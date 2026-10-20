import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  PASSWORD,
  STAMP,
  type Session,
  session,
  api,
  errorCode,
  ok,
  pairByApi,
  newDevice,
  closeOpenShift,
  openShiftByApi,
} from './helpers/int4';

/**
 * INT-5 (EC-135): the installment lifecycle end to end, server and client together, in a shop of
 * its own (the platform admin provisions it, the owner and the staff accept the emailed invites).
 *   R01 the owner adds the customer on the customers screen; R04 adds a guarantor; R05 assigns a
 *   field survey, the collector fills it (location, photo) and the owner approves it; R03 the owner
 *   sets the credit limit and the server refuses a sale above it, even sent straight to the API.
 *   N01/N02 the installment sale at the till (terms preview, down payment, contract); N07 the
 *   printed contract and promissory notes; N06 the collector collects the first installment in
 *   the field and a branch manager settles the wallet into the safe; N05 a second contract is
 *   settled early; N04 the next installment of the first contract is made late (the database
 *   moves its due dates back: EcoFin-API/scripts/int5-db.mjs) and the overdue check gives a
 *   warning, never a fee; R02 the customer account shows all of it, in English and Arabic.
 * The database checks at the end: EcoFin-API/scripts/int5-db.mjs verify (results in
 * test-results/int-5/). Needs the API (with SMTP to Mailpit), local Supabase with the dev seed,
 * docker (the database container) and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 *   E2E_API_DIR                                       the EcoFin-API folder (default ../EcoFin-API)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const API_DIR = resolve(env('E2E_API_DIR', '../EcoFin-API'));
const OUT = resolve('test-results/int-5');
const OWNER_EMAIL = `int5.owner.${STAMP}@ecotech.test`;
const COLLECTOR_EMAIL = `int5.collector.${STAMP}@ecotech.test`;
const MANAGER_EMAIL = `int5.manager.${STAMP}@ecotech.test`;
const IP = `198.51.105.${(STAMP % 250) + 1}`;
const CUSTOMER = `INT5 Customer ${STAMP}`;
const GUARANTOR = `INT5 Guarantor ${STAMP}`;
const DAYS_LATE = 10;
// The smallest valid PNG (1 x 1): the server checks the file's bytes, not its name.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** The invite link (#token=...) of the newest email to this address. */
async function inviteToken(request: APIRequestContext, email: string) {
  for (let i = 0; i < 50; i++) {
    const list = (await (
      await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json()) as { messages: { ID: string }[] };
    const id = list.messages[0]?.ID;
    if (id) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const token = /#token=([A-Za-z0-9_-]{43})/.exec(msg.Text)?.[1];
      if (token) return token;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no invite email for ${email}`);
}

async function acceptInvite(request: APIRequestContext, email: string) {
  const accepted = await request.post('/api/auth/invites/accept', {
    headers: { 'X-Forwarded-For': IP },
    data: { token: await inviteToken(request, email), password: PASSWORD },
  });
  expect(accepted.status(), await accepted.text()).toBe(200);
}

/** A new retail_pro shop whose owner has the e2e password; answers its organization id. */
async function provisionShop(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', {
    headers: { 'X-Forwarded-For': IP },
    data: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(login.status(), await login.text()).toBe(200);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const shop = await request.post('/api/admin/shops', {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Forwarded-For': IP },
    data: {
      name: `INT5 shop ${STAMP}`,
      tenant_slug: `int5-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'INT5 Owner', email: OWNER_EMAIL },
    },
  });
  expect(shop.status(), await shop.text()).toBe(201);
  const orgId = String(((await shop.json()) as { organization_id: string }).organization_id);
  await acceptInvite(request, OWNER_EMAIL);
  return orgId;
}

/** A valid Egyptian national ID that is new on every run (born 1990, Cairo). */
const freshNationalId = (n: number) =>
  `290010101${String((STAMP + 51 + n) % 100000).padStart(5, '0')}`;

/** Runs one of the API repo's scripts; answers its output (throws with the output on failure). */
function apiScript(...args: string[]) {
  try {
    return execFileSync('node', args, { cwd: API_DIR, encoding: 'utf8' });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(`${args.join(' ')} failed:\n${e.stdout ?? ''}${e.stderr ?? ''}`, {
      cause: error,
    });
  }
}

const cents = (v: unknown) => Math.round(Number(String(v)) * 100);
const money = (c: number) => (c / 100).toFixed(2);

interface Contract {
  id: string;
  number: string;
  status: string;
  total_payable: string;
  installments_count: number;
  lines: { seq: number; amount: string; remaining?: string }[];
  balance: { paid: string; remaining: string };
}

test.describe('INT-5 installment lifecycle end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(600_000);

  let owner: Session;
  let orgId = '';

  test.beforeAll(async ({ request }) => {
    mkdirSync(OUT, { recursive: true });
    orgId = await provisionShop(request);
  });
  test.afterAll(async () => {
    if (owner) await closeOpenShift(owner).catch(() => undefined);
    await owner?.context.close();
  });

  test('customer, guarantor, survey, limit, sale, print, field collection, settle, overdue, account', async ({
    browser,
    request,
  }) => {
    owner = await session(browser, OWNER_EMAIL, orgId);
    const page = owner.page;
    // The browser's print dialog is replaced by a counter.
    await page.addInitScript(() => {
      window.print = () => {
        window.sessionStorage.setItem(
          '__prints',
          String(Number(window.sessionStorage.getItem('__prints') ?? 0) + 1),
        );
      };
    });
    const prints = () =>
      page.evaluate(() => Number(window.sessionStorage.getItem('__prints') ?? 0));
    const contractOf = async (id: string) =>
      ok(await api(owner, 'GET', `/api/contracts/${id}`)) as unknown as Contract;

    // ---- Set-up through the API: staff, stock, the till, the policy. ----
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    for (const [email, role, name] of [
      [COLLECTOR_EMAIL, 'COLLECTOR', 'INT5 Collector'],
      [MANAGER_EMAIL, 'BRANCH_MANAGER', 'INT5 Manager'],
    ] as const) {
      ok(
        await api(owner, 'POST', '/api/employees', {
          full_name: name,
          email,
          role,
          default_branch_id: branch,
          branch_ids: [branch],
        }),
        201,
      );
      await acceptInvite(request, email);
    }
    const sku = `INT5-TV-${STAMP}`;
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'INT5 TV',
        sku,
        cash_price: '12000.00',
      }),
      201,
    );
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        { branch_id: branch, reason: 'found', lines: [{ product_id: product['id'], quantity: 3 }] },
        `int5-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `INT5 POS ${STAMP}`, branch);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, branch, device);
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [{ up_to_months: 24, pct: 20 }],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
        early_settlement_rule: 'percent_of_future_profit',
        early_settlement_pct: '50',
      }),
      201,
    );
    // The score check has its own tests (R03); here the limit is the gate.
    ok(await api(owner, 'PATCH', '/api/settings', { credit_min_score: 0 }));
    const settings = ok(await api(owner, 'GET', '/api/settings'));
    const policyVersion = (settings['installment_policy'] as { version: number }).version;

    // ---- R01: the owner adds the customer on the customers screen. ----
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Add customer' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Full name').fill(CUSTOMER);
    await form.getByLabel('National ID').fill(freshNationalId(1));
    await form.getByLabel('Main phone').fill('01500000135');
    await form.getByLabel('Address').fill('5 Test Street');
    await form.getByLabel('City').fill('Cairo');
    await form.getByLabel('Monthly income').fill('9000');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole('link', { name: CUSTOMER })).toBeVisible();
    const found = ok(
      await api(owner, 'GET', `/api/customers?search=${encodeURIComponent(CUSTOMER)}`),
    ) as unknown as { items: { id: string; full_name: string }[] };
    const customerId = found.items.find((c) => c.full_name === CUSTOMER)!.id;
    await page.getByRole('link', { name: CUSTOMER }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${customerId}$`));

    // ---- R04: a guarantor, a new person. ----
    await page.getByRole('button', { name: 'Add guarantor' }).click();
    const addG = page.getByRole('dialog', { name: 'Add a guarantor' });
    await addG.getByLabel('Full name').fill(GUARANTOR);
    await addG.getByLabel('Phone').fill('01500000136');
    await addG.getByLabel('National ID').fill(freshNationalId(2));
    await addG.getByLabel('Relation to the customer').selectOption('father');
    await addG.getByRole('button', { name: 'Add guarantor' }).click();
    await expect(addG).toBeHidden();
    await expect(page.getByRole('link', { name: GUARANTOR })).toBeVisible();

    // ---- R05: the owner assigns a home visit to the collector. ----
    await page.getByRole('button', { name: 'Assign survey' }).click();
    const assign = page.getByRole('dialog', { name: 'Assign survey' });
    await assign.getByLabel('Employee', { exact: true }).selectOption({ label: 'INT5 Collector' });
    await assign.getByLabel('Instructions for the employee').fill('Ask for the electricity bill');
    await assign.getByRole('button', { name: 'Assign' }).click();
    await expect(assign).toBeHidden();
    const surveys = ok(
      await api(owner, 'GET', `/api/customers/${customerId}/surveys`),
    ) as unknown as { id: string; status: string }[];
    const surveyId = surveys[0]!.id;
    expect(surveys[0]!.status).toBe('assigned');

    // The collector fills it from the field: ratings, checklist, location, a photo.
    const collector = await session(browser, COLLECTOR_EMAIL, orgId);
    try {
      await collector.context.grantPermissions(['geolocation']);
      await collector.context.setGeolocation({
        latitude: 30.0444,
        longitude: 31.2357,
        accuracy: 15,
      });
      const cp = collector.page;
      await cp.goto(`/customers/surveys/${surveyId}/fill`);
      await expect(cp.getByRole('heading', { level: 1, name: 'Fill the survey' })).toBeVisible();
      for (const criterion of [
        'Housing quality',
        'Neighbourhood',
        'Income stability',
        'Job status',
        'Property ownership',
        'Overall impression',
      ]) {
        await cp
          .getByRole('radiogroup', { name: criterion })
          .getByRole('radio', { name: new RegExp(`: 8$`) })
          .check();
      }
      for (const item of [
        'Met the customer in person',
        'The address matches the file',
        'Saw the original national ID',
        'Neighbours confirm the customer lives or works here',
        "Saw a recent utility bill in the customer's name",
        'The workplace confirms the job',
      ]) {
        await cp
          .getByRole('radiogroup', { name: item })
          .getByRole('radio', { name: 'Yes' })
          .check();
      }
      await cp.getByRole('button', { name: 'Capture location' }).click();
      await expect(cp.getByText('Accuracy: 15 m')).toBeVisible();
      await cp
        .getByLabel('Take a photo')
        .setInputFiles({ name: 'home.png', mimeType: 'image/png', buffer: PHOTO });
      await expect(cp.getByText('Uploaded')).toBeVisible();
      await cp.getByRole('button', { name: 'Submit for review' }).click();
      await cp.getByRole('dialog').getByRole('button', { name: 'Submit for review' }).click();
      await expect(cp).toHaveURL(new RegExp(`/customers/surveys/${surveyId}$`));
    } finally {
      await collector.context.close();
    }

    // The owner approves it.
    await page.goto(`/customers/surveys/${surveyId}`);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
    await expect
      .poll(
        async () =>
          (ok(await api(owner, 'GET', `/api/surveys/${surveyId}`)) as { status: string }).status,
      )
      .toBe('approved');

    // ---- R03: the owner sets the credit limit on the customer page. ----
    await page.goto(`/customers/${customerId}`);
    await page.getByRole('button', { name: 'Set limit' }).click();
    const limit = page.getByRole('dialog', { name: 'Set the credit limit' });
    await limit.getByLabel('Credit limit').fill('30000');
    await limit.getByLabel('Reason').fill('INT-5: approved survey and guarantor');
    await limit.getByRole('button', { name: 'Save limit' }).click();
    await expect(limit).toBeHidden();
    await expect(page.locator('body')).toContainText(/30,000\.00/);

    // ---- N01/N02: the installment sale at the till; N07 the papers from its done card. ----
    await page.goto(`/sales/pos?customer=${customerId}`);
    const search = page.getByRole('searchbox', { name: 'Find a product by name, SKU or barcode' });
    await search.fill(sku);
    await search.press('Enter');
    await page.getByRole('button', { name: 'Installments', exact: true }).click();
    const termsButton = page.getByRole('button', { name: /Installment terms/ });
    await expect(termsButton).toBeEnabled();
    await termsButton.click();
    const terms = page.getByRole('dialog', { name: 'Installment sale' });
    await expect(terms.getByTestId('check-credit')).toContainText('Credit: OK');
    const installmentPrice = (await terms.getByTestId('terms-total').innerText()).trim();
    await terms.getByRole('button', { name: 'Next: down payment' }).click();
    await page
      .getByRole('dialog', { name: 'Down payment' })
      .getByRole('button', { name: 'Pay' })
      .dblclick();
    await expect(page.getByTestId('done-contract')).toContainText(installmentPrice);
    const href = await page.getByRole('link', { name: 'View contract' }).getAttribute('href');
    const lifecycleId = String(href?.split('/').pop());
    const first = await contractOf(lifecycleId);
    expect(first.lines.reduce((s, l) => s + cents(l.amount), 0)).toBe(cents(first.total_payable));

    await page.getByTestId('print-contract').click();
    await expect(page.getByTestId('contract-document')).toContainText(first.number);
    await expect(page.getByTestId('copy-mark')).toHaveCount(0);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(prints).toBe(1);
    await page.goto(`/contracts/${lifecycleId}`);
    await page.getByTestId('print-notes').click();
    await expect(page.getByTestId('promissory-note')).toHaveCount(first.installments_count);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(prints).toBe(2);
    await expect(page.locator('body')).not.toContainText(/interest/i);

    // R03 again: above the available credit is refused by the server, straight from the API.
    const lines2 = [{ product_id: product['id'], quantity: 2 }];
    const quote2 = ok(await api(owner, 'POST', '/api/sales/quote', { lines: lines2 }));
    const tooMuch = await api(
      owner,
      'POST',
      '/api/installments/sales',
      {
        lines: lines2,
        expected_total: quote2['total'],
        customer_id: customerId,
        terms: {
          down_payment: '2400.00',
          installments_count: 12,
          frequency: 'monthly',
          policy_version: policyVersion,
        },
      },
      `int5-e2e-over-limit-${STAMP}`,
    );
    expect(tooMuch.status, JSON.stringify(tooMuch.body)).toBe(409);
    expect(errorCode(tooMuch)).toBe('CREDIT_LIMIT_EXCEEDED');

    // A second, smaller contract (it is settled early below).
    const lines1 = [{ product_id: product['id'], quantity: 1 }];
    const quote1 = ok(await api(owner, 'POST', '/api/sales/quote', { lines: lines1 }));
    const second = (
      ok(
        await api(
          owner,
          'POST',
          '/api/installments/sales',
          {
            lines: lines1,
            expected_total: quote1['total'],
            customer_id: customerId,
            terms: {
              down_payment: '2000.00',
              installments_count: 12,
              frequency: 'monthly',
              policy_version: policyVersion,
            },
          },
          `int5-e2e-sale-2-${STAMP}`,
        ),
        201,
      ) as unknown as { contract: { id: string; number: string } }
    ).contract;

    // ---- N06: the customer goes to the collector, who collects the first installment. ----
    await page.goto(`/customers/${customerId}`);
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    const toCollector = page.getByRole('dialog');
    await toCollector.getByLabel(/Collector/).selectOption({ label: 'INT5 Collector' });
    await toCollector.getByLabel(/Reason/).fill('East side');
    await toCollector.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('customer-collector')).toHaveText('INT5 Collector');

    const firstInstallment = cents(first.lines.find((l) => l.seq === 1)!.amount);
    const safeBalance = async () => {
      const list = (await api(owner, 'GET', '/api/cash-accounts?kind=safe')).body as {
        kind: string;
        balance: string;
      }[];
      return cents(list.find((a) => a.kind === 'safe')!.balance);
    };
    const safeBefore = await safeBalance();
    const fieldWorker = await session(browser, COLLECTOR_EMAIL, orgId);
    try {
      const cp = fieldWorker.page;
      await cp.goto(`/collections/new?customer=${customerId}&contract=${lifecycleId}&mode=field`);
      await expect(cp.getByText(/the cash goes into your wallet/)).toBeVisible();
      await cp.getByRole('button', { name: /Next installment/ }).click();
      await cp.getByRole('button', { name: 'Take payment' }).click();
      await cp.getByRole('dialog').getByRole('button', { name: 'Take payment' }).dblclick();
      await expect(cp.getByRole('heading', { name: /^Receipt / })).toBeVisible();
      await expect(cp.locator('body')).toContainText(/Collected in the field by INT5 Collector/);
      const wallet = ok(await api(fieldWorker, 'GET', '/api/wallets/me'));
      expect(cents(wallet['balance'])).toBe(firstInstallment);
    } finally {
      await fieldWorker.context.close();
    }
    expect(await safeBalance()).toBe(safeBefore);

    // A branch manager settles it into the safe, all but 100.00 (partial settlement).
    const handed = firstInstallment - 10000;
    const manager = await session(browser, MANAGER_EMAIL, orgId);
    let walletId: string;
    try {
      await manager.page.goto('/installments/wallets');
      const row = manager.page.locator('tr', { hasText: 'INT5 Collector' });
      await row.getByRole('button', { name: 'Settle' }).click();
      const settle = manager.page.getByRole('dialog');
      await settle.getByLabel(/Safe/).selectOption({ index: 1 });
      await settle.getByLabel(/Handed in/).fill(money(handed));
      await expect(settle.getByTestId('settle-left')).toContainText(/100\.00/);
      await settle.getByRole('button', { name: 'Settle' }).click();
      await expect(settle).toBeHidden();
      await expect(row).toContainText(/100\.00/);
      walletId = String(
        (ok(await api(manager, 'GET', '/api/wallets')) as unknown as { items: { id: string }[] })
          .items[0]!.id,
      );
    } finally {
      await manager.context.close();
    }
    expect(await safeBalance()).toBe(safeBefore + handed);

    // ---- N05: the second contract is settled early with the policy's suggestion. ----
    await page.goto(`/contracts/${second.id}`);
    await page.getByRole('button', { name: 'Settle early' }).click();
    const early = page.getByRole('dialog', { name: `Settle contract ${second.number} early` });
    await early.getByRole('button', { name: 'Use the suggestion' }).click();
    await early.getByLabel('Reason for the waiver').fill('Paid everything early');
    await early.getByRole('button', { name: 'Continue to payment' }).click();
    await page
      .getByRole('dialog', { name: 'Collect the payment' })
      .getByRole('button', { name: 'Pay' })
      .dblclick();
    await expect(page.getByRole('heading', { name: /^Receipt / })).toBeVisible();
    const settled = await contractOf(second.id);
    expect(settled.status).toBe('completed');
    expect(settled.balance.remaining).toBe('0.00');

    // ---- N04: time passes; the second installment is late. A warning, never a fee. ----
    const beforeLate = await contractOf(lifecycleId);
    apiScript('scripts/int5-db.mjs', 'backdate', lifecycleId, String(DAYS_LATE));
    await page.goto('/installments/overdue');
    await page.getByRole('button', { name: 'Run the check now' }).click();
    await expect(
      page.getByText('Check done: 1 new warnings, 0 customers blocked, 0 legal referrals.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: first.number })).toBeVisible();
    // Run twice the same day: nothing new.
    await page.getByRole('button', { name: 'Run the check now' }).click();
    await expect(
      page.getByText('Check done: 0 new warnings, 0 customers blocked, 0 legal referrals.'),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Warnings' }).click();
    await expect(page.locator('tr', { hasText: first.number })).toBeVisible();
    const afterLate = await contractOf(lifecycleId);
    expect(afterLate.balance.remaining).toBe(beforeLate.balance.remaining);
    const overdueAmount = cents(first.lines.find((l) => l.seq === 2)!.amount);

    // ---- R02: the customer account shows all of it. ----
    const account = ok(await api(owner, 'GET', `/api/customers/${customerId}/account`));
    const balance = account['balance'] as Record<string, string>;
    expect(balance['open_balance']).toBe(afterLate.balance.remaining);
    const contracts = account['contracts'] as { id: string; status: string }[];
    expect(contracts.map((c) => [c.id, c.status]).sort()).toEqual(
      [
        [lifecycleId, 'active'],
        [second.id, 'completed'],
      ].sort(),
    );
    await page.goto(`/customers/${customerId}`);
    await page.getByRole('tab', { name: 'Account' }).click();
    const tab = page.getByRole('tabpanel');
    await expect(tab).toContainText(first.number);
    await expect(tab).toContainText(second.number);
    await expect(tab).toContainText(
      money(cents(afterLate.balance.remaining)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    );
    await expect(tab).toContainText(money(overdueAmount).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    await expect(tab).toContainText('Completed');
    await expect(page.locator('body')).not.toContainText(/interest/i);

    // Arabic, right to left.
    await page.getByRole('button', { name: 'Switch language to العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('body')).not.toContainText('فائدة');

    // ---- The database checks. ----
    const run = {
      stamp: STAMP,
      orgId,
      customerId,
      surveyId,
      walletId,
      contracts: { lifecycle: lifecycleId, settled: second.id },
      walletExpected: money(firstInstallment - handed),
      overdueAmount: money(overdueAmount),
      remainingAfterOverdue: afterLate.balance.remaining,
    };
    writeFileSync(resolve(OUT, 'run.json'), JSON.stringify(run, null, 2));
    const verify = apiScript('scripts/int5-db.mjs', 'verify', resolve(OUT, 'run.json'));
    writeFileSync(resolve(OUT, 'int5-db-verify.txt'), verify);
    console.log(verify);
    expect(verify).toMatch(/0 failed/);
  });
});

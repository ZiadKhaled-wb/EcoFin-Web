import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  PASSWORD,
  STAMP,
  type Session,
  session,
  api,
  ok,
  pairByApi,
  newDevice,
  closeOpenShift,
  openShiftByApi,
} from './helpers/int4';

/**
 * N07 (EC-86, D82): the printed contract and promissory notes end to end, server and client
 * together. Like N05's spec it makes its own shop (the platform admin provisions it, the owner
 * accepts the emailed invite). An installment sale at the till; the contract is printed from the
 * done card (the original), again from the contract page (a COPY), the promissory notes are
 * printed (one per installment, their sum is what is left), and the owner saves a terms text with
 * {{customer_name}} and sees it on the paper; wording with "فائدة" is warned about and refused.
 * `window.print` is replaced by a counter. Needs the API (with SMTP to Mailpit), local Supabase
 * with the dev seed and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `n07.owner.${STAMP}@ecotech.test`;
const IP = `198.51.107.${(STAMP % 250) + 1}`;

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
      name: `N07 shop ${STAMP}`,
      tenant_slug: `n07-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'N07 Owner', email: OWNER_EMAIL },
    },
  });
  expect(shop.status(), await shop.text()).toBe(201);
  const orgId = String(((await shop.json()) as { organization_id: string }).organization_id);
  const accepted = await request.post('/api/auth/invites/accept', {
    headers: { 'X-Forwarded-For': IP },
    data: { token: await inviteToken(request, OWNER_EMAIL), password: PASSWORD },
  });
  expect(accepted.status(), await accepted.text()).toBe(200);
  return orgId;
}

/** A valid Egyptian national ID that is new on every run (born 1990, Cairo). */
const freshNationalId = () => `290010101${String((STAMP + 11) % 100000).padStart(5, '0')}`;

test.describe('N07 printed contract and promissory notes end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(300_000);

  let owner: Session;

  test.beforeAll(async ({ browser, request }) => {
    owner = await session(browser, OWNER_EMAIL, await provisionShop(request));
  });
  test.afterAll(async () => {
    if (owner) await closeOpenShift(owner).catch(() => undefined);
    await owner?.context.close();
  });

  test('sale, original then COPY, the notes, and the owner edits the terms', async () => {
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

    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    const sku = `N07-TV-${STAMP}`;
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'N07 TV',
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
        { branch_id: branch, reason: 'found', lines: [{ product_id: product['id'], quantity: 2 }] },
        `n07-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `N07 POS ${STAMP}`, branch);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, branch, device);
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [{ up_to_months: 24, pct: 20 }],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
        early_settlement_rule: 'no_discount',
      }),
      201,
    );
    ok(await api(owner, 'PATCH', '/api/settings', { credit_min_score: 0 }));
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `N07 Customer ${STAMP}`,
        phones: ['01500000087'],
        national_id: freshNationalId(),
      }),
      201,
    );
    const customerId = String(customer['id']);
    ok(
      await api(owner, 'PUT', `/api/customers/${customerId}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'N07 e2e',
      }),
    );

    // The installment sale at the till; its done card has the two print buttons.
    await page.goto(`/sales/pos?customer=${customerId}`);
    const search = page.getByRole('searchbox', { name: 'Find a product by name, SKU or barcode' });
    await search.fill(sku);
    await search.press('Enter');
    await page.getByRole('button', { name: 'Installments', exact: true }).click();
    const terms = page.getByRole('button', { name: /Installment terms/ });
    await expect(terms).toBeEnabled();
    await terms.click();
    const dialog = page.getByRole('dialog', { name: 'Installment sale' });
    await expect(dialog.getByTestId('check-credit')).toContainText('Credit: OK');
    const next = dialog.getByRole('button', { name: 'Next: down payment' });
    await expect(next).toBeEnabled();
    await next.click();
    await page
      .getByRole('dialog', { name: 'Down payment' })
      .getByRole('button', { name: 'Pay' })
      .dblclick();
    await expect(page.getByTestId('done-contract')).toBeVisible();
    const href = await page.getByRole('link', { name: 'View contract' }).getAttribute('href');
    const contractId = String(href?.split('/').pop());
    const contract = ok(await api(owner, 'GET', `/api/contracts/${contractId}`)) as unknown as {
      number: string;
      installments_count: number;
      total_payable: string;
      balance: { remaining: string };
      lines: { amount: string }[];
    };

    // 1. The contract from the done card: the first print is the original.
    await page.getByTestId('print-contract').click();
    await expect(page).toHaveURL(new RegExp(`/contracts/${contractId}/print\\?doc=contract$`));
    const paper = page.getByTestId('contract-document');
    await expect(paper).toBeVisible();
    await expect(paper).toContainText(contract.number);
    await expect(paper.getByTestId('contract-schedule').getByRole('row')).toHaveCount(
      contract.lines.length + 1,
    );
    await expect(page.getByTestId('copy-mark')).toHaveCount(0);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(prints).toBe(1);

    // 2. The contract page: the same contract printed again is a COPY.
    await page.goto(`/contracts/${contractId}`);
    await page.getByTestId('print-contract').click();
    await expect(page.getByTestId('copy-mark')).toContainText('COPY');
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(prints).toBe(2);

    // 3. The promissory notes: one per installment, their sum is what is left.
    await page.goto(`/contracts/${contractId}`);
    await page.getByTestId('print-notes').click();
    await expect(page.getByTestId('promissory-note')).toHaveCount(contract.installments_count);
    const amounts = await page.getByTestId('note-amount').allInnerTexts();
    const cents = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, '')) * 100);
    // The paper is Arabic: read the digits back from the API instead of the formatted text.
    expect(amounts).toHaveLength(contract.installments_count);
    const docs = ok(
      await api(owner, 'GET', `/api/contracts/${contractId}/documents`),
    ) as unknown as {
      notes: { amount: string }[];
      prints: { promissory_notes: { next_print_no: number } };
    };
    expect(docs.notes.reduce((sum, n) => sum + cents(n.amount), 0)).toBe(
      cents(contract.balance.remaining),
    );
    await expect(page.getByTestId('copy-mark')).toHaveCount(0);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(prints).toBe(3);
    await expect(page.locator('body')).not.toContainText(/interest/i);

    // 4. The owner edits the terms; the paper shows the customer's name.
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Installment terms' }).click();
    const terms7 = page.getByLabel('Terms printed on the contract');
    await terms7.fill('');
    await page.getByTestId('insert-customer_name').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.').first()).toBeVisible();
    await page.goto(`/contracts/${contractId}/print?doc=contract`);
    await expect(page.getByTestId('contract-terms')).toContainText(`N07 Customer ${STAMP}`);

    // 5. Wording the rules forbid is warned about and refused.
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Installment terms' }).click();
    await page.getByLabel('Terms printed on the contract').fill('يدفع العميل فائدة شهرية');
    await expect(page.getByText(/This wording is not allowed on the contract/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    const refused = await api(owner, 'PATCH', '/api/settings', {
      contract_terms: 'يدفع العميل فائدة شهرية',
    });
    expect(refused.status).toBe(422);
  });
});

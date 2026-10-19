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
 * N06 (EC-85, D81): collector wallets end to end, server and client together. Like N05's spec it
 * makes its own shop (the platform admin provisions it, the owner accepts the emailed invite). The
 * owner sells one TV on installments (through the API) and, on the customer page, assigns the
 * customer to a new collector. The collector collects the next installment in the field (no shift:
 * the wallet goes up, the receipt says it was collected in the field, a customer that is not
 * theirs is refused). A branch manager settles part of the wallet with a shortage and a reason
 * (the safe goes up by the handed amount, the wallet down by the handed amount plus the
 * shortage). The collector's home reads in Arabic. No commission anywhere. Needs the API (with
 * SMTP to Mailpit), local Supabase with the dev seed and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `n06.owner.${STAMP}@ecotech.test`;
const COLLECTOR_EMAIL = `n06.collector.${STAMP}@ecotech.test`;
const MANAGER_EMAIL = `n06.manager.${STAMP}@ecotech.test`;
const IP = `198.51.106.${(STAMP % 250) + 1}`;

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
      name: `N06 shop ${STAMP}`,
      tenant_slug: `n06-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'N06 Owner', email: OWNER_EMAIL },
    },
  });
  expect(shop.status(), await shop.text()).toBe(201);
  const orgId = String(((await shop.json()) as { organization_id: string }).organization_id);
  await acceptInvite(request, OWNER_EMAIL);
  return orgId;
}

/** A valid Egyptian national ID that is new on every run (born 1990, Cairo). */
const freshNationalId = (n: number) =>
  `290010101${String((STAMP + 11 + n) % 100000).padStart(5, '0')}`;

const num = (v: unknown) => Number(String(v));

test.describe('N06 collector wallets end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(300_000);

  let owner: Session;
  let orgId = '';

  test.beforeAll(async ({ request }) => {
    orgId = await provisionShop(request);
  });
  test.afterAll(async () => {
    if (owner) await closeOpenShift(owner).catch(() => undefined);
    await owner?.context.close();
  });

  test('assign, collect in the field, settle part with a shortage', async ({
    browser,
    request,
  }) => {
    owner = await session(browser, OWNER_EMAIL, orgId);
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;

    // The collector and a branch manager, with logins.
    for (const [email, role, name] of [
      [COLLECTOR_EMAIL, 'COLLECTOR', 'N06 Collector'],
      [MANAGER_EMAIL, 'BRANCH_MANAGER', 'N06 Manager'],
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

    // Stock, a policy and two customers: one will be assigned to the collector, one will not.
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'N06 TV',
        sku: `N06-TV-${STAMP}`,
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
        `n06-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `N06 POS ${STAMP}`, branch);
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
    ok(await api(owner, 'PATCH', '/api/settings', { credit_min_score: 0 }));
    const settings = ok(await api(owner, 'GET', '/api/settings'));
    const version = (settings['installment_policy'] as { version: number }).version;
    const lines = [{ product_id: product['id'], quantity: 1 }];
    const quote = ok(await api(owner, 'POST', '/api/sales/quote', { lines }));
    const customers: { id: string; name: string; contractId: string }[] = [];
    for (const n of [1, 2]) {
      const name = `N06 Customer ${n} ${STAMP}`;
      const customer = ok(
        await api(owner, 'POST', '/api/customers', {
          full_name: name,
          phones: [`0150000086${n}`],
          national_id: freshNationalId(n),
          city: 'Cairo',
          address: `${n} Test Street`,
        }),
        201,
      );
      const id = String(customer['id']);
      ok(
        await api(owner, 'PUT', `/api/customers/${id}/credit-limit`, {
          credit_limit: '100000.00',
          reason: 'N06 e2e',
        }),
      );
      const sold = ok(
        await api(
          owner,
          'POST',
          '/api/installments/sales',
          {
            lines,
            expected_total: quote['total'],
            customer_id: id,
            terms: {
              down_payment: '2000.00',
              installments_count: 12,
              frequency: 'monthly',
              policy_version: version,
            },
          },
          `n06-e2e-sale-${n}-${STAMP}`,
        ),
        201,
      ) as unknown as { contract: { id: string } };
      customers.push({ id, name, contractId: sold.contract.id });
    }
    const [mine, notMine] = customers as [(typeof customers)[number], (typeof customers)[number]];
    const safeBalance = async () => {
      const list = (await api(owner, 'GET', '/api/cash-accounts?kind=safe')).body as {
        id: string;
        kind: string;
        balance: string;
        is_default?: boolean;
      }[];
      const safe = list.find((a) => a.kind === 'safe')!;
      return {
        id: safe.id,
        name: (safe as unknown as { name: string }).name,
        balance: num(safe.balance),
      };
    };

    // The owner assigns the customer to the collector on the customer page.
    const page = owner.page;
    await page.goto(`/customers/${mine.id}`);
    await expect(page.getByTestId('customer-collector')).toHaveText('No collector assigned');
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    const assign = page.getByRole('dialog');
    await assign.getByLabel(/Collector/).selectOption({ label: 'N06 Collector' });
    await assign.getByLabel(/Reason/).fill('East side');
    await assign.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('customer-collector')).toHaveText('N06 Collector');

    // The collector collects in the field: no shift, the wallet goes up, the receipt says so.
    const collector = await session(browser, COLLECTOR_EMAIL, orgId);
    const safeBefore = await safeBalance();
    try {
      await collector.page.goto('/field');
      await expect(collector.page.getByRole('heading', { name: 'My field work' })).toBeVisible();
      await expect(collector.page.getByTestId('wallet-balance')).toHaveText(/0\.00/);
      await collector.page.goto(
        `/collections/new?customer=${mine.id}&contract=${mine.contractId}&mode=field`,
      );
      await expect(collector.page.getByText(/the cash goes into your wallet/)).toBeVisible();
      await collector.page.getByRole('button', { name: /Next installment/ }).click();
      await collector.page.getByRole('button', { name: 'Take payment' }).click();
      await collector.page
        .getByRole('dialog')
        .getByRole('button', { name: 'Take payment' })
        .dblclick();
      await expect(collector.page.getByRole('heading', { name: /^Receipt / })).toBeVisible();
      await expect(collector.page.locator('body')).toContainText(
        /Collected in the field by N06 Collector/,
      );
      await collector.page.goto('/field');
      await expect(collector.page.getByTestId('wallet-balance')).toHaveText(/1,000\.00/);

      // A customer who is not theirs is refused by the server.
      const refused = await api(
        collector,
        'POST',
        '/api/collections/field',
        {
          customer_id: notMine.id,
          contracts: [{ contract_id: notMine.contractId, amount: '100.00' }],
          payments: [{ method: 'cash', amount: '100.00' }],
        },
        `n06-e2e-refused-${STAMP}`,
      );
      expect(refused.status).toBe(403);
      expect(errorCode(refused)).toBe('CUSTOMER_NOT_ASSIGNED');

      // The wallet is up, the safe did not move.
      const wallet = ok(await api(collector, 'GET', '/api/wallets/me'));
      expect(num(wallet['balance'])).toBe(1000);
      expect((await safeBalance()).balance).toBe(safeBefore.balance);

      // The collector reads their home in Arabic, right to left.
      await collector.page.getByRole('button', { name: 'Switch language to العربية' }).click();
      await expect(collector.page.getByRole('heading', { name: 'عملي الميداني' })).toBeVisible();
      await expect(collector.page.locator('html')).toHaveAttribute('dir', 'rtl');
    } finally {
      await collector.context.close();
    }

    // A branch manager settles part of it with a shortage and a reason.
    const manager = await session(browser, MANAGER_EMAIL, orgId);
    try {
      await manager.page.goto('/installments/wallets');
      const row = manager.page.locator('tr', { hasText: 'N06 Collector' });
      await expect(row).toContainText(/1,000\.00/);
      await row.getByRole('button', { name: 'Settle' }).click();
      const dialog = manager.page.getByRole('dialog');
      await expect(dialog.getByTestId('settle-balance')).toContainText(/1,000\.00/);
      await dialog.getByLabel(/Safe/).selectOption({ index: 1 });
      await dialog.getByLabel(/Handed in/).fill('600');
      await dialog.getByLabel(/^Shortage/).fill('100');
      await dialog.getByLabel(/Reason for the shortage/).fill('Torn note');
      await expect(dialog.getByTestId('settle-left')).toContainText(/300\.00/);
      await dialog.getByRole('button', { name: 'Settle' }).click();
      await expect(dialog).toBeHidden();
      await expect(row).toContainText(/300\.00/);

      // The safe went up by the handed amount only; the shortage is recorded in the ledger.
      expect((await safeBalance()).balance).toBe(safeBefore.balance + 600);
      const walletId = String(
        (ok(await api(manager, 'GET', '/api/wallets')) as unknown as { items: { id: string }[] })
          .items[0]!.id,
      );
      await manager.page.goto(`/installments/wallets/${walletId}`);
      await expect(manager.page.getByTestId('wallet-balance')).toContainText(/300\.00/);
      await expect(manager.page.locator('body')).toContainText(/Shortage .*100\.00.*Torn note/);
      await expect(manager.page.locator('body')).not.toContainText(/commission/i);
    } finally {
      await manager.context.close();
    }
  });
});

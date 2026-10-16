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
 * N02 (EC-81, D77): an installment sale end to end, server and client together. The test makes
 * its own shop (the platform admin provisions it, the owner accepts the emailed invite), so it
 * shares no user, shift or device with the other specs that run beside it (INT-4 uses shops A
 * and B of the dev seed). In that shop the owner publishes an installment policy, stocks a TV,
 * gives a new customer a national ID and a credit limit, pairs the computer, opens a shift and
 * sells the TV on installments with a cash down payment; the contract adds up, the down payment
 * is the sale's cash payment, and the customer account shows the contract.
 * Needs the API (with SMTP to Mailpit), local Supabase with the dev seed and the dev server;
 * skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `n02.owner.${STAMP}@ecotech.test`;
const IP = `198.51.102.${(STAMP % 250) + 1}`;

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
      name: `N02 shop ${STAMP}`,
      tenant_slug: `n02-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'N02 Owner', email: OWNER_EMAIL },
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
const freshNationalId = () => `290010101${String(STAMP % 100000).padStart(5, '0')}`;

test.describe('N02 installment sale end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(120_000);

  let owner: Session;

  test.beforeAll(async ({ browser, request }) => {
    owner = await session(browser, OWNER_EMAIL, await provisionShop(request));
  });
  test.afterAll(async () => {
    if (owner) await closeOpenShift(owner).catch(() => undefined);
    await owner?.context.close();
  });

  test('the owner sells on installments; the contract adds up and shows on the customer account', async () => {
    // The shop's main branch, a TV in stock, and this computer paired with an open shift.
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    const sku = `N02-TV-${STAMP}`;
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'N02 TV',
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
        `n02-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `N02 POS ${STAMP}`, branch);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, branch, device);

    // The policy: 10 % minimum down payment, 20 % profit for the whole term up to 24 months.
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [
          { up_to_months: 6, pct: 10 },
          { up_to_months: 24, pct: 20 },
        ],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
      }),
      201,
    );
    ok(await api(owner, 'PATCH', '/api/settings', { credit_min_score: 0 }));
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `N02 Buyer ${STAMP}`,
        phones: ['01500000077'],
        national_id: freshNationalId(),
      }),
      201,
    );
    const customerId = String(customer['id']);
    ok(
      await api(owner, 'PUT', `/api/customers/${customerId}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'N02 e2e',
      }),
    );

    const page = owner.page;
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
    const installmentPrice = (await dialog.getByTestId('terms-total').innerText()).trim();
    await next.click();

    const pay = page.getByRole('dialog', { name: 'Down payment' });
    await pay.getByRole('button', { name: 'Pay' }).dblclick();
    const done = page.getByTestId('done-contract');
    await expect(done).toBeVisible();
    await expect(done).toContainText(installmentPrice);

    const href = await page.getByRole('link', { name: 'View contract' }).getAttribute('href');
    const contractId = String(href?.split('/').pop());
    const contract = ok(await api(owner, 'GET', `/api/contracts/${contractId}`));
    const money = (v: unknown) => Math.round(Number(v) * 100);
    // The slice's check: total = cash price - down payment + profit.
    expect(money(contract['total_payable'])).toBe(
      money(contract['cash_price']) -
        money(contract['down_payment']) +
        money(contract['markup_amount']),
    );
    const lines = contract['lines'] as { amount: string }[];
    expect(lines.reduce((sum, l) => sum + money(l.amount), 0)).toBe(
      money(contract['total_payable']),
    );

    // The down payment is the sale's one cash payment (into the shift's drawer).
    const sale = ok(await api(owner, 'GET', `/api/sales/${String(contract['sale_id'])}`));
    const payments = sale['payments'] as { method: string; amount: string }[];
    expect(payments.map((p) => [p.method, money(p.amount)])).toEqual([
      ['cash', money(contract['down_payment'])],
    ]);

    // The customer account shows the contract, and the page opens from it.
    const account = ok(await api(owner, 'GET', `/api/customers/${customerId}/account`));
    expect((account['contracts'] as { id: string }[]).map((c) => c.id)).toContain(contractId);
    await page.goto(`/contracts/${contractId}`);
    await expect(page.getByTestId('contract-total')).toContainText(installmentPrice);
  });
});

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
 * S05 (EC-72, D88): returns end to end, server and client together. Like D01's spec it makes its own
 * shop (the platform admin provisions it, the owner accepts the emailed invite). The owner sells a
 * sofa (6 000) and a table (4 000) on installments, 1 000 down and 12 monthly installments of 900,
 * and collects two of them; then returns the table on the return page: the page shows 4 280.00 left
 * over 10 installments of 428.00 before confirming, and the return's page shows the contract change
 * (the slice's Done when). A cash sale of two chairs then has one chair returned in cash: the shift's
 * expected cash drops by that chair once. The browser runs in UTC, as in CI. Needs the API (with
 * SMTP to Mailpit), local Supabase with the dev seed and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `s05.owner.${STAMP}@ecotech.test`;
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

/** A new retail shop whose owner has the e2e password; answers its organization id. */
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
      name: `S05 shop ${STAMP}`,
      tenant_slug: `s05-e2e-${STAMP}`,
      plan_key: 'retail',
      owner: { full_name: 'S05 Owner', email: OWNER_EMAIL },
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

test.describe('S05 returns end to end', () => {
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

  test('an installment item back leaves 4 280.00 over 10 x 428.00; a cash return moves the drawer once', async ({
    browser,
  }) => {
    owner = await session(browser, OWNER_EMAIL, orgId, 'en', undefined, 'UTC');
    const { page } = owner;
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const main = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;

    ok(
      await api(owner, 'PATCH', '/api/settings', { prices_include_vat: true, credit_min_score: 0 }),
    );
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [{ up_to_months: 24, pct: 20 }],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
      }),
      201,
    );
    const version = (
      ok(await api(owner, 'GET', '/api/settings'))['installment_policy'] as { version: number }
    ).version;
    const product = async (name: string, sku: string, price: string) =>
      String(
        ok(
          await api(owner, 'POST', '/api/products', {
            name_ar: name,
            name_en: name,
            sku: `S05-${sku}-${STAMP}`,
            cash_price: price,
          }),
          201,
        )['id'],
      );
    const sofa = await product('S05 Sofa', 'SOFA', '6000.00');
    const table = await product('S05 Table', 'TABLE', '4000.00');
    const chair = await product('S05 Chair', 'CHAIR', '100.00');
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        {
          branch_id: main,
          reason: 'found',
          lines: [
            { product_id: sofa, quantity: 2 },
            { product_id: table, quantity: 2 },
            { product_id: chair, quantity: 5 },
          ],
        },
        `s05-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `S05 customer ${STAMP}`,
        phones: ['01500000106'],
        national_id: '29001010100106',
      }),
      201,
    );
    ok(
      await api(owner, 'PUT', `/api/customers/${customer['id']}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'S05 e2e',
      }),
    );
    const device = await newDevice(owner, `S05 POS ${STAMP}`, main);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, main, device);

    // The installment sale and two collections of 900.
    const installment = ok(
      await api(
        owner,
        'POST',
        '/api/installments/sales',
        {
          lines: [
            { product_id: sofa, quantity: 1 },
            { product_id: table, quantity: 1 },
          ],
          expected_total: '10000.00',
          customer_id: customer['id'],
          terms: {
            down_payment: '1000.00',
            installments_count: 12,
            frequency: 'monthly',
            policy_version: version,
          },
        },
        `s05-e2e-inst-${STAMP}`,
      ),
      201,
    );
    const saleId = String((installment['sale'] as { id: string }).id);
    const contractId = String((installment['contract'] as { id: string }).id);
    for (const n of [1, 2]) {
      ok(
        await api(
          owner,
          'POST',
          '/api/collections',
          {
            customer_id: customer['id'],
            contracts: [{ contract_id: contractId, amount: '900.00' }],
            payments: [{ method: 'cash', amount: '900.00' }],
          },
          `s05-e2e-col-${n}-${STAMP}`,
        ),
        201,
      );
    }

    // The return page: the table back (the second line). The page shows the contract after.
    await page.goto(`/sales/${saleId}/return`);
    await expect(page.getByRole('heading', { name: /^Return from sale/ })).toBeVisible();
    await page.getByLabel('Quantity back').nth(1).fill('1');
    await expect(page.getByTestId('remaining-after')).toContainText('4,280.00');
    await expect(page.getByTestId('new-installments')).toContainText('10 installments of');
    await expect(page.getByTestId('new-installments')).toContainText('428.00');
    await page.getByLabel('Reason').fill('The table did not fit');
    await page.getByRole('button', { name: 'Confirm the return' }).click();
    await expect(page).toHaveURL(/\/sales\/returns\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('contract-change')).toContainText('4,280.00');
    const lines = ok(await api(owner, 'GET', `/api/sales/${saleId}/returnable`)) as unknown as {
      contract: { remaining: string; installments_left: number };
    };
    expect(lines.contract).toMatchObject({ remaining: '4280.00', installments_left: 10 });

    // A cash sale of two chairs, one back in cash: the drawer gives back 100 once.
    const cashSale = ok(
      await api(
        owner,
        'POST',
        '/api/sales',
        { lines: [{ product_id: chair, quantity: 2 }], expected_total: '200.00' },
        `s05-e2e-cash-${STAMP}`,
      ),
      201,
    );
    const expected = async () =>
      Number(
        (ok(await api(owner, 'GET', '/api/shifts/current'))['shift'] as { expected_cash: string })
          .expected_cash,
      );
    const before = await expected();
    await page.goto(`/sales/${String(cashSale['id'])}`);
    await page.getByRole('link', { name: 'Return items' }).click();
    await page.getByLabel('Quantity back').first().fill('1');
    await expect(page.getByTestId('return-total')).toContainText('100.00');
    await expect(page.getByTestId('refund-sum')).toContainText('100.00');
    await page.getByLabel('Reason').fill('One chair too many');
    await page.getByRole('button', { name: 'Confirm the return' }).click();
    await expect(page).toHaveURL(/\/sales\/returns\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('return-detail-total')).toContainText('100.00');
    expect(await expected()).toBe(before - 100);
  });
});

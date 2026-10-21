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
  sellByApi,
} from './helpers/int4';

/**
 * D01 (EC-93, D87): the owner dashboard end to end, server and client together. Like K04's spec it
 * makes its own shop (the platform admin provisions it, the owner accepts the emailed invite). The
 * owner makes a second branch and, in the main branch, sells a chair for cash, sells a TV on
 * installments (2 000 down) and collects 1 000 on the contract. The dashboard shows those numbers
 * for all branches; "Sales today" opens the sales history filtered to today with the same total;
 * switching to the second branch changes the numbers to that branch's (nothing yet).
 * The browser runs in UTC, as in CI: "today" on the page must be the shop's day (Africa/Cairo),
 * never the browser's. Needs the API (with SMTP to Mailpit), local Supabase with the dev seed and
 * the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `d01.owner.${STAMP}@ecotech.test`;
const IP = `198.51.105.${(STAMP % 250) + 1}`;
const SHOP_ZONE = 'Africa/Cairo';

/** The shop's business date, as the server computes it. */
const shopToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_ZONE }).format(new Date());

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
      name: `D01 shop ${STAMP}`,
      tenant_slug: `d01-e2e-${STAMP}`,
      plan_key: 'retail',
      owner: { full_name: 'D01 Owner', email: OWNER_EMAIL },
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

test.describe('D01 owner dashboard end to end', () => {
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

  test('sell and collect, read the numbers, open the sales history, switch branch', async ({
    browser,
  }) => {
    owner = await session(browser, OWNER_EMAIL, orgId, 'en', undefined, 'UTC');
    const { page } = owner;
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const main = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    const second = String(
      ok(await api(owner, 'POST', '/api/branches', { name: 'Second D01', code: 'S2' }), 201)['id'],
    );

    // The installment policy, a customer with a limit, a chair and a TV in stock in the main branch.
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
    const chair = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'كرسي',
        name_en: 'D01 Chair',
        sku: `D01-CH-${STAMP}`,
        cash_price: '100.00',
      }),
      201,
    );
    const tv = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'D01 TV',
        sku: `D01-TV-${STAMP}`,
        cash_price: '12000.00',
      }),
      201,
    );
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        {
          branch_id: main,
          reason: 'found',
          lines: [
            { product_id: chair['id'], quantity: 5 },
            { product_id: tv['id'], quantity: 2 },
          ],
        },
        `d01-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `D01 customer ${STAMP}`,
        phones: ['01500000105'],
        national_id: '29001010100105',
      }),
      201,
    );
    ok(
      await api(owner, 'PUT', `/api/customers/${customer['id']}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'D01 e2e',
      }),
    );

    // A shift on a paired device; a 100 cash sale; a TV on installments; 1 000 collected.
    const device = await newDevice(owner, `D01 POS ${STAMP}`, main);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, main, device);
    ok(await sellByApi(owner, String(chair['id']), '100.00', `d01-e2e-sale-${STAMP}`), 201);
    const installment = ok(
      await api(
        owner,
        'POST',
        '/api/installments/sales',
        {
          lines: [{ product_id: tv['id'], quantity: 1 }],
          expected_total: '12000.00',
          customer_id: customer['id'],
          terms: {
            down_payment: '2000.00',
            installments_count: 12,
            frequency: 'monthly',
            policy_version: version,
          },
        },
        `d01-e2e-inst-${STAMP}`,
      ),
      201,
    );
    const contractId = String((installment['contract'] as { id: string }).id);
    ok(
      await api(
        owner,
        'POST',
        '/api/collections',
        {
          customer_id: customer['id'],
          contracts: [{ contract_id: contractId, amount: '1000.00' }],
          payments: [{ method: 'cash', amount: '1000.00' }],
        },
        `d01-e2e-col-${STAMP}`,
      ),
      201,
    );

    // The dashboard, all branches: the shop's day, the sales, the collection and the open shift.
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /^Today,/ })).toBeVisible();
    const sales = page.locator('[data-tile="sales_today"]');
    await expect(sales).toContainText('12,100.00 EGP');
    await expect(sales).toContainText('Sales: 2');
    await expect(sales).toContainText('On installment contracts: 10,000.00 EGP');
    await expect(page.locator('[data-tile="collections_today"]')).toContainText('1,000.00 EGP');
    await expect(page.locator('[data-tile="collections_today"]')).toContainText('Collections: 1');
    await expect(page.locator('[data-tile="open_shifts"]')).toContainText('1');
    // Nothing is late yet and no day is waiting.
    await expect(page.locator('[data-tile="overdue"]')).not.toHaveAttribute('data-attention', /./);

    // "Sales today" opens the sales history of the shop's today, with the same total.
    await sales.getByRole('link', { name: 'Sales today' }).click();
    const day = shopToday();
    await expect(page).toHaveURL(new RegExp(`/sales/history\\?from=${day}&to=${day}$`));
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows).toHaveCount(3);
    const totals = await page
      .getByRole('table')
      .locator('td')
      .allInnerTexts()
      .then((cells) =>
        cells
          .map((c) => /^([\d,]+\.\d{2}) EGP$/.exec(c.trim())?.[1])
          .filter((c): c is string => !!c)
          .map((c) => Math.round(Number(c.replace(/,/g, '')) * 100)),
      );
    expect(totals.reduce((a, b) => a + b, 0)).toBe(1_210_000);

    // One branch: the second one has nothing yet, and its links carry the branch.
    await page.goto('/dashboard');
    await page.getByLabel('Branch', { exact: true }).selectOption({ label: 'Second D01' });
    await expect(sales).toContainText('0.00 EGP');
    await expect(sales).toContainText('Sales: 0');
    await expect(page.locator('[data-tile="collections_today"]')).toContainText('Collections: 0');
    await expect(page.locator('[data-tile="open_shifts"]')).toContainText('0');
    await sales.getByRole('link', { name: 'Sales today' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/sales/history\\?from=${day}&to=${day}&branch_id=${second}$`),
    );
    await expect(page.getByText('No sales found')).toBeVisible();
    await expect(page.getByLabel('Branch', { exact: true })).toHaveValue(second);

    // The main branch again: the numbers are back, and the choice is remembered on a reload.
    await page.goto('/dashboard');
    await expect(page.getByLabel('Branch', { exact: true })).toHaveValue(second);
    await page.getByLabel('Branch', { exact: true }).selectOption({ label: 'All branches' });
    await expect(sales).toContainText('12,100.00 EGP');
    await page.reload();
    await expect(page.getByLabel('Branch', { exact: true })).toHaveValue('');
    await expect(sales).toContainText('12,100.00 EGP');
  });
});

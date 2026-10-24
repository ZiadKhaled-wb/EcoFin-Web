import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  Customer,
  formatEgp,
  Product,
  SalesOrder,
  sumMoney,
  subtractMoney,
} from '@ziadkhaled-wb/contracts';
import {
  PASSWORD,
  STAMP,
  api,
  closeOpenShift,
  newDevice,
  ok,
  openShiftByApi,
  pairByApi,
  session,
  type Session,
} from './helpers/int4';

/**
 * S10 E1 in a shop of its own (the platform admin provisions it; the owner, a cashier and a branch
 * manager accept their emailed invites), so no other spec shares its staff, devices or drawers.
 * Needs the local API (with SMTP to Mailpit) and Supabase (RUN_E2E=1). Drawers are per employee:
 * the cashier's drawer takes the deposit and the manager's drawer (opened with a float of the
 * deposit from the funded safe) pays the cash refund.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `s10.owner.${STAMP}@ecotech.test`;
const CASHIER_EMAIL = `s10.cashier.${STAMP}@ecotech.test`;
const MANAGER_EMAIL = `s10.manager.${STAMP}@ecotech.test`;
const IP = `198.51.111.${(STAMP % 250) + 1}`;

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
      name: `S10 shop ${STAMP}`,
      tenant_slug: `s10-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'S10 Owner', email: OWNER_EMAIL },
    },
  });
  expect(shop.status(), await shop.text()).toBe(201);
  const orgId = String(((await shop.json()) as { organization_id: string }).organization_id);
  await acceptInvite(request, OWNER_EMAIL);
  return orgId;
}

const AR = JSON.parse(
  readFileSync(new URL('../src/i18n/locales/ar/salesOrders.json', import.meta.url), 'utf8'),
) as { print: { title: string; depositsPaid: string; balanceDue: string; notes: string } };
const DEPOSIT = '1000.00';
const fmt = (m: string, lang: 'ar' | 'en' = 'en') => formatEgp(m, lang);

/** Visible leaf text that looks like an untranslated i18n key (`ns.path.key`). */
async function rawKeys(page: Page) {
  const visible = await page.locator('body').evaluate((body) =>
    Array.from(body.querySelectorAll('*'))
      .filter((el) => el.children.length === 0 && (el as HTMLElement).offsetParent !== null)
      .map((el) => el.textContent ?? '')
      .join('\n'),
  );
  return visible
    .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+/g, '')
    .match(/\b[a-z][A-Za-z_]*(\.[A-Za-z_]+)+\b/g);
}

const expectedCash = async (s: Session) =>
  (ok(await api(s, 'GET', '/api/shifts/current'))['shift'] as { expected_cash: string })
    .expected_cash;

/** The I01 row of a product: [reserved, available] as shown. */
async function stockOf(page: Page, sku: string) {
  await page.goto('/inventory/stock');
  await page.getByLabel('Search by name, SKU or barcode').first().fill(sku);
  const row = page.locator('tbody tr', { hasText: sku });
  await expect(row).toHaveCount(1);
  const headers = (await page.locator('thead th').allInnerTexts()).map((h) => h.trim());
  const cell = (name: string) => row.locator('td').nth(headers.indexOf(name)).innerText();
  return [await cell('Reserved'), await cell('Available')].map((v) => v.trim());
}

let orderId = '';
let orgId = '';

test.describe.serial('S10 sales orders', () => {
  test.skip(process.env.RUN_E2E !== '1', 'Requires the local API and Supabase');
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ request }) => {
    orgId = await provisionShop(request);
  });

  test('E1 quote to order: reserve + to_order, deposit, print AR/EN, stock, POS refusal, manager cancel with cash refund', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const warnings: string[] = [];
    const owner = await session(browser, OWNER_EMAIL, orgId, 'en', warnings);
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    // The shop's cashier and branch manager, with logins.
    for (const [email, role, name] of [
      [CASHIER_EMAIL, 'CASHIER', 'S10 Cashier'],
      [MANAGER_EMAIL, 'BRANCH_MANAGER', 'S10 Manager'],
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
    // The branch safe holds the cash the manager's float is taken from.
    const [safe] = ok(
      await api(owner, 'GET', `/api/cash-accounts?kind=safe&branch_id=${branch}`),
    ) as unknown as { id: string }[];
    ok(
      await api(
        owner,
        'POST',
        `/api/cash-accounts/${safe!.id}/opening`,
        { amount: '5000.00', note: 'S10 e2e' },
        `s10-safe-${STAMP}`,
      ),
    );
    const cashier = await session(browser, CASHIER_EMAIL, orgId, 'en', warnings);
    const manager = await session(browser, MANAGER_EMAIL, orgId, 'en', warnings);
    try {
      // Fixtures: a serialized phone with one fresh serial, a to-order product, a customer.
      const serial = `S10-SN-${STAMP}`;
      const phone = Product.parse(
        ok(
          await api(owner, 'POST', '/api/products', {
            name_ar: 'هاتف طلب',
            name_en: `S10 phone ${STAMP}`,
            sku: `S10-PH-${STAMP}`,
            cash_price: '5000.00',
            is_serialized: true,
          }),
          201,
        ),
      );
      const sofa = Product.parse(
        ok(
          await api(owner, 'POST', '/api/products', {
            name_ar: 'كنبة طلب',
            name_en: `S10 sofa ${STAMP}`,
            sku: `S10-SO-${STAMP}`,
            cash_price: '228.00',
          }),
          201,
        ),
      );
      ok(
        await api(
          owner,
          'POST',
          '/api/units',
          { product_id: phone.id, branch_id: branch, cost: '3000.00', serials: [serial] },
          `s10-units-${STAMP}`,
        ),
        201,
      );
      const customer = Customer.parse(
        ok(
          await api(owner, 'POST', '/api/customers', {
            full_name: `S10 customer ${STAMP}`,
            phones: ['01012345678'],
          }),
          201,
        ),
      );
      // A till each for the cashier and the manager (one open shift per device).
      const till = await newDevice(owner, `S10 Till ${STAMP}`, branch);
      const managerTill = await newDevice(owner, `S10 Manager Till ${STAMP}`, branch);
      await pairByApi(owner, cashier, till);
      await pairByApi(owner, manager, managerTill);
      await openShiftByApi(cashier, branch, till);

      const page = cashier.page;
      // The POS cart holds the serial while it is still free; it is sold after the reservation.
      const pos = await cashier.context.newPage();
      await pos.goto('/sales/pos');
      const posSearch = pos.getByRole('searchbox', {
        name: 'Find a product by name, SKU or barcode',
      });
      await posSearch.fill(serial);
      await posSearch.press('Enter');
      await expect(pos.getByText(serial)).toBeVisible();

      // The accepted quote: a custom line (to be ordered as the sofa) and the phone.
      await page.goto('/sales/quotations/new');
      await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption(branch);
      await page.getByLabel('Search customers', { exact: true }).fill(customer.full_name);
      await expect(page.getByRole('option', { name: new RegExp(customer.full_name) })).toHaveCount(
        1,
      );
      await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(customer.id);
      await page.getByLabel('Description', { exact: true }).fill('Custom sofa');
      await page.getByLabel('Unit price', { exact: true }).fill('228.00');
      await page.getByLabel('Search products or barcode').fill(phone.sku);
      await page.getByRole('button', { name: phone.name_en!, exact: true }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page).toHaveURL(/\/sales\/quotations\/[0-9a-f-]+$/);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(page.getByText('Accepted', { exact: true })).toBeVisible();

      // Create order: line 1 to_order as the sofa, line 2 from stock with the serial.
      await page.getByRole('button', { name: 'Create order', exact: true }).click();
      const convert = page.getByRole('dialog', { name: 'Create an order from this quote' });
      const custom = convert.getByRole('group', { name: 'Line 1: Custom sofa' });
      await custom.getByLabel('Product for this line').fill(sofa.sku);
      await custom.getByRole('button', { name: new RegExp(sofa.name_en!) }).click();
      await expect(custom.getByText(`Chosen: ${sofa.name_en!}`)).toBeVisible();
      await custom.getByRole('combobox').selectOption('to_order');
      const phoneLine = convert.getByRole('group', { name: /^Line 2:/ });
      await phoneLine.getByText(serial, { exact: true }).click();
      await convert.getByRole('button', { name: 'Confirm order', exact: true }).click();
      await expect(page).toHaveURL(/\/sales\/orders\/[0-9a-f-]+$/);
      orderId = page.url().split('/').pop()!;
      const lines = page.locator('section[aria-labelledby="sales-order-lines"] tbody tr');
      await expect(lines.filter({ hasText: phone.name_en! })).toContainText('1 of 1 reserved');
      await expect(lines.filter({ hasText: phone.name_en! })).toContainText(serial);
      await expect(lines.filter({ hasText: sofa.name_en! })).toContainText(
        'To order, no purchase order',
      );
      let order = SalesOrder.parse(ok(await api(cashier, 'GET', `/api/orders/${orderId}`)));
      expect(order.status).toBe('open');
      expect(order.lines.map((l) => [l.product.id, l.fulfilment, l.reserved])).toEqual(
        expect.arrayContaining([
          [phone.id, 'from_stock', 1],
          [sofa.id, 'to_order', 0],
        ]),
      );

      // A cash deposit on the cashier's shift.
      const drawerBefore = await expectedCash(cashier);
      await page.getByRole('button', { name: 'Add deposit', exact: true }).click();
      const pay = page.getByRole('dialog', { name: 'Add deposit' });
      await pay.getByLabel('Amount: Cash').fill(DEPOSIT);
      await pay.getByRole('button', { name: 'Pay', exact: true }).click();
      await expect(pay).toBeHidden();
      order = SalesOrder.parse(ok(await api(cashier, 'GET', `/api/orders/${orderId}`)));
      expect(order.balances.deposits_paid).toBe(DEPOSIT);
      expect(order.balances.unpaid).toBe(subtractMoney(order.total, DEPOSIT));
      const balances = page.locator('section[aria-labelledby="sales-order-balances"]');
      await expect(balances).toContainText(fmt(DEPOSIT));
      await expect(balances).toContainText(fmt(order.balances.unpaid));
      expect(await expectedCash(cashier)).toBe(sumMoney([drawerBefore, DEPOSIT]));

      // I01: the reserved serial shows as reserved, not available.
      expect(await stockOf(owner.page, phone.sku)).toEqual(['1', '0']);

      // POS: the reserved serial can't be sold; the localized message, not the code.
      await pos.getByRole('button', { name: 'Confirm and pay' }).click();
      const posPay = pos.getByRole('dialog', { name: 'Payment' });
      await posPay.getByRole('button', { name: 'Pay', exact: true }).click();
      await expect(
        posPay.getByText('This serial is no longer in stock in this branch.'),
      ).toBeVisible();
      await expect(pos.getByText('UNIT_NOT_AVAILABLE')).toHaveCount(0);
      await pos.close();

      // The confirmation in English, then Arabic.
      await page.getByRole('link', { name: 'Print', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/sales/orders/${orderId}/print$`));
      const print = page.locator('main .sales-order-print');
      await expect(print).toHaveAttribute('dir', 'ltr');
      for (const text of [phone.name_en!, sofa.name_en!, 'Notes', 'Deposits paid'])
        await expect(print).toContainText(text);
      await expect(print).toContainText(fmt(DEPOSIT));
      await expect(print.getByTestId('print-balance-due')).toHaveText(fmt(order.balances.unpaid));
      await page.getByRole('button', { name: /العربية/ }).click();
      await expect(print).toHaveAttribute('dir', 'rtl');
      for (const text of [
        AR.print.title,
        AR.print.depositsPaid,
        AR.print.balanceDue,
        AR.print.notes,
        'هاتف طلب',
        'كنبة طلب',
      ])
        await expect(print).toContainText(text);
      await expect(print).toContainText(fmt(DEPOSIT, 'ar'));
      await expect(print.getByTestId('print-balance-due')).toHaveText(
        fmt(order.balances.unpaid, 'ar'),
      );
      await page.getByRole('button', { name: /English/ }).click();
      await expect(print).toHaveAttribute('dir', 'ltr');

      // The cashier can't cancel; the manager cancels with one cash refund line from their drawer.
      await page.goto(`/sales/orders/${orderId}`);
      await expect(page.getByRole('button', { name: 'Add deposit' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
      const m = manager.page;
      await m.goto('/accounting/shifts');
      await m.getByLabel('Opening float').fill(DEPOSIT);
      await m.getByLabel('Safe').selectOption({ index: 1 });
      await m.getByRole('button', { name: 'Open shift' }).click();
      await expect(m.getByTestId('shift-expected')).toBeVisible();
      expect(await expectedCash(manager)).toBe(DEPOSIT);
      await m.goto(`/sales/orders/${orderId}`);
      await m.getByRole('button', { name: 'Cancel order', exact: true }).click();
      const cancel = m.getByRole('dialog', { name: 'Cancel order' });
      await cancel.getByLabel('Reason', { exact: true }).fill('Customer changed their mind');
      await expect(cancel.getByLabel('Method, line 1')).toHaveValue('cash');
      await expect(cancel.getByTestId('cancel-refunded')).toHaveText(fmt(DEPOSIT));
      await cancel.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
      await expect(cancel).toBeHidden();
      await expect(m.getByText('Cancelled', { exact: true })).toBeVisible();
      order = SalesOrder.parse(ok(await api(manager, 'GET', `/api/orders/${orderId}`)));
      expect(order.status).toBe('cancelled');
      expect(order.balances.deposits_paid).toBe('0.00');
      expect(order.lines.every((l) => l.reserved === 0)).toBe(true);
      expect(order.payments.map((p) => [p.direction, p.method, p.amount])).toEqual([
        ['in', 'cash', DEPOSIT],
        ['out', 'cash', DEPOSIT],
      ]);
      // The refund left the manager's drawer at its float minus the deposit; the cashier's keeps it.
      expect(await expectedCash(manager)).toBe('0.00');
      expect(await expectedCash(cashier)).toBe(sumMoney([drawerBefore, DEPOSIT]));
      expect(await stockOf(owner.page, phone.sku)).toEqual(['0', '1']);
      expect(warnings).toEqual([]);
    } finally {
      // Each shift is closed from its own paired device, so a failed run leaves none open.
      for (const s of [cashier, manager]) await closeOpenShift(s).catch(() => undefined);
      await Promise.all([owner, cashier, manager].map((s) => s.context.close()));
    }
  });

  test('E1 (UI): orders list, detail, new order and print in Arabic and English', async ({
    browser,
  }) => {
    test.skip(!orderId, 'needs the order E1 made');
    for (const [lang, dir] of [
      ['ar', 'rtl'],
      ['en', 'ltr'],
    ] as const) {
      const warnings: string[] = [];
      const s = await session(browser, CASHIER_EMAIL, orgId, lang, warnings);
      try {
        for (const path of [
          '/sales/orders',
          `/sales/orders/${orderId}`,
          '/sales/orders/new',
          `/sales/orders/${orderId}/print`,
        ]) {
          await s.page.goto(path);
          await s.page.waitForLoadState('networkidle');
          await expect(s.page.locator('main').first()).toBeVisible();
          await expect(s.page.locator('html')).toHaveAttribute('dir', dir);
          expect(await rawKeys(s.page), `${lang} ${path}`).toBeNull();
        }
        expect(warnings).toEqual([]);
      } finally {
        await s.context.close();
      }
    }
  });
});

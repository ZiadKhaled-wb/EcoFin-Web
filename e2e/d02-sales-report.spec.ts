import { readFile } from 'node:fs/promises';
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
 * D02 (EC-94, D89): the sales and margin report end to end, server and client together. Like S05's spec it
 * makes its own shop (the platform admin provisions it, the owner accepts the emailed invite). The owner
 * sells two chairs (500) and a table with 10 % off (1 000 -> 900), then takes one chair back (250 in
 * cash). The report for the shop's day, grouped by product and by seller, shows the numbers of those
 * documents (the discount, the return, the check line), and the CSV export holds every row and the totals.
 * The browser runs in UTC, as in CI. Needs the API (with SMTP to Mailpit), local Supabase with the dev seed
 * and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `d02.owner.${STAMP}@ecotech.test`;
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
      name: `D02 shop ${STAMP}`,
      tenant_slug: `d02-e2e-${STAMP}`,
      plan_key: 'retail',
      owner: { full_name: 'D02 Owner', email: OWNER_EMAIL },
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

test.describe('D02 sales and margin report end to end', () => {
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

  test('the report shows the documents of the day by product and by seller, and exports them as CSV', async ({
    browser,
  }) => {
    owner = await session(browser, OWNER_EMAIL, orgId, 'en', undefined, 'UTC');
    const { page } = owner;
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const main = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    ok(await api(owner, 'PATCH', '/api/settings', { prices_include_vat: true }));
    const product = async (name: string, sku: string, price: string) =>
      String(
        ok(
          await api(owner, 'POST', '/api/products', {
            name_ar: name,
            name_en: name,
            sku: `D02-${sku}-${STAMP}`,
            cash_price: price,
          }),
          201,
        )['id'],
      );
    const chair = await product('D02 Chair', 'CHAIR', '250.00');
    const table = await product('D02 Table', 'TABLE', '1000.00');
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        {
          branch_id: main,
          reason: 'found',
          lines: [
            { product_id: chair, quantity: 5 },
            { product_id: table, quantity: 3 },
          ],
        },
        `d02-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `D02 POS ${STAMP}`, main);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, main, device);

    // Two chairs (500), a table with 10 % off (900) and one chair back in cash (250).
    const chairSale = ok(
      await api(
        owner,
        'POST',
        '/api/sales',
        { lines: [{ product_id: chair, quantity: 2 }], expected_total: '500.00' },
        `d02-e2e-chairs-${STAMP}`,
      ),
      201,
    );
    ok(
      await api(
        owner,
        'POST',
        '/api/sales',
        {
          lines: [
            {
              product_id: table,
              quantity: 1,
              discount: { type: 'percent', value: '10' },
            },
          ],
          discount_reason: 'Closing offer',
          expected_total: '900.00',
        },
        `d02-e2e-table-${STAMP}`,
      ),
      201,
    );
    const saleId = String(chairSale['id']);
    const line = (
      ok(await api(owner, 'GET', `/api/sales/${saleId}/returnable`)) as unknown as {
        lines: { sale_line_id: string }[];
      }
    ).lines[0]!.sale_line_id;
    ok(
      await api(
        owner,
        'POST',
        '/api/returns',
        {
          sale_id: saleId,
          lines: [{ sale_line_id: line, quantity: 1 }],
          refunds: [{ method: 'cash', amount: '250.00' }],
          reason: 'One chair too many',
          expected_total: '250.00',
        },
        `d02-e2e-return-${STAMP}`,
      ),
      201,
    );
    const day = String(
      (ok(await api(owner, 'GET', `/api/sales/${saleId}`)) as { business_date: string })
        .business_date,
    );

    // By product: the chair row and the table row with the documents' numbers.
    await page.goto(`/reports/sales?from=${day}&to=${day}&group_by=product`);
    await expect(page.getByRole('heading', { name: 'Sales and margin' })).toBeVisible();
    const chairRow = page.getByRole('row').filter({ hasText: 'D02 Chair' });
    await expect(chairRow.getByRole('cell').nth(1)).toHaveText('1'); // one sale
    await expect(chairRow.getByRole('cell').nth(2)).toHaveText('2'); // two chairs sold
    const tableRow = page.getByRole('row').filter({ hasText: 'D02 Table' });
    await expect(tableRow.getByRole('cell').nth(1)).toHaveText('1');
    await expect(page.getByText('Totals checked against 2 sales documents')).toBeVisible();

    // By seller: the owner sold both documents.
    await page.getByRole('combobox', { name: 'Group by' }).selectOption('employee');
    await expect(page.getByRole('table', { name: 'Sales and margin by Seller' })).toBeVisible();
    const ownerRow = page.getByRole('row').filter({ hasText: 'D02 Owner' });
    await expect(ownerRow.getByRole('cell').nth(1)).toHaveText('2');
    await expect(ownerRow.getByRole('link', { name: /Open the sales of D02 Owner/ })).toBeVisible();

    // CSV: every row and the totals line, numbers as the server sent them.
    await page.getByRole('combobox', { name: 'Group by' }).selectOption('product');
    await expect(page.getByRole('table', { name: 'Sales and margin by Product' })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`sales-report-${day}-${day}-product.csv`);
    const csv = (await readFile(await download.path(), 'utf8')).replace(
      String.fromCharCode(0xfeff),
      '',
    );
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(4); // header, two products, totals
    const header = lines[0]!.split(',');
    const cell = (row: string, name: string) => row.split(',')[header.indexOf(name)];
    const chairLine = lines.find((l) => l.startsWith('D02 Chair'))!;
    const tableLine = lines.find((l) => l.startsWith('D02 Table'))!;
    const totals = lines.find((l) => l.startsWith('Totals'))!;
    expect(cell(chairLine, 'Quantity')).toBe('2');
    expect(cell(chairLine, 'With VAT')).toBe('500.00');
    expect(cell(chairLine, 'Returned with VAT')).toBe('250.00');
    expect(cell(chairLine, 'Cost')).toBe('0.00'); // no purchase set a cost: the snapshot is 0
    expect(cell(tableLine, 'With VAT')).toBe('900.00');
    expect(cell(tableLine, 'Discounts')).toBe('100.00');
    expect(cell(totals, 'Sales')).toBe('2');
    expect(cell(totals, 'With VAT')).toBe('1400.00');
    expect(cell(totals, 'Returned with VAT')).toBe('250.00');
  });
});

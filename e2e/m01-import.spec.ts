import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { PASSWORD, STAMP, type Session, session, api, ok } from './helpers/int4';

/**
 * M01 (EC-100, D83): import products, suppliers and opening stock end to end, server and client
 * together. Like N07's spec it makes its own shop (the platform admin provisions it, the owner
 * accepts the emailed invite). The owner:
 *   1. checks a products CSV that uses the shop's own column names and has two errors: both are
 *      listed by row, the Import button is off and nothing is saved;
 *   2. fixes the file, imports it (the background job runs in the API) and finds the products;
 *   3. imports the same file again: nothing is new;
 *   4. imports opening stock for one branch: the stock levels equal the file.
 * Needs the API with the job worker on (JOBS_ENABLED=true, JOBS_POLL_SECONDS=5, SMTP to Mailpit),
 * local Supabase with the dev seed and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `m01.owner.${STAMP}@ecotech.test`;
const IP = `198.51.108.${(STAMP % 250) + 1}`;

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
      name: `M01 shop ${STAMP}`,
      tenant_slug: `m01-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'M01 Owner', email: OWNER_EMAIL },
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

const csv = (lines: string[]) => ({
  name: 'file.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(lines.join('\r\n') + '\r\n', 'utf8'),
});

/** Opens a kind's wizard, chooses the file and reads it: the column step is next. */
async function startWith(page: Page, kind: string, file: ReturnType<typeof csv>) {
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: kind }) });
  await card.getByRole('button', { name: 'Import from a file' }).click();
  await page.getByLabel('Choose a file', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: 'Read the file' }).click();
  await expect(page.getByRole('heading', { name: 'Match your columns' })).toBeVisible();
}

test.describe('M01 import end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(300_000);

  let owner: Session;

  test.beforeAll(async ({ browser, request }) => {
    owner = await session(browser, OWNER_EMAIL, await provisionShop(request));
  });
  test.afterAll(async () => {
    await owner?.context.close();
  });

  test('errors save nothing; the fixed file imports; the same file again changes nothing; stock equals the file', async () => {
    const page = owner.page;
    const sku = (tag: string) => `M01-${STAMP}-${tag}`;
    const count = async () => {
      const list = ok(await api(owner, 'GET', `/api/products?search=M01-${STAMP}&pageSize=50`)) as {
        total: number;
      };
      return list.total;
    };
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      name: string;
      is_main: boolean;
    }[];
    const main = branches.find((b) => b.is_main) ?? branches[0]!;

    await page.goto('/settings/import');
    await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible();

    // 1. A file with the shop's own column names and two errors.
    await startWith(
      page,
      'Products',
      csv([
        'Item Code,Product Name,Price,Category',
        `${sku('A')},Samsung A15,9000,Phones > Samsung`,
        `${sku('B')},,100,`,
        `${sku('A')},Repeated,5,`,
      ]),
    );
    await expect(page.getByRole('combobox', { name: 'Cash price' })).toHaveValue('Price');
    await page.getByRole('button', { name: 'Check the file' }).click();
    const errors = page.getByRole('table', { name: 'Errors by row' });
    await expect(errors).toBeVisible();
    await expect(errors.getByRole('row')).toHaveCount(3); // header + 2 errors
    await expect(errors.getByRole('row', { name: /3/ })).toContainText(
      'A required value is missing',
    );
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    expect(await count()).toBe(0);

    // 2. The fixed file.
    await page.getByRole('button', { name: 'Start over' }).click();
    await startWith(
      page,
      'Products',
      csv([
        'Item Code,Product Name,Price,Category',
        `${sku('A')},Samsung A15,9000,Phones > Samsung`,
        `${sku('B')},USB cable,100,Phones`,
      ]),
    );
    await page.getByRole('button', { name: 'Check the file' }).click();
    await expect(page.getByText('No errors. Nothing has been saved yet.')).toBeVisible();
    await expect(page.getByText(/Phones, Phones > Samsung/)).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Import now' }).click();
    await expect(page.getByText('Import finished')).toBeVisible({ timeout: 90_000 });
    expect(await count()).toBe(2);
    await page.getByRole('link', { name: 'Open the list' }).click();
    await expect(page).toHaveURL(/\/inventory\/products/);

    // 3. The same file again: nothing new.
    await page.goto('/settings/import');
    await startWith(
      page,
      'Products',
      csv([
        'Item Code,Product Name,Price,Category',
        `${sku('A')},Samsung A15,9000,Phones > Samsung`,
        `${sku('B')},USB cable,100,Phones`,
      ]),
    );
    await page.getByRole('button', { name: 'Check the file' }).click();
    await expect(page.getByText('No errors. Nothing has been saved yet.')).toBeVisible();
    // The "Unchanged" tile says 2 (and nothing is new).
    const unchanged = page
      .locator('div.rounded-control.px-4.py-3')
      .filter({ hasText: 'Unchanged' });
    await expect(unchanged).toContainText('2');
    const created = page.locator('div.rounded-control.px-4.py-3').filter({ hasText: /^New/ });
    await expect(created).toContainText('0');
    expect(await count()).toBe(2);

    // 4. Opening stock for the main branch.
    await page.goto('/settings/import');
    const card = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Opening stock' }) });
    await card.getByRole('button', { name: 'Import from a file' }).click();
    await page.getByLabel('Branch', { exact: true }).selectOption({ label: main.name });
    await page
      .getByLabel('Choose a file', { exact: true })
      .setInputFiles(csv(['SKU,Qty,Cost', `${sku('A')},10,6500`, `${sku('B')},4,60.50`]));
    await page.getByRole('button', { name: 'Read the file' }).click();
    await expect(page.getByRole('heading', { name: 'Match your columns' })).toBeVisible();
    await page.getByRole('button', { name: 'Check the file' }).click();
    await expect(page.getByText('No errors. Nothing has been saved yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Import now' }).click();
    await expect(page.getByText('Import finished')).toBeVisible({ timeout: 90_000 });

    const stock = ok(
      await api(owner, 'GET', `/api/stock?branch_id=${main.id}&search=M01-${STAMP}&pageSize=50`),
    ) as unknown as { items: { sku: string; on_hand: number }[] };
    expect(Object.fromEntries(stock.items.map((r) => [r.sku, r.on_hand]))).toEqual({
      [sku('A')]: 10,
      [sku('B')]: 4,
    });

    // The history keeps all of it.
    await page.goto('/settings/import');
    await page.getByRole('tab', { name: 'History' }).click();
    const history = page.getByRole('table', { name: 'History' });
    await expect(history.getByRole('row')).toHaveCount(5); // header + 4 imports (1 failed check, 3 ran or checked)
    await expect(history).toContainText('Completed');
    await expect(history).toContainText('Failed');
  });
});

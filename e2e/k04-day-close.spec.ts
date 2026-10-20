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
  sellByApi,
} from './helpers/int4';

/**
 * K04 (EC-62, D84): the day close end to end, server and client together. Like N06's spec it
 * makes its own shop (the platform admin provisions it, the owner accepts the emailed invite). The
 * owner sells through the API in a shift and closes the shift; on the Day close page they open
 * today for the main branch, see the day's sales and close it with a note. Posting into the closed
 * day is refused (DAY_CLOSED); the owner reopens it with a reason, a late stock entry posts, and
 * the day closes again. Needs the API (with SMTP to Mailpit), local Supabase with the dev seed and
 * the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `k04.owner.${STAMP}@ecotech.test`;
const IP = `198.51.104.${(STAMP % 250) + 1}`;

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
      name: `K04 shop ${STAMP}`,
      tenant_slug: `k04-e2e-${STAMP}`,
      plan_key: 'retail',
      owner: { full_name: 'K04 Owner', email: OWNER_EMAIL },
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

test.describe('K04 day close end to end', () => {
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

  test('sell, close the shift, close the day, refused entry, reopen, close again', async ({
    browser,
  }) => {
    owner = await session(browser, OWNER_EMAIL, orgId);
    const { page } = owner;
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;

    // A product with stock, a shift on a paired device, one cash sale of 100, the shift closed.
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'كرسي',
        name_en: 'K04 Chair',
        sku: `K04-CH-${STAMP}`,
        cash_price: '100.00',
      }),
      201,
    );
    const adjust = (tag: string) =>
      api(
        owner,
        'POST',
        '/api/stock/adjustments',
        { branch_id: branch, reason: 'found', lines: [{ product_id: product['id'], quantity: 3 }] },
        `k04-e2e-stock-${tag}-${STAMP}`,
      );
    ok(await adjust('first'), 201);
    const device = await newDevice(owner, `K04 POS ${STAMP}`, branch);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, branch, device);
    ok(await sellByApi(owner, String(product['id']), '100.00', `k04-e2e-sale-${STAMP}`), 201);
    await closeOpenShift(owner);

    // Day close: today for the main branch, the sale in the numbers, closed with a note.
    await page.goto('/accounting/day-close');
    await page.getByRole('button', { name: 'Show the day' }).click();
    await expect(page).toHaveURL(new RegExp(`/accounting/day-close/${branch}/\\d{4}-\\d{2}-\\d{2}$`));
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible();
    await expect(page.getByText(/closed with a difference/)).toBeVisible();
    await page.getByRole('button', { name: 'Close the day' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/no more sales, payments or expenses/)).toBeVisible();
    await dialog.getByLabel(/Note/).fill('K04 e2e close');
    await dialog.getByRole('button', { name: 'Close the day' }).click();
    await expect(page).toHaveURL(/\/accounting\/day-close\/closed\//);
    await expect(page.getByText(/^Closed by K04 Owner/)).toBeVisible();
    await expect(page.getByText('K04 e2e close')).toBeVisible();

    // The closed day refuses a new entry in this branch.
    const refused = await adjust('refused');
    expect(refused.status).toBe(409);
    expect(errorCode(refused)).toBe('DAY_CLOSED');

    // The owner reopens with a reason; the late entry posts; the day closes again.
    await page.getByRole('button', { name: 'Reopen the day' }).click();
    await page.getByRole('dialog').getByLabel(/Reason/).fill('Late stock receipt');
    await page.getByRole('dialog').getByRole('button', { name: 'Reopen' }).click();
    await expect(page).toHaveURL(new RegExp(`/accounting/day-close/${branch}/`));
    await expect(page.getByText('Reopened', { exact: true })).toBeVisible();
    ok(await adjust('late'), 201);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.getByRole('button', { name: 'Close the day' }).click();
    await page.getByRole('dialog').getByLabel(/Note/).fill('Closed again after the late receipt');
    await page.getByRole('dialog').getByRole('button', { name: 'Close the day' }).click();
    await expect(page).toHaveURL(/\/accounting\/day-close\/closed\//);
    await expect(page.getByText('Closed again after the late receipt')).toBeVisible();

    // The list shows the day as closed.
    await page.goto('/accounting/day-close');
    await expect(page.getByRole('table').getByText('Closed', { exact: true })).toBeVisible();
  });
});

import { expect, test, type Page } from '@playwright/test';

/**
 * F04 client e2e. Needs the API, local Supabase (with Mailpit) and the dev server.
 * Skipped unless RUN_E2E=1. Credentials come from the seed data via env vars:
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD            a login with ONE shop
 *   E2E_MULTI_EMAIL, E2E_MULTI_PASSWORD            a login with TWO shops
 *   E2E_MULTI_SHOP_NAME                            the name of the shop to choose
 *   E2E_RESET_EMAIL, E2E_RESET_PASSWORD            a DEDICATED user for the forgot-password
 *                                                  test (its password is changed, then restored)
 *   E2E_API_URL        (default http://localhost:3000)
 *   E2E_MAILPIT_URL    (default http://127.0.0.1:54324)
 * Labels are Arabic (the default language); override with E2E_* if the copy changes.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const env = (name: string) => process.env[name] ?? '';

// Own client IP per test, so the API's per-IP login limiter (10 per 15 min) doesn't trip when the
// suite is rerun locally. The API trusts one proxy hop (Vite's dev proxy passes the header on).
let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.51.100.${(ipCounter++ % 250) + 1}` });
});

const IDENTIFIER = 'اسم المستخدم أو البريد الإلكتروني';
const PASSWORD = 'كلمة المرور';
const SIGN_IN = 'تسجيل الدخول';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(IDENTIFIER).fill(email);
  await page.getByLabel(PASSWORD, { exact: true }).fill(password);
  await page.getByRole('button', { name: SIGN_IN }).click();
}

const storedAuth = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('ecofin-auth');
    return raw ? (JSON.parse(raw) as { state: Record<string, string> }).state : null;
  });

/** Overwrites fields of the persisted auth state (the zustand store reads it on page load). */
const patchStoredAuth = (page: Page, patch: Record<string, string>) =>
  page.evaluate((fields) => {
    const raw = localStorage.getItem('ecofin-auth');
    if (!raw) return;
    const stored = JSON.parse(raw) as { state: Record<string, string> };
    Object.assign(stored.state, fields);
    localStorage.setItem('ecofin-auth', JSON.stringify(stored));
  }, patch);

const authHeaders = (state: Record<string, string> | null) => ({
  Authorization: `Bearer ${state?.accessToken ?? ''}`,
  'x-org-id': state?.orgId ?? '',
});

test.describe('auth flows', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('expired access token: the silent refresh runs and the NEW token works on /me', async ({
    page,
    request,
  }) => {
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await expect(page).toHaveURL(/\/dashboard/);
    const before = await storedAuth(page);

    // expiresAt in the past: on load the silent-refresh timer fires at once (delay 0).
    await patchStoredAuth(page, {
      accessToken: 'expired.invalid.token',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const refresh = page.waitForResponse((r) => r.url().endsWith('/api/auth/refresh'));
    await page.reload();
    expect((await refresh).status()).toBe(200);
    await expect
      .poll(async () => (await storedAuth(page))?.accessToken)
      .not.toBe('expired.invalid.token');

    // The new token really works on an authenticated endpoint.
    const after = await storedAuth(page);
    expect(after?.orgId).toBe(before?.orgId);
    const me = await request.get(`${API}/api/auth/me`, { headers: authHeaders(after) });
    expect(me.status()).toBe(200);
    // Not asserted: that the previous access token now fails. The contract does not promise
    // that a refresh revokes the old access token (only logout is specified to).
  });

  test('401 path: a garbage token with a future expiry triggers exactly one refresh, then the retried call succeeds', async ({
    page,
  }) => {
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await expect(page).toHaveURL(/\/dashboard/);

    // Future expiry: the silent timer stays idle, so only the 401 interceptor can refresh.
    await patchStoredAuth(page, {
      accessToken: 'garbage.invalid.token',
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    // Count from the reload on: the shell's own GET /api/auth/me on load (F09) is the first call
    // to meet the garbage token, so the single refresh can happen before the calls below.
    let refreshCalls = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/auth/refresh')) refreshCalls += 1;
    });
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);

    // Two parallel calls through the app's own axios client (same module instance in dev).
    const statuses = await page.evaluate(async () => {
      const modulePath = '/src/lib/api.ts';
      const { api } = (await import(/* @vite-ignore */ modulePath)) as {
        api: { get: (url: string) => Promise<{ status: number }> };
      };
      const results = await Promise.all([api.get('/api/auth/me'), api.get('/api/auth/me')]);
      return results.map((r) => r.status);
    });

    expect(statuses).toEqual([200, 200]);
    expect(refreshCalls).toBe(1);
    expect((await storedAuth(page))?.accessToken).not.toBe('garbage.invalid.token');
  });

  test('log out, then the old token is rejected with 401', async ({ page, request }) => {
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await expect(page).toHaveURL(/\/dashboard/);
    const before = await storedAuth(page);
    expect(before?.accessToken).toBeTruthy();

    const loggedOut = page.waitForResponse((r) => r.url().endsWith('/api/auth/logout'));
    await page.getByRole('button', { name: 'قائمة الحساب' }).click();
    await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();
    expect((await loggedOut).ok()).toBe(true);
    await expect(page).toHaveURL(/\/login/);

    const reuse = await request.get(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${before?.accessToken}`, 'x-org-id': before?.orgId ?? '' },
    });
    expect(reuse.status()).toBe(401);
  });

  test('forgot password, Mailpit email, reset page, new password, log in', async ({
    page,
    request,
  }) => {
    // A dedicated user: this test changes its password and puts it back at the end.
    const email = env('E2E_RESET_EMAIL');
    const originalPassword = env('E2E_RESET_PASSWORD');
    const newPassword = `New-${Date.now()}-pw`;

    await page.goto('/forgot-password');
    await page.getByLabel(IDENTIFIER).fill(email);
    await page.getByRole('button', { name: 'إرسال رابط الاستعادة' }).click();
    await expect(page.getByText('إذا كان هناك حساب مطابق')).toBeVisible();

    // Read the newest email for this address from Mailpit and pull out the link.
    let link = '';
    await expect
      .poll(async () => {
        const list = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const { messages } = (await list.json()) as { messages: { ID: string }[] };
        const id = messages[0]?.ID;
        if (!id) return '';
        const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
          Text: string;
          HTML: string;
        };
        link =
          /https?:\/\/[^\s"'<>]+/.exec(`${msg.Text} ${msg.HTML}`)?.[0].replace(/&amp;/g, '&') ?? '';
        return link;
      })
      .not.toBe('');

    await page.goto(link);
    await page.getByLabel('كلمة المرور الجديدة').fill(newPassword);
    await page.getByLabel('تأكيد كلمة المرور').fill(newPassword);
    await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('تم تغيير كلمة المرور')).toBeVisible();

    await login(page, email, newPassword);
    await expect(page).toHaveURL(/\/dashboard/);

    // Put the original password back, so the next run starts from the same state.
    const restore = await request.post(`${API}/api/auth/change-password`, {
      headers: authHeaders(await storedAuth(page)),
      data: { currentPassword: newPassword, newPassword: originalPassword },
    });
    expect(restore.status()).toBe(200);
  });

  test('one login with two shops sees the picker and lands in the chosen shop', async ({
    page,
  }) => {
    await login(page, env('E2E_MULTI_EMAIL'), env('E2E_MULTI_PASSWORD'));
    await expect(page).toHaveURL(/\/select-shop/);
    await page.getByRole('button', { name: new RegExp(env('E2E_MULTI_SHOP_NAME')) }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect((await storedAuth(page))?.orgId).toBeTruthy();
  });

  test('the removed activation routes land on the login page', async ({ page }) => {
    for (const path of ['/activate', '/activate-workspace']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

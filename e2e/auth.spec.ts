import { expect, test, type Page } from '@playwright/test';

/**
 * F04 client e2e. Needs the API, local Supabase (with Mailpit) and the dev server.
 * Skipped unless RUN_E2E=1. Credentials come from the seed data via env vars:
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD            a login with ONE shop
 *   E2E_MULTI_EMAIL, E2E_MULTI_PASSWORD            a login with TWO shops
 *   E2E_MULTI_SHOP_NAME                            the name of the shop to choose
 *   E2E_API_URL        (default http://localhost:3000)
 *   E2E_MAILPIT_URL    (default http://127.0.0.1:54324)
 * Labels are Arabic (the default language); override with E2E_* if the copy changes.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const env = (name: string) => process.env[name] ?? '';

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

test.describe('auth flows', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('log in, then a request still works after the access token expired', async ({ page }) => {
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await expect(page).toHaveURL(/\/dashboard/);

    // Force-expire: break the access token and say it is already past due.
    await page.evaluate(() => {
      const raw = localStorage.getItem('ecofin-auth');
      if (!raw) return;
      const stored = JSON.parse(raw) as { state: Record<string, string> };
      stored.state.accessToken = 'expired.invalid.token';
      stored.state.expiresAt = new Date(Date.now() - 1000).toISOString();
      localStorage.setItem('ecofin-auth', JSON.stringify(stored));
    });

    // The next authenticated request gets 401, refreshes once and is retried.
    const refresh = page.waitForResponse((r) => r.url().endsWith('/api/auth/refresh'));
    await page.reload();
    expect((await refresh).status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard/);
    expect((await storedAuth(page))?.accessToken).not.toBe('expired.invalid.token');
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
    const email = env('E2E_OWNER_EMAIL');
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

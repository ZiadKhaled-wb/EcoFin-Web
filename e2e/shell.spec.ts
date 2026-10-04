import { expect, test, type Page } from '@playwright/test';

/**
 * F09 UI shell e2e. Needs the API, local Supabase and the dev server (the sample pages are
 * dev-only). Skipped unless RUN_E2E=1. Credentials come from the seed data:
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD        an owner (holds every permission, incl. audit.view)
 *   E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD    a cashier (no audit.view)
 * The login form is Arabic by default, so labels below are Arabic.
 */
const env = (name: string) => process.env[name] ?? '';

// Own client IP per test, so the API's per-IP login limiter (10 per 15 min) doesn't trip when the
// suite is rerun locally. The API trusts one proxy hop (Vite's dev proxy passes the header on).
let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.51.100.${(ipCounter++ % 250) + 1}` });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('اسم المستخدم أو البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('ui shell', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('the sample page switches Arabic <-> English and the layout mirrors', async ({ page }) => {
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await page.goto('/sample');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1, name: 'صفحة نموذجية' })).toBeVisible();
    const sidebarArabic = await page.locator('aside').boundingBox();

    await page.getByRole('button', { name: /English/ }).click();
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1, name: 'Sample page' })).toBeVisible();
    const sidebarEnglish = await page.locator('aside').boundingBox();

    // The sidebar sits on the right in RTL and on the left in LTR.
    expect(sidebarArabic?.x).toBeGreaterThan(sidebarEnglish?.x ?? Infinity);

    // The choice is remembered after a reload.
    await page.reload();
    await expect(html).toHaveAttribute('lang', 'en');
  });

  test('a cashier typing the URL of a page that needs audit.view sees the 403 page', async ({
    page,
  }) => {
    await login(page, env('E2E_CASHIER_EMAIL'), env('E2E_CASHIER_PASSWORD'));
    await page.goto('/sample/restricted');
    await expect(page.getByText('ليس لديك صلاحية لفتح هذه الصفحة')).toBeVisible();
    await expect(page.getByText('تظهر هذه الصفحة لمن لديه صلاحية')).toHaveCount(0);
    await expect(page).toHaveURL(/\/sample\/restricted/);
  });

  test('an owner opens the same page', async ({ page }) => {
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await page.goto('/sample/restricted');
    await expect(page.getByRole('heading', { level: 1, name: 'صفحة مقيّدة' })).toBeVisible();
  });
});

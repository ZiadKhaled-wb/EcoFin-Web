import { expect, test, type Page } from '@playwright/test';

/**
 * F06 client half: `<Can permission="employee.manage">` hides an action from employees without
 * the key. Needs the API (with GET /api/me/permissions), local Supabase and the dev server (the
 * sample page is dev-only). Skipped unless RUN_E2E=1. Seed logins:
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD        an owner (holds every key)
 *   E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD    a cashier (no employee.manage)
 */
const env = (name: string) => process.env[name] ?? '';
const MANAGE_ACCESS = 'إدارة الصلاحيات'; // sample.manageAccess (Arabic is the default language)

// Own client IP per test, so the per-IP login limiter doesn't trip (see rtl.spec.ts).
let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.51.100.${(ipCounter++ % 250) + 1}` });
});

async function openSampleAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  const permissions = page.waitForResponse((r) => r.url().endsWith('/api/me/permissions'));
  await page.goto('/sample');
  expect((await permissions).ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('permissions in the UI', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('a cashier does not see a button wrapped in <Can permission="employee.manage">', async ({
    page,
  }) => {
    await openSampleAs(page, env('E2E_CASHIER_EMAIL'), env('E2E_CASHIER_PASSWORD'));
    await expect(page.getByRole('button', { name: MANAGE_ACCESS })).toHaveCount(0);
  });

  test('the owner sees it', async ({ page }) => {
    await openSampleAs(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await expect(page.getByRole('button', { name: MANAGE_ACCESS })).toBeVisible();
  });
});

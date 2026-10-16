import { expect, test, type Page } from '@playwright/test';

/**
 * F07 owner audit screen. Needs the API (with GET /api/audit), local Supabase and the dev server.
 * Skipped unless RUN_E2E=1. Seed logins:
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD        an owner (holds audit.view); seed name "Owner One"
 *   E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD    a cashier (no audit.view)
 * Arabic is the default language, so labels below come from the Arabic strings.
 */
const env = (name: string) => process.env[name] ?? '';
const OWNER_NAME = process.env.E2E_OWNER_NAME ?? 'Owner One';
const AR = {
  title: 'سجل التدقيق',
  action: 'الإجراء',
  signedIn: 'تسجيل الدخول', // audit.json actions.auth.login (renamed in PR 67)
  details: 'التفاصيل',
  detailTitle: 'تفاصيل القيد',
  forbidden: 'ليس لديك صلاحية لفتح هذه الصفحة',
};

// Own client IP per test (the API's per-IP login limiter; see rtl.spec.ts).
let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.51.100.${(ipCounter++ % 250) + 1}` });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('audit log screen', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('the owner opens it from the menu, filters by sign-ins and sees their own login', async ({
    page,
  }) => {
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await page.getByRole('link', { name: AR.title }).first().click();
    await expect(page).toHaveURL(/\/audit/);
    await expect(page.getByRole('heading', { level: 1, name: AR.title })).toBeVisible();

    const searched = page.waitForResponse(
      (r) => r.url().includes('/api/audit') && r.url().includes('action=auth.login'),
    );
    await page.getByLabel(AR.action).selectOption('auth.login');
    expect((await searched).ok()).toBe(true);
    await expect(page).toHaveURL(/action=auth\.login/);

    const table = page.getByRole('table');
    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toContainText(AR.signedIn);
    await expect(firstRow).toContainText(OWNER_NAME); // newest first: this login

    // The drawer shows the entry; filtering by the person narrows the request.
    await firstRow.getByRole('button', { name: AR.details }).click();
    await expect(page.getByRole('dialog', { name: AR.detailTitle })).toBeVisible();
    await page.keyboard.press('Escape');
    const byPerson = page.waitForResponse(
      (r) => r.url().includes('/api/audit') && r.url().includes('actorEmployeeId='),
    );
    await firstRow.getByRole('button', { name: OWNER_NAME }).click();
    expect((await byPerson).ok()).toBe(true);
  });

  test('a cashier has no menu item and typing the URL shows the 403 page', async ({ page }) => {
    await login(page, env('E2E_CASHIER_EMAIL'), env('E2E_CASHIER_PASSWORD'));
    await expect(page.getByRole('link', { name: AR.title })).toHaveCount(0);
    await page.goto('/audit');
    await expect(page.getByText(AR.forbidden)).toBeVisible();
  });
});

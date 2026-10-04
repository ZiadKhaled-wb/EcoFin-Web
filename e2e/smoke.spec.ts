import { expect, test } from '@playwright/test';

// Needs a browser and the dev server. Skipped unless RUN_E2E=1.
test.describe('login page smoke', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('Arabic (default) renders right-to-left', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });

  // The login page has no switch of its own; the choice made in the shell (F09) is remembered.
  test('English renders left-to-right', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('ecofin-lang', 'en'));
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

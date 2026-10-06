import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * EC-145: an owner deactivates and reactivates a cashier from Settings -> Employees. Needs the
 * API, local Supabase and the dev server; skipped unless RUN_E2E=1. Seed logins:
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD        an owner (holds employee.manage)
 *   E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD    a cashier of the same shop
 *   E2E_CASHIER_USERNAME (optional)            the cashier's username; default: the email's local part
 * Run once per language below. The test leaves the cashier active again.
 */
const env = (name: string) => process.env[name] ?? '';
// How the Employees list shows the cashier's login: the username, or the email's local part.
const cashierLogin = () =>
  env('E2E_CASHIER_USERNAME') || env('E2E_CASHIER_EMAIL').split('@')[0] || '';

const TEXT = {
  en: {
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    deactivateTitle: 'Deactivate employee',
    reactivateTitle: 'Reactivate employee',
    confirm: 'Confirm',
    reason: 'Reason',
    inactive: 'Inactive',
    deactivatedNotice: 'Your account has been deactivated.',
  },
  ar: {
    deactivate: 'تعطيل',
    reactivate: 'إعادة تفعيل',
    deactivateTitle: 'تعطيل الموظف',
    reactivateTitle: 'إعادة تفعيل الموظف',
    confirm: 'تأكيد',
    reason: 'السبب',
    inactive: 'معطل',
    deactivatedNotice: 'تم تعطيل حسابك.',
  },
} as const;

// Each context logs in from its own client IP, so the per-IP login limiter doesn't trip.
let ipCounter = Math.floor(Math.random() * 200);

async function newSession(browser: Browser, lang: 'ar' | 'en') {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': `198.51.100.${(ipCounter++ % 250) + 1}` },
  });
  await context.addInitScript((l) => window.localStorage.setItem('ecofin-lang', l), lang);
  return { context, page: await context.newPage() };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('EC-145 deactivate and reactivate an employee', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  for (const lang of ['en', 'ar'] as const) {
    test(`owner deactivates a cashier who is signed out, then reactivates (${lang})`, async ({
      browser,
    }) => {
      const text = TEXT[lang];
      const cashierSession = await newSession(browser, lang);
      const ownerSession = await newSession(browser, lang);
      const a = cashierSession.page;
      const b = ownerSession.page;
      try {
        // A: the cashier is signed in and has a page open.
        await login(a, env('E2E_CASHIER_EMAIL'), env('E2E_CASHIER_PASSWORD'));

        // B: the owner deactivates that cashier with a reason.
        await login(b, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
        await b.goto('/settings/employees');
        const cashierRow = b.locator('tr', { hasText: cashierLogin() });
        await cashierRow.getByRole('button', { name: text.deactivate, exact: true }).click();
        const dialog = b.getByRole('dialog', { name: text.deactivateTitle });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(await cashierRow.locator('td').first().innerText());
        // The reason is required: confirming without one sends nothing and shows the inline error.
        await dialog.getByRole('button', { name: text.confirm }).click();
        await expect(dialog.locator('[role=alert], [id$="-error"]').first()).toBeVisible();
        await dialog.getByLabel(text.reason).fill('E2E: left the shop');
        await dialog.getByRole('button', { name: text.confirm }).click();
        await expect(dialog).toBeHidden();
        await expect(cashierRow).toContainText(text.inactive);
        await expect(cashierRow.getByRole('button', { name: text.reactivate })).toBeVisible();

        // A: the cashier's next action is refused and lands on the login page with the message.
        await a.reload();
        await expect(a).toHaveURL(/\/login/);
        await expect(a.getByText(text.deactivatedNotice)).toBeVisible();

        // B: the owner reactivates.
        await cashierRow.getByRole('button', { name: text.reactivate, exact: true }).click();
        const back = b.getByRole('dialog', { name: text.reactivateTitle });
        await back.getByLabel(text.reason).fill('E2E: back on shift');
        await back.getByRole('button', { name: text.confirm }).click();
        await expect(back).toBeHidden();
        await expect(cashierRow).not.toContainText(text.inactive);

        // A: the cashier logs in again.
        await login(a, env('E2E_CASHIER_EMAIL'), env('E2E_CASHIER_PASSWORD'));
        await expect(a.getByText(text.deactivatedNotice)).toHaveCount(0);
      } finally {
        await cashierSession.context.close();
        await ownerSession.context.close();
      }
    });
  }
});

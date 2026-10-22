import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * INT-2 (EC-129) / TEST-2: a fresh shop is made ready to stock goods entirely through the UI,
 * in Arabic and in English:
 *   platform admin provisions the shop (P01) → the owner accepts the emailed invite →
 *   settings (P03) and legal profile (P04) → branches up to the plan limit (O01, P05) →
 *   an employee with a role (O02) → a category (C01) → a taxed product (C02, T01) →
 *   its barcode label (C03).
 * Needs the API (with SMTP to Mailpit), local Supabase and the dev server; RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD'));
const OWNER_PASSWORD = 'Int2-Owner-Pass-2026!';

type Lang = 'ar' | 'en';
const dictionaries = new Map<string, Record<string, unknown>>();
/** The UI text for a key (namespace.path), read from the app's own locale files. */
function L(lang: Lang, key: string): string {
  const [ns, ...path] = key.split('.');
  const file = `${lang}/${ns}`;
  if (!dictionaries.has(file)) {
    dictionaries.set(
      file,
      JSON.parse(
        readFileSync(new URL(`../src/i18n/locales/${file}.json`, import.meta.url), 'utf8'),
      ),
    );
  }
  let node: unknown = dictionaries.get(file);
  for (const p of path) node = (node as Record<string, unknown>)[p];
  if (typeof node !== 'string') throw new Error(`missing ${lang}:${key}`);
  return node;
}

// Each session logs in from its own client IP (the login limiter is per IP).
let ip = Math.floor(Math.random() * 200);
async function newSession(browser: Browser, lang: Lang) {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': `198.51.100.${(ip++ % 250) + 1}` },
  });
  await context.addInitScript((l) => window.localStorage.setItem('ecofin-lang', l), lang);
  return { context, page: await context.newPage() };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

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

/** TEST-2 RTL check: the page runs in the language's direction and nothing sticks out sideways. */
async function expectDirection(page: Page, lang: Lang) {
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${page.url()} scrolls sideways`).toBeLessThanOrEqual(1);
}

test.describe('INT-2: a fresh shop is set up through the UI', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.describe.configure({ timeout: 180_000 });

  for (const lang of ['en', 'ar'] as const) {
    test(`provision → invite → settings → branches → staff → catalog → label (${lang})`, async ({
      browser,
      request,
    }) => {
      const stamp = `${Date.now().toString(36)}${lang}`;
      const ownerEmail = `int2.${stamp}@ecotech.test`;
      const t = (key: string) => L(lang, key);

      // P01: the platform admin provisions the shop on the "retail" plan (3 branches).
      const admin = await newSession(browser, lang);
      await login(admin.page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await admin.page.goto('/admin/shops/new');
      await admin.page.getByLabel(t('shops.fields.name')).fill(`INT-2 shop ${stamp}`);
      await admin.page.getByLabel(t('shops.fields.slug')).fill(`int2-${stamp}`);
      await admin.page.getByLabel(t('shops.fields.plan')).selectOption('retail');
      await admin.page.getByLabel(t('shops.fields.ownerName')).fill('INT-2 Owner');
      await admin.page.getByLabel(t('shops.fields.email')).fill(ownerEmail);
      await admin.page.getByLabel(t('shops.fields.branch')).fill('Main');
      await admin.page.getByRole('button', { name: t('shops.create') }).click();
      await expect(admin.page).toHaveURL(/\/admin(\?|$)/, { timeout: 15_000 });
      await admin.context.close();

      // The owner accepts the emailed invite and sets a password.
      const owner = await newSession(browser, lang);
      const page = owner.page;
      await page.goto(`/invite/accept#token=${await inviteToken(request, ownerEmail)}`);
      await page.getByLabel(t('shops.invite.password'), { exact: true }).fill(OWNER_PASSWORD);
      await page.getByLabel(t('shops.invite.confirm'), { exact: true }).fill(OWNER_PASSWORD);
      await page.getByRole('button', { name: t('shops.invite.accept') }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
      // The URL changes a moment before the login form replaces the invite form (two password
      // fields): wait for the login form itself before typing.
      await expect(page.locator('input[type=password]')).toHaveCount(1, { timeout: 15_000 });
      // P02: sign in on the page the invite led to; the first login opens the setup wizard.
      await page.locator('input').first().fill(ownerEmail);
      await page.locator('input[type=password]').fill(OWNER_PASSWORD);
      await page.locator('button[type=submit]').click();
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: t('onboarding.title') })).toBeVisible();
      await expectDirection(page, lang);
      // The wizard links to the settings pages, which offer the way back.
      await page.getByRole('link', { name: t('onboarding.steps.shop.action') }).click();
      await expect(page).toHaveURL(/\/settings\?tab=general&from=onboarding/);
      await expect(page.getByRole('link', { name: t('onboarding.returnToWizard') })).toBeVisible();

      // P03 settings and P04 legal profile.
      await page.goto('/settings');
      await page.getByLabel(t('settings.general.phone')).fill('01000000000');
      await page
        .getByRole('button', { name: t('settings.save') })
        .first()
        .click();
      await expect(page.getByText(t('settings.saved')).first()).toBeVisible();
      await page.goto('/settings/profile');
      await page.getByLabel(t('settings.profile.legalName')).fill(`INT-2 Trading ${stamp}`);
      await page.getByRole('button', { name: t('settings.profile.save') }).click();
      await expect(page.getByText(t('settings.profile.saved')).first()).toBeVisible();
      await expectDirection(page, lang);

      // O01 branches: two more fit the retail plan, a fourth is refused (P05).
      await page.goto('/settings/branches');
      for (const [name, code] of [
        ['Second', 'B2'],
        ['Third', 'B3'],
        ['Fourth', 'B4'],
      ] as const) {
        await page.getByRole('button', { name: t('branches.create') }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel(t('branches.fields.name'), { exact: true }).fill(name);
        await dialog.getByLabel(t('branches.fields.code'), { exact: true }).fill(code);
        await dialog.getByRole('button', { name: t('branches.save') }).click();
        if (code !== 'B4') {
          await expect(dialog).toBeHidden();
          await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
        } else {
          // P05: the inline message and the plan toast (the retail plan allows 3 branches).
          await expect(dialog.getByText(t('branches.planLimit'))).toBeVisible();
          await expect(
            page.getByText(
              t('subscriptions.limitReached')
                .replace('{limit}', '3')
                .replace('{resource}', t('subscriptions.resources.branches')),
            ),
          ).toBeVisible();
          await page.keyboard.press('Escape');
        }
      }

      // O02: a cashier in the second branch.
      await page.goto('/settings/employees');
      await page.getByRole('button', { name: t('employees.create') }).click();
      const staff = page.getByRole('dialog');
      await staff
        .getByLabel(t('employees.fields.full_name'), { exact: true })
        .fill('INT-2 Cashier');
      await staff
        .getByLabel(t('employees.fields.email'))
        .fill(`int2.cashier.${stamp}@ecotech.test`);
      await staff.getByLabel(t('employees.fields.role'), { exact: true }).selectOption('CASHIER');
      await staff.getByLabel('Second', { exact: true }).check();
      await staff.getByRole('button', { name: t('employees.save') }).click();
      await expect(page.getByText(t('employees.saved')).first()).toBeVisible();
      await expect(page.getByRole('cell', { name: 'INT-2 Cashier' })).toBeVisible();
      await expectDirection(page, lang);

      // C01 category, then C02 product with a T01 tax class.
      await page.goto('/inventory/categories');
      await page.getByRole('button', { name: t('categories.add') }).click();
      await page.getByLabel(t('categories.name')).fill('INT-2 Screens');
      await page.getByRole('button', { name: t('categories.save') }).click();
      await expect(page.getByRole('cell', { name: 'INT-2 Screens' })).toBeVisible();

      await page.goto('/inventory/products');
      await page.getByRole('button', { name: t('products.add') }).click();
      const form = page.getByRole('dialog');
      await form.getByLabel(t('products.fields.nameAr')).fill('شاشة INT-2');
      await form.getByLabel(t('products.fields.nameEn')).fill('INT-2 Screen');
      await form.getByLabel(t('products.fields.sku')).fill('int2-scr-1');
      await form
        .getByLabel(t('products.fields.category'), { exact: true })
        .selectOption({ label: 'INT-2 Screens' });
      await form.getByLabel(t('products.fields.cashPrice')).fill('8500');
      const taxClass = await form
        .getByLabel(t('products.fields.taxClass'))
        .locator('option:checked')
        .textContent();
      expect(taxClass, 'the shop default tax class is preselected').toBeTruthy();
      await form.getByRole('button', { name: t('products.save') }).click();
      await expect(form).toBeHidden();
      const row = page.getByRole('row', { name: /INT2-SCR-1/ });
      await expect(row).toBeVisible();
      await expect(row.getByText(taxClass!.trim())).toBeVisible();
      const barcode = (await row.getByRole('cell').nth(2).textContent())?.trim() ?? '';
      expect(barcode).toMatch(/^2\d{12}$/);

      // C03: its barcode label, ready to print.
      await row.getByRole('button', { name: t('products.labels') }).click();
      await expect(page).toHaveURL(/\/inventory\/labels\?product=/);
      const preview = page.getByRole('region', { name: t('labels.preview') });
      await expect(preview.getByRole('img', { name: barcode })).toBeVisible();
      await expect(page.getByRole('button', { name: t('labels.print') })).toBeEnabled();
      await expectDirection(page, lang);

      await owner.context.close();
    });
  }
});

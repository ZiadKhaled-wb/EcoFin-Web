import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 1 test-plan gaps (F09): long Arabic text and links in RTL. Needs the API, local Supabase
 * and the dev server; skipped unless RUN_E2E=1. Seed logins (same env as auth.spec.ts):
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD    a login with ONE shop
 *   E2E_MULTI_EMAIL, E2E_MULTI_PASSWORD    a login with TWO shops
 * Long names are put into the real API responses with page.route, so no seed change is needed.
 * Selectors avoid UI copy where they can, so the checks survive wording changes.
 */
const env = (name: string) => process.env[name] ?? '';

// Real-world length: a shop / branch name with mixed Arabic, digits and Latin.
const LONG_SHOP =
  'معرض الأمانة للأثاث والأجهزة الكهربائية والتقسيط المريح فرع مدينة نصر رقم 12 (Main)';
const LONG_BRANCH = 'فرع الحي السابع - مدينة نصر - بجوار محطة المترو الجديدة رقم 3';

const PHONE = { width: 360, height: 780 };
const DESKTOP = { width: 1280, height: 800 };

// Each test logs in from its own client IP (the API trusts one proxy hop, here Vite's), so the
// per-IP login limiter (10 per 15 min) doesn't trip when the whole e2e suite runs.
let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.51.100.${(ipCounter++ % 250) + 1}` });
});

async function useLanguage(page: Page, lang: 'ar' | 'en') {
  await page.addInitScript((l) => window.localStorage.setItem('ecofin-lang', l), lang);
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
}

/** No horizontal page scroll, and no visible element sticking out of the viewport. */
async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
    outside: [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`)
      .slice(0, 5),
  }));
  expect(result.outside, 'elements outside the viewport').toEqual([]);
  expect(result.scroll).toBeLessThanOrEqual(result.width);
}

test.describe('RTL: long Arabic text', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  for (const viewport of [PHONE, DESKTOP]) {
    test(`a long Arabic shop name wraps inside the picker card (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await useLanguage(page, 'ar');
      await page.route('**/api/auth/login', async (route) => {
        const response = await route.fetch();
        const json = (await response.json()) as { shops?: { orgName: string }[] };
        for (const shop of json.shops ?? []) shop.orgName = LONG_SHOP;
        await route.fulfill({ response, json });
      });
      await login(page, env('E2E_MULTI_EMAIL'), env('E2E_MULTI_PASSWORD'));
      await expect(page).toHaveURL(/\/select-shop/);

      const names = page.getByText(LONG_SHOP, { exact: true });
      await expect(names).toHaveCount(2);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expectNoHorizontalOverflow(page);

      // Each name stays inside its button, right-aligned, and wraps instead of clipping.
      for (const name of await names.all()) {
        const button = name.locator('xpath=ancestor::button[1]');
        const [n, b] = [await name.boundingBox(), await button.boundingBox()];
        expect(n && b).toBeTruthy();
        if (!n || !b) continue;
        expect(n.x).toBeGreaterThanOrEqual(b.x - 1);
        expect(n.x + n.width).toBeLessThanOrEqual(b.x + b.width + 1);
        expect(b.x + b.width - (n.x + n.width)).toBeLessThan(n.x - b.x); // closer to the right edge
        expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
      if (viewport === PHONE) {
        const lineHeight = await names
          .first()
          .evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
        expect((await names.first().boundingBox())?.height ?? 0).toBeGreaterThan(lineHeight * 1.5);
      }
    });

    test(`a long Arabic branch name is truncated, not overflowing (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await useLanguage(page, 'ar');
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const json = (await response.json()) as { branches?: { name: string }[] };
        for (const branch of json.branches ?? []) branch.name = LONG_BRANCH;
        await route.fulfill({ response, json });
      });
      await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
      await expect(page).toHaveURL(/\/dashboard/);

      // Phones keep the branch switcher in the menu drawer; wider screens in the top bar.
      if (viewport === PHONE) await page.locator('header button[aria-haspopup="dialog"]').click();
      const where = viewport === PHONE ? page.getByRole('dialog') : page.getByRole('banner');
      const switcher = where.locator(`button[aria-label$="${LONG_BRANCH}"]`);
      await expect(switcher).toBeVisible();
      // Let the drawer finish sliding in before measuring.
      await expect
        .poll(() =>
          where.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= 0 && r.right <= window.innerWidth;
          }),
        )
        .toBe(true);
      await expectNoHorizontalOverflow(page);

      const label = switcher.locator('span').first();
      expect(await label.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true); // truncated
      expect(await label.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
      // The full name is still in the menu once it opens.
      await switcher.click();
      await expect(page.getByRole('menuitem', { name: LONG_BRANCH }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe('RTL: links', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('the forgot-password link keeps its style and sits after its prompt in both directions', async ({
    page,
  }) => {
    const read = async () => {
      const link = page.locator('a[href="/forgot-password"]');
      const prompt = link.locator('xpath=preceding-sibling::span[1]');
      await expect(link).toBeVisible();
      const style = await link.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, direction: s.direction, decoration: s.textDecorationLine };
      });
      const [l, p] = [await link.boundingBox(), await prompt.boundingBox()];
      return { style, linkX: l?.x ?? 0, promptX: p?.x ?? 0 };
    };

    await useLanguage(page, 'ar');
    await page.goto('/login');
    const ar = await read();
    expect(ar.style.direction).toBe('rtl');
    expect(ar.linkX).toBeLessThan(ar.promptX); // RTL: the link follows the prompt to its left

    await page.evaluate(() => window.localStorage.setItem('ecofin-lang', 'en'));
    await page.addInitScript(() => window.localStorage.setItem('ecofin-lang', 'en'));
    await page.reload();
    const en = await read();
    expect(en.style.direction).toBe('ltr');
    expect(en.linkX).toBeGreaterThan(en.promptX); // LTR: to its right

    // Same look in both languages, and not the browser's default link blue.
    expect(ar.style).toEqual({ ...en.style, direction: 'rtl' });
    expect(ar.style.color).not.toBe('rgb(0, 0, 238)');
  });

  test('sidebar links mirror: icon on the start side, text aligned to the start edge', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await useLanguage(page, 'ar');
    await login(page, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
    await expect(page).toHaveURL(/\/dashboard/);

    const geometry = async () => {
      const link = page.locator('aside nav a[href="/dashboard"]');
      await expect(link).toBeVisible();
      return link.evaluate((a) => {
        const aside = a.closest('aside')!.getBoundingClientRect();
        const icon = a.querySelector('svg')!.getBoundingClientRect();
        const text = a.querySelector('span')!.getBoundingClientRect();
        return {
          iconRightOfText: icon.left > text.left,
          gapToRight: aside.right - icon.right,
          gapToLeft: icon.left - aside.left,
        };
      });
    };

    const ar = await geometry();
    expect(ar.iconRightOfText).toBe(true);
    expect(ar.gapToRight).toBeLessThan(ar.gapToLeft);

    await page.getByRole('button', { name: /English/ }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const en = await geometry();
    expect(en.iconRightOfText).toBe(false);
    expect(en.gapToLeft).toBeLessThan(en.gapToRight);
  });
});

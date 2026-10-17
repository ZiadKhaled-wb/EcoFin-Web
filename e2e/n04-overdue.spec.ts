import { expect, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, STAMP, type Session, session, api, ok } from './helpers/int4';

/**
 * N04 (EC-83, D79): overdue tracking end to end, server and client together. Like N03's spec it
 * makes its own shop (the platform admin provisions it, the owner accepts the emailed invite), so
 * it shares nothing with the specs beside it. The owner sells a TV on installments (through the
 * API, first installment next month), then on the screens: finds Overdue in the menu, sees nothing
 * late, runs the check by hand (twice: nothing new), opens the warnings and legal referrals tabs,
 * reads the page in Arabic, and saves grace days on a policy screen that has no late-fee field.
 * The lateness rules (grace, warnings, ban, legal referral) need due dates in the past, which only
 * the database can make: supabase/tests/n04_overdue_tracking_test.sql in the API covers them.
 * Needs the API (with SMTP to Mailpit), local Supabase with the dev seed and the dev server;
 * skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `n04.owner.${STAMP}@ecotech.test`;
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

/** A new retail_pro shop whose owner has the e2e password; answers its organization id. */
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
      name: `N04 shop ${STAMP}`,
      tenant_slug: `n04-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'N04 Owner', email: OWNER_EMAIL },
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

test.describe('N04 overdue tracking end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(180_000);

  let owner: Session;

  test.beforeAll(async ({ browser, request }) => {
    owner = await session(browser, OWNER_EMAIL, await provisionShop(request));
  });
  test.afterAll(async () => {
    await owner?.context.close();
  });

  test('the overdue page, the manual check and a policy without late fees', async () => {
    const page = owner.page;
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [{ up_to_months: 24, pct: 20 }],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
      }),
      201,
    );
    // A fee is refused by the server whatever the screen sends (rule 4).
    const fee = await api(owner, 'POST', '/api/settings/installment-policies', {
      late_fee_type: 'fixed',
      late_fee_value: '50.00',
    });
    expect(fee.status).toBe(422);

    // The menu leads to the page; nothing is late yet.
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Overdue' }).first().click();
    await expect(page).toHaveURL(/\/installments\/overdue$/);
    await expect(page.getByRole('heading', { name: 'Overdue installments' })).toBeVisible();
    await expect(page.getByText('No contract is overdue.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/interest/i);

    // The owner runs the check now; a second run the same day finds nothing new.
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Run the check now' }).click();
      await expect(
        page.getByText('Check done: 0 new warnings, 0 customers blocked, 0 legal referrals.'),
      ).toBeVisible();
    }

    await page.getByRole('tab', { name: 'Warnings' }).click();
    await expect(page.getByText('No warnings here.')).toBeVisible();
    await page.getByRole('tab', { name: 'Legal referrals' }).click();
    await expect(page.getByText('No legal referrals here.')).toBeVisible();

    // The policy screen: grace days, no late-fee field.
    await page.goto('/settings?tab=installments');
    await expect(page.getByText(/No late fees are ever charged/)).toBeVisible();
    await expect(page.getByLabel(/late fee/i)).toHaveCount(0);
    const grace = page.getByLabel('Grace days');
    await grace.fill('3');
    await page.getByRole('button', { name: 'Publish new version' }).click();
    await expect
      .poll(async () => {
        const s = ok(await api(owner, 'GET', '/api/settings'));
        const p = s['installment_policy'] as { grace_days: number; late_fee_type: string };
        return `${p.grace_days}/${p.late_fee_type}`;
      })
      .toBe('3/none');

    // Arabic, right to left.
    // (the session's init script sets English on every load, so switch with the top bar control)
    await page.goto('/installments/overdue');
    await page.getByRole('button', { name: 'Switch language to العربية' }).click();
    await expect(page.getByRole('heading', { name: 'الأقساط المتأخرة' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('tab', { name: 'الإحالات القانونية' })).toBeVisible();
  });
});

import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  PASSWORD,
  STAMP,
  type Session,
  session,
  api,
  ok,
  pairByApi,
  newDevice,
  closeOpenShift,
  openShiftByApi,
} from './helpers/int4';

/**
 * N03 (EC-82, D78): collections end to end, server and client together. Like N02's spec it makes
 * its own shop (the platform admin provisions it, the owner accepts the emailed invite), so it
 * shares nothing with the specs beside it. The owner sells two TVs on installments to one customer
 * (through the API), then on the screens: collects the next installment of the first contract
 * (a double click is one receipt), reverses it the same day (the drawer gives it back, the
 * installment is unpaid again), and pays the first contract off. No late fees anywhere.
 * Needs the API (with SMTP to Mailpit), local Supabase with the dev seed and the dev server;
 * skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `n03.owner.${STAMP}@ecotech.test`;
const IP = `198.51.103.${(STAMP % 250) + 1}`;

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
      name: `N03 shop ${STAMP}`,
      tenant_slug: `n03-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'N03 Owner', email: OWNER_EMAIL },
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

/** A valid Egyptian national ID that is new on every run (born 1990, Cairo). */
const freshNationalId = () => `290010101${String((STAMP + 7) % 100000).padStart(5, '0')}`;

test.describe('N03 collections end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(180_000);

  let owner: Session;

  test.beforeAll(async ({ browser, request }) => {
    owner = await session(browser, OWNER_EMAIL, await provisionShop(request));
  });
  test.afterAll(async () => {
    if (owner) await closeOpenShift(owner).catch(() => undefined);
    await owner?.context.close();
  });

  test('collect, reverse the same day, then pay a contract off', async () => {
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'N03 TV',
        sku: `N03-TV-${STAMP}`,
        cash_price: '12000.00',
      }),
      201,
    );
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        { branch_id: branch, reason: 'found', lines: [{ product_id: product['id'], quantity: 2 }] },
        `n03-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `N03 POS ${STAMP}`, branch);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, branch, device);
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
    ok(await api(owner, 'PATCH', '/api/settings', { credit_min_score: 0 }));
    const settings = ok(await api(owner, 'GET', '/api/settings'));
    const version = (settings['installment_policy'] as { version: number }).version;
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `N03 Payer ${STAMP}`,
        phones: ['01500000078'],
        national_id: freshNationalId(),
      }),
      201,
    );
    const customerId = String(customer['id']);
    ok(
      await api(owner, 'PUT', `/api/customers/${customerId}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'N03 e2e',
      }),
    );
    const lines = [{ product_id: product['id'], quantity: 1 }];
    const quote = ok(await api(owner, 'POST', '/api/sales/quote', { lines }));
    const sell = async (tag: string) =>
      ok(
        await api(
          owner,
          'POST',
          '/api/installments/sales',
          {
            lines,
            expected_total: quote['total'],
            customer_id: customerId,
            terms: {
              down_payment: '2000.00',
              installments_count: 12,
              frequency: 'monthly',
              policy_version: version,
            },
          },
          `n03-e2e-${tag}-${STAMP}`,
        ),
        201,
      ) as unknown as { contract: { id: string; number: string } };
    const first = (await sell('sale-1')).contract;
    await sell('sale-2');
    const remaining = async () =>
      (
        ok(await api(owner, 'GET', `/api/contracts/${first.id}/collection`))['due'] as {
          remaining: string;
        }
      ).remaining;
    const before = await remaining();

    // Collect the next installment of the first contract; a double click is one receipt.
    const page = owner.page;
    await page.goto(`/collections/new?customer=${customerId}&contract=${first.id}`);
    await expect(page.getByLabel(`Pay contract ${first.number}`)).toBeChecked();
    await page
      .getByRole('button', { name: /Next installment/ })
      .first()
      .click();
    await expect(page.getByText(/This amount pays/)).toBeVisible();
    await page.getByRole('button', { name: 'Take payment' }).click();
    const pay = page.getByRole('dialog', { name: 'Collect the payment' });
    await pay.getByRole('button', { name: 'Pay' }).dblclick();
    await expect(page.getByRole('heading', { name: /^Receipt / })).toBeVisible();
    const receiptId = page.url().split('/').pop()!;
    const receipt = ok(await api(owner, 'GET', `/api/collections/${receiptId}`));
    expect((receipt['payments'] as unknown[]).length).toBe(1);
    expect(await remaining()).not.toBe(before);
    await expect(page.locator('body')).not.toContainText(/interest|late fee/i);

    // The customer takes it back the same day.
    await page.getByRole('button', { name: 'Reverse collection' }).click();
    const reverse = page.getByRole('dialog', { name: /^Reverse receipt/ });
    await reverse.getByLabel('Reason').fill('Changed mind');
    await reverse.getByRole('button', { name: 'Reverse' }).click();
    await expect(page.getByText('The collection was reversed.')).toBeVisible();
    expect(await remaining()).toBe(before);

    // Then the first contract is paid off in one go.
    await page.goto(`/collections/new?customer=${customerId}&contract=${first.id}`);
    await page
      .getByRole('button', { name: /Pay off the contract/ })
      .first()
      .click();
    await expect(page.getByText('This pays off the contract.')).toBeVisible();
    await page.getByRole('button', { name: 'Take payment' }).click();
    await page
      .getByRole('dialog', { name: 'Collect the payment' })
      .getByRole('button', { name: 'Pay' })
      .click();
    await expect(page.getByRole('heading', { name: /^Receipt / })).toBeVisible();
    await expect(page.locator('[data-receipt="collection"]')).toContainText(
      /Contract paid off|تم سداد العقد بالكامل/,
    );
    const contract = ok(await api(owner, 'GET', `/api/contracts/${first.id}`));
    expect(contract['status']).toBe('completed');
  });
});

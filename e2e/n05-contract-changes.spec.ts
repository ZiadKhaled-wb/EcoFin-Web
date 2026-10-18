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
 * N05 (EC-84, D80): early settlement, rescheduling and write-off end to end, server and client
 * together. Like N03's spec it makes its own shop (the platform admin provisions it, the owner
 * accepts the emailed invite). The owner sells three TVs on installments to one customer (through
 * the API), then on the screens: reschedules the first contract (the total stays, the old
 * schedule stays visible), settles the second early with the policy's suggested waiver and a
 * reason (N03's payment dialog, then the receipt), writes off the third, and finds all three in
 * the contract changes list; the contract page reads in Arabic without interest or a promised
 * discount. Needs the API (with SMTP to Mailpit), local Supabase with the dev seed and the dev
 * server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `n05.owner.${STAMP}@ecotech.test`;
const IP = `198.51.105.${(STAMP % 250) + 1}`;

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
      name: `N05 shop ${STAMP}`,
      tenant_slug: `n05-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'N05 Owner', email: OWNER_EMAIL },
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
const freshNationalId = () => `290010101${String((STAMP + 11) % 100000).padStart(5, '0')}`;

test.describe('N05 contract changes end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(240_000);

  let owner: Session;

  test.beforeAll(async ({ browser, request }) => {
    owner = await session(browser, OWNER_EMAIL, await provisionShop(request));
  });
  test.afterAll(async () => {
    if (owner) await closeOpenShift(owner).catch(() => undefined);
    await owner?.context.close();
  });

  test('reschedule, settle early with a waiver, write off, and the list', async () => {
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'N05 TV',
        sku: `N05-TV-${STAMP}`,
        cash_price: '12000.00',
      }),
      201,
    );
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        { branch_id: branch, reason: 'found', lines: [{ product_id: product['id'], quantity: 3 }] },
        `n05-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `N05 POS ${STAMP}`, branch);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, branch, device);
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [{ up_to_months: 24, pct: 20 }],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
        early_settlement_rule: 'percent_of_future_profit',
        early_settlement_pct: '50',
      }),
      201,
    );
    ok(await api(owner, 'PATCH', '/api/settings', { credit_min_score: 0 }));
    const settings = ok(await api(owner, 'GET', '/api/settings'));
    const version = (settings['installment_policy'] as { version: number }).version;
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `N05 Customer ${STAMP}`,
        phones: ['01500000085'],
        national_id: freshNationalId(),
      }),
      201,
    );
    const customerId = String(customer['id']);
    ok(
      await api(owner, 'PUT', `/api/customers/${customerId}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'N05 e2e',
      }),
    );
    const lines = [{ product_id: product['id'], quantity: 1 }];
    const quote = ok(await api(owner, 'POST', '/api/sales/quote', { lines }));
    const sell = async (tag: string) =>
      (
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
            `n05-e2e-${tag}-${STAMP}`,
          ),
          201,
        ) as unknown as { contract: { id: string; number: string } }
      ).contract;
    const [toReschedule, toSettle, toWriteOff] = [
      await sell('sale-1'),
      await sell('sale-2'),
      await sell('sale-3'),
    ];
    const contractOf = async (id: string) =>
      ok(await api(owner, 'GET', `/api/contracts/${id}`)) as unknown as {
        status: string;
        current_version: number;
        balance: { paid: string; remaining: string };
      };
    const page = owner.page;

    // Reschedule: the preview keeps the total; the old schedule stays visible.
    const before = await contractOf(toReschedule.id);
    await page.goto(`/contracts/${toReschedule.id}`);
    await page.getByRole('button', { name: 'Reschedule' }).click();
    const dialog = page.getByRole('dialog', { name: `Reschedule contract ${toReschedule.number}` });
    await dialog.getByLabel('Number of installments').fill('6');
    await expect(dialog.getByText(/exactly what is left/)).toBeVisible();
    await dialog.getByLabel('Reason').fill('Lost his job');
    await dialog.getByRole('button', { name: 'Reschedule' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Changes to this contract')).toBeVisible();
    const after = await contractOf(toReschedule.id);
    expect(after.status).toBe('rescheduled');
    expect(after.current_version).toBe(2);
    expect(after.balance.remaining).toBe(before.balance.remaining);
    await page.getByLabel('Schedule', { exact: true }).selectOption('1');
    await expect(page.getByTestId('superseded-note')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Schedule 1' }).getByRole('row')).toHaveCount(13);

    // Early settlement: the policy's suggestion, a reason, N03's payment, the receipt.
    await page.goto(`/contracts/${toSettle.id}`);
    await page.getByRole('button', { name: 'Settle early' }).click();
    const settle = page.getByRole('dialog', { name: `Settle contract ${toSettle.number} early` });
    await expect(settle.getByTestId('settle-payoff')).toHaveText(/12,000\.00/);
    await settle.getByRole('button', { name: 'Use the suggestion' }).click();
    await settle.getByLabel('Reason for the waiver').fill('Paid everything early');
    const toPay = (await settle.getByTestId('settle-to-pay').innerText()).trim();
    await settle.getByRole('button', { name: 'Continue to payment' }).click();
    const pay = page.getByRole('dialog', { name: 'Collect the payment' });
    await pay.getByRole('button', { name: 'Pay' }).dblclick();
    await expect(page.getByRole('heading', { name: /^Receipt / })).toBeVisible();
    await expect(page.locator('body')).toContainText(toPay.replace(/[^\d.,]/g, ''));
    const settled = await contractOf(toSettle.id);
    expect(settled.status).toBe('completed');
    expect(settled.balance.remaining).toBe('0.00');

    // Write-off by the owner.
    await page.goto(`/contracts/${toWriteOff.id}`);
    await page.getByRole('button', { name: 'Write off' }).click();
    const writeOff = page.getByRole('dialog', { name: `Write off contract ${toWriteOff.number}` });
    await expect(writeOff.getByText("This can't be undone.")).toBeVisible();
    await writeOff.getByLabel('Reason').fill('Customer emigrated');
    await writeOff.getByRole('button', { name: 'Write off' }).click();
    await expect(writeOff).toBeHidden();
    expect((await contractOf(toWriteOff.id)).status).toBe('written_off');

    // The customer owes only what is left on the rescheduled contract.
    const account = ok(await api(owner, 'GET', `/api/customers/${customerId}/account`));
    expect((account['balance'] as { open_balance: string }).open_balance).toBe(
      after.balance.remaining,
    );

    // The list, from the menu.
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Contract changes' }).first().click();
    await expect(page).toHaveURL(/\/installments\/changes$/);
    for (const c of [toReschedule, toSettle, toWriteOff]) {
      await expect(page.getByRole('link', { name: c.number })).toBeVisible();
    }
    await expect(page.locator('body')).not.toContainText(/interest/i);

    // Arabic, right to left.
    await page.goto(`/contracts/${toReschedule.id}`);
    await page.getByRole('button', { name: 'Switch language to العربية' }).click();
    await expect(page.getByRole('button', { name: 'سداد مبكر' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('body')).not.toContainText('فائدة');
  });
});

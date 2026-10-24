import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  PASSWORD,
  STAMP,
  type Session,
  api,
  closeOpenShift,
  errorCode,
  newDevice,
  ok,
  openShiftByApi,
  pairByApi,
  session,
} from './helpers/int4';

/**
 * L01 + N09 (EC-108, EC-88, D92): the legal module end to end, server and client together, in a
 * shop of its own (the platform admin provisions it, the owner and two lawyers accept the emailed
 * invites). The owner sells a TV on installments (through the API), the contract falls 40 days
 * behind (the database moves its due dates back: EcoFin-API/scripts/int5-db.mjs), the owner runs
 * the overdue check on the screen and turns the legal referral into a legal case: the referral
 * says "case opened", the contract and its customer show the legal badge, the customer is
 * blocked. The owner adds a hearing and a note and moves the case to filed and in court. The first
 * lawyer signs in, lands on the cases, sees only Legal and Overdue in the menu, sees the case and
 * no sales or cash; the second lawyer sees nothing of it. The owner closes the case with an
 * outcome: the badge goes, nothing that is owed changed, the customer stays blocked.
 * Needs the API (with SMTP to Mailpit), local Supabase with the dev seed, docker (the database
 * container) and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 *   E2E_API_DIR                                       the EcoFin-API folder (default ../EcoFin-API)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const API_DIR = resolve(env('E2E_API_DIR', '../EcoFin-API'));
const OWNER_EMAIL = `l01.owner.${STAMP}@ecotech.test`;
const LAWYER1_EMAIL = `l01.lawyer1.${STAMP}@ecotech.test`;
const LAWYER2_EMAIL = `l01.lawyer2.${STAMP}@ecotech.test`;
const IP = `198.51.108.${(STAMP % 250) + 1}`;
const LAWYER1 = `L01 Lawyer One ${STAMP}`;
const CUSTOMER = `L01 Customer ${STAMP}`;
const LEGAL_LANDING = /\/legal$/;

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

async function acceptInvite(request: APIRequestContext, email: string) {
  const accepted = await request.post('/api/auth/invites/accept', {
    headers: { 'X-Forwarded-For': IP },
    data: { token: await inviteToken(request, email), password: PASSWORD },
  });
  expect(accepted.status(), await accepted.text()).toBe(200);
}

/** A new retail_pro shop (its plan has the legal module) whose owner has the e2e password. */
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
      name: `L01 shop ${STAMP}`,
      tenant_slug: `l01-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'L01 Owner', email: OWNER_EMAIL },
    },
  });
  expect(shop.status(), await shop.text()).toBe(201);
  const orgId = String(((await shop.json()) as { organization_id: string }).organization_id);
  await acceptInvite(request, OWNER_EMAIL);
  return orgId;
}

/** Runs one of the API repo's scripts; answers its output (throws with the output on failure). */
function apiScript(...args: string[]) {
  try {
    return execFileSync('node', args, { cwd: API_DIR, encoding: 'utf8' });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(`${args.join(' ')} failed:\n${e.stdout ?? ''}${e.stderr ?? ''}`, {
      cause: error,
    });
  }
}

/** A valid Egyptian national ID that is new on every run (born 1990, Cairo). */
const freshNationalId = () => `290010101${String((STAMP + 108) % 100000).padStart(5, '0')}`;

/** "ddmmyyyy" of a day `days` from today, to type into the day box of a date field. */
function typedDate(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    typed: `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`,
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  };
}

interface Balance {
  total_payable: string;
  paid: string;
  remaining: string;
}

test.describe('L01 + N09 legal module end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(600_000);

  let owner: Session;
  let lawyer1: Session | undefined;
  let lawyer2: Session | undefined;
  let orgId = '';

  test.beforeAll(async ({ request }) => {
    orgId = await provisionShop(request);
  });
  test.afterAll(async () => {
    if (owner) await closeOpenShift(owner).catch(() => undefined);
    await owner?.context.close();
    await lawyer1?.context.close();
    await lawyer2?.context.close();
  });

  test('referral to case, the flag, the lawyer who sees only theirs, and the close', async ({
    browser,
    request,
  }) => {
    owner = await session(browser, OWNER_EMAIL, orgId);
    const page = owner.page;

    // ---- Set-up through the API: lawyers, stock, the till, the policy, a defaulted contract. ----
    const branches = ok(await api(owner, 'GET', '/api/branches')) as unknown as {
      id: string;
      is_main: boolean;
    }[];
    const branch = branches.find((b) => b.is_main)?.id ?? branches[0]!.id;
    for (const [email, name] of [
      [LAWYER1_EMAIL, LAWYER1],
      [LAWYER2_EMAIL, `L01 Lawyer Two ${STAMP}`],
    ] as const) {
      ok(
        await api(owner, 'POST', '/api/employees', {
          full_name: name,
          email,
          role: 'LAWYER',
          default_branch_id: branch,
          branch_ids: [branch],
        }),
        201,
      );
      await acceptInvite(request, email);
    }
    const product = ok(
      await api(owner, 'POST', '/api/products', {
        name_ar: 'تلفزيون',
        name_en: 'L01 TV',
        sku: `L01-TV-${STAMP}`,
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
        `l01-e2e-stock-${STAMP}`,
      ),
      201,
    );
    const device = await newDevice(owner, `L01 POS ${STAMP}`, branch);
    await pairByApi(owner, owner, device);
    await openShiftByApi(owner, branch, device);
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [{ up_to_months: 24, pct: 20 }],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
        grace_days: 3,
      }),
      201,
    );
    // A legal referral after 30 days late (monthly contracts); the score check has its own tests.
    ok(
      await api(owner, 'PATCH', '/api/settings', {
        credit_min_score: 0,
        legal_referral_days: { monthly: 30 },
      }),
    );
    const policyVersion = (
      ok(await api(owner, 'GET', '/api/settings'))['installment_policy'] as { version: number }
    ).version;
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: CUSTOMER,
        phones: ['01500000108'],
        national_id: freshNationalId(),
      }),
      201,
    );
    const customerId = String(customer['id']);
    ok(
      await api(owner, 'PUT', `/api/customers/${customerId}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'L01 e2e',
      }),
    );
    const lines = [{ product_id: product['id'], quantity: 1 }];
    const quote = ok(await api(owner, 'POST', '/api/sales/quote', { lines }));
    const sold = ok(
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
            policy_version: policyVersion,
          },
        },
        `l01-e2e-sale-${STAMP}`,
      ),
      201,
    );
    const contract = sold['contract'] as { id: string; number: string };
    const balanceOf = async () =>
      (ok(await api(owner, 'GET', `/api/contracts/${contract.id}`))['balance'] ?? {}) as Balance;
    // Time passes: the first installment is 40 days late (only the database can move due dates).
    apiScript('scripts/int5-db.mjs', 'backdate', contract.id, '40');
    const owedBefore = await balanceOf();

    // ---- N04 then L01: the overdue check makes the referral; the owner turns it into a case. ----
    await page.goto('/installments/overdue');
    await page.getByRole('button', { name: 'Run the check now' }).click();
    await expect(page.getByText(/Check done: \d+ new warnings/)).toBeVisible();
    await page.getByRole('tab', { name: 'Legal referrals' }).click();
    const referralRow = page.getByRole('row').filter({ hasText: contract.number });
    await expect(referralRow).toBeVisible();
    await referralRow.getByRole('button', { name: 'Open legal case' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Claim')).not.toHaveValue('');
    await dialog.getByLabel('Lawyer').selectOption({ label: LAWYER1 });
    await dialog.getByLabel('Court', { exact: true }).fill('Cairo Economic Court');
    await dialog.getByLabel('Court case number').fill(`${STAMP % 10000}/2026`);
    await dialog.getByLabel('First note (optional)').fill('Opened from the legal referral');
    await dialog.getByRole('button', { name: 'Open the case' }).click();
    await expect(page).toHaveURL(/\/legal\/cases\/[0-9a-f-]{36}$/);
    const caseId = page.url().split('/').pop()!;
    await expect(page.getByRole('heading', { name: /^Case .*-LC-/ })).toBeVisible();
    await expect(page.getByText('Preparing').first()).toBeVisible();
    await expect(page.getByText('Blocked')).toBeVisible();
    await expect(page.getByText('Opened from the legal referral')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/interest/i);
    // No collect button on the case: payments are taken on the collection screen.
    await expect(page.getByRole('button', { name: /collect/i })).toHaveCount(0);

    // The referral says "case opened" and links to the case instead of "dismiss".
    await page.goto('/installments/overdue?tab=referrals');
    // The list shows the open referrals first; this one is no longer open.
    await expect(page.getByRole('row').filter({ hasText: contract.number })).toHaveCount(0);
    await page.getByLabel('Status').selectOption('case_opened');
    const afterRow = page.getByRole('row').filter({ hasText: contract.number });
    await expect(afterRow.getByRole('link', { name: 'View the case' })).toHaveAttribute(
      'href',
      `/legal/cases/${caseId}`,
    );
    await expect(afterRow.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);

    // The contract (and the overdue list) carry the badge; the customer is blocked.
    await page.goto(`/contracts/${contract.id}`);
    await expect(page.getByRole('link', { name: 'Legal: Preparing' })).toBeVisible();
    const flagged = ok(await api(owner, 'GET', `/api/contracts/${contract.id}`));
    expect((flagged['legal_case'] as { id: string }).id).toBe(caseId);
    expect(
      (ok(await api(owner, 'GET', `/api/customers/${customerId}`))['status'] as string) ?? '',
    ).toBe('blocked');
    await page.goto('/installments/overdue');
    await expect(page.getByRole('link', { name: 'Legal: Preparing' })).toBeVisible();

    // ---- The case: a hearing, a note, filed, in court. ----
    await page.goto(`/legal/cases/${caseId}`);
    const hearing = typedDate(3);
    await page.getByRole('button', { name: 'Add a hearing' }).click();
    const hearingDialog = page.getByRole('dialog');
    await hearingDialog.getByLabel('Hearing date').pressSequentially(hearing.typed);
    await hearingDialog.getByLabel('Notes (optional)').fill('First session');
    await hearingDialog.getByRole('button', { name: 'Add a hearing' }).click();
    await expect(hearingDialog).toBeHidden();
    await expect(page.getByText('First session')).toBeVisible();
    await page.getByLabel('New note').fill('Spoke to the customer by phone');
    await page.getByRole('button', { name: 'Add the note' }).click();
    await expect(page.getByText('Spoke to the customer by phone')).toBeVisible();
    await page.getByRole('button', { name: 'File the case' }).click();
    await expect(page.getByRole('button', { name: 'Move to court' })).toBeVisible();
    await page.getByRole('button', { name: 'Move to court' }).click();
    await expect(page.getByRole('button', { name: 'Record the judgment' })).toBeVisible();
    const detail = ok(await api(owner, 'GET', `/api/legal/cases/${caseId}`));
    expect(detail['status']).toBe('in_court');
    expect(detail['next_hearing_date']).toBe(hearing.iso);
    await page.goto('/legal');
    await expect(page.getByRole('row').filter({ hasText: contract.number })).toContainText(
      'within 7 days',
    );

    // ---- The first lawyer: lands on the cases, a menu of two items, no sales or cash. ----
    lawyer1 = await session(
      browser,
      LAWYER1_EMAIL,
      orgId,
      'en',
      undefined,
      undefined,
      LEGAL_LANDING,
    );
    const lp = lawyer1.page;
    await expect(lp.getByRole('heading', { name: 'Legal cases' })).toBeVisible();
    await expect(lp.getByRole('row').filter({ hasText: contract.number })).toBeVisible();
    await expect
      .poll(async () => (await lp.locator('aside nav a').allInnerTexts()).sort())
      .toEqual(['Legal', 'Overdue']);
    await expect(lp.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
    for (const path of [
      '/api/sales',
      '/api/returns',
      '/api/quotations',
      '/api/shifts',
      '/api/cash-accounts',
      '/api/expenses',
    ]) {
      const refused = await api(lawyer1, 'GET', path);
      expect(refused.status, path).toBe(403);
      expect(errorCode(refused), path).toBe('PERMISSION_DENIED');
    }
    await lp.getByRole('link', { name: contract.number }).first().click();
    await expect(lp).toHaveURL(new RegExp(`/contracts/${contract.id}$`));
    await expect(lp.getByRole('heading', { name: `Contract ${contract.number}` })).toBeVisible();
    await expect(lp.getByRole('link', { name: /-SL-/ })).toHaveCount(0);
    await expect(lp.getByRole('link', { name: 'Legal: In court' })).toBeVisible();
    await lp.getByRole('link', { name: 'Legal: In court' }).click();
    await expect(lp).toHaveURL(new RegExp(`/legal/cases/${caseId}$`));
    await expect(lp.getByText('Spoke to the customer by phone')).toBeVisible();
    await lp.getByLabel('New note').fill('Lawyer: filed the power of attorney');
    await lp.getByRole('button', { name: 'Add the note' }).click();
    await expect(lp.getByText('Lawyer: filed the power of attorney')).toBeVisible();

    // ---- The second lawyer sees nothing of it. ----
    lawyer2 = await session(
      browser,
      LAWYER2_EMAIL,
      orgId,
      'en',
      undefined,
      undefined,
      LEGAL_LANDING,
    );
    await expect(lawyer2.page.getByText('No open legal cases.')).toBeVisible();
    await lawyer2.page.goto(`/legal/cases/${caseId}`);
    await expect(lawyer2.page.getByText('This case was not found')).toBeVisible();
    const hidden = await api(lawyer2, 'GET', `/api/legal/cases/${caseId}`);
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden)).toBe('LEGAL_CASE_NOT_FOUND');

    // ---- The owner closes the case: the outcome is kept, nothing owed changed, still blocked. ----
    await page.goto(`/legal/cases/${caseId}`);
    await page.getByRole('button', { name: 'Close the case' }).click();
    const closeDialog = page.getByRole('dialog');
    await closeDialog.getByLabel('How did it end?').selectOption('settled_out_of_court');
    await closeDialog.getByLabel('Note (optional)').fill('A plan agreed at the court');
    await closeDialog.getByRole('button', { name: 'Close the case' }).click();
    await expect(page.getByText('Closed: Settled out of court')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close the case' })).toHaveCount(0);
    expect(await balanceOf()).toEqual(owedBefore);
    expect(
      (ok(await api(owner, 'GET', `/api/contracts/${contract.id}`))['legal_case'] ?? null) as
        object | null,
    ).toBeNull();
    expect(
      (ok(await api(owner, 'GET', `/api/customers/${customerId}`))['status'] as string) ?? '',
    ).toBe('blocked');
    await page.goto(`/contracts/${contract.id}`);
    await expect(page.getByRole('link', { name: /^Legal:/ })).toHaveCount(0);

    // Arabic, right to left.
    await page.goto('/legal');
    await page.getByRole('button', { name: 'Switch language to العربية' }).click();
    await expect(page.getByRole('heading', { name: 'القضايا القانونية' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('tab', { name: 'منتهية' }).click();
    await expect(page.getByText('منتهية').first()).toBeVisible();
  });
});

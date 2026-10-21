import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { PASSWORD, STAMP, type Session, session, api, ok } from './helpers/int4';

/**
 * M02 (EC-101, D85): opening balances end to end, server and client together. Like M01's spec it
 * makes its own shop (the platform admin provisions it, the owner accepts the emailed invite). The
 * owner:
 *   1. imports a customer (M01) and publishes an installment policy;
 *   2. checks an open-contracts file whose balance does not add up: the error is listed, the Import
 *      button is off, nothing is saved;
 *   3. checks the fixed file (one installment already late): the contract table, the late amount and
 *      the "no fee" note show; imports it;
 *   4. sees the reconciliation report (imported = left today), refuses a wrong total (the three
 *      numbers show) and signs off the right one;
 *   5. runs the overdue check and finds the customer's late installment on the overdue list.
 * Needs the API with the job worker on (JOBS_ENABLED=true, JOBS_POLL_SECONDS=5, SMTP to Mailpit),
 * local Supabase with the dev seed and the dev server; skipped unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `m02.owner.${STAMP}@ecotech.test`;
const IP = `198.51.109.${(STAMP % 250) + 1}`;

/** A valid Egyptian national ID that is new on every run (born 1990, Cairo). */
const NATIONAL_ID = `290010101${String((STAMP + 21) % 100000).padStart(5, '0')}`;
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

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
      name: `M02 shop ${STAMP}`,
      tenant_slug: `m02-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'M02 Owner', email: OWNER_EMAIL },
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

const csv = (lines: string[]) => ({
  name: 'file.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(lines.join('\r\n') + '\r\n', 'utf8'),
});

/** Opens a kind's wizard, chooses the file and reads it: the column step is next. */
async function startWith(page: Page, kind: string, file: ReturnType<typeof csv>) {
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: kind }) });
  await card.getByRole('button', { name: 'Import from a file' }).click();
  await page.getByLabel('Choose a file', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: 'Read the file' }).click();
  await expect(page.getByRole('heading', { name: 'Match your columns' })).toBeVisible();
}

const HEADER =
  'Contract number,National ID,Contract date,Original total,Paid before,Due date,Installment amount left';

test.describe('M02 opening balances end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(300_000);

  let owner: Session;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(120_000);
    owner = await session(browser, OWNER_EMAIL, await provisionShop(request));
  });
  test.afterAll(async () => {
    await owner?.context.close();
  });

  test('an unbalanced contract is refused; the fixed file imports; the wrong total is refused; the right one signs; the late line is overdue', async () => {
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
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `M02 Customer ${STAMP}`,
        phones: ['01500000091'],
        national_id: NATIONAL_ID,
      }),
      201,
    );
    const customerId = String(customer['id']);

    await page.goto('/settings/import');
    await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible();

    // 1. 5000 - 1000 = 4000, but the installments add up to 3000: refused, nothing saved.
    await startWith(
      page,
      'Open installment contracts',
      csv([
        HEADER,
        `M02-${STAMP},${NATIONAL_ID},2025-01-15,5000,1000,${day(-20)},1000`,
        `M02-${STAMP},${NATIONAL_ID},2025-01-15,5000,1000,${day(10)},1000`,
        `M02-${STAMP},${NATIONAL_ID},2025-01-15,5000,1000,${day(40)},1000`,
      ]),
    );
    await page.getByRole('button', { name: 'Check the file' }).click();
    const errors = page.getByRole('table', { name: 'Errors by row' });
    await expect(errors).toBeVisible();
    await expect(errors).toContainText('Original total minus paid before must equal');
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();

    // 2. The fixed file: four installments of 1000, the first one already late.
    await page.getByRole('button', { name: 'Start over' }).click();
    await startWith(
      page,
      'Open installment contracts',
      csv([
        HEADER,
        `M02-${STAMP},${NATIONAL_ID},2025-01-15,5000,1000,${day(-20)},1000`,
        `M02-${STAMP},${NATIONAL_ID},2025-01-15,5000,1000,${day(10)},1000`,
        `M02-${STAMP},${NATIONAL_ID},2025-01-15,5000,1000,${day(40)},1000`,
        `M02-${STAMP},${NATIONAL_ID},2025-01-15,5000,1000,${day(70)},1000`,
      ]),
    );
    await page.getByRole('button', { name: 'Check the file' }).click();
    await expect(page.getByText('No errors. Nothing has been saved yet.')).toBeVisible();
    const contracts = page.getByRole('table', { name: 'Contracts in this file' });
    await expect(contracts).toContainText(`M02-${STAMP}`);
    await expect(contracts).toContainText('4,000.00');
    await expect(page.getByText(/is already late/)).toBeVisible();
    await expect(page.getByText(/no fee is ever added/)).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Import now' }).click();
    await expect(page.getByText('Import finished')).toBeVisible({ timeout: 90_000 });

    // 3. The report: imported equals what is left today.
    await page.goto('/settings/migration');
    await expect(page.getByRole('heading', { name: 'Data migration' })).toBeVisible();
    await expect(page.getByText(`M02 Customer ${STAMP}`)).toBeVisible();
    await expect(page.getByTestId('tile-Imported (left at import)')).toContainText('4,000.00');
    await expect(page.getByTestId('tile-Left to pay today')).toContainText('4,000.00');
    await expect(page.getByTestId('tile-Late today')).toContainText('1,000.00');

    // 4. A wrong total is refused with the three numbers; the right one signs off.
    await page.getByRole('tab', { name: 'Sign-off' }).click();
    await page.getByText(/Open contracts · /).click();
    await page.getByLabel('Open debt total (from the paper)').fill('3999');
    await page.getByLabel('Note').fill('Signed by the owner against the paper ledger');
    await page.getByRole('button', { name: 'Sign off', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Difference' })).toContainText(
      '3,999.00',
    );
    await expect(page.getByRole('alert').filter({ hasText: 'Difference' })).toContainText(
      '4,000.00',
    );
    await page.getByLabel('Open debt total (from the paper)').fill('4000');
    await page.getByRole('button', { name: 'Sign off', exact: true }).click();
    await expect(page.getByText('The reconciliation is signed off.')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Signed reconciliations' })).toContainText(
      '4,000.00',
    );
    await page.getByRole('tab', { name: 'Reconciliation report' }).click();
    await expect(page.getByRole('button', { name: 'Reverse batch' })).toHaveCount(0);
    expect(
      (ok(await api(owner, 'GET', '/api/migration/sign-offs')) as unknown as { items: unknown[] })
        .items,
    ).toHaveLength(1);

    // 5. The nightly check treats the late installment like any other: it is on the overdue list.
    await page.goto('/installments/overdue');
    await page.getByRole('button', { name: 'Run the check now' }).click();
    // The job worker may have run the nightly check already, so the count of NEW warnings is 0 or 1.
    await expect(page.getByText(/Check done: [01] new warnings/)).toBeVisible();
    await expect(page.getByText(`M02 Customer ${STAMP}`).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/interest/i);

    // The contract page and the customer account say where the contract came from.
    await page.goto(`/customers/${customerId}`);
    await page.getByRole('tab', { name: /Account/ }).click();
    await expect(page.getByText(new RegExp(`Migrated · M02-${STAMP}`))).toBeVisible();
  });
});

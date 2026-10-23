import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { PASSWORD, STAMP, type Session, session, api, ok } from './helpers/int4';

/**
 * D03 (EC-95, D90): the receivables aging end to end, server and client together. Like M02's spec it makes
 * its own shop (the platform admin provisions it, the owner accepts the emailed invite). The clock can't
 * move, so the late installments come from the supported way to have them: an M02 opening-contracts import
 * whose remaining installments have past due dates. Two customers: Late owes 4 000 (1 000 about 40 days
 * late, 1 000 about 10 days late, 2 000 not due), On-time owes 2 000 (not due). The owner opens the report
 * grouped by customer and sees those buckets and the 6 000 total, drills down to Late's contract and on to
 * its page, and exports the CSV. The policy has no grace days, so the shop's date (Cairo) against the
 * browser's (UTC) can't move a line across a bucket edge. Needs the API with the job worker on (the import
 * runs as a job) and SMTP to Mailpit, local Supabase with the dev seed and the dev server; skipped unless
 * RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `d03.owner.${STAMP}@ecotech.test`;
const IP = `198.51.111.${(STAMP % 250) + 1}`;

/** Valid Egyptian national IDs that are new on every run (born 1990, Cairo). */
const ID_LATE = `290010101${String((STAMP + 31) % 100000).padStart(5, '0')}`;
const ID_ON_TIME = `290010101${String((STAMP + 32) % 100000).padStart(5, '0')}`;
const LATE = `D03 Late ${STAMP}`;
const ON_TIME = `D03 OnTime ${STAMP}`;
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

/** A new retail shop whose owner has the e2e password; answers its organization id. */
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
      name: `D03 shop ${STAMP}`,
      tenant_slug: `d03-e2e-${STAMP}`,
      plan_key: 'retail',
      owner: { full_name: 'D03 Owner', email: OWNER_EMAIL },
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

const HEADER =
  'Contract number,National ID,Contract date,Original total,Paid before,Due date,Installment amount left';

/** M02's wizard: one open-contracts file, checked and imported. */
async function importOpeningContracts(page: Page, lines: string[]) {
  await page.goto('/settings/import');
  await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible();
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Open installment contracts' }) });
  await card.getByRole('button', { name: 'Import from a file' }).click();
  await page.getByLabel('Choose a file', { exact: true }).setInputFiles(csv([HEADER, ...lines]));
  await page.getByRole('button', { name: 'Read the file' }).click();
  await expect(page.getByRole('heading', { name: 'Match your columns' })).toBeVisible();
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(page.getByText('No errors. Nothing has been saved yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Import now' }).click();
  await expect(page.getByText('Import finished')).toBeVisible({ timeout: 90_000 });
}

test.describe('D03 receivables aging end to end', () => {
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

  test('the report shows who owes what by age, drills down to the contract and exports the CSV', async () => {
    const page = owner.page;
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [{ up_to_months: 24, pct: 20 }],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
        grace_days: 0,
      }),
      201,
    );
    for (const [name, nationalId, phone] of [
      [LATE, ID_LATE, '01500000093'],
      [ON_TIME, ID_ON_TIME, '01500000094'],
    ] as const) {
      ok(
        await api(owner, 'POST', '/api/customers', {
          full_name: name,
          phones: [phone],
          national_id: nationalId,
        }),
        201,
      );
    }
    // Late: 5 000 - 1 000 paid = 4 000 in four lines, two of them past due. On time: 2 000 in two future lines.
    await importOpeningContracts(page, [
      `D03L-${STAMP},${ID_LATE},2025-01-15,5000,1000,${day(-40)},1000`,
      `D03L-${STAMP},${ID_LATE},2025-01-15,5000,1000,${day(-10)},1000`,
      `D03L-${STAMP},${ID_LATE},2025-01-15,5000,1000,${day(20)},1000`,
      `D03L-${STAMP},${ID_LATE},2025-01-15,5000,1000,${day(50)},1000`,
      `D03T-${STAMP},${ID_ON_TIME},2025-01-15,3000,1000,${day(20)},1000`,
      `D03T-${STAMP},${ID_ON_TIME},2025-01-15,3000,1000,${day(50)},1000`,
    ]);

    // The report, grouped by customer (the default); the menu holds it under Reports.
    await page.goto('/reports/receivables');
    await expect(page.getByRole('link', { name: 'Receivables aging' })).toBeAttached();
    await expect(page.getByRole('heading', { name: 'Receivables aging' })).toBeVisible();
    await expect(page.getByText('6,000.00 EGP').first()).toBeVisible();
    const table = page.getByRole('table', { name: 'Receivables by Customer' });
    const late = table.getByRole('row').filter({ hasText: LATE });
    await expect(late).toContainText('4,000.00 EGP'); // outstanding
    await expect(late).toContainText('2,000.00 EGP'); // not due, overdue
    await expect(late).toContainText('1,000.00 EGP'); // 1-30 and 31-60
    const onTime = table.getByRole('row').filter({ hasText: ON_TIME });
    await expect(onTime).toContainText('2,000.00 EGP');
    await expect(
      page.getByText(/Total checked against the open balance of 2 contracts/),
    ).toBeVisible();

    // The CSV: every row and the server's totals line.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^receivables-\d{4}-\d{2}-\d{2}-customer\.csv$/);
    const text = (await readFile(await download.path(), 'utf8')).replace(
      String.fromCharCode(0xfeff),
      '',
    );
    const lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(4); // header, two customers, totals
    const header = lines[0]!.split(',');
    const cell = (row: string, name: string) => row.split(',')[header.indexOf(name)];
    const lateLine = lines.find((l) => l.startsWith(LATE))!;
    expect(cell(lateLine, 'Outstanding')).toBe('4000.00');
    expect(cell(lateLine, 'Not due')).toBe('2000.00');
    expect(cell(lateLine, '1–30 days')).toBe('1000.00');
    expect(cell(lateLine, '31–60 days')).toBe('1000.00');
    expect(cell(lines[3]!, 'Outstanding')).toBe('6000.00');

    // Drill down: Late's contracts, then the contract page.
    await page.getByRole('link', { name: `Show the contracts of ${LATE}` }).click();
    await expect(page.getByText(`Contracts of ${LATE}`)).toBeVisible();
    const contracts = page.getByRole('table', { name: 'Receivables by Contract' });
    await expect(contracts.getByRole('row')).toHaveCount(2); // header + one contract
    await expect(contracts).toContainText('Opening balance');
    await expect(contracts).toContainText('4,000.00 EGP');
    await contracts.getByRole('link', { name: /^Open contract / }).click();
    await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]{36}$/);
  });
});

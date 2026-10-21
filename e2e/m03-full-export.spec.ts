import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, STAMP, type Session, session, api, ok } from './helpers/int4';

/**
 * M03 (EC-102, D86): the full export end to end, server and client together. Like M01 and M02 it
 * makes its own shop (the platform admin provisions it, the owner accepts the emailed invite), so a
 * run never meets the one-export-an-hour rule of an earlier run. The owner:
 *   1. has a customer whose name is a formula (=1+1) with a national ID;
 *   2. opens Settings > Export data, presses "Export all data" and waits for it to be Ready;
 *   3. downloads the zip, which holds manifest.json and csv/customers.csv;
 *   4. the CSV starts with the UTF-8 BOM, the formula comes out as '=1+1 and the national ID is masked.
 * Needs the API with the job worker on (JOBS_ENABLED=true, JOBS_POLL_SECONDS=5, DATABASE_URL = the
 * local Postgres, SMTP to Mailpit), local Supabase with the dev seed and the dev server; skipped
 * unless RUN_E2E=1.
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD   the seeded platform admin
 *   E2E_MAILPIT_URL                                   (default http://127.0.0.1:54324)
 */
const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const MAILPIT = env('E2E_MAILPIT_URL', 'http://127.0.0.1:54324');
const ADMIN_EMAIL = env('E2E_SUPERADMIN_EMAIL', 'superadmin@ecotech.test');
const ADMIN_PASSWORD = env('E2E_SUPERADMIN_PASSWORD', env('E2E_OWNER_PASSWORD', PASSWORD));
const OWNER_EMAIL = `m03.owner.${STAMP}@ecotech.test`;
const IP = `198.51.110.${(STAMP % 250) + 1}`;
const NATIONAL_ID = `290010101${String((STAMP + 33) % 100000).padStart(5, '0')}`;

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
      name: `M03 shop ${STAMP}`,
      tenant_slug: `m03-e2e-${STAMP}`,
      plan_key: 'retail_pro',
      owner: { full_name: 'M03 Owner', email: OWNER_EMAIL },
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

/** The entries of a zip file (stored or deflated), read from its central directory. */
function readZip(buffer: Buffer): Record<string, Buffer> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const entries: Record<string, Buffer> = {};
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let n = buffer.readUInt16LE(eocd + 10); n > 0; n -= 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extra = buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extra;
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    entries[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
  }
  return entries;
}

test.describe('M03 full export end to end', () => {
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

  test('the owner exports the shop, downloads the zip and finds the manifest, a BOM and a safe formula', async () => {
    const page = owner.page;
    ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: '=1+1',
        phones: ['01500000093'],
        national_id: NATIONAL_ID,
      }),
      201,
    );

    await page.goto('/settings/export');
    await expect(page.getByRole('heading', { name: 'Export data' })).toBeVisible();
    await expect(page.getByText('No export yet')).toBeVisible();
    await page.getByRole('button', { name: 'Export all data' }).click();

    // The list refreshes by itself while the job runs; the row turns Ready with its size.
    const ready = page.getByRole('row').filter({ hasText: 'Ready' });
    await expect(ready).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Export all data' })).toBeEnabled();

    // The download link is a short-lived signed URL to the zip.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      ready.getByRole('button', { name: 'Download' }).click(),
    ]);
    const path = await download.path();
    const entries = readZip(readFileSync(path));

    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining(['manifest.json', 'csv/customers.csv', 'json/customers.json']),
    );
    const manifest = JSON.parse(entries['manifest.json']!.toString('utf8')) as {
      pii: string;
      tables: { name: string; rows: number }[];
    };
    expect(manifest.pii).toBe('masked');
    expect(manifest.tables.find((t) => t.name === 'customers')?.rows).toBe(1);

    const csv = entries['csv/customers.csv']!;
    // UTF-8 BOM, so Arabic opens correctly in Excel.
    expect([csv[0], csv[1], csv[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = csv.toString('utf8');
    // A customer named =1+1 comes out as '=1+1: no cell can run a formula.
    expect(text).toContain("'=1+1");
    // National IDs are masked unless the full export was asked for.
    expect(text).not.toContain(NATIONAL_ID);
    expect(text).toContain(`**********${NATIONAL_ID.slice(-4)}`);
  });
});

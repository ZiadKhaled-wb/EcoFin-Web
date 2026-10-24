import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const PASSWORD = process.env.E2E_INT4_PASSWORD ?? 'LocalDev-Only-2026!';

export const USERS = {
  ownerA: 'owner.a@int4.test',
  managerA: 'manager.a@int4.test',
  cashierA1: 'cashier.a1@int4.test',
  cashierA2: 'cashier.a2@int4.test',
  ownerB: 'owner.b@int4.test',
  cashierB: 'cashier.b@int4.test',
} as const;

export const ORG_A = 'e4100000-0000-0000-0000-000000000001';

export const ORG_B = 'e4100000-0000-0000-0000-000000000002';

export const BRANCH_A = 'e4200000-0000-0000-0000-000000000011';

export const BRANCH_B = 'e4200000-0000-0000-0000-000000000021';

export const BARCODE_CHAIR = '6221000000011';

export const ETA_POS = [
  { eta_serial: 'INT4-POS-1', preshared_key: 'int4-fake-psk-1' },
  { eta_serial: 'INT4-POS-2', preshared_key: 'int4-fake-psk-2' },
] as const;

export const FAKE_ADMIN = process.env.FAKE_ETA_ADMIN_URL ?? 'http://127.0.0.1:4011';

export const STAMP = Date.now();

let ipCounter = Math.floor(Math.random() * 200);

export interface Session {
  context: BrowserContext;
  page: Page;
  orgId: string;
}

export async function session(
  browser: Browser,
  email: string,
  orgId: string,
  lang: 'ar' | 'en' = 'en',
  warnings?: string[],
  /** The browser's own time zone (D01 runs it in UTC, as CI does; the shop's day is the server's). */
  timezoneId?: string,
  /** Where the first page after sign-in is (L01: a lawyer lands on /legal, not on the dashboard). */
  landing: RegExp = /\/(dashboard|select-shop)/,
) {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': `198.51.101.${(ipCounter++ % 250) + 1}` },
    ...(timezoneId ? { timezoneId } : {}),
  });
  await context.addInitScript((l) => window.localStorage.setItem('ecofin-lang', l), lang);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (warnings && /missingKey|missing key/i.test(message.text())) warnings.push(message.text());
  });
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(landing);
  return { context, page, orgId } satisfies Session;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

export async function api(
  s: Session,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  path: string,
  data?: object,
  key?: string,
): Promise<ApiResult> {
  const auth = await s.page.evaluate(() => {
    const raw = window.localStorage.getItem('ecofin-auth');
    const state = (raw ? JSON.parse(raw) : {}).state ?? {};
    const orgId: string = state.orgId ?? '';
    return {
      accessToken: (state.accessToken ?? '') as string,
      deviceToken: window.localStorage.getItem(`ecotech.deviceToken.${orgId}`),
    };
  });
  const res = await s.page.request.fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-org-id': s.orgId,
      ...(auth.deviceToken ? { 'x-device-token': auth.deviceToken } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(data ? { data } : {}),
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as unknown };
}

export const ok = (r: ApiResult, status = 200) => {
  expect(r.status, JSON.stringify(r.body)).toBe(status);
  return r.body as Record<string, unknown>;
};

export const errorCode = (r: ApiResult) =>
  (r.body as { error?: { code?: string } } | null)?.error?.code;

export async function fakeEta(request: APIRequestContext, path: string, data?: object) {
  const res = data
    ? await request.post(`${FAKE_ADMIN}${path}`, { data })
    : await request.get(`${FAKE_ADMIN}${path}`);
  expect(res.ok(), path).toBe(true);
  return res.status() === 204 ? null : ((await res.json()) as Record<string, unknown>);
}

export async function pairByApi(owner: Session, cashier: Session, deviceId: string) {
  await cashier.page.evaluate(
    (org) => window.localStorage.removeItem(`ecotech.deviceToken.${org}`),
    cashier.orgId,
  );
  const code = ok(await api(owner, 'POST', `/api/devices/${deviceId}/pairing-code`), 200);
  const paired = ok(await api(cashier, 'POST', '/api/devices/pair', { code: code['code'] }), 200);
  await cashier.page.evaluate(
    ([org, token]) => window.localStorage.setItem(`ecotech.deviceToken.${org}`, token),
    [cashier.orgId, String(paired['token'] ?? paired['device_token'] ?? '')] as const,
  );
}

export async function newDevice(
  owner: Session,
  name: string,
  branch: string,
  eta?: (typeof ETA_POS)[number],
) {
  const id = String(
    ok(await api(owner, 'POST', '/api/devices', { name, branch_id: branch }), 201)['id'],
  );
  if (eta) await registerEta(owner, id, eta);
  return id;
}

export async function registerEta(owner: Session, id: string, eta: (typeof ETA_POS)[number]) {
  ok(
    await api(owner, 'PUT', `/api/devices/${id}/eta`, {
      ...eta,
      eta_os_version: 'windows 11',
      eta_model_framework: '1',
      eta_status: 'active',
    }),
  );
}

export async function closeOpenShift(s: Session) {
  const current = await api(s, 'GET', '/api/shifts/current');
  const shift = (current.body as { shift: { id: string } | null } | null)?.shift;
  if (!shift) return;
  ok(
    await api(s, 'POST', `/api/shifts/${shift.id}/close`, {
      counts: {},
      difference_reason: 'INT-4 clean-up',
    }),
  );
}

export async function openShiftByApi(s: Session, branch: string, device: string) {
  ok(
    await api(
      s,
      'POST',
      '/api/shifts',
      { branch_id: branch, opening_float: '0', device_id: device },
      `int4-shift-${STAMP}-${device}`,
    ),
    201,
  );
}

export async function sellByApi(s: Session, productId: string, price: string, key: string) {
  return api(
    s,
    'POST',
    '/api/sales',
    { lines: [{ product_id: productId, quantity: 1 }], expected_total: price },
    key,
  );
}

export async function fiscalOf(owner: Session, saleNumber: string) {
  const list = ok(await api(owner, 'GET', `/api/fiscal?q=${encodeURIComponent(saleNumber)}`));
  const item = (list['items'] as { id: string; sale_number: string; status: string }[]).find(
    (i) => i.sale_number === saleNumber,
  );
  expect(item, `no fiscal row for ${saleNumber}`).toBeTruthy();
  const details = ok(await api(owner, 'GET', `/api/fiscal/${item!.id}`));
  return {
    ...(details['row'] as Record<string, unknown>),
    diagnosis: details['diagnosis'],
    events: details['events'],
  };
}

export async function waitFiscal(
  owner: Session,
  saleNumber: string,
  status: string | RegExp,
  timeout = 90_000,
) {
  let last: Record<string, unknown> = {};
  await expect
    .poll(
      async () => {
        last = await fiscalOf(owner, saleNumber);
        return `${String(last['status'])} ${String(last['last_error'] ?? '')}`;
      },
      { timeout, intervals: [1000, 2000, 3000] },
    )
    .toMatch(status);
  return last;
}

export const saleOf = async (s: Session, id: string) => ok(await api(s, 'GET', `/api/sales/${id}`));

export const lastSaleId = async (page: Page) => {
  const href = await page.getByRole('link', { name: 'View the sale' }).getAttribute('href');
  return String(href?.split('/').pop());
};

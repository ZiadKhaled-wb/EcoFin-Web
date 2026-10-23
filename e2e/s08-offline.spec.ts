import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  BRANCH_A,
  ORG_A,
  PASSWORD,
  STAMP,
  USERS,
  api,
  closeOpenShift,
  errorCode,
  fakeEta,
  ok,
  openShiftByApi,
  pairByApi,
  waitFiscal,
  type Session,
} from './helpers/int4';

/**
 * S08 (EC-75, §6.4): offline cash sales in the browser, against the production build (`vite build
 * && vite preview`: service worker, CSP) with the API, its job worker and the fake ETA running
 * (`npm run fake-eta` in EcoFin-API), on the dev seed's shop int4-shop-a. Skipped unless RUN_E2E=1.
 *
 * Headless Chromium never grants `navigator.storage.persist()` (Chrome grants it from site
 * engagement or an installed app, which automation can't earn), so the cashier's browser reports
 * it as granted; W7 covers a denied one.
 */

const PIN = '2468';
const ETA_POS = { eta_serial: 'S08-POS-1', preshared_key: 's08-fake-psk-1' };
const locale = (lang: 'ar' | 'en') =>
  JSON.parse(readFileSync(resolve(`src/i18n/locales/${lang}/offline.json`), 'utf8')) as {
    banner: Record<string, string>;
    pos: { refusals: Record<string, string> };
    lock: Record<string, string>;
    review: Record<string, string>;
    settings: Record<string, string>;
  };
const EN = locale('en');
const AR = locale('ar');

interface OutboxRow {
  kind: string;
  number: string;
  content: string;
  signature: string;
  uuid: string | null;
}

let sessions = Math.floor(Math.random() * 200);

/** What the pages logged that E5 refuses: missing translations and CSP violations. */
const problems: string[] = [];

async function openPage(context: BrowserContext) {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (/missingKey|missing key|Content Security Policy|CSP violation/i.test(m.text())) {
      problems.push(m.text());
    }
  });
  return page;
}

async function newSession(
  browser: Browser,
  email: string,
  lang: 'ar' | 'en',
  cashier = false,
): Promise<Session> {
  // Each session its own client address, as INT-4 does: logins are rate limited per address.
  const context = await browser.newContext({
    serviceWorkers: 'allow',
    extraHTTPHeaders: { 'X-Forwarded-For': `198.51.102.${(sessions++ % 250) + 1}` },
  });
  await context.addInitScript((l) => window.localStorage.setItem('ecofin-lang', l), lang);
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  if (cashier) {
    await context.addInitScript(() => {
      // See the note at the top: the browser's persistence heuristic, not the app, is replaced.
      const storage = navigator.storage;
      storage.persist = () => Promise.resolve(true);
      storage.persisted = () => Promise.resolve(true);
      // Printing is the OS dialog; the receipt itself is checked in the preview.
      window.print = () => undefined;
    });
  }
  const page = await openPage(context);
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/(dashboard|select-shop)/);
  return { context, page, orgId: ORG_A };
}

/** The outbox of the shop's offline database, read in the page. */
const outbox = (page: Page) =>
  page.evaluate(async (org) => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open(`ecofin-offline-${org}`);
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const rows = await new Promise<unknown[]>((done, fail) => {
      const all = db.transaction('outbox').objectStore('outbox').getAll();
      all.onsuccess = () => done(all.result);
      all.onerror = () => fail(all.error);
    });
    db.close();
    return rows;
  }, ORG_A) as Promise<OutboxRow[]>;

const offlineRows = async (page: Page) => (await outbox(page)).filter((r) => r.kind === 'offline');

/**
 * A run that stopped half way leaves offline sales waiting for a decision (and its shift can't
 * close): they are decided as a manager would, a new unit for a lost serial, or accepted.
 */
async function settleEarlierRuns(owner: Session) {
  const waiting = ok(await api(owner, 'GET', '/api/offline/sales?status=conflict')) as unknown as {
    id: string;
    device_name: string | null;
  }[];
  for (const sale of waiting.filter((x) => x.device_name?.startsWith('S08 POS'))) {
    const detail = ok(await api(owner, 'GET', `/api/offline/sales/${sale.id}`)) as unknown as {
      branch_id: string;
      actions: string[];
      lines: { line_no: number; product_id: string; unit_id: string | null }[];
    };
    if (detail.actions.includes('accept')) {
      ok(
        await api(owner, 'POST', `/api/offline/sales/${sale.id}/resolve`, {
          action: 'accept',
          reason: 'S08 new run',
        }),
      );
    } else if (detail.actions.includes('use_serial')) {
      const unitIds: Record<string, string> = {};
      for (const line of detail.lines.filter((l) => l.unit_id)) {
        const serial = `S08-SN-${STAMP}-R${line.line_no}`;
        ok(
          await api(
            owner,
            'POST',
            '/api/units',
            {
              product_id: line.product_id,
              branch_id: detail.branch_id,
              cost: '1.00',
              serials: [serial],
            },
            `s08-settle-${STAMP}-${sale.id}-${line.line_no}`,
          ),
          201,
        );
        unitIds[String(line.line_no)] = String(
          ok(await api(owner, 'GET', `/api/units/find?serial=${serial}`))['id'],
        );
      }
      ok(
        await api(owner, 'POST', `/api/offline/sales/${sale.id}/resolve`, {
          action: 'use_serial',
          reason: 'S08 new run',
          unit_ids: unitIds,
        }),
      );
    }
  }
  await expect
    .poll(
      async () =>
        (
          ok(await api(owner, 'GET', '/api/offline/sales')) as unknown as {
            device_name: string | null;
            status: string;
          }[]
        ).filter(
          (x) =>
            x.device_name?.startsWith('S08 POS') &&
            (x.status === 'received' || x.status === 'conflict'),
        ).length,
      { timeout: 90_000 },
    )
    .toBe(0);
}

test.describe('S08 offline cash sales', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  let owner: Session;
  let manager: Session;
  let cashier: Session;
  let deviceId = '';
  let chairId = '';
  let phoneId = '';
  const serials = [`S08-SN-${STAMP}-1`, `S08-SN-${STAMP}-2`];
  const unitIds: string[] = [];
  let chairSale: OutboxRow | undefined;
  let phoneNumber = '';

  test.beforeAll(async ({ browser }) => {
    owner = await newSession(browser, USERS.ownerA, 'en');
    manager = await newSession(browser, USERS.managerA, 'en');
    cashier = await newSession(browser, USERS.cashierA2, 'en', true);
  });
  test.afterAll(async () => {
    for (const s of [owner, manager, cashier]) await s?.context.close();
  });

  test('E1.1 pair, open a shift, get a lease and set the PIN', async () => {
    ok(
      await api(owner, 'PUT', '/api/offline/settings', {
        offline_enabled: true,
        offline_max_sale_total: '3000.00',
        offline_max_hours: 12,
        offline_max_sales: 100,
        offline_max_lease_total: '200000.00',
      }),
    );
    await settleEarlierRuns(owner);
    // A shift the cashier still has open (an earlier S08 run, or INT-4's second device) is closed
    // by the owner, as for a lost POS (EC-147): the cashier opens this run's shift on the S08 device.
    const current = ok(await api(cashier, 'GET', '/api/shifts/current'))['shift'] as {
      id: string;
      expected_cash: string;
    } | null;
    if (current) {
      ok(
        await api(owner, 'POST', `/api/shifts/${current.id}/force-close`, {
          counted_cash: current.expected_cash,
          reason: 'S08 new run',
        }),
      );
    }
    const devices = ok(await api(owner, 'GET', '/api/devices')) as unknown as {
      id: string;
      eta_serial: string | null;
      is_active: boolean;
    }[];
    // One device for every run: its ETA serial stays taken once registered.
    const earlier = devices.find((x) => x.eta_serial === ETA_POS.eta_serial);
    if (earlier) {
      deviceId = earlier.id;
      if (!earlier.is_active) {
        ok(
          await api(owner, 'POST', `/api/devices/${deviceId}/active`, {
            active: true,
            reason: 'S08 new run',
          }),
        );
      }
    } else {
      deviceId = String(
        ok(await api(owner, 'POST', '/api/devices', { name: 'S08 POS', branch_id: BRANCH_A }), 201)[
          'id'
        ],
      );
      ok(
        await api(owner, 'PUT', `/api/devices/${deviceId}/eta`, {
          ...ETA_POS,
          eta_os_version: 'windows 11',
          eta_model_framework: '1',
          eta_status: 'active',
        }),
      );
    }
    // Products of this run with stock in branch A, made before the lease takes its snapshot.
    chairId = String(
      ok(
        await api(owner, 'POST', '/api/products', {
          name_ar: `كرسي S08 ${STAMP}`,
          name_en: `S08 Chair ${STAMP}`,
          sku: `S08-CHAIR-${STAMP}`,
          cash_price: '1000.00',
          eta_item_code: 'EG-674859545-1001',
          eta_item_type: 'EGS',
        }),
        201,
      )['id'],
    );
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        { branch_id: BRANCH_A, reason: 'found', lines: [{ product_id: chairId, quantity: 10 }] },
        `s08-chair-${STAMP}`,
      ),
      201,
    );
    phoneId = String(
      ok(
        await api(owner, 'POST', '/api/products', {
          name_ar: `هاتف S08 ${STAMP}`,
          name_en: `S08 Phone ${STAMP}`,
          sku: `S08-PHONE-${STAMP}`,
          cash_price: '2000.00',
          is_serialized: true,
          eta_item_code: 'EG-674859545-1002',
          eta_item_type: 'EGS',
        }),
        201,
      )['id'],
    );
    ok(
      await api(
        owner,
        'POST',
        '/api/units',
        { product_id: phoneId, branch_id: BRANCH_A, cost: '1500.00', serials },
        `s08-units-${STAMP}`,
      ),
      201,
    );
    for (const serial of serials) {
      unitIds.push(String(ok(await api(owner, 'GET', `/api/units/find?serial=${serial}`))['id']));
    }

    await pairByApi(owner, cashier, deviceId);
    await openShiftByApi(cashier, BRANCH_A, deviceId);
    const page = cashier.page;
    await page.goto('/sales/pos');
    // The lease of this shift arrives; the cashier sets the PIN that opens the POS offline.
    const setPin = page.getByTestId('offline-set-pin');
    await expect(setPin).toBeVisible({ timeout: 30_000 });
    await setPin.getByLabel(EN.lock['pin']!, { exact: true }).fill(PIN);
    await setPin.getByLabel(EN.lock['confirm']!).fill(PIN);
    await setPin.getByRole('button', { name: EN.lock['set'] }).click();
    await expect(setPin).toBeHidden();
    // The app shell is cached before the network goes.
    expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active))).toBe(
      true,
    );
  });

  test('E1.2 offline, a cash sale prints the offline number and the QR', async () => {
    const page = cashier.page;
    await cashier.context.setOffline(true);
    await expect(page.getByTestId('offline-pos')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('offline-banner')).toContainText(EN.banner['offline']!);
    await expect(page.getByTestId('offline-banner')).toContainText(/Offline time left: \d+:\d\d/);
    await page.getByTestId('offline-search').fill(`S08-CHAIR-${STAMP}`);
    await page.getByTestId('offline-product').getByRole('button').click();
    await expect(page.getByTestId('offline-total')).toContainText('1,000.00');
    await page.getByTestId('offline-tendered').fill('1200');
    await page.getByTestId('offline-pay').click();
    const done = page.getByTestId('offline-done');
    await expect(done).toContainText(/OFF-D\d+-\d{6}/);
    await expect(done).toContainText('200.00');
    [chairSale] = await offlineRows(page);
    expect(chairSale?.uuid).toMatch(/^[0-9a-f]{64}$/);
    await page.getByTestId('offline-print').click();
    const receipt = page.getByTestId('offline-receipt');
    await expect(receipt).toContainText(chairSale!.number);
    await expect(receipt.locator('[data-part="eta-uuid"]')).toContainText(chairSale!.uuid!);
    await expect(receipt.locator('.r-qr')).toBeVisible();
    await page.getByTestId('offline-print-now').click();
  });

  test('E1.3 closed and reopened offline: from cache, asks the PIN, the outbox holds 1', async () => {
    await cashier.page.close();
    // E5: the reopened POS is in Arabic, right to left.
    await cashier.context.addInitScript(() => window.localStorage.setItem('ecofin-lang', 'ar'));
    const page = await openPage(cashier.context);
    cashier.page = page;
    await page.goto('/sales/pos');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const lock = page.getByTestId('offline-lock');
    await expect(lock).toBeVisible({ timeout: 20_000 });
    await expect(lock).toContainText(AR.lock['title']!);
    await expect(page.getByTestId('offline-unsynced')).toContainText('1');
    expect(await offlineRows(page)).toHaveLength(1);
    await lock.locator('input[type=password]').fill(PIN);
    await lock.locator('button[type=submit]').click();
    await expect(page.getByTestId('offline-pos')).toBeVisible();
  });

  test('E2 an offline sale over the max sale is blocked with the message', async () => {
    const page = cashier.page;
    await page.getByTestId('offline-search').fill(`S08-CHAIR-${STAMP}`);
    const add = page.getByTestId('offline-product').getByRole('button');
    for (let i = 0; i < 4; i += 1) await add.click();
    await expect(page.getByTestId('offline-total')).toContainText('4,000.00');
    await page.getByTestId('offline-pay').click();
    await expect(page.getByText(AR.pos.refusals['MAX_SALE']!)).toBeVisible();
    expect(await offlineRows(page)).toHaveLength(1);
    await page.getByTestId('offline-cart').getByRole('button').first().click();
  });

  test('E4.1 a serial sold offline that the shop writes off meanwhile', async () => {
    const page = cashier.page;
    await page.getByTestId('offline-search').fill(`S08-PHONE-${STAMP}`);
    await page
      .getByTestId('offline-product')
      .getByRole('combobox')
      .selectOption({ label: serials[0]! });
    await page.getByTestId('offline-pay').click();
    await expect(page.getByTestId('offline-done')).toBeVisible();
    phoneNumber = (await offlineRows(page))[1]!.number;
    // While the POS is offline, the unit is written off online: it can't be sold any more.
    ok(
      await api(
        owner,
        'POST',
        '/api/stock/adjustments',
        {
          branch_id: BRANCH_A,
          reason: 'damage',
          lines: [{ product_id: phoneId, unit_id: unitIds[0], quantity: -1 }],
        },
        `s08-damage-${STAMP}`,
      ),
      201,
    );
  });

  test('E1.4 + E3 back online: synced; the banner clears only when the outbox is empty', async () => {
    const page = cashier.page;
    await cashier.context.setOffline(false);
    // Still in offline mode while sales wait to sync.
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect.poll(async () => (await outbox(page)).length, { timeout: 90_000 }).toBe(0);
    await expect(page.getByTestId('offline-banner')).toBeHidden({ timeout: 60_000 });
    await expect(page.getByRole('searchbox')).toBeVisible();
  });

  test('E1.5 the sync replayed twice: one sale, one stock movement, one accepted receipt', async ({
    request,
  }) => {
    const items = [{ content: chairSale!.content, signature: chairSale!.signature }];
    const replays = await Promise.all([
      api(cashier, 'POST', '/api/offline/sync', { items }),
      api(cashier, 'POST', '/api/offline/sync', { items }),
    ]);
    for (const r of replays) {
      expect((ok(r)['results'] as { result: string }[])[0]!.result).toBe('duplicate');
    }
    const number = chairSale!.number;
    const listed = async () =>
      ok(await api(owner, 'GET', '/api/offline/sales')) as unknown as {
        number: string;
        status: string;
        sale_id: string | null;
      }[];
    await expect
      .poll(async () => (await listed()).filter((s) => s.number === number).map((s) => s.status), {
        timeout: 90_000,
      })
      .toEqual(['posted']);
    const saleId = (await listed()).find((s) => s.number === number)!.sale_id!;
    expect(ok(await api(owner, 'GET', `/api/sales/${saleId}`))['number']).toBe(number);
    const moves = ok(
      await api(owner, 'GET', `/api/stock/movements?product_id=${chairId}&types=sale_out`),
    )['items'] as unknown[];
    expect(moves).toHaveLength(1);
    await waitFiscal(owner, number, /^accepted/);
    const state = (await fakeEta(request, '/admin/state'))!;
    expect((state['received'] as Record<string, number>)[chairSale!.uuid!]).toBe(1);
  });

  test('E3 the next sale is online and prints the server receipt', async () => {
    const page = cashier.page;
    const search = page.getByRole('searchbox');
    await search.fill(`S08-CHAIR-${STAMP}`);
    await search.press('Enter');
    await page.getByTestId('sale-total').waitFor();
    // The reopened POS is in Arabic (E1.3): "Confirm and pay", then "Pay".
    await page.getByRole('button', { name: 'تأكيد ودفع', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'دفع', exact: true }).click();
    const heading = page.getByRole('heading', { name: /^تم البيع / });
    await expect(heading).toBeVisible();
    await expect(heading).not.toContainText('OFF-');
    expect(await outbox(page)).toHaveLength(0);
  });

  test('E4.2 a manager resolves SERIAL_UNAVAILABLE with use_serial; then the shift closes', async () => {
    const conflicts = async () =>
      ok(await api(manager, 'GET', '/api/offline/sales?status=conflict')) as unknown as {
        number: string;
        conflict_code: string;
      }[];
    await expect
      .poll(async () => (await conflicts()).find((s) => s.number === phoneNumber)?.conflict_code, {
        timeout: 90_000,
      })
      .toBe('SERIAL_UNAVAILABLE');
    // The shift can't close while the sale waits for a decision.
    const current = ok(await api(cashier, 'GET', '/api/shifts/current'));
    const shiftId = (current['shift'] as { id: string }).id;
    const early = await api(cashier, 'POST', `/api/shifts/${shiftId}/close`, {
      counts: {},
      difference_reason: 'S08 close',
    });
    expect(errorCode(early)).toBe('OFFLINE_SALES_OPEN');

    const page = manager.page;
    await page.goto('/sales/offline');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const row = page.getByTestId('offline-sales').locator('li', { hasText: phoneNumber });
    await row.getByRole('button', { name: EN.review['open'] }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('offline-sale-code')).toContainText('Serial not available');
    await dialog.getByTestId('offline-unit-1').fill(unitIds[1]!);
    await dialog.getByTestId('offline-resolve').click();
    await expect(dialog.getByText('Write a reason.')).toBeVisible();
    await dialog.getByTestId('offline-reason').fill('Unit 1 was damaged; unit 2 went out');
    await dialog.getByTestId('offline-resolve').click();
    await expect(dialog).toBeHidden();
    const all = async () =>
      ok(await api(manager, 'GET', '/api/offline/sales')) as unknown as {
        number: string;
        status: string;
      }[];
    await expect
      .poll(async () => (await all()).find((s) => s.number === phoneNumber)?.status, {
        timeout: 90_000,
      })
      .toBe('posted');
    await closeOpenShift(cashier);
    expect(ok(await api(cashier, 'GET', '/api/shifts/current'))['shift']).toBeNull();
  });

  test('E5 AR and EN: review page and settings; no missing keys, no CSP violations', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const text = lang === 'ar' ? AR : EN;
      const dir = lang === 'ar' ? 'rtl' : 'ltr';
      // A later init script wins over the session's first one.
      for (const s of [owner, manager]) {
        await s.context.addInitScript((l) => window.localStorage.setItem('ecofin-lang', l), lang);
      }
      await manager.page.goto('/sales/offline');
      await expect(manager.page.locator('html')).toHaveAttribute('dir', dir);
      await expect(
        manager.page.getByRole('heading', { name: text.review['title'], exact: true }),
      ).toBeVisible();
      await owner.page.goto('/settings/offline');
      await expect(owner.page.locator('html')).toHaveAttribute('dir', dir);
      await expect(owner.page.getByTestId('offline-settings')).toBeVisible();
      await expect(
        owner.page.getByRole('heading', { name: text.settings['title'], exact: true }),
      ).toBeVisible();
    }
    expect(problems).toEqual([]);
  });
});

import {
  USERS,
  ORG_A,
  ORG_B,
  BRANCH_A,
  BRANCH_B,
  BARCODE_CHAIR,
  ETA_POS,
  STAMP,
  type Session,
  session,
  api,
  ok,
  errorCode,
  fakeEta,
  pairByApi,
  newDevice,
  registerEta,
  closeOpenShift,
  openShiftByApi,
  sellByApi,
  fiscalOf,
  waitFiscal,
  saleOf,
  lastSaleId,
} from './helpers/int4';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * INT-4 (EC-133): Sprint 4's cash sale end to end, server and client together, against the fake
 * ETA (`npm run fake-eta` in EcoFin-API, restarted for each run: its POS chain is in memory).
 * Checks a to o of docs/testing/int-4/REPORT.md in the API repo, one test each, in order; the ids a
 * check needs from an earlier one are kept in test-results/int-4/run.json (ids only, no tokens), so
 * a failed check doesn't stop the next ones. Database checks: EcoFin-API/scripts/int4-verify.mjs.
 * Needs the API (with its job worker), local Supabase with the dev seed (shops int4-shop-a and
 * int4-shop-b), the fake ETA and the dev server; skipped unless RUN_E2E=1.
 *   E2E_API_DIR       the EcoFin-API folder (default ../EcoFin-API)
 *   FAKE_ETA_ADMIN_URL the fake ETA's controls (default http://127.0.0.1:4011)
 */

const API_DIR = resolve(process.env.E2E_API_DIR ?? '../EcoFin-API');

const OUT = resolve('test-results/int-4');
const RUN_FILE = resolve(OUT, 'run.json');

/** Ids made by earlier checks (never a token or a code). */
interface Run {
  stamp?: number;
  deviceA1?: string;
  deviceA2?: string;
  deviceB?: string;
  products?: Record<string, string>;
  serials?: string[];
  splitSaleId?: string;
  splitSaleNumber?: string;
  cashPart?: string;
  transferPart?: string;
  approvalSaleId?: string;
  shiftSaleIds?: string[];
  rejectedSaleId?: string;
  rejectedOldUuid?: string;
  blockedSaleId?: string;
  voidSaleId?: string;
  claimId?: string;
  lastProductId?: string;
  branchA?: string;
  daySummary?: unknown;
}
const loadRun = (): Run =>
  existsSync(RUN_FILE) ? (JSON.parse(readFileSync(RUN_FILE, 'utf8')) as Run) : {};
const saveRun = (patch: Partial<Run>) =>
  writeFileSync(RUN_FILE, JSON.stringify({ ...loadRun(), ...patch }, null, 2));
const shot = (page: Page, name: string) =>
  page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });

/** A call to the API as the user signed in on that page, from that computer (its device token). */

/** The cashier's computer becomes `deviceId` (a fresh pairing code from the owner). */

/** Waits until the job worker (5 s ticks) has taken the receipt to `status`. */

test.describe('INT-4 cash sale end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(180_000);

  let owner: Session;
  let cashier: Session;
  const run = () => loadRun();

  test.beforeAll(async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    if (!existsSync(RUN_FILE) || loadRun().stamp === undefined)
      saveRun({ stamp: STAMP, branchA: BRANCH_A });
    owner = await session(browser, USERS.ownerA, ORG_A);
    cashier = await session(browser, USERS.cashierA1, ORG_A);
    // A later check in a new worker: this computer is device A1 again.
    const device = loadRun().deviceA1;
    if (device) await pairByApi(owner, cashier, device).catch(() => undefined);
  });
  test.afterAll(async () => {
    await cashier?.context.close();
    await owner?.context.close();
  });

  test('a: owner creates a device, the cashier pairs and opens a shift with a float', async () => {
    writeFileSync(RUN_FILE, JSON.stringify({ stamp: STAMP, branchA: BRANCH_A }, null, 2));
    // Earlier runs: the cashier has no open shift; INT-4's earlier devices are turned off.
    await closeOpenShift(cashier);
    const devices = ok(await api(owner, 'GET', '/api/devices')) as unknown as {
      id: string;
      name: string;
      is_active: boolean;
    }[];
    for (const d of devices.filter((x) => x.is_active && x.name.startsWith('INT4 '))) {
      // Hygiene only: a device whose shift is still open (DEVICE_HAS_OPEN_SHIFT) stays on.
      await api(owner, 'POST', `/api/devices/${d.id}/active`, {
        active: false,
        reason: 'INT-4 new run',
      });
    }
    // Fresh serials for this run (the seed's are sold by an earlier run).
    const products = Object.fromEntries(
      (
        (ok(await api(owner, 'GET', '/api/products?search=INT4&pageSize=50'))['items'] ?? []) as {
          id: string;
          sku: string;
        }[]
      ).map((p) => [p.sku, p.id]),
    );
    const serials = [1, 2].map((n) => `INT4-SN-${STAMP}-${n}`);
    ok(
      await api(
        owner,
        'POST',
        '/api/units',
        {
          product_id: products['INT4-PHONE'],
          branch_id: BRANCH_A,
          cost: '3000.00',
          serials,
        },
        `int4-units-${STAMP}`,
      ),
      201,
    );
    saveRun({ products, serials });

    const name = `INT4 Till ${STAMP}`;
    await owner.page.goto('/settings/devices');
    await owner.page.getByRole('button', { name: 'Add device' }).click();
    const add = owner.page.getByRole('dialog', { name: 'New POS device' });
    await add.getByLabel('Device name').fill(name);
    await add.getByLabel('Branch').selectOption(BRANCH_A);
    await add.getByRole('button', { name: 'Add device' }).click();
    await expect(add).toBeHidden();
    const row = owner.page.locator('tr', { hasText: name });
    await row.getByRole('button', { name: 'Pair', exact: true }).click();
    const codeDialog = owner.page.getByRole('dialog', { name: `Pair ${name}` });
    const code = (await codeDialog.getByTestId('pairing-code').innerText()).trim();
    await shot(owner.page, 'a-owner-pairing-code');

    await cashier.page.goto('/device/pair');
    await cashier.page.getByLabel('Pairing code').fill(code);
    await cashier.page.getByRole('button', { name: 'Pair this computer' }).click();
    await expect(cashier.page.getByTestId('topbar-device')).toHaveText(name);
    await codeDialog.getByRole('button', { name: 'Done' }).click();
    const listed = ok(await api(owner, 'GET', '/api/devices')) as unknown as {
      id: string;
      name: string;
    }[];
    const deviceA1 = listed.find((d) => d.name === name)!.id;
    await registerEta(owner, deviceA1, ETA_POS[0]);
    saveRun({ deviceA1 });

    await cashier.page.goto('/accounting/shifts');
    await cashier.page.getByLabel('Opening float').fill('500');
    await cashier.page.getByLabel('Safe').selectOption({ index: 1 });
    await cashier.page.getByRole('button', { name: 'Open shift' }).click();
    await expect(cashier.page.getByTestId('shift-expected')).toBeVisible();
    await shot(cashier.page, 'a-cashier-shift-open');
    const current = ok(await api(cashier, 'GET', '/api/shifts/current'));
    expect(current['shift']).toMatchObject({ device_id: deviceA1, opening_float: '500.00' });
  });

  test('b+d+e: scan, serial, 5% discount; split cash + transfer; double-click Pay sells once', async () => {
    const { serials } = run();
    const page = cashier.page;
    await page.goto('/sales/pos');
    const search = page.getByRole('searchbox', { name: 'Find a product by name, SKU or barcode' });
    await search.fill(BARCODE_CHAIR);
    await search.press('Enter');
    await expect(page.getByLabel('Quantity: INT4 Chair')).toBeVisible();
    await search.fill('INT4-PHONE');
    await search.press('Enter');
    const serialDialog = page.getByRole('dialog', { name: 'Serials of INT4 Phone' });
    await serialDialog.getByText(serials![0]!).click();
    await serialDialog.getByRole('button', { name: 'Add to the cart' }).click();
    await expect(page.getByText(serials![0]!)).toBeVisible();
    await page.getByRole('button', { name: 'Add a discount: INT4 Chair' }).click();
    await page.getByLabel('Discount: INT4 Chair').fill('5');
    await page.getByLabel('Discount reason').fill('INT-4 loyal customer');
    await expect(page.getByTestId('sale-total')).toContainText('5,950.00');
    await shot(page, 'b-pos-cart');

    await page.getByRole('button', { name: 'Confirm and pay' }).click();
    const pay = page.getByRole('dialog', { name: 'Payment' });
    await pay.getByLabel('Amount: Cash').fill('950.00');
    await pay.getByLabel('Received from the customer').fill('1000');
    await pay.getByRole('button', { name: 'Add bank transfer' }).click();
    await expect(pay.getByLabel('Amount: Bank transfer')).toHaveValue('5000.00');
    await pay.getByLabel('Bank account').selectOption({ label: 'INT4 Bank' });
    await pay.getByLabel('Transfer reference').fill(`TRX-INT4-${STAMP}`);
    await expect(pay.getByTestId('pay-change')).toContainText('50.00');
    await shot(page, 'd-payment-split');
    await pay.getByRole('button', { name: 'Pay' }).dblclick();
    await expect(page.getByRole('heading', { name: /Sale .+ completed/ })).toBeVisible();
    await expect(page.getByTestId('sale-change')).toContainText('50.00');
    await shot(page, 'd-sale-completed');
    const id = await lastSaleId(page);
    const sale = await saleOf(cashier, id);
    expect(sale['total']).toBe('5950.00');
    saveRun({
      splitSaleId: id,
      splitSaleNumber: String(sale['number']),
      cashPart: '950.00',
      transferPart: '5000.00',
      shiftSaleIds: [id],
    });
  });

  test('c: 8% needs a manager; approved, the sale carries it; the approval is single use', async ({
    browser,
  }) => {
    const page = cashier.page;
    await page.goto('/sales/pos');
    await page
      .getByRole('button', { name: 'New sale' })
      .click({ timeout: 2000 })
      .catch(() => undefined);
    const search = page.getByRole('searchbox', { name: 'Find a product by name, SKU or barcode' });
    await search.fill(BARCODE_CHAIR);
    await search.press('Enter');
    await page.getByRole('button', { name: 'Add a discount: INT4 Chair' }).click();
    await page.getByLabel('Discount: INT4 Chair').fill('8');
    await page.getByLabel('Discount reason').fill('INT-4 agreed 8%');
    await page.getByRole('button', { name: 'Confirm and pay' }).click();
    await page
      .getByRole('dialog', { name: 'Payment' })
      .getByRole('button', { name: 'Pay' })
      .click();
    const panel = page.getByRole('region', { name: 'Discount above your limit' });
    await panel.getByRole('button', { name: 'Ask a manager' }).click();
    await expect(panel.getByText('Waiting for a manager…')).toBeVisible();
    await shot(page, 'c-cashier-waiting');

    const manager = await session(browser, USERS.managerA, ORG_A);
    try {
      await manager.page.goto('/sales/approvals');
      await expect(manager.page.getByText('Requested by Cashier A1')).toBeVisible();
      await shot(manager.page, 'c-manager-approvals');
      await manager.page.getByRole('button', { name: 'Approve' }).first().click();
      const dialog = manager.page.getByRole('dialog', { name: 'Approve this discount?' });
      await dialog.getByRole('button', { name: 'Approve' }).click();
      await expect(dialog).toBeHidden();
    } finally {
      await manager.context.close();
    }

    await expect(panel.getByText(/Approved by Manager A/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Confirm and pay' }).click();
    await page
      .getByRole('dialog', { name: 'Payment' })
      .getByRole('button', { name: 'Pay' })
      .click();
    await expect(page.getByRole('heading', { name: /Sale .+ completed/ })).toBeVisible();
    await shot(page, 'c-sale-with-approval');
    const id = await lastSaleId(page);
    saveRun({ approvalSaleId: id, shiftSaleIds: [...(run().shiftSaleIds ?? []), id] });

    // The same approval again, on a new cart: refused.
    const approvals = ok(await api(owner, 'GET', '/api/approvals?status=approved'));
    const used = ((approvals['items'] ?? []) as { id: string; used: boolean }[]).find(
      (a) => a.used,
    );
    expect(used, JSON.stringify(approvals)).toBeTruthy();
    const again = await api(
      cashier,
      'POST',
      '/api/sales',
      {
        lines: [
          {
            product_id: run().products!['INT4-CHAIR'],
            quantity: 1,
            discount: { type: 'percent', value: '8' },
          },
        ],
        expected_total: '920.00',
        discount_reason: 'INT-4 reuse',
        discount_approval_id: used!.id,
      },
      `int4-reuse-${STAMP}`,
    );
    expect(again.status, JSON.stringify(again.body)).toBeGreaterThanOrEqual(400);
    expect(errorCode(again)).toBe('APPROVAL_INVALID');
  });

  test('f: both receipts of the shift accepted, chained, sent once', async () => {
    const r = run();
    for (const id of r.shiftSaleIds ?? []) {
      const sale = await saleOf(owner, id);
      await waitFiscal(owner, String(sale['number']), 'accepted');
    }
    expect(r.shiftSaleIds).toHaveLength(2);
  });

  test('g: the receipt prints in Arabic with totals, payments, serial, warranty and the QR', async ({
    browser,
  }) => {
    const r = run();
    const ar = await session(browser, USERS.cashierA1, ORG_A, 'ar');
    try {
      await ar.page.goto(`/sales/${r.splitSaleId}`);
      await ar.page.getByRole('button', { name: 'طباعة الإيصال' }).click();
      const preview = ar.page.getByLabel('معاينة الإيصال');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText('5,950.00');
      await expect(preview).toContainText('950.00');
      await expect(preview).toContainText('5,000.00');
      await expect(preview).toContainText('50.00');
      await expect(preview).toContainText(r.serials![0]!);
      const fiscal = await fiscalOf(owner, r.splitSaleNumber!);
      const uuid = String(fiscal['eta_uuid']);
      await expect(preview.locator('[data-part="eta-uuid"]')).toHaveText(uuid);
      await expect(
        preview
          .getByRole('img', { name: 'QR' })
          .or(preview.locator('.r-qr svg, .r-qr canvas, .r-qr img')),
      ).toBeVisible();
      expect(JSON.stringify(fiscal)).toContain(uuid);
      // The first print is the original (no mark); a reprint is a copy (the mark is on the print
      // root, the part that goes to paper). The browser's print window is stubbed.
      // The stub records, at the moment of printing, whether the paper carries the COPY mark.
      await expect(ar.page.locator('[data-receipt-print]')).toBeAttached();
      await shot(ar.page, 'g-receipt-ar');
      await ar.page.evaluate(() => {
        const marks: boolean[] = [];
        Object.assign(window, { int4Marks: marks });
        window.print = () => {
          marks.push(!!document.querySelector('[data-receipt-print] [data-mark="copy"]'));
        };
      });
      const printOnce = async () => {
        const logged = ar.page.waitForResponse((res) => res.url().includes('/receipt-prints'));
        await ar.page
          .getByRole('dialog')
          .getByRole('button', { name: 'طباعة', exact: true })
          .click();
        const res = await logged;
        expect(res.status()).toBeLessThan(300);
        if (await ar.page.getByRole('dialog').isVisible()) await ar.page.keyboard.press('Escape');
        await expect(ar.page.getByRole('dialog')).toBeHidden();
        return (await res.json()) as { print_no: number; copy: boolean };
      };
      const first = await printOnce();
      await ar.page.getByRole('button', { name: 'طباعة الإيصال' }).click();
      await shot(ar.page, 'g-receipt-ar-reprint');
      const second = await printOnce();
      const marks = await ar.page.evaluate(
        () => (window as unknown as { int4Marks: boolean[] }).int4Marks,
      );
      writeFileSync(resolve(OUT, 'g-prints.json'), JSON.stringify({ first, second, marks }));
      expect(first.copy).toBe(false);
      expect(second).toMatchObject({ print_no: first.print_no + 1, copy: true });
      expect(marks).toEqual([false, true]);
    } finally {
      await ar.context.close();
    }
  });

  test('h: rejected on itemCode -> reason shown -> code fixed -> corrected and accepted', async ({
    request,
  }) => {
    const r = run();
    await fakeEta(request, '/admin/invalid-next', {
      code: 'CV307',
      propertyPath: 'itemData[0].itemCode',
      message: 'the item code is not registered',
    });
    const sale = ok(
      await sellByApi(cashier, r.products!['INT4-CHAIR']!, '1000.00', `int4-h-${STAMP}`),
      201,
    );
    const rejected = await waitFiscal(owner, String(sale['number']), 'rejected');
    const oldUuid = JSON.stringify(rejected).match(/"eta_uuid":"([^"]+)"/)?.[1] ?? '';
    expect(oldUuid).not.toBe('');
    saveRun({ rejectedSaleId: String(sale['id']), rejectedOldUuid: oldUuid });

    const page = owner.page;
    const drawer = page.getByRole('dialog', { name: `Receipt ${String(sale['number'])}` });
    await page.goto('/tax/eta-receipts');
    await page.getByRole('button', { name: `Receipt ${String(sale['number'])}` }).click();
    await expect(drawer).toContainText('the item code is not registered');
    await expect(drawer).toContainText('itemData[0].itemCode');
    await shot(page, 'h-monitor-rejected');
    ok(
      await api(owner, 'PATCH', `/api/products/${r.products!['INT4-CHAIR']}`, {
        eta_item_code: 'EG-674859545-1101',
        eta_item_type: 'EGS',
      }),
    );
    // The diagnosis is computed live: open the receipt again after the fix.
    await page.reload();
    await page.getByRole('button', { name: `Receipt ${String(sale['number'])}` }).click();
    await drawer.getByRole('button', { name: 'Correct and resend' }).click();
    await expect(page.getByText(/Correction queued/).first()).toBeVisible();
    await waitFiscal(owner, String(sale['number']), 'accepted');
    await page.reload();
    await shot(page, 'h-monitor-corrected');
    const state = (await fakeEta(request, '/admin/state'))!;
    const corrected = (state['receipts'] as { referenceOldUuid: string; status: string }[]).find(
      (x) => x.referenceOldUuid === oldUuid,
    );
    expect(corrected?.status).toBe('Valid');
  });

  test('i: no ETA code -> blocked ITEM_CODE naming the product -> code set -> retry -> accepted', async () => {
    const r = run();
    let lamp = r.products!['INT4-LAMP']!;
    const product = ok(await api(owner, 'GET', `/api/products/${lamp}`));
    if (product['eta_item_code']) {
      // An earlier run gave the seed's lamp a code: a new one without.
      lamp = String(
        ok(
          await api(owner, 'POST', '/api/products', {
            name_ar: `مصباح ${STAMP}`,
            name_en: 'INT4 Lamp',
            sku: `INT4-LAMP-${STAMP}`,
            cash_price: '200.00',
          }),
          201,
        )['id'],
      );
      ok(
        await api(
          owner,
          'POST',
          '/api/stock/adjustments',
          {
            branch_id: BRANCH_A,
            reason: 'found',
            lines: [{ product_id: lamp, quantity: 2 }],
          },
          `int4-lamp-${STAMP}`,
        ),
        201,
      );
    }
    const sale = ok(await sellByApi(cashier, lamp, '200.00', `int4-i-${STAMP}`), 201);
    await waitFiscal(owner, String(sale['number']), /^failed BLOCKED:ITEM_CODE/);
    saveRun({ blockedSaleId: String(sale['id']) });
    const page = owner.page;
    const drawer = page.getByRole('dialog', { name: `Receipt ${String(sale['number'])}` });
    await page.goto('/tax/eta-receipts');
    await page.getByRole('button', { name: `Receipt ${String(sale['number'])}` }).click();
    // The diagnosis names the product (by its Arabic name, the one the ETA receipt carries).
    await expect(drawer).toContainText('These products have no ETA item code');
    await expect(drawer).toContainText(String(product['name_ar']));
    await expect(drawer.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled();
    await shot(page, 'i-monitor-blocked');
    ok(
      await api(owner, 'PATCH', `/api/products/${lamp}`, {
        eta_item_code: 'EG-674859545-1003',
        eta_item_type: 'EGS',
      }),
    );
    await page.reload();
    await page.getByRole('button', { name: `Receipt ${String(sale['number'])}` }).click();
    await drawer.getByRole('button', { name: 'Retry', exact: true }).click();
    await waitFiscal(owner, String(sale['number']), 'accepted');
    await page.reload();
    await shot(page, 'i-monitor-accepted');
  });

  test('j: history by serial and number; void with a UUID refused; shop B void puts it back', async ({
    browser,
  }) => {
    const r = run();
    const page = owner.page;
    await page.goto('/sales/history');
    const search = page.getByLabel('Number, serial or phone');
    await search.fill(r.serials![0]!);
    await expect(page.getByRole('link', { name: r.splitSaleNumber! })).toBeVisible();
    await shot(page, 'j-history-by-serial');
    await search.fill(r.splitSaleNumber!);
    await expect(page.getByRole('link', { name: r.splitSaleNumber! })).toBeVisible();
    await page.getByRole('link', { name: r.splitSaleNumber! }).click();
    // Its receipt has a UUID: the page offers no void, it says to use a return; the API refuses.
    await waitFiscal(owner, r.splitSaleNumber!, /^accepted/);
    await expect(page.getByText('The ETA receipt has been issued. Use a return.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Void sale' })).toHaveCount(0);
    await shot(page, 'j-void-refused-shop-a');
    const refused = await api(
      owner,
      'POST',
      `/api/sales/${r.splitSaleId}/void`,
      { reason: 'INT-4 void after the ETA' },
      `int4-void-a-${STAMP}`,
    );
    expect(refused.status, JSON.stringify(refused.body)).toBeGreaterThanOrEqual(400);
    writeFileSync(
      resolve(OUT, 'j-void-a-response.json'),
      JSON.stringify({ status: refused.status, code: errorCode(refused) }),
    );

    const ownerB = await session(browser, USERS.ownerB, ORG_B);
    const cashierB = await session(browser, USERS.cashierB, ORG_B);
    try {
      await closeOpenShift(cashierB);
      const deviceB = await newDevice(ownerB, `INT4 B Till ${STAMP}`, BRANCH_B);
      await pairByApi(ownerB, cashierB, deviceB);
      await openShiftByApi(cashierB, BRANCH_B, deviceB);
      const products = ok(await api(ownerB, 'GET', '/api/products?search=INT4-TABLE'))['items'] as {
        id: string;
      }[];
      const sale = ok(
        await sellByApi(cashierB, products[0]!.id, '300.00', `int4-j-b-${STAMP}`),
        201,
      );
      saveRun({ deviceB, voidSaleId: String(sale['id']) });
      // The manager performs this POS void on the cashier's paired computer.
      const deviceToken = await cashierB.page.evaluate(
        (org) => localStorage.getItem(`ecotech.deviceToken.${org}`),
        ORG_B,
      );
      await ownerB.page.evaluate(
        ([org, token]) => localStorage.setItem(`ecotech.deviceToken.${org}`, token!),
        [ORG_B, deviceToken] as const,
      );
      await ownerB.page.goto(`/sales/${String(sale['id'])}`);
      await ownerB.page.getByRole('button', { name: 'Void sale' }).click();
      await ownerB.page.getByLabel('Reason').fill('INT-4 void, ETA off');
      await ownerB.page.getByRole('button', { name: 'Confirm void' }).click();
      await expect(ownerB.page.getByText('Sale voided')).toBeVisible();
      await expect(ownerB.page.getByText('Voided').first()).toBeVisible();
      await shot(ownerB.page, 'j-void-shop-b');
      await closeOpenShift(cashierB);
    } finally {
      await cashierB.context.close();
      await ownerB.context.close();
    }
  });

  test('k: warranty lookup -> claim -> replace with another serial; both serials show the chain', async () => {
    const r = run();
    const page = owner.page;
    await page.goto('/sales/warranty');
    await page.getByRole('tab', { name: 'Lookup' }).click();
    await page.getByLabel('Serial, phone or sale number').fill(r.serials![0]!);
    await page.getByRole('button', { name: 'Lookup' }).click();
    await expect(page.getByText('In warranty').first()).toBeVisible();
    await shot(page, 'k-warranty-lookup');
    await page.getByRole('button', { name: 'Open claim' }).first().click();
    await page.getByLabel('Issue').fill('INT-4 screen failed');
    await page.getByLabel('Received condition').fill('Scratched case');
    await page.getByRole('dialog').getByRole('button', { name: 'Open claim' }).click();
    await expect(page).toHaveURL(/\/warranty\/claims\/[0-9a-f-]{36}$/);
    const claimId = page.url().split('/').pop()!;
    saveRun({ claimId });
    await page.getByRole('button', { name: 'Replace' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Replacement unit').selectOption({ label: r.serials![1]! });
    await dialog.getByLabel('Decision note').fill('INT-4 replacement');
    await dialog.getByRole('button', { name: 'Confirm decision' }).click();
    await expect(page.getByText('Replaced').first()).toBeVisible();
    await shot(page, 'k-warranty-replaced');
    for (const serial of r.serials!) {
      await page.goto('/sales/warranty');
      await page.getByRole('tab', { name: 'Lookup' }).click();
      await page.getByLabel('Serial, phone or sale number').fill(serial);
      await page.getByRole('button', { name: 'Lookup' }).click();
      await expect(page.getByText('Serial history')).toBeVisible();
      await expect(page.getByText(r.serials![0]!).first()).toBeVisible();
      await expect(page.getByText(r.serials![1]!).first()).toBeVisible();
      await shot(page, `k-chain-${serial}`);
    }
  });

  test('l: the cashier has no ETA monitor; shop B never sees shop A sales or receipts', async ({
    browser,
  }) => {
    const r = run();
    await cashier.page.goto('/dashboard');
    await expect(cashier.page.locator('a[href="/tax/eta-receipts"]')).toHaveCount(0);
    expect((await api(cashier, 'GET', '/api/fiscal')).status).toBe(403);
    expect((await api(cashier, 'GET', '/api/fiscal/summary')).status).toBe(403);
    const ownerB = await session(browser, USERS.ownerB, ORG_B);
    try {
      expect((await api(ownerB, 'GET', `/api/sales/${r.splitSaleId}`)).status).toBe(404);
      expect(
        (await api(ownerB, 'POST', `/api/sales/${r.splitSaleId}/receipt-prints`, {})).status,
      ).toBe(404);
      const fiscalA = await fiscalOf(owner, r.splitSaleNumber!);
      expect((await api(ownerB, 'GET', `/api/fiscal/${String(fiscalA['id'])}`)).status).toBe(404);
    } finally {
      await ownerB.context.close();
    }
  });

  test('m: the last unit, two devices at once: one sale, one OUT_OF_STOCK', async ({ browser }) => {
    const r = run();
    const last = r.products!['INT4-LAST']!;
    const levels = ok(await api(owner, 'GET', `/api/stock?search=INT4-LAST&branch_id=${BRANCH_A}`));
    const onHand = Number(
      JSON.stringify(levels).match(/"(?:quantity|on_hand|available)":(\d+)/)?.[1] ?? 0,
    );
    if (onHand !== 1) {
      ok(
        await api(
          owner,
          'POST',
          '/api/stock/adjustments',
          {
            branch_id: BRANCH_A,
            reason: 'found',
            lines: [{ product_id: last, quantity: 1 - onHand }],
          },
          `int4-last-${STAMP}`,
        ),
        201,
      );
    }
    const cashier2 = await session(browser, USERS.cashierA2, ORG_A);
    try {
      await closeOpenShift(cashier2);
      const deviceA2 = await newDevice(owner, `INT4 Till 2 ${STAMP}`, BRANCH_A, ETA_POS[1]);
      await pairByApi(owner, cashier2, deviceA2);
      await openShiftByApi(cashier2, BRANCH_A, deviceA2);
      saveRun({ deviceA2, lastProductId: last });
      const [one, two] = await Promise.all([
        sellByApi(cashier, last, '300.00', `int4-m1-${STAMP}`),
        sellByApi(cashier2, last, '300.00', `int4-m2-${STAMP}`),
      ]);
      const statuses = [one.status, two.status].sort();
      expect(statuses, JSON.stringify([one.body, two.body])).toEqual([201, 409].sort());
      expect([errorCode(one), errorCode(two)]).toContain('OUT_OF_STOCK');
      writeFileSync(
        resolve(OUT, 'm-responses.json'),
        JSON.stringify(
          [one, two].map((x) => ({ status: x.status, code: errorCode(x) ?? 'created' })),
        ),
      );
    } finally {
      await cashier2.context.close();
    }
  });

  test('n: POS, receipt, monitor and warranty in Arabic and English', async ({ browser }) => {
    const r = run();
    const rawKey =
      /\b(?:sales|receipts|fiscal|eta|common|nav|devices|cash|errors|shell|ui|table|form)\.[a-zA-Z0-9_.]+\b/;
    for (const lang of ['ar', 'en'] as const) {
      const c = await session(browser, USERS.cashierA1, ORG_A, lang);
      const o = await session(browser, USERS.ownerA, ORG_A, lang);
      const warnings: string[] = [];
      for (const p of [c.page, o.page]) {
        p.on('console', (m) => {
          if (/missingKey|missing key|i18next/i.test(m.text())) warnings.push(m.text());
        });
      }
      try {
        await pairByApi(owner, c, r.deviceA1!);
        const pages: [Page, string, string][] = [
          [c.page, '/sales/pos', 'pos'],
          [c.page, `/sales/${r.splitSaleId}`, 'sale'],
          [o.page, '/tax/eta-receipts', 'monitor'],
          [o.page, '/sales/warranty', 'warranty'],
        ];
        for (const [page, path, name] of pages) {
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
          if (name === 'sale') {
            await page
              .getByRole('button', { name: lang === 'ar' ? 'طباعة الإيصال' : 'Print receipt' })
              .click();
            await page.waitForTimeout(500);
          }
          const text = await page.locator('body').innerText();
          expect(text.match(rawKey)?.[0] ?? null, `${name} ${lang}`).toBeNull();
          await shot(page, `n-${name}-${lang}`);
        }
        expect(warnings).toEqual([]);
      } finally {
        await c.context.close();
        await o.context.close();
      }
    }
    // The cashier's main session is device A1 again.
    await pairByApi(owner, cashier, r.deviceA1!);
  });

  test('o: day summary, reconciliation and the database checks', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    // The last receipts (check m) may still be on their way: wait until nothing is waiting.
    let summary: Record<string, unknown> = {};
    await expect
      .poll(
        async () => {
          summary = ok(
            await api(owner, 'GET', `/api/fiscal/day-summary?branch_id=${BRANCH_A}&date=${today}`),
          );
          return summary['waiting'];
        },
        { timeout: 90_000, intervals: [2000, 3000] },
      )
      .toBe(0);
    expect(summary['all_accepted']).toBe(true);
    saveRun({ daySummary: summary });
    const env = { ...process.env, NODE_OPTIONS: '--no-network-family-autoselection' };
    const out = (script: string, args: string[] = []) => {
      try {
        return {
          ok: true,
          text: execFileSync('node', [script, ...args], { cwd: API_DIR, env, encoding: 'utf8' }),
        };
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        return { ok: false, text: `${err.stdout ?? ''}${err.stderr ?? ''}` };
      }
    };
    const verify = out('scripts/int4-verify.mjs', [RUN_FILE]);
    const reconcile = out('scripts/db-reconcile.mjs');
    writeFileSync(resolve(OUT, 'int4-verify.txt'), `${verify.text}\n${reconcile.text}`);
    console.log(verify.text, reconcile.text);
    expect(reconcile.ok, reconcile.text).toBe(true);
    expect(verify.ok, verify.text).toBe(true);
  });
});

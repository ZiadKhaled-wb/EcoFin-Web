import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * O03 POS devices: the owner creates a device and gets a pairing code; the cashier types it on
 * another computer, which becomes that device, opens a shift there and sells. Then the owner
 * turns the device off and the cashier's computer is told it is no longer a POS device.
 * Needs the API, local Supabase and the dev server; skipped unless RUN_E2E=1. Seed logins:
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD        an owner (holds device.manage)
 *   E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD    a cashier of the same shop (holds shift.operate)
 * The test makes its own product and stock through the API, and leaves the cashier without an
 * open shift and the device turned off (a device is never deleted; one that is off does not
 * count against the plan).
 */
const env = (name: string) => process.env[name] ?? '';
const STAMP = Date.now();
const DEVICE = `E2E POS ${STAMP}`;
const PRODUCT = `E2E lamp ${STAMP}`;

// Each context logs in from its own client IP, so the per-IP login limiter doesn't trip.
let ipCounter = Math.floor(Math.random() * 200);

async function newSession(browser: Browser) {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': `198.51.100.${(ipCounter++ % 250) + 1}` },
  });
  await context.addInitScript(() => window.localStorage.setItem('ecofin-lang', 'en'));
  return { context, page: await context.newPage() };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** A call to the API as the user signed in on that page (setup and clean-up only). */
async function apiCall(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  data?: object,
  key?: string,
) {
  const session = await page.evaluate(() => {
    const raw = window.localStorage.getItem('ecofin-auth');
    const state = (raw ? JSON.parse(raw) : {}).state ?? {};
    const orgId: string = state.orgId ?? '';
    return {
      accessToken: (state.accessToken ?? '') as string,
      orgId,
      deviceToken: window.localStorage.getItem(`ecotech.deviceToken.${orgId}`),
    };
  });
  const res = await page.request.fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'x-org-id': session.orgId,
      ...(session.deviceToken ? { 'x-device-token': session.deviceToken } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(data ? { data } : {}),
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as unknown };
}

/** The cashier's open shift from an earlier run or spec is closed, so this one can open its own. */
async function closeOpenShift(page: Page) {
  const current = await apiCall(page, 'GET', '/api/shifts/current');
  const shift = (current.body as { shift: { id: string } | null } | null)?.shift;
  if (!shift) return;
  const closed = await apiCall(page, 'POST', `/api/shifts/${shift.id}/close`, {
    counts: {},
    difference_reason: 'E2E O03 clean-up',
  });
  expect(closed.status, JSON.stringify(closed.body)).toBe(200);
}

test.describe('O03 POS devices', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');

  test('owner creates a device and a code; the cashier pairs, opens a shift and sells', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ownerSession = await newSession(browser);
    const cashierSession = await newSession(browser);
    const owner = ownerSession.page;
    const cashier = cashierSession.page;
    let deviceId = '';
    try {
      // Setup through the API: something to sell, in stock in the main branch.
      await login(owner, env('E2E_OWNER_EMAIL'), env('E2E_OWNER_PASSWORD'));
      const branches = await apiCall(owner, 'GET', '/api/branches');
      const branch = (branches.body as { id: string; is_main: boolean; name: string }[]).find(
        (b) => b.is_main,
      );
      expect(branch, JSON.stringify(branches.body)).toBeTruthy();
      const product = await apiCall(owner, 'POST', '/api/products', {
        name_ar: PRODUCT,
        name_en: PRODUCT,
        sku: `E2E-${STAMP}`,
        cash_price: '100.00',
      });
      expect(product.status, JSON.stringify(product.body)).toBe(201);
      const stocked = await apiCall(
        owner,
        'POST',
        '/api/stock/adjustments',
        {
          branch_id: branch!.id,
          reason: 'found',
          lines: [{ product_id: (product.body as { id: string }).id, quantity: 3 }],
        },
        `e2e-o03-stock-${STAMP}`,
      );
      expect(stocked.status, JSON.stringify(stocked.body)).toBe(201);

      // The owner adds the device and asks for its pairing code.
      await owner.goto('/settings/devices');
      await owner.getByRole('button', { name: 'Add device' }).click();
      const add = owner.getByRole('dialog', { name: 'New POS device' });
      await add.getByLabel('Device name').fill(DEVICE);
      await add.getByLabel('Branch').selectOption(branch!.id);
      await add.getByRole('button', { name: 'Add device' }).click();
      await expect(add).toBeHidden();
      const row = owner.locator('tr', { hasText: DEVICE });
      await expect(row).toContainText('Not paired');
      await row.getByRole('button', { name: 'Pair', exact: true }).click();
      const codeDialog = owner.getByRole('dialog', { name: `Pair ${DEVICE}` });
      await expect(codeDialog).toContainText('Enter this code on the POS computer');
      await expect(codeDialog.getByRole('timer')).toContainText(/Valid for 1[45]:\d\d/);
      const code = (await codeDialog.getByTestId('pairing-code').innerText()).trim();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);

      // The cashier's computer is no device yet: the shift screen sends them to pair.
      await login(cashier, env('E2E_CASHIER_EMAIL'), env('E2E_CASHIER_PASSWORD'));
      await closeOpenShift(cashier);
      await cashier.goto('/accounting/shifts');
      await expect(cashier.getByRole('button', { name: 'Open shift' })).toBeDisabled();
      await cashier.getByRole('link', { name: 'Pair this computer' }).click();
      await expect(cashier).toHaveURL(/\/device\/pair/);
      await cashier.getByLabel('Pairing code').fill(code.toLowerCase());
      await cashier.getByRole('button', { name: 'Pair this computer' }).click();
      await expect(cashier.getByRole('status')).toContainText(
        `This computer is now ${DEVICE} (${branch!.name})`,
      );
      await expect(cashier.getByTestId('topbar-device')).toHaveText(DEVICE);

      // The owner sees the device paired once the code dialog is closed.
      await codeDialog.getByRole('button', { name: 'Done' }).click();
      await expect(row).toContainText('Paired');
      const listed = await apiCall(owner, 'GET', '/api/devices');
      deviceId =
        (listed.body as { id: string; name: string }[]).find((d) => d.name === DEVICE)?.id ?? '';
      expect(deviceId).not.toBe('');

      // The cashier opens a shift on this computer.
      await cashier.getByRole('link', { name: 'Go to the shift' }).click();
      await expect(cashier.getByTestId('shift-device')).toContainText(DEVICE);
      await cashier.getByRole('button', { name: 'Open shift' }).click();
      await expect(cashier.getByTestId('shift-expected')).toBeVisible();
      const opened = await apiCall(cashier, 'GET', '/api/shifts/current');
      expect(
        (opened.body as { shift: { device_id: string; device_name: string } }).shift,
      ).toMatchObject({ device_id: deviceId, device_name: DEVICE });

      // And sells: find the product, pay in cash.
      await cashier.goto('/sales/pos');
      const search = cashier.getByRole('searchbox').first();
      await search.fill(PRODUCT);
      await cashier.getByRole('button', { name: `Add ${PRODUCT}` }).click();
      await cashier.getByRole('button', { name: 'Confirm and pay' }).click();
      const payment = cashier.getByRole('dialog', { name: 'Payment' });
      await expect(payment).toBeVisible();
      await cashier.keyboard.press('Enter');
      await cashier.keyboard.press('Enter');
      await expect(cashier.getByRole('heading', { name: /Sale .+ completed/ })).toBeVisible();
      const after = await apiCall(cashier, 'GET', '/api/shifts/current');
      expect((after.body as { shift: { sales_total: string } }).shift.sales_total).toBe('100.00');

      // The shift is closed and the owner turns the device off: on the cashier's next request
      // the computer is told it is no longer a POS device.
      await closeOpenShift(cashier);
      await owner.reload();
      await row.getByRole('button', { name: 'Turn off' }).click();
      const off = owner.getByRole('dialog', { name: 'Turn this device off' });
      await off.getByLabel('Reason').fill('E2E: test device');
      await off.getByRole('button', { name: 'Turn off' }).click();
      await expect(off).toBeHidden();
      await expect(row).toContainText('Off');
      deviceId = '';

      await cashier.goto('/accounting/shifts');
      await expect(cashier.getByText('This computer is no longer a POS device')).toBeVisible();
      await expect(cashier.getByTestId('topbar-device')).toHaveCount(0);
      await expect(cashier.getByRole('link', { name: 'Pair this computer' })).toBeVisible();
    } finally {
      // A failed run must not leave an open shift or an active device behind.
      if (deviceId) {
        await closeOpenShift(cashier).catch(() => undefined);
        await apiCall(owner, 'POST', `/api/devices/${deviceId}/active`, {
          active: false,
          reason: 'E2E O03 clean-up',
        }).catch(() => undefined);
      }
      await cashierSession.context.close();
      await ownerSession.context.close();
    }
  });
});

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const API_DIR = resolve(process.env.E2E_API_DIR ?? '../EcoFin-API');
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
for (const language of ['ar', 'en'] as const) {
  test(`EC147: revoked POS stops selling and a manager force-closes in ${language}`, async ({
    page,
  }) => {
    test.skip(process.env.RUN_E2E !== '1', 'local stack only');
    test.setTimeout(90000);
    const fixture = JSON.parse(
      execFileSync('node', ['scripts/test4-language-fixture.mjs', language], {
        cwd: API_DIR,
        env: process.env,
        encoding: 'utf8',
        timeout: 30000,
      }),
    ) as { orgId: string; branchId: string; email: string };
    await page.addInitScript((lang) => localStorage.setItem('ecofin-lang', lang), language);
    await page.goto('/login');
    await page.locator('input').first().fill(fixture.email);
    await page.locator('input[type=password]').fill('LocalDev-Only-2026!');
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/dashboard/);
    const token = await page.evaluate(
      () => JSON.parse(localStorage.getItem('ecofin-auth') ?? '{}').state.accessToken as string,
    );
    const call = async (path: string, body?: object, key?: string) => {
      const response = await page.request.post(`${API_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-org-id': fixture.orgId,
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body ? { data: body } : {}),
      });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as Record<string, unknown>;
    };
    const created = await call('/api/devices', {
      name: `EC147 ${language}`,
      branch_id: fixture.branchId,
    });
    const device = String(created.id);
    const code = await call(`/api/devices/${device}/pairing-code`);
    const pairing = await call('/api/devices/pair', { code: code.code });
    await page.evaluate(
      ([org, deviceToken]) => localStorage.setItem(`ecotech.deviceToken.${org}`, deviceToken),
      [fixture.orgId, String(pairing.device_token)],
    );
    const opened = await page.request.post(`${API_URL}/api/shifts`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-org-id': fixture.orgId,
        'x-device-token': String(pairing.device_token),
        'Idempotency-Key': `ec147-${fixture.orgId}`,
      },
      data: { branch_id: fixture.branchId, opening_float: '0' },
    });
    expect(opened.status(), await opened.text()).toBe(201);
    await page.goto('/sales/pos');
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    const search = page.getByRole('searchbox');
    await search.fill('6222000000011');
    await search.press('Enter');
    const confirm = page.getByRole('button', {
      name: language === 'ar' ? 'تأكيد ودفع' : 'Confirm and pay',
    });
    await expect(confirm).toBeEnabled();
    await call(`/api/devices/${device}/unpair`);
    await confirm.click();
    const pay = page.getByRole('dialog', { name: language === 'ar' ? 'الدفع' : 'Payment' });
    await pay.getByRole('button', { name: language === 'ar' ? 'دفع' : 'Pay', exact: true }).click();
    await expect(
      page.getByText(
        language === 'ar'
          ? 'تم إلغاء اقتران جهاز نقطة البيع هذا. اطلب من مدير إغلاق الوردية.'
          : 'This POS device was revoked. Ask a manager to close the shift.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await page.goto('/accounting/shifts');
    const forceLabel = language === 'ar' ? 'إغلاق إجباري' : 'Force close';
    await page.getByRole('button', { name: forceLabel }).click();
    const dialog = page.getByRole('dialog', { name: forceLabel });
    await dialog.getByLabel(language === 'ar' ? 'النقد المعدود' : 'Counted cash').fill('0');
    await dialog.getByRole('button', { name: forceLabel }).click();
    await expect(
      dialog.getByText(
        language === 'ar'
          ? 'اكتب سبباً من 3 إلى 500 حرف.'
          : 'Write a reason of 3 to 500 characters.',
      ),
    ).toBeVisible();
    await dialog.getByLabel(language === 'ar' ? 'السبب' : 'Reason').fill('Lost POS device');
    const closing = page.waitForResponse(
      (response) =>
        response.url().includes('/force-close') && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: forceLabel }).click();
    const closed = await closing;
    expect(closed.status()).toBe(200);
    expect(((await closed.json()) as { status: string }).status).toBe('closed');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: forceLabel })).toHaveCount(0);
  });
}

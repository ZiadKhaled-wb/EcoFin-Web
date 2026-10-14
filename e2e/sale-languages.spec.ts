import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatEgp as formatMoney, roundMoney } from '@ziadkhaled-wb/contracts';
import { expect, test } from '@playwright/test';
import { api, ok, pairByApi, newDevice, openShiftByApi, session, waitFiscal } from './helpers/int4';

const API_DIR = resolve(process.env.E2E_API_DIR ?? '../EcoFin-API');
for (const language of ['ar', 'en'] as const) {
  test(`TEST4: full POS sale and prepared QR receipt in ${language}`, async ({ browser }) => {
    test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
    test.setTimeout(120000);
    const fixture = JSON.parse(
      execFileSync('node', ['scripts/test4-language-fixture.mjs', language], {
        cwd: API_DIR,
        env: process.env,
        encoding: 'utf8',
        timeout: 30000,
      }),
    ) as { orgId: string; branchId: string; email: string; serial: string };
    const warnings: string[] = [];
    const s = await session(browser, fixture.email, fixture.orgId, language, warnings);
    const labels = JSON.parse(
      readFileSync(resolve(`src/i18n/locales/${language}/sales.json`), 'utf8'),
    ) as Record<string, unknown>;
    const text = (path: string, values: Record<string, string> = {}) => {
      let value: unknown = labels;
      for (const part of path.split('.')) value = (value as Record<string, unknown>)[part];
      let output = String(value);
      for (const [name, replacement] of Object.entries(values))
        output = output.replace(`{${name}}`, replacement);
      return output;
    };
    try {
      const device = await newDevice(s, `TEST4 ${language}`, fixture.branchId);
      ok(
        await api(s, 'PUT', `/api/devices/${device}/eta`, {
          eta_serial: `TEST4-POS-${language.toUpperCase()}`,
          preshared_key: `test4-fake-psk-${language}`,
          eta_os_version: 'windows 11',
          eta_model_framework: '1',
          eta_status: 'active',
        }),
      );
      await pairByApi(s, s, device);
      await openShiftByApi(s, fixture.branchId, device);
      await s.page.goto('/sales/pos');
      await expect(s.page.locator('html')).toHaveAttribute(
        'dir',
        language === 'ar' ? 'rtl' : 'ltr',
      );
      await expect(s.page.locator('html')).toHaveAttribute('lang', language);
      const search = s.page.getByRole('searchbox', { name: text('pos.search') });
      await search.fill('6222000000011');
      await search.press('Enter');
      const chair = language === 'ar' ? 'كرسي' : 'Chair';
      await expect(s.page.getByLabel(text('pos.quantityOf', { name: chair }))).toBeVisible();
      await search.fill(fixture.serial);
      await search.press('Enter');
      await expect(s.page.getByText(fixture.serial)).toBeVisible();
      await s.page
        .getByRole('button', { name: text('pos.discount.addOf', { name: chair }) })
        .click();
      await s.page.getByLabel(text('pos.discount.of', { name: chair }), { exact: true }).fill('5');
      await s.page.getByLabel(text('pos.discount.reason')).fill('TEST4 loyalty');
      await expect(s.page.getByTestId('sale-total')).toContainText('5,950.00');
      await s.page.getByRole('button', { name: text('pos.confirm') }).click();
      const pay = s.page.getByRole('dialog', { name: text('pay.title') });
      await pay
        .getByLabel(text('pay.amountOf', { method: text('detail.methods.cash') }))
        .fill('950.00');
      await pay.getByLabel(text('pay.received')).fill('1000');
      await pay.getByRole('button', { name: text('pay.addTransfer') }).click();
      await pay.getByLabel(text('pay.account')).selectOption({ label: 'TEST4 Bank' });
      await pay.getByLabel(text('pay.reference')).fill(`TEST4-${language}`);
      const response = s.page.waitForResponse(
        (res) => res.url().endsWith('/api/sales') && res.request().method() === 'POST',
      );
      await pay.getByRole('button', { name: text('pay.pay'), exact: true }).click();
      const res = await response;
      expect(res.status()).toBe(201);
      const sale = (await res.json()) as { id: string; number: string };
      // The verifier requires a Valid receipt at the fake, not merely a prepared UUID.
      await waitFiscal(s, sale.number, /^accepted\b/);
      const checked = JSON.parse(
        execFileSync('node', ['scripts/int4-verify.mjs', '--sale', sale.id], {
          cwd: API_DIR,
          env: process.env,
          encoding: 'utf8',
          timeout: 10000,
        }),
      ) as {
        sale: { total: string; subtotal: string; discount_total: string; tax_total: string };
        fiscal: { qr_payload: string; eta_uuid: string };
        lines: { line_total: string; serial?: string }[];
      };
      await s.page.goto(`/sales/${sale.id}`);
      await s.page
        .getByRole('button', { name: language === 'ar' ? 'طباعة الإيصال' : 'Print receipt' })
        .click();
      const receipt = s.page.getByLabel(language === 'ar' ? 'معاينة الإيصال' : 'Receipt preview');
      await expect(receipt).toBeVisible();
      for (const amount of [
        checked.sale.total,
        checked.sale.subtotal,
        checked.sale.discount_total,
        checked.sale.tax_total,
        ...checked.lines.map((line) => line.line_total),
      ])
        await expect(receipt).toContainText(formatMoney(roundMoney(String(amount)), language));
      await expect(receipt).toContainText(fixture.serial);
      await expect(receipt.locator('[data-part="eta-uuid"]')).toHaveText(checked.fiscal.eta_uuid);
      await expect(
        receipt
          .getByRole('img', { name: 'QR' })
          .or(receipt.locator('.r-qr svg, .r-qr canvas, .r-qr img')),
      ).toBeVisible();
      await expect(receipt.locator('[data-qr]')).toHaveAttribute(
        'data-qr',
        checked.fiscal.qr_payload,
      );
      expect(checked.fiscal.qr_payload).toContain(checked.fiscal.eta_uuid);
      // Only visible leaf text is checked; email, URL and fixture serial tokens are allowed.
      const visible = await s.page.locator('body').evaluate((body) =>
        Array.from(body.querySelectorAll('*'))
          .filter((el) => el.children.length === 0 && (el as HTMLElement).offsetParent !== null)
          .map((el) => el.textContent ?? '')
          .join('\n'),
      );
      const cleaned = visible.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|TEST4-[\w-]+/g, '');
      expect(cleaned.match(/\b[a-z]+\.[a-z_.]+\b/g)).toBeNull();
      expect(warnings).toEqual([]);
    } finally {
      await s.context.close();
    }
  });
}

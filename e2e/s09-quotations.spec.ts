import { expect, test } from '@playwright/test';
import { Quotation, Customer, Product } from '@ziadkhaled-wb/contracts';
import { session, api, ok } from './helpers/int4';
const ORG = 'd1000000-0000-0000-0000-000000000001';
const BRANCH = 'd2000000-0000-0000-0000-000000000011';
test.describe('S09 quotations', () => {
  test.skip(process.env.RUN_E2E !== '1', 'Requires the local API and Supabase');
  test('E1 cashier creates product/custom offer, accepts, prints exact totals in EN and AR', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const warnings: string[] = [];
    const owner = await session(browser, 'owner.one@ecotech.test', ORG, 'en', warnings);
    const stamp = Date.now();
    const product = Product.parse(
      ok(
        await api(owner, 'POST', '/api/products', {
          name_ar: 'كرسي عرض سعر',
          name_en: 'S09 chair ' + stamp,
          sku: 'S09-' + stamp,
          cash_price: '114.00',
        }),
        201,
      ),
    );
    const customer = Customer.parse(
      ok(
        await api(owner, 'POST', '/api/customers', {
          full_name: 'S09 customer ' + stamp,
          phones: ['01012345678'],
        }),
        201,
      ),
    );
    await owner.context.close();
    const cashier = await session(browser, 'cashier.one@ecotech.test', ORG, 'en', warnings);
    const page = cashier.page;
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Sales', exact: true }).click();
    await page.getByRole('link', { name: 'Quotations', exact: true }).click();
    await page.getByRole('link', { name: 'New quotation', exact: true }).click();
    await expect(page).toHaveURL(/\/sales\/quotations\/new$/);
    await expect(page.getByRole('heading', { name: 'New quotation', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption(BRANCH);
    await page.getByLabel('Search customers', { exact: true }).fill(customer.full_name);
    await expect(page.getByRole('option', { name: new RegExp(customer.full_name) })).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(customer.id);
    await page.getByLabel('Description', { exact: true }).fill('Custom fabric');
    await page.getByLabel('Unit price', { exact: true }).fill('228.00');
    await page.getByLabel('Search products or barcode').fill(product.name_en!);
    await page.getByRole('button', { name: product.name_en!, exact: true }).click();
    await expect(page.getByLabel('Unit price').nth(1)).toHaveAttribute('readonly');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/\/sales\/quotations\/[0-9a-f-]+$/);
    const id = page.url().split('/').pop()!;
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    const quote = Quotation.parse(ok(await api(cashier, 'GET', '/api/quotations/' + id)));
    expect(quote.effective_status).toBe('accepted');
    await page.getByRole('link', { name: 'Print / Save as PDF' }).click();
    const print = page.locator('main .quotation-print');
    await expect(print).toContainText(quote.total);
    for (const [index, key] of (
      ['subtotal', 'discount_total', 'tax_total', 'total'] as const
    ).entries()) {
      await expect(print.locator('dd').nth(index)).toHaveText(quote[key]);
    }
    await expect(print).toHaveAttribute('dir', 'ltr');
    await page.getByRole('button', { name: /العربية/ }).click();
    await expect(print).toHaveAttribute('dir', 'rtl');
    await expect(print).toContainText(quote.total);
    await expect(print).toContainText('الأسعار سارية حتى');
    for (const [index, key] of (
      ['subtotal', 'discount_total', 'tax_total', 'total'] as const
    ).entries()) {
      await expect(print.locator('dd').nth(index)).toHaveText(quote[key]);
    }
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.quotation-print-root')).toBeVisible();
    await expect(page.locator('.quotation-page')).toBeHidden();
    await expect(page.locator('.quotation-print-root')).toContainText(quote.total);
    expect(warnings).toEqual([]);
    await cashier.context.close();
  });
});

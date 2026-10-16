import { expect, test } from '@playwright/test';
import {
  USERS,
  ORG_A,
  BRANCH_A,
  BARCODE_CHAIR,
  STAMP,
  type Session,
  session,
  api,
  ok,
  pairByApi,
  newDevice,
  closeOpenShift,
  openShiftByApi,
} from './helpers/int4';

/**
 * N02 (EC-81, D77): an installment sale end to end, server and client together, on INT-4's shop A
 * (dev seed). The owner publishes an installment policy and gives a new customer a national ID and
 * a credit limit; the cashier sells the seed chair on installments with a cash down payment; the
 * contract adds up, the down payment is the sale's cash payment, and the customer account shows
 * the contract. Skipped unless RUN_E2E=1 (API, local Supabase with the dev seed, dev server).
 */

/** A valid Egyptian national ID that is new on every run (born 1990, Cairo). */
function freshNationalId() {
  const serial = String(STAMP % 100000).padStart(5, '0');
  return `290010101${serial}`;
}

test.describe('N02 installment sale end to end', () => {
  test.skip(process.env.RUN_E2E !== '1', 'set RUN_E2E=1 to run browser tests');
  test.setTimeout(120_000);

  let owner: Session;
  let cashier: Session;

  test.beforeAll(async ({ browser }) => {
    owner = await session(browser, USERS.ownerA, ORG_A);
    cashier = await session(browser, USERS.cashierA1, ORG_A);
  });
  test.afterAll(async () => {
    await cashier?.context.close();
    await owner?.context.close();
  });

  test('a cashier sells on installments; the contract adds up and shows on the customer account', async () => {
    // The cashier works on a newly paired computer with an open shift.
    await closeOpenShift(cashier);
    const device = await newDevice(owner, `N02 POS ${STAMP}`, BRANCH_A);
    await pairByApi(owner, cashier, device);
    await openShiftByApi(cashier, BRANCH_A, device);

    // The policy: 10 % minimum down payment, 20 % profit for the whole term up to 24 months.
    ok(
      await api(owner, 'POST', '/api/settings/installment-policies', {
        min_down_payment_pct: '10',
        max_months: 24,
        markup_tiers: [
          { up_to_months: 6, pct: 10 },
          { up_to_months: 24, pct: 20 },
        ],
        allowed_frequencies: ['monthly'],
        rounding_step: '1.00',
      }),
      201,
    );
    ok(await api(owner, 'PATCH', '/api/settings', { credit_min_score: 0 }));
    const customer = ok(
      await api(owner, 'POST', '/api/customers', {
        full_name: `N02 Buyer ${STAMP}`,
        phones: ['01500000077'],
        national_id: freshNationalId(),
      }),
      201,
    );
    const customerId = String(customer['id']);
    ok(
      await api(owner, 'PUT', `/api/customers/${customerId}/credit-limit`, {
        credit_limit: '100000.00',
        reason: 'N02 e2e',
      }),
    );

    const page = cashier.page;
    await page.goto(`/sales/pos?customer=${customerId}`);
    const search = page.getByRole('searchbox', { name: 'Find a product by name, SKU or barcode' });
    await search.fill(BARCODE_CHAIR);
    await search.press('Enter');
    await page.getByRole('button', { name: 'Installments', exact: true }).click();
    const terms = page.getByRole('button', { name: /Installment terms/ });
    await expect(terms).toBeEnabled();
    await terms.click();

    const dialog = page.getByRole('dialog', { name: 'Installment sale' });
    await expect(dialog.getByTestId('check-credit')).toContainText('Credit: OK');
    const next = dialog.getByRole('button', { name: 'Next: down payment' });
    await expect(next).toBeEnabled();
    const installmentPrice = (await dialog.getByTestId('terms-total').innerText()).trim();
    await next.click();

    const pay = page.getByRole('dialog', { name: 'Down payment' });
    await pay.getByRole('button', { name: 'Pay' }).dblclick();
    const done = page.getByTestId('done-contract');
    await expect(done).toBeVisible();
    await expect(done).toContainText(installmentPrice);

    const href = await page.getByRole('link', { name: 'View contract' }).getAttribute('href');
    const contractId = String(href?.split('/').pop());
    const contract = ok(await api(owner, 'GET', `/api/contracts/${contractId}`));
    const money = (v: unknown) => Math.round(Number(v) * 100);
    // The slice's check: total = cash price - down payment + profit.
    expect(money(contract['total_payable'])).toBe(
      money(contract['cash_price']) -
        money(contract['down_payment']) +
        money(contract['markup_amount']),
    );
    const lines = contract['lines'] as { amount: string }[];
    expect(lines.reduce((sum, l) => sum + money(l.amount), 0)).toBe(
      money(contract['total_payable']),
    );

    // The down payment is the sale's one cash payment (into the shift's drawer).
    const sale = ok(await api(owner, 'GET', `/api/sales/${String(contract['sale_id'])}`));
    const payments = sale['payments'] as { method: string; amount: string }[];
    expect(payments.map((p) => [p.method, money(p.amount)])).toEqual([
      ['cash', money(contract['down_payment'])],
    ]);

    // The customer account shows the contract, and the page opens from it.
    const account = ok(await api(owner, 'GET', `/api/customers/${customerId}/account`));
    expect((account['contracts'] as { id: string }[]).map((c) => c.id)).toContain(contractId);
    await page.goto(`/contracts/${contractId}`);
    await expect(page.getByTestId('contract-total')).toContainText(installmentPrice);
    await closeOpenShift(cashier);
  });
});

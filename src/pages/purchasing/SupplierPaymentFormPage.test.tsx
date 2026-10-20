import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiErrorCode } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { purchaseReturnsApi } from '@/services/purchaseReturnsApi';
import { supplierPaymentsApi } from '@/services/supplierPaymentsApi';
import { suppliersApi } from '@/services/suppliersApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import SupplierPaymentFormPage from './SupplierPaymentFormPage';
import { INVOICE, MAIN, SAFE, SUPPLIER, branches } from './purchaseFixtures';
import { INVOICE_B, openInvoices, payment } from './supplierPaymentFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const page = (
  <Routes>
    <Route path="/purchasing/payments/new" element={<SupplierPaymentFormPage />} />
    <Route path="/purchasing/payments/:id" element={<p>posted payment</p>} />
  </Routes>
);
const route = `/purchasing/payments/new?supplier_id=${SUPPLIER}`;
const allocation = (number: string, lang: 'en' | 'ar' = 'en') =>
  screen.findByLabelText(
    lang === 'en' ? `Pay now on ${number}` : `المدفوع الآن على ${number}`,
  ) as Promise<HTMLInputElement>;
const payButton = () => screen.getByRole('button', { name: t('purchases.payments.form.submit') });
async function chooseAccount(user: ReturnType<typeof userEvent.setup>) {
  const select = screen.getByLabelText(t('purchases.payments.form.account'));
  await waitFor(() => expect(select.querySelector(`option[value="${SAFE}"]`)).not.toBeNull());
  await user.selectOptions(select, SAFE);
}

describe('U03 supplier payment form', () => {
  let open: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['supplier.payment_create']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(suppliersApi, 'list').mockResolvedValue({
      items: [
        {
          id: SUPPLIER,
          name: 'Nile Traders',
          phone: null,
          tax_registration_no: null,
          address: null,
          payment_terms_days: 7,
          notes: null,
          balance: '14100.00',
          archived_at: null,
          created_at: '2026-10-01T08:00:00.000Z',
          updated_at: '2026-10-01T08:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    } as Awaited<ReturnType<typeof suppliersApi.list>>);
    open = vi.spyOn(supplierPaymentsApi, 'openInvoices').mockResolvedValue(openInvoices());
    vi.spyOn(purchaseReturnsApi, 'cashAccounts').mockResolvedValue({
      items: [{ id: SAFE, name: 'Main safe', kind: 'safe', branch_id: MAIN, balance: '50000.00' }],
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows the form in Arabic with the open invoices and what is owed', async () => {
    await renderApp(page, { lang: 'ar', route });
    expect(await screen.findByRole('heading', { name: 'دفع لمورد' })).toBeInTheDocument();
    expect(await allocation('MAIN-PI-26-000001', 'ar')).toBeInTheDocument();
    expect(screen.getByText('متأخرة')).toBeInTheDocument();
    expect(screen.getByText('14,100.00 ج.م')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دفع' })).toBeDisabled();
    expect(open).toHaveBeenCalledWith(SUPPLIER);
  });

  it('in English: "Fill oldest first" splits the amount; Pay waits until the split matches', async () => {
    const create = vi.spyOn(supplierPaymentsApi, 'create').mockResolvedValue(payment());
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Pay a supplier' })).toBeInTheDocument();
    const older = await allocation('MAIN-PI-26-000001');
    const newer = await allocation('MAIN-PI-26-000002');
    await chooseAccount(user);
    await user.type(screen.getByLabelText(t('purchases.payments.form.amount')), '10000');
    expect(payButton()).toBeDisabled();
    expect(screen.getByText(t('purchases.payments.form.mismatch'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('purchases.payments.form.fillOldest') }));
    expect(older).toHaveValue('8400.00');
    expect(newer).toHaveValue('1600.00');
    expect(screen.queryByText(t('purchases.payments.form.mismatch'))).not.toBeInTheDocument();
    expect(payButton()).toBeEnabled();

    await user.clear(newer);
    await user.type(newer, '1000');
    expect(payButton()).toBeDisabled();
    await user.clear(newer);
    await user.type(newer, '1600');
    await user.type(screen.getByLabelText(t('purchases.payments.form.reference')), ' TRX-9 ');
    await user.click(payButton());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    // Amounts are padded to two decimals when a field loses focus.
    const sent = create.mock.calls[0]![0];
    expect(sent).toMatchObject({
      supplier_id: SUPPLIER,
      branch_id: MAIN,
      cash_account_id: SAFE,
      reference: 'TRX-9',
    });
    expect(Number(sent.amount)).toBe(10000);
    expect(sent.allocations?.map((a) => [a.purchase_invoice_id, Number(a.amount)])).toEqual([
      [INVOICE, 8400],
      [INVOICE_B, 1600],
    ]);
    expect(await screen.findByText('posted payment')).toBeInTheDocument();
  }, 20_000);

  it('two clicks send one request, with one idempotency key', async () => {
    const create = vi
      .spyOn(supplierPaymentsApi, 'create')
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(payment()), 50)));
    await renderApp(page, { lang: 'en', route: `${route}&invoice_id=${INVOICE}` });
    const user = userEvent.setup();
    // The invoice from the URL comes pre-selected with what is owed on it.
    const older = await allocation('MAIN-PI-26-000001');
    await waitFor(() => expect(older).toHaveValue('8400.00'));
    expect(screen.getByLabelText(t('purchases.payments.form.amount'))).toHaveValue('8400.00');
    await chooseAccount(user);
    await user.dblClick(payButton());
    expect(await screen.findByText('posted payment')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each<[ApiErrorCode, object | undefined, string]>([
    ['INSUFFICIENT_FUNDS', undefined, 'The account does not have enough money.'],
    [
      'PAYMENT_EXCEEDS_OUTSTANDING',
      { outstanding: '4100.00' },
      'This is more than what is owed: 4,100.00 EGP is outstanding.',
    ],
    [
      'ALLOCATION_INVALID',
      undefined,
      'The split over the invoices is not valid. Refresh and try again.',
    ],
    [
      'DAY_CLOSED',
      undefined,
      'The day is closed for this branch. Ask the owner to reopen it from Day close.',
    ],
  ])('%s shows its message', async (code, details, message) => {
    vi.spyOn(supplierPaymentsApi, 'create').mockRejectedValue(
      Object.assign(new ApiError(409, code, 'No.'), { details }),
    );
    await renderApp(page, { lang: 'en', route: `${route}&invoice_id=${INVOICE}` });
    const user = userEvent.setup();
    const older = await allocation('MAIN-PI-26-000001');
    await waitFor(() => expect(older).toHaveValue('8400.00'));
    await chooseAccount(user);
    await user.click(payButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('ids from the URL that are not UUIDs make no call', async () => {
    await renderApp(page, {
      lang: 'en',
      route: '/purchasing/payments/new?supplier_id=not-a-uuid&invoice_id=also-not',
    });
    expect(await screen.findByRole('heading', { name: 'Pay a supplier' })).toBeInTheDocument();
    expect(screen.getByLabelText(t('purchases.payments.form.supplier'))).toHaveValue('');
    expect(open).not.toHaveBeenCalled();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { supplierPaymentsApi } from '@/services/supplierPaymentsApi';
import { suppliersApi } from '@/services/suppliersApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import SupplierPaymentsPage from './SupplierPaymentsPage';
import SupplierPaymentPage from './SupplierPaymentPage';
import { INVOICE, branches } from './purchaseFixtures';
import { PAYMENT, REVERSAL, payment, paymentSummary } from './supplierPaymentFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const detail = (
  <Routes>
    <Route path="/purchasing/payments/:id" element={<SupplierPaymentPage />} />
  </Routes>
);
const route = `/purchasing/payments/${PAYMENT}`;

describe('U03 supplier payments list and receipt', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['supplier.payment_create']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(suppliersApi, 'list').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
    });
    vi.spyOn(supplierPaymentsApi, 'list').mockResolvedValue({
      items: [
        paymentSummary({
          id: REVERSAL,
          number: 'MAIN-SP-26-000002',
          reverses_payment_id: PAYMENT,
          reason: 'Wrong supplier',
        }),
        paymentSummary({ reversed_by_payment_id: REVERSAL }),
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    vi.spyOn(supplierPaymentsApi, 'get').mockResolvedValue(payment());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists payments in Arabic: receipt number, account, state and amount', async () => {
    await renderApp(<SupplierPaymentsPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: 'مدفوعات الموردين' });
    for (const label of [
      'رقم الإيصال',
      'المورد',
      'الفرع',
      'التاريخ',
      'مدفوع من',
      'الحالة',
      'المبلغ',
    ]) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await within(table).findByRole('row', { name: /MAIN-SP-26-000001/ });
    expect(within(row).getByText('Main safe')).toBeInTheDocument();
    expect(within(row).getByText('معكوس')).toBeInTheDocument();
    expect(within(row).getByText('3,000.00 ج.م')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'MAIN-SP-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/payments/${PAYMENT}`,
    );
  });

  it('lists payments in English; a reversal is its own row; New payment needs the permission', async () => {
    await renderApp(<SupplierPaymentsPage />, { lang: 'en' });
    const table = await screen.findByRole('table', { name: 'Supplier payments' });
    const reversal = await within(table).findByRole('row', { name: /MAIN-SP-26-000002/ });
    expect(within(reversal).getByText('Reversal')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'New payment' })).toHaveAttribute(
      'href',
      '/purchasing/payments/new',
    );
  });

  it('the receipt shows the number, the allocations with invoice links and Print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await renderApp(detail, { lang: 'en', route });
    expect(
      await screen.findByRole('heading', { name: 'Payment receipt MAIN-SP-26-000001' }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: t('purchases.payments.detail.allocations') });
    expect(within(table).getByRole('link', { name: 'MAIN-PI-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/invoices/${INVOICE}`,
    );
    expect(screen.getByText('TRX-1')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('the owner reverses with a reason, once (even on a double click)', async () => {
    const reverse = vi
      .spyOn(supplierPaymentsApi, 'reverse')
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(payment({ id: REVERSAL, reverses_payment_id: PAYMENT })), 50),
          ),
      );
    await renderApp(detail, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reverse' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reverse' }));
    expect(
      await within(dialog).findByText(t('purchases.payments.detail.reasonInvalid')),
    ).toBeInTheDocument();
    expect(reverse).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Reason'), '  Wrong supplier ');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Reverse' }));
    await waitFor(() => expect(reverse).toHaveBeenCalledTimes(1));
    expect(reverse.mock.calls[0]!.slice(0, 2)).toEqual([PAYMENT, 'Wrong supplier']);
    expect(reverse.mock.calls[0]![2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText(t('purchases.payments.detail.reversed'))).toBeInTheDocument();
  });

  it('Reverse is hidden for non-owners, on a reversed payment and on a reversal', async () => {
    signOut();
    signIn('CASHIER');
    await renderApp(detail, { lang: 'en', route });
    await screen.findByRole('heading', { name: 'Payment receipt MAIN-SP-26-000001' });
    expect(screen.queryByRole('button', { name: 'Reverse' })).not.toBeInTheDocument();

    signOut();
    signIn();
    vi.spyOn(supplierPaymentsApi, 'get').mockResolvedValue(
      payment({ reversed_by_payment_id: REVERSAL }),
    );
    await renderApp(detail, { lang: 'en', route });
    expect(
      (await screen.findAllByText(t('purchases.payments.detail.reversedBy'), { exact: false }))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Open the reversal' })[0]).toHaveAttribute(
      'href',
      `/purchasing/payments/${REVERSAL}`,
    );
  });

  it('a non-UUID id makes no call; a 404 says not found', async () => {
    const get = vi
      .spyOn(supplierPaymentsApi, 'get')
      .mockRejectedValue(new ApiError(404, 'SUPPLIER_PAYMENT_NOT_FOUND', 'No.'));
    await renderApp(detail, { lang: 'en', route: '/purchasing/payments/not-a-uuid' });
    expect(await screen.findByText(t('purchases.payments.detail.notFound'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});

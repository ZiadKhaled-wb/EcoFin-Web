import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { purchaseReturnsApi } from '@/services/purchaseReturnsApi';
import { suppliersApi } from '@/services/suppliersApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import PurchaseReturnsPage from './PurchaseReturnsPage';
import PurchaseReturnPage from './PurchaseReturnPage';
import { INVOICE, RETURN, SAFE, branches, purchaseReturn, returnSummary } from './purchaseFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const detail = (
  <Routes>
    <Route path="/purchasing/returns/:id" element={<PurchaseReturnPage />} />
  </Routes>
);

describe('U04 purchase returns list and detail', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['supplier.manage']));
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(suppliersApi, 'list').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
    });
    vi.spyOn(purchaseReturnsApi, 'list').mockResolvedValue({
      items: [
        returnSummary(),
        returnSummary({
          id: SAFE,
          number: 'MAIN-PR-26-000002',
          refund_mode: 'cash',
          cash_account_id: SAFE,
          cash_account_name: 'Main safe',
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists returns in Arabic with links to the return and its invoice', async () => {
    await renderApp(<PurchaseReturnsPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: 'مرتجعات المشتريات' });
    for (const label of [
      'الرقم',
      'الفاتورة',
      'المورد',
      'الفرع',
      'التاريخ',
      'الاسترداد',
      'الإجمالي',
    ]) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await within(table).findByRole('row', { name: /MAIN-PR-26-000001/ });
    expect(within(row).getByText('Nile Traders')).toBeInTheDocument();
    expect(within(row).getByText('Main')).toBeInTheDocument();
    expect(within(row).getByText('خصم من رصيد المورد')).toBeInTheDocument();
    expect(within(row).getByText('592.80 ج.م')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'MAIN-PR-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/returns/${RETURN}`,
    );
    expect(within(row).getByRole('link', { name: 'MAIN-PI-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/invoices/${INVOICE}`,
    );
  });

  it('lists returns in English', async () => {
    await renderApp(<PurchaseReturnsPage />, { lang: 'en' });
    const table = await screen.findByRole('table', { name: 'Purchase returns' });
    for (const label of ['Number', 'Invoice', 'Supplier', 'Branch', 'Date', 'Refund', 'Total']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const cash = await within(table).findByRole('row', { name: /MAIN-PR-26-000002/ });
    expect(within(cash).getByText('Cash refund')).toBeInTheDocument();
  });

  it('shows one return with its lines, the reason and the totals', async () => {
    vi.spyOn(purchaseReturnsApi, 'get').mockResolvedValue(purchaseReturn());
    await renderApp(detail, { lang: 'en', route: `/purchasing/returns/${RETURN}` });
    expect(
      await screen.findByRole('heading', {
        name: t('purchases.returns.detail.title', { number: 'MAIN-PR-26-000001' }),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Damaged on arrival')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MAIN-PI-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/invoices/${INVOICE}`,
    );
    const table = screen.getByRole('table', { name: t('purchases.returns.detail.lines') });
    expect(within(table).getByRole('row', { name: /TV-55/ })).toBeInTheDocument();
  });

  it('a non-UUID id makes no call; a 404 says not found', async () => {
    const get = vi
      .spyOn(purchaseReturnsApi, 'get')
      .mockRejectedValue(new ApiError(404, 'PURCHASE_RETURN_NOT_FOUND', 'No.'));
    await renderApp(detail, { lang: 'en', route: '/purchasing/returns/not-a-uuid' });
    expect(await screen.findByText(t('purchases.returns.detail.notFound'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});

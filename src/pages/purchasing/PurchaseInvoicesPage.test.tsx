import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { suppliersApi } from '@/services/suppliersApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import PurchaseInvoicesPage from './PurchaseInvoicesPage';
import { INVOICE, MAIN, SUPPLIER, branches, summary } from './purchaseFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const list = (items: ReturnType<typeof summary>[]) => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
});
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
async function invoiceRow() {
  const table = await screen.findByRole('table', { name: t('purchases.title') });
  return within(table).findByRole('row', { name: /MAIN-PI-26-000001/ });
}

describe('U02 purchase invoices list', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['purchase.invoice_create', 'purchase.invoice_approve']);
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(suppliersApi, 'list').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
    });
    vi.spyOn(purchaseInvoicesApi, 'list').mockResolvedValue(
      list([
        summary(),
        summary({
          id: SUPPLIER,
          number: 'MAIN-PI-26-000002',
          status: 'approved',
          outstanding: '3534.00',
        }),
      ]),
    );
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists invoices in Arabic with the old labels', async () => {
    await renderApp(<PurchaseInvoicesPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: t('purchases.title') });
    for (const label of ['الرقم', 'رقم فاتورة المورد', 'المورد', 'الفرع', 'الإجمالي', 'المتبقي']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await invoiceRow();
    expect(within(row).getByText('Nile Traders')).toBeInTheDocument();
    expect(within(row).getByText('Main')).toBeInTheDocument();
    expect(within(row).getByText('مسودة')).toBeInTheDocument();
    expect(within(row).getByText('3,534.00 ج.م')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'MAIN-PI-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/invoices/${INVOICE}`,
    );
  });

  it('lists invoices in English with the outstanding amount once approved', async () => {
    await renderApp(<PurchaseInvoicesPage />, { lang: 'en' });
    const table = await screen.findByRole('table', { name: t('purchases.title') });
    const approved = await within(table).findByRole('row', { name: /MAIN-PI-26-000002/ });
    expect(within(approved).getByText('Approved')).toBeInTheDocument();
    expect(within(approved).getAllByText('3,534.00 EGP')).toHaveLength(2);
    expect(within(await invoiceRow()).getByText('S-100')).toHaveAttribute('dir', 'ltr');
  });

  it('sends the status, branch and search filters', async () => {
    const api = vi.spyOn(purchaseInvoicesApi, 'list');
    await renderApp(<PurchaseInvoicesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await invoiceRow();
    await user.selectOptions(screen.getByLabelText(t('purchases.filters.status')), 'approved');
    await user.selectOptions(screen.getByLabelText(t('purchases.filters.branch')), MAIN);
    await user.type(
      screen.getByRole('searchbox', { name: t('purchases.filters.search') }),
      ' s-1 ',
    );
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith({
        status: 'approved',
        branch_id: MAIN,
        search: 's-1',
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it('shows "New invoice" only with purchase.invoice_create', async () => {
    await renderApp(<PurchaseInvoicesPage />, { lang: 'en' });
    expect(await screen.findByRole('link', { name: t('purchases.new') })).toHaveAttribute(
      'href',
      '/purchasing/invoices/new',
    );
  });

  it('hides "New invoice" without purchase.invoice_create', async () => {
    setPermissions(['report.financial']);
    await renderApp(<PurchaseInvoicesPage />, { lang: 'en' });
    await invoiceRow();
    expect(screen.queryByRole('link', { name: t('purchases.new') })).not.toBeInTheDocument();
  });
});

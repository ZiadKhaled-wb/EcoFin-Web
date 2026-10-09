import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import PurchaseApprovalsPage from './PurchaseApprovalsPage';
import { INVOICE, approval, branches, summary } from './purchaseFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const item = (over: Parameters<typeof approval>[0] = {}) => ({
  approval: approval(over),
  invoice: { ...summary({ status: 'pending_approval' }), approval: approval(over) },
});
const list = (items: ReturnType<typeof item>[]) => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
});

describe('U06 purchase approvals page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['purchase.invoice_approve']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(purchaseInvoicesApi, 'approvals').mockResolvedValue(list([item()]));
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the waiting invoices in Arabic', async () => {
    await renderApp(<PurchaseApprovalsPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: t('purchases.approvals.title') });
    for (const label of ['الفاتورة', 'المورد', 'الإجمالي', 'الحد', 'طلبها']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await within(table).findByRole('row', { name: /MAIN-PI-26-000001/ });
    expect(within(row).getByText('Nile Traders')).toBeInTheDocument();
    expect(within(row).getByText('3,534.00 ج.م')).toBeInTheDocument();
    expect(within(row).getByText('1,000.00 ج.م')).toBeInTheDocument();
    expect(within(row).getByText('Manager')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'MAIN-PI-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/invoices/${INVOICE}`,
    );
  });

  it('lists in English; the status filter shows decided ones with the note', async () => {
    const api = vi.spyOn(purchaseInvoicesApi, 'approvals');
    await renderApp(<PurchaseApprovalsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByRole('row', { name: /MAIN-PI-26-000001/ });
    expect(api).toHaveBeenLastCalledWith({ status: 'pending', page: 1, pageSize: 20 });
    api.mockResolvedValue(
      list([
        item({
          status: 'approved',
          decided_by_name: 'Owner',
          decided_at: '2026-10-11T10:00:00.000Z',
          note: 'Checked with the supplier',
        }),
      ]),
    );
    await user.selectOptions(screen.getByLabelText(t('purchases.approvals.status')), 'approved');
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith({ status: 'approved', page: 1, pageSize: 20 }),
    );
    expect(await screen.findByText('Checked with the supplier')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Decided by' })).toBeInTheDocument();
  });
});

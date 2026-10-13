import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import userEvent from '@testing-library/user-event';
import { SaleHistoryDetails } from '@ziadkhaled-wb/contracts';
import { renderApp } from '@/test/renderApp';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import SalesHistoryPage from './SalesHistoryPage';
import SaleHistoryActions from './SaleHistoryActions';
const ID = 'a7070000-0000-4000-8000-000000000001';
const permissions = vi.hoisted(() => ({ allowed: true }));
vi.mock('@/features/me/useCan', () => ({ useCan: () => permissions.allowed }));
vi.mock('@/features/me/useBranches', () => ({
  useBranches: () => ({ data: [{ id: ID, name: 'Main' }] }),
}));
vi.mock('@/features/me/useMe', () => ({
  useMe: () => ({ data: { org: { timezone: 'Africa/Cairo' } } }),
}));
vi.mock('@/services/salesHistoryApi', () => ({
  salesHistoryApi: { list: vi.fn(), get: vi.fn(), void: vi.fn() },
}));
const sale = SaleHistoryDetails.parse({
  id: ID,
  number: 'SL-1',
  branch_id: ID,
  shift_id: null,
  shift_number: null,
  customer_id: null,
  customer_name: null,
  prices_include_vat: true,
  subtotal: '100.00',
  discount_total: '0.00',
  discount_reason: null,
  tax_total: '0.00',
  total: '100.00',
  business_date: '2026-10-12',
  issued_at: '2026-10-12T10:00:00Z',
  created_by_name: 'Owner',
  lines: [],
  payments: [],
  paid_total: '100.00',
  change_total: '0.00',
  branch: { id: ID, name: 'Main' },
  cashier: { id: ID, name: 'Owner' },
  customer: null,
  status: 'completed',
  voidable: true,
  void_block_reason: null,
  returns: [],
});
beforeEach(() => {
  permissions.allowed = true;
  vi.clearAllMocks();
});
describe('S07 history UI', () => {
  it('lists computed statuses and marks voided sales red', async () => {
    vi.mocked(salesHistoryApi.list).mockResolvedValue({
      items: [
        {
          id: ID,
          number: 'SL-1',
          issued_at: sale.issued_at,
          business_date: sale.business_date,
          branch: sale.branch,
          cashier: sale.cashier!,
          customer: null,
          total: sale.total,
          status: 'voided',
          items_count: 1,
        },
      ],
      total: 1,
    });
    await renderApp(<SalesHistoryPage />, { lang: 'en' });
    expect(await screen.findByRole('link', { name: 'SL-1' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Voided')).toHaveClass('badge-danger');
  });
  it('requires a reason and keeps one key per dialog open; successful void refreshes cached history/detail', async () => {
    vi.mocked(salesHistoryApi.void).mockResolvedValue({ return_id: ID, number: 'RT-1' });
    const invalidation = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const user = userEvent.setup();
    await renderApp(<SaleHistoryActions sale={sale} />, { lang: 'en' });
    await user.click(screen.getByRole('button', { name: 'Void sale' }));
    await user.click(screen.getByRole('button', { name: 'Confirm void' }));
    expect(salesHistoryApi.void).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Reason'), 'Duplicate receipt');
    await user.click(screen.getByRole('button', { name: 'Confirm void' }));
    expect(salesHistoryApi.void).toHaveBeenCalledWith(
      ID,
      'Duplicate receipt',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(await screen.findByText('Sale voided')).toBeInTheDocument();
    expect(invalidation).toHaveBeenCalledWith({
      queryKey: ['sales', useAuthStore.getState().orgId],
    });
    invalidation.mockRestore();
  });
  it('shows the block hint and hides Void without permission', async () => {
    permissions.allowed = false;
    await renderApp(
      <SaleHistoryActions
        sale={{ ...sale, voidable: false, void_block_reason: 'PERMISSION_DENIED' }}
      />,
      { lang: 'en' },
    );
    expect(screen.queryByRole('button', { name: 'Void sale' })).not.toBeInTheDocument();
    expect(screen.getByText('You do not have permission to void this sale.')).toBeInTheDocument();
  });
  it('a voided detail keeps the reversal number, reason and red badge', async () => {
    await renderApp(
      <SaleHistoryActions
        sale={{
          ...sale,
          status: 'voided',
          voidable: false,
          void_block_reason: 'ALREADY_VOIDED',
          returns: [
            {
              id: ID,
              number: 'RT-1',
              kind: 'void',
              total: '100.00',
              reason: 'Duplicate receipt',
              by: 'Owner',
              at: sale.issued_at,
            },
          ],
        }}
      />,
      { lang: 'en' },
    );
    expect(screen.getByText('Voided')).toHaveClass('badge-danger');
    expect(screen.getByText('RT-1')).toBeInTheDocument();
    expect(screen.getByText('Duplicate receipt')).toBeInTheDocument();
  });
});

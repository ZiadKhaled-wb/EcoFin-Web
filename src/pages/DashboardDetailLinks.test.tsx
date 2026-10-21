import { screen, waitFor } from '@testing-library/react';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { cashApi } from '@/services/cashApi';
import { overdueApi } from '@/services/overdueApi';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { shiftsApi } from '@/services/shiftsApi';
import { walletsApi } from '@/services/walletsApi';
import {
  BRANCH_MAIN,
  BRANCH_TWO,
  meFixture,
  permissionsFixture,
  renderApp,
  signIn,
  signOut,
} from '@/test/renderApp';
import { setLanguage } from '@/i18n';
import ShiftsPage from './accounting/ShiftsPage';
import VaultsPage from './accounting/VaultsPage';
import OverduePage from './installments/OverduePage';
import WalletsPage from './installments/WalletsPage';
import SalesHistoryPage from './sales/SalesHistoryPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

/**
 * D01 (decision 8): every link of the owner dashboard opens its page already filtered. The pages
 * read the filters from the URL; anything that is not a well-formed value is dropped.
 */
function setup(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
  vi.spyOn(branchApi, 'list').mockResolvedValue([
    { id: BRANCH_MAIN, code: 'B1', name: 'Main branch', is_main: true },
    { id: BRANCH_TWO, code: 'B2', name: 'Second branch', is_main: false },
  ] as Awaited<ReturnType<typeof branchApi.list>>);
}
const lastArg = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.at(-1)?.[0];

describe('D01 dashboard links open the detail pages filtered', () => {
  beforeEach(() => signIn());
  afterEach(async () => {
    signOut();
    vi.restoreAllMocks();
    await setLanguage('ar');
  });

  it('sales history: ?from=&to=&branch_id= is today of that branch', async () => {
    setup(['report.view']);
    const list = vi.spyOn(salesHistoryApi, 'list').mockResolvedValue({ items: [], total: 0 });
    await renderApp(<SalesHistoryPage />, {
      lang: 'en',
      route: `/sales/history?from=2026-10-21&to=2026-10-21&branch_id=${BRANCH_TWO}`,
    });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastArg(list)).toMatchObject({
      from: '2026-10-21',
      to: '2026-10-21',
      branch_id: BRANCH_TWO,
    });
  });

  it('sales history: a bad branch or date in the URL is dropped (today, all branches)', async () => {
    setup(['report.view']);
    const list = vi.spyOn(salesHistoryApi, 'list').mockResolvedValue({ items: [], total: 0 });
    await renderApp(<SalesHistoryPage />, {
      lang: 'en',
      route: '/sales/history?from=yesterday&branch_id=not-an-id',
    });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastArg(list)).not.toHaveProperty('branch_id');
    expect(lastArg(list)).toMatchObject({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('vaults: ?branch_id= lists the safes and banks of that branch', async () => {
    setup(['cash.view']);
    const list = vi.spyOn(cashApi, 'list').mockResolvedValue([]);
    await renderApp(<VaultsPage />, {
      lang: 'en',
      route: `/accounting/vaults?branch_id=${BRANCH_TWO}`,
    });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastArg(list)).toMatchObject({ status: 'active', branch_id: BRANCH_TWO });
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveValue(BRANCH_TWO);
  });

  it('shifts: ?status=open&branch_id= lists the open shifts of that branch', async () => {
    setup(['cash.view', 'shift.operate']);
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(null);
    const list = vi
      .spyOn(shiftsApi, 'list')
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await renderApp(<ShiftsPage />, {
      lang: 'en',
      route: `/accounting/shifts?status=open&branch_id=${BRANCH_TWO}`,
    });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastArg(list)).toMatchObject({ status: 'open', branch_id: BRANCH_TWO });
  });

  it('shifts: an unknown status in the URL is dropped', async () => {
    setup(['cash.view', 'shift.operate']);
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(null);
    const list = vi
      .spyOn(shiftsApi, 'list')
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await renderApp(<ShiftsPage />, { lang: 'en', route: '/accounting/shifts?status=everything' });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastArg(list)).not.toHaveProperty('status');
  });

  it('wallets: ?branch_id= lists the wallets of that branch and offers the picker', async () => {
    setup(['cash.view', 'collector.settle']);
    const list = vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [] });
    await renderApp(<WalletsPage />, {
      lang: 'en',
      route: `/installments/wallets?branch_id=${BRANCH_TWO}`,
    });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ branch_id: BRANCH_TWO }));
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveValue(BRANCH_TWO);
  });

  it('wallets: without a branch the list is every wallet', async () => {
    setup(['cash.view', 'collector.settle']);
    const list = vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [] });
    await renderApp(<WalletsPage />, { lang: 'en', route: '/installments/wallets' });
    await waitFor(() => expect(list).toHaveBeenCalledWith({}));
  });

  it('overdue: ?branch_id= filters the contracts of that branch', async () => {
    setup(['overdue.view']);
    const list = vi.spyOn(overdueApi, 'list').mockResolvedValue({
      items: [],
      next_cursor: null,
      totals: {
        contracts: 0,
        overdue_amount: '0.00',
        late_1_30: '0.00',
        late_31_60: '0.00',
        late_61_90: '0.00',
        late_90_plus: '0.00',
      },
    });
    await renderApp(<OverduePage />, {
      lang: 'en',
      route: `/installments/overdue?branch_id=${BRANCH_TWO}`,
    });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(lastArg(list)).toMatchObject({ branch_id: BRANCH_TWO });
  });
});

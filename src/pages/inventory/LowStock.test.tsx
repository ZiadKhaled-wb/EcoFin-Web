import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BranchMinLevels, LowStockSummary, StockRow } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { categoriesApi } from '@/services/categoriesApi';
import { stockApi } from '@/services/stockApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import DashboardPage from '@/pages/DashboardPage';
import StockPage from './StockPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0a00000-0000-4000-8000-000000000001';
const SECOND = 'a0a00000-0000-4000-8000-000000000002';
const CABLE = 'a0a00000-0000-4000-8000-000000000003';

const summary: LowStockSummary = {
  total: 3,
  branches: [
    { branch_id: MAIN, low: 2 },
    { branch_id: SECOND, low: 1 },
  ],
  items: [
    {
      product_id: CABLE,
      name_ar: 'كابل',
      name_en: 'Cable',
      sku: 'CB-1',
      branch_id: MAIN,
      available: 2,
      min_level: 10,
      shortage: 8,
    },
  ],
};
const row: StockRow = {
  product_id: CABLE,
  name_ar: 'كابل',
  name_en: 'Cable',
  sku: 'CB-1',
  barcode: null,
  category_id: null,
  is_serialized: false,
  archived_at: null,
  branch_id: MAIN,
  on_hand: 2,
  reserved: 0,
  available: 2,
  damaged: 0,
  in_transit: 0,
  min_level: 10,
  min_source: 'branch',
  low: true,
};
const levels = (main: number | null): BranchMinLevels => ({
  product_id: CABLE,
  product_min_stock: 4,
  shop_min_stock: 3,
  branches: [
    {
      branch_id: MAIN,
      min_stock: main,
      min_level: main ?? 4,
      min_source: main === null ? 'product' : 'branch',
    },
    { branch_id: SECOND, min_stock: null, min_level: 4, min_source: 'product' },
  ],
});
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 50, total: items.length });

beforeEach(() => {
  signIn();
  vi.spyOn(branchApi, 'list').mockResolvedValue([
    { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    { id: SECOND, code: 'B2', name: 'Second', is_main: false },
  ]);
  vi.spyOn(categoriesApi, 'list').mockResolvedValue([]);
  vi.spyOn(stockApi, 'list').mockResolvedValue(page([row]));
  vi.spyOn(stockApi, 'lowSummary').mockResolvedValue(summary);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe('I06 dashboard card', () => {
  it.each(['ar', 'en'] as const)(
    'Done when: a product below its min level is on the dashboard (%s)',
    async (lang) => {
      vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
      await renderApp(<DashboardPage />, { lang });
      const perBranch = await screen.findByRole('list', { name: t('stock.lowCard.perBranch') });
      expect(within(perBranch).getByRole('link', { name: /Main/ })).toHaveAttribute(
        'href',
        `/inventory/stock?low=1&branch_id=${MAIN}`,
      );
      const biggest = screen.getByRole('list', { name: t('stock.lowCard.biggest') });
      expect(
        within(biggest).getByText(t('stock.lowCard.short', { count: '8' })),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: t('stock.lowCard.viewAll', { count: '3' }) }),
      ).toHaveAttribute('href', '/inventory/stock?low=1');
    },
  );

  it('says when nothing is low', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
    vi.spyOn(stockApi, 'lowSummary').mockResolvedValue({ total: 0, branches: [], items: [] });
    await renderApp(<DashboardPage />, { lang: 'en' });
    expect(await screen.findByText(t('stock.lowCard.none'))).toBeInTheDocument();
  });

  it('is not shown without stock.view', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture([]));
    await renderApp(<DashboardPage />, { lang: 'en' });
    await screen.findByRole('heading', { name: t('nav.dashboard') });
    await waitFor(() => expect(meApi.permissions).toHaveBeenCalled());
    expect(screen.queryByText(t('stock.lowCard.title'))).not.toBeInTheDocument();
    expect(stockApi.lowSummary).not.toHaveBeenCalled();
  });
});

describe('I06 low list and per-branch levels', () => {
  it('Done when: the card link opens the low list of the branch; a bad branch id is ignored', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
    await renderApp(<StockPage />, { lang: 'en', route: `/?low=1&branch_id=${MAIN}` });
    await waitFor(() =>
      expect(stockApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ low_only: true, branch_id: MAIN }),
      ),
    );
    const table = await screen.findByRole('table', { name: t('stock.title') });
    expect(within(table).getByText(t('stock.minSource.branch'))).toBeInTheDocument();
    // No catalog.manage: no min-level button.
    expect(
      within(table).queryByRole('button', { name: t('stock.minLevels.open') }),
    ).not.toBeInTheDocument();
  });

  it('ignores a branch id that is not a UUID', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
    await renderApp(<StockPage />, { lang: 'en', route: '/?low=1&branch_id=..%2Fx' });
    await waitFor(() => expect(stockApi.list).toHaveBeenCalled());
    expect(vi.mocked(stockApi.list).mock.calls[0]![0]).not.toHaveProperty('branch_id');
  });

  it('sets a branch level, then goes back to the default (catalog.manage)', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['stock.view', 'catalog.manage']),
    );
    // The refetch after saving reads the new level.
    vi.spyOn(stockApi, 'minLevels')
      .mockResolvedValueOnce(levels(null))
      .mockResolvedValue(levels(8));
    const set = vi
      .spyOn(stockApi, 'setMinLevel')
      .mockResolvedValueOnce(levels(8))
      .mockResolvedValueOnce(levels(null));
    await renderApp(<StockPage />, { lang: 'en' });
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: t('stock.title') });
    await user.click(within(table).getByRole('button', { name: t('stock.minLevels.open') }));
    const dialog = await screen.findByRole('dialog', {
      name: t('stock.minLevels.title', { name: 'كابل' }),
    });
    const input = await within(dialog).findByLabelText(
      t('stock.minLevels.input', { branch: 'Main' }),
    );
    const mainRow = within(dialog).getByRole('row', { name: /Main/ });
    const save = within(mainRow).getByRole('button', { name: t('stock.minLevels.save') });
    expect(save).toBeDisabled();
    await user.type(input, '2000000');
    expect(save).toBeDisabled();
    expect(within(dialog).getByText(t('stock.minLevels.errors.invalid'))).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '8');
    await user.click(save);
    await waitFor(() => expect(set).toHaveBeenCalledWith(CABLE, { branch_id: MAIN, min_stock: 8 }));
    expect(await screen.findByText(t('stock.minLevels.saved'))).toBeInTheDocument();
    await user.click(
      await within(dialog).findByRole('button', { name: t('stock.minLevels.useDefault') }),
    );
    await waitFor(() =>
      expect(set).toHaveBeenLastCalledWith(CABLE, { branch_id: MAIN, min_stock: null }),
    );
  });

  it('a branch the user does not work in is refused with a message', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['stock.view', 'catalog.manage']),
    );
    vi.spyOn(stockApi, 'minLevels').mockResolvedValue(levels(null));
    vi.spyOn(stockApi, 'setMinLevel').mockRejectedValue(
      new ApiError(403, 'BRANCH_DENIED', 'Branch denied.'),
    );
    await renderApp(<StockPage />, { lang: 'en' });
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: t('stock.title') });
    await user.click(within(table).getByRole('button', { name: t('stock.minLevels.open') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      await within(dialog).findByLabelText(t('stock.minLevels.input', { branch: 'Second' })),
      '5',
    );
    await user.click(
      within(within(dialog).getByRole('row', { name: /Second/ })).getByRole('button', {
        name: t('stock.minLevels.save'),
      }),
    );
    expect(await screen.findByText(t('stock.minLevels.errors.denied'))).toBeInTheDocument();
  });
});

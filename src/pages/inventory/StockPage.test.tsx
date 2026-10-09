import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StockMovement, StockRow } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { categoriesApi } from '@/services/categoriesApi';
import { stockApi } from '@/services/stockApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import StockPage from './StockPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0900000-0000-4000-8000-000000000001';
const SECOND = 'a0900000-0000-4000-8000-000000000002';
const TV = 'a0900000-0000-4000-8000-000000000003';
const CATEGORY = 'a0900000-0000-4000-8000-000000000004';

const row = (over: Partial<StockRow> = {}): StockRow => ({
  product_id: TV,
  name_ar: 'تلفزيون',
  name_en: 'Television',
  sku: 'TV-55',
  barcode: null,
  category_id: null,
  is_serialized: false,
  archived_at: null,
  branch_id: MAIN,
  on_hand: 5,
  reserved: 2,
  available: 3,
  damaged: 1,
  in_transit: 0,
  min_level: 3,
  min_source: 'shop',
  low: false,
  ...over,
});
const movement = (over: Partial<StockMovement> = {}): StockMovement => ({
  id: 'a0900000-0000-4000-8000-000000000010',
  created_at: '2026-10-09T08:00:00.000Z',
  business_date: '2026-10-09',
  product_id: 'a0900000-0000-4000-8000-000000000012',
  product_name_ar: 'تلفزيون',
  product_name_en: 'TV',
  sku: 'TV-1',
  branch_id: MAIN,
  unit_id: null,
  type: 'purchase_in',
  stock_state: 'sellable',
  quantity: 10,
  balance_after: 10,
  serial: null,
  source_type: 'purchase_invoice',
  source_id: 'a0900000-0000-4000-8000-000000000011',
  source_number: null,
  party: null,
  reason: null,
  reverses_movement_id: null,
  created_by_name: 'Owner',
  ...over,
});
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 50, total: items.length });

async function stockTable() {
  const table = await screen.findByRole('table', { name: t('stock.title') });
  return table;
}

describe('I01 stock page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
      { id: SECOND, code: 'B2', name: 'Second', is_main: false },
    ]);
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([
      {
        id: CATEGORY,
        name: 'Screens',
        parent_id: null,
        archived_at: null,
        active_product_count: 1,
        created_at: '2026-10-09T08:00:00.000Z',
        updated_at: '2026-10-09T08:00:00.000Z',
      },
    ]);
    vi.spyOn(stockApi, 'list').mockResolvedValue(
      page([
        row(),
        row({
          branch_id: SECOND,
          on_hand: 0,
          reserved: 0,
          available: 0,
          damaged: 0,
          in_transit: 3,
          low: true,
        }),
      ]),
    );
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)(
    'shows on hand, reserved, available and in transit (%s)',
    async (lang) => {
      await renderApp(<StockPage />, { lang });
      const table = await stockTable();
      for (const key of [
        'onHand',
        'reserved',
        'available',
        'inTransit',
        'damaged',
        'minLevel',
      ] as const) {
        expect(
          within(table).getByRole('columnheader', { name: t(`stock.columns.${key}`) }),
        ).toBeInTheDocument();
      }
      const main = within(table).getByRole('row', { name: /Main/ });
      const cells = within(main)
        .getAllByRole('cell')
        .map((c) => c.textContent);
      // product, sku, branch, on hand, reserved, available, in transit, damaged, min, status
      expect(cells.slice(2, 8)).toEqual(['Main', '5', '2', '3', '0', '1']);
      // I06: the min level and where it comes from.
      expect(cells[8]).toBe(`3${t('stock.minSource.shop')}`);
      expect(within(main).getByText(t('stock.ok'))).toBeInTheDocument();
      const second = within(table).getByRole('row', { name: /Second/ });
      expect(within(second).getByText(t('stock.low'))).toBeInTheDocument();
    },
  );

  it('U05: low stock of one branch offers Create purchase order (with purchase.order_manage)', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['stock.view', 'purchase.order_manage']),
    );
    await renderApp(<StockPage />, { lang: 'en', route: `/?low=1&branch_id=${MAIN}` });
    expect(await screen.findByRole('link', { name: 'Create purchase order' })).toHaveAttribute(
      'href',
      `/purchasing/orders/new?branch_id=${MAIN}&from=low`,
    );
  });

  it('U05: no Create purchase order without the permission or without one branch', async () => {
    await renderApp(<StockPage />, { lang: 'en', route: `/?low=1&branch_id=${MAIN}` });
    await stockTable();
    expect(screen.queryByRole('link', { name: 'Create purchase order' })).not.toBeInTheDocument();
  });

  it('sends the branch, category, search and low-stock filters', async () => {
    const list = vi.spyOn(stockApi, 'list');
    await renderApp(<StockPage />, { lang: 'en' });
    const user = userEvent.setup();
    await stockTable();
    await user.selectOptions(screen.getByLabelText(t('stock.branch')), SECOND);
    await user.selectOptions(screen.getByLabelText(t('stock.category')), CATEGORY);
    await user.click(screen.getByLabelText(t('stock.lowOnly')));
    await user.type(screen.getByRole('searchbox', { name: t('stock.search') }), 'tv');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        branch_id: SECOND,
        category_id: CATEGORY,
        include_subcategories: true,
        search: 'tv',
        low_only: true,
        page: 1,
        pageSize: 50,
      }),
    );
  });

  it('opens the movements of a row with the running balance', async () => {
    const movements = vi.spyOn(stockApi, 'movements').mockResolvedValue(
      page([
        movement({
          id: 'a0900000-0000-4000-8000-000000000012',
          type: 'sale_out',
          quantity: -5,
          balance_after: 5,
        }),
        movement(),
      ]),
    );
    await renderApp(<StockPage />, { lang: 'en' });
    const user = userEvent.setup();
    const table = await stockTable();
    const main = within(table).getByRole('row', { name: /Main/ });
    await user.click(within(main).getByRole('button', { name: t('stock.movements') }));
    expect(movements).toHaveBeenCalledWith({
      product_id: TV,
      branch_id: MAIN,
      page: 1,
      pageSize: 20,
    });
    const drawer = await screen.findByRole('dialog');
    const history = await within(drawer).findByRole('table');
    const rows = within(history).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText(t('stock.types.sale_out'))).toBeInTheDocument();
    expect(within(rows[0]!).getByText('-5')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('+10')).toBeInTheDocument();
    // I02: an adjustment movement names its reason and document.
    movements.mockResolvedValue(
      page([
        movement({
          type: 'adjustment',
          quantity: -1,
          balance_after: 4,
          source_type: 'stock_adjustment',
          source_number: 'B1-SA-26-000001',
          reason: 'damage',
        }),
      ]),
    );
    await user.selectOptions(within(drawer).getByLabelText(t('stock.branch')), SECOND);
    expect(
      await within(drawer).findByText(
        `${t('stock.types.adjustment')} · ${t('stock.reasons.damage')}`,
      ),
    ).toBeInTheDocument();
    expect(within(drawer).getByText('B1-SA-26-000001')).toBeInTheDocument();
    // All branches: the branch filter is cleared.
    await user.selectOptions(within(drawer).getByLabelText(t('stock.branch')), '');
    await waitFor(() =>
      expect(movements).toHaveBeenLastCalledWith({ product_id: TV, page: 1, pageSize: 20 }),
    );
  });
});

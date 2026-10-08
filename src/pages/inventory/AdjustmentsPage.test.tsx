import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Product, StockAdjustment, StockAdjustmentSummary } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { productsApi } from '@/services/productsApi';
import { stockApi } from '@/services/stockApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import AdjustmentsPage from './AdjustmentsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0a00000-0000-4000-8000-000000000001';
const CABLE = 'a0a00000-0000-4000-8000-000000000002';
const PHONE = 'a0a00000-0000-4000-8000-000000000003';
const UNIT = 'a0a00000-0000-4000-8000-000000000004';
const ADJ = 'a0a00000-0000-4000-8000-000000000005';

const summary = (over: Partial<StockAdjustmentSummary> = {}): StockAdjustmentSummary => ({
  id: ADJ,
  number: 'MAIN-SA-26-000001',
  branch_id: MAIN,
  reason: 'damage',
  note: 'Broken box',
  count_id: null,
  count_number: null,
  created_at: '2026-10-10T08:00:00.000Z',
  created_by_name: 'Owner',
  lines_count: 1,
  quantity_in: 0,
  quantity_out: 2,
  ...over,
});
const adjustment: StockAdjustment = {
  ...summary(),
  lines: [
    {
      id: 'a0a00000-0000-4000-8000-000000000006',
      product_id: CABLE,
      name_ar: 'كابل',
      name_en: 'Cable',
      sku: 'CB-1',
      unit_id: null,
      serial: null,
      quantity: -2,
    },
  ],
};
const product = (over: Partial<Product> = {}): Product => ({
  id: CABLE,
  name_ar: 'كابل',
  name_en: 'Cable',
  sku: 'CB-1',
  barcode: '2000000000015',
  category_id: null,
  unit_of_measure: 'piece',
  cash_price: '5.00',
  installment_price: null,
  avg_cost: '0.0000',
  tax_class_id: 'a0a00000-0000-4000-8000-000000000009',
  warranty_months: 0,
  is_serialized: false,
  min_stock: 0,
  image_file_id: null,
  eta_item_code: null,
  eta_item_type: null,
  archived_at: null,
  created_at: '2026-10-10T08:00:00.000Z',
  updated_at: '2026-10-10T08:00:00.000Z',
  ...over,
});
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 50, total: items.length });

describe('I02 adjustments page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['stock.view', 'stock.adjust']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ]);
    vi.spyOn(stockApi, 'adjustments').mockResolvedValue(
      page([
        summary(),
        summary({
          id: 'a0a00000-0000-4000-8000-000000000007',
          reason: 'count',
          count_number: 'MAIN-SC-26-000001',
          note: null,
          number: 'MAIN-SA-26-000002',
        }),
      ]),
    );
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)('lists adjustments with reason and totals (%s)', async (lang) => {
    await renderApp(<AdjustmentsPage />, { lang });
    const table = await screen.findByRole('table', { name: t('stock.adjustments.title') });
    const first = within(table).getByRole('row', { name: /MAIN-SA-26-000001/ });
    expect(within(first).getByText(t('stock.reasons.damage'))).toBeInTheDocument();
    expect(within(first).getByText('-2')).toBeInTheDocument();
    const fromCount = within(table).getByRole('row', { name: /MAIN-SA-26-000002/ });
    expect(
      within(fromCount).getByText(
        t('stock.adjustments.fromCount', { number: 'MAIN-SC-26-000001' }),
      ),
    ).toBeInTheDocument();
  });

  it('filters by reason and opens the lines', async () => {
    const list = vi.spyOn(stockApi, 'adjustments');
    vi.spyOn(stockApi, 'adjustment').mockResolvedValue(adjustment);
    await renderApp(<AdjustmentsPage />, { lang: 'en' });
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: t('stock.adjustments.title') });
    await user.selectOptions(screen.getByLabelText(t('stock.adjustments.reason')), 'count');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ reason: 'count', page: 1, pageSize: 50 }),
    );
    const first = within(table).getByRole('row', { name: /MAIN-SA-26-000001/ });
    await user.click(within(first).getByRole('button', { name: t('stock.adjustments.view') }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Cable')).toBeInTheDocument();
    expect(within(drawer).getByText('-2')).toBeInTheDocument();
  });

  it('posts a damage adjustment as negative quantities with one idempotency key', async () => {
    vi.spyOn(productsApi, 'list').mockResolvedValue({ ...page([product()]), pageSize: 8 });
    const post = vi
      .spyOn(stockApi, 'postAdjustment')
      .mockRejectedValueOnce(new ApiError(409, 'OUT_OF_STOCK', 'Out of stock.'))
      .mockResolvedValueOnce(adjustment);
    await renderApp(<AdjustmentsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.adjustments.new') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('searchbox', { name: t('stock.adjustments.form.search') }),
      'cable',
    );
    await user.click(
      await within(dialog).findByRole('button', { name: t('stock.adjustments.form.add') }),
    );
    const qty = within(dialog).getByLabelText(t('stock.adjustments.form.quantity'));
    await user.clear(qty);
    await user.type(qty, '2');
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.adjustments.form.submit') }),
    );
    expect(
      await within(dialog).findByText(t('stock.adjustments.errors.outOfStock')),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.adjustments.form.submit') }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const [body, key] = post.mock.calls[0]!;
    expect(body).toEqual({
      branch_id: MAIN,
      reason: 'damage',
      lines: [{ product_id: CABLE, quantity: -2 }],
    });
    // A retry after an error reuses the key, so the server posts at most once.
    expect(post.mock.calls[1]![1]).toBe(key);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a found serial: picks written-off units and sends +1 with the unit', async () => {
    vi.spyOn(productsApi, 'list').mockResolvedValue({
      ...page([product({ id: PHONE, sku: 'PH-1', name_en: 'Phone', is_serialized: true })]),
      pageSize: 8,
    });
    const units = vi
      .spyOn(productsApi, 'units')
      .mockResolvedValue([{ id: UNIT, serial: 'SN-1', branch_id: MAIN, status: 'written_off' }]);
    const post = vi.spyOn(stockApi, 'postAdjustment').mockResolvedValue(adjustment);
    await renderApp(<AdjustmentsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.adjustments.new') }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText(t('stock.adjustments.form.reason')),
      'found',
    );
    await user.type(
      within(dialog).getByRole('searchbox', { name: t('stock.adjustments.form.search') }),
      'phone',
    );
    await user.click(
      await within(dialog).findByRole('button', { name: t('stock.adjustments.form.chooseUnits') }),
    );
    expect(units).toHaveBeenCalledWith(PHONE, 'written_off');
    await user.click(await screen.findByLabelText('SN-1'));
    await user.click(screen.getByRole('button', { name: t('stock.adjustments.form.addUnits') }));
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.adjustments.form.submit') }),
    );
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![0]).toEqual({
      branch_id: MAIN,
      reason: 'found',
      lines: [{ product_id: PHONE, unit_id: UNIT, quantity: 1 }],
    });
  });

  it('hides the new button without stock.adjust', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
    await renderApp(<AdjustmentsPage />, { lang: 'en' });
    await screen.findByRole('table', { name: t('stock.adjustments.title') });
    expect(screen.queryByRole('button', { name: t('stock.adjustments.new') })).toBeNull();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { StockCount, StockCountDetail, StockCountLine } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { categoriesApi } from '@/services/categoriesApi';
import { stockApi } from '@/services/stockApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import CountSheetPage from './CountSheetPage';
import CountsPage from './CountsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0b00000-0000-4000-8000-000000000001';
const COUNT = 'a0b00000-0000-4000-8000-000000000002';
const CABLE = 'a0b00000-0000-4000-8000-000000000003';
const PHONE = 'a0b00000-0000-4000-8000-000000000004';
const UNIT = 'a0b00000-0000-4000-8000-000000000005';

const count = (over: Partial<StockCount> = {}): StockCount => ({
  id: COUNT,
  number: 'MAIN-SC-26-000001',
  branch_id: MAIN,
  category_id: null,
  category_name: null,
  status: 'open',
  created_at: '2026-10-10T08:00:00.000Z',
  created_by_name: 'Keeper',
  posted_at: null,
  posted_by_name: null,
  adjustment_id: null,
  adjustment_number: null,
  lines_total: 2,
  lines_counted: 0,
  lines_different: 0,
  quantity_in: 0,
  quantity_out: 0,
  ...over,
});
const cable: StockCountLine = {
  id: 'a0b00000-0000-4000-8000-000000000010',
  product_id: CABLE,
  name_ar: 'كابل',
  name_en: 'Cable',
  sku: 'CB-1',
  barcode: '2000000000015',
  is_serialized: false,
  unit_id: null,
  serial: null,
  expected_qty: 8,
  counted_qty: null,
  difference: null,
};
const phone: StockCountLine = {
  ...cable,
  id: 'a0b00000-0000-4000-8000-000000000011',
  product_id: PHONE,
  name_ar: 'موبايل',
  name_en: 'Phone',
  sku: 'PH-1',
  barcode: null,
  is_serialized: true,
  unit_id: UNIT,
  serial: 'SN-1',
  expected_qty: 1,
};
const detail = (over: Partial<StockCount> = {}, lines = [cable, phone]): StockCountDetail => ({
  ...count(over),
  lines: { items: lines, page: 1, pageSize: 50, total: lines.length },
});
const route = `/inventory/counts/${COUNT}`;
const sheet = (
  <Routes>
    <Route path="/inventory/counts/:id" element={<CountSheetPage />} />
  </Routes>
);

describe('I02 count sheet', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.count']));
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ]);
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([]);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)('shows the sheet with expected and counted (%s)', async (lang) => {
    vi.spyOn(stockApi, 'count').mockResolvedValue(detail());
    await renderApp(sheet, { lang, route });
    expect(
      await screen.findByRole('heading', {
        name: t('stock.counts.sheet.title', { number: 'MAIN-SC-26-000001' }),
      }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', {
      name: t('stock.counts.sheet.title', { number: 'MAIN-SC-26-000001' }),
    });
    const row = within(table).getByRole('row', { name: /CB-1/ });
    expect(within(row).getByText('8')).toBeInTheDocument();
    expect(within(table).getByText('SN-1')).toBeInTheDocument();
    expect(screen.getByText(t('stock.counts.sheet.liveHint'))).toBeInTheDocument();
  });

  it('scans a code, then saves typed counts (null for cleared) and the unit status', async () => {
    vi.spyOn(stockApi, 'count').mockResolvedValue(detail());
    const scan = vi
      .spyOn(stockApi, 'scan')
      .mockRejectedValueOnce(new ApiError(404, 'PRODUCT_NOT_FOUND', 'Not found.'))
      .mockResolvedValueOnce({ ...cable, counted_qty: 1, difference: -7 });
    const save = vi.spyOn(stockApi, 'saveCountLines').mockResolvedValue(count());
    await renderApp(sheet, { lang: 'en', route });
    const user = userEvent.setup();
    const input = await screen.findByLabelText(t('stock.counts.sheet.scan'));
    await user.type(input, 'NOPE{Enter}');
    expect(await screen.findByText(t('stock.counts.errors.notFound'))).toBeInTheDocument();
    await user.type(input, '2000000000015{Enter}');
    expect(scan).toHaveBeenLastCalledWith(COUNT, '2000000000015');
    expect(
      await screen.findByText(t('stock.counts.sheet.scanned', { name: 'Cable', counted: '1' })),
    ).toBeInTheDocument();

    const table = screen.getByRole('table', {
      name: t('stock.counts.sheet.title', { number: 'MAIN-SC-26-000001' }),
    });
    const cableRow = within(table).getByRole('row', { name: /CB-1/ });
    await user.type(within(cableRow).getByRole('textbox'), '6');
    expect(within(cableRow).getByText('-2')).toBeInTheDocument();
    const phoneRow = within(table).getByRole('row', { name: /PH-1/ });
    await user.selectOptions(within(phoneRow).getByRole('combobox'), '0');
    // Unsaved changes: posting waits for a save.
    expect(screen.getByRole('button', { name: t('stock.counts.sheet.post') })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: t('stock.counts.sheet.save') }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(COUNT, [
        { product_id: CABLE, counted_qty: 6 },
        { product_id: PHONE, unit_id: UNIT, counted_qty: 0 },
      ]),
    );
  });

  it('posting with uncounted lines asks to treat them as zero, with one key', async () => {
    vi.spyOn(stockApi, 'count').mockResolvedValue(
      detail({ lines_counted: 1, lines_different: 1, quantity_out: 2 }),
    );
    const post = vi
      .spyOn(stockApi, 'postCount')
      .mockRejectedValueOnce(new ApiError(409, 'OUT_OF_STOCK', 'Out of stock.'))
      .mockResolvedValueOnce(
        count({ status: 'posted', adjustment_id: COUNT, adjustment_number: 'MAIN-SA-26-000003' }),
      );
    await renderApp(sheet, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.counts.sheet.post') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('stock.counts.sheet.uncounted', { count: 1 }))).toBeVisible();
    const confirm = within(dialog).getByRole('button', { name: t('stock.counts.sheet.post') });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByLabelText(t('stock.counts.sheet.uncountedAsZero')));
    await user.click(confirm);
    expect(await within(dialog).findByText(t('stock.counts.errors.outOfStock'))).toBeVisible();
    await user.click(confirm);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[0]!.slice(0, 2)).toEqual([COUNT, true]);
    expect(post.mock.calls[1]![2]).toBe(post.mock.calls[0]![2]);
  });

  it('a posted count is read only and names its adjustment', async () => {
    vi.spyOn(stockApi, 'count').mockResolvedValue(
      detail({ status: 'posted', adjustment_id: COUNT, adjustment_number: 'MAIN-SA-26-000003' }, [
        { ...cable, counted_qty: 6, difference: -2 },
      ]),
    );
    await renderApp(sheet, { lang: 'ar', route });
    expect(
      await screen.findByText(t('stock.counts.sheet.adjustment', { number: 'MAIN-SA-26-000003' })),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(t('stock.counts.sheet.scan'))).toBeNull();
    expect(screen.queryByRole('button', { name: t('stock.counts.sheet.post') })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /CB-1|Cable|كابل/ })).toBeNull();
  });

  it('cancels an open count after confirming', async () => {
    vi.spyOn(stockApi, 'count').mockResolvedValue(detail());
    const cancel = vi
      .spyOn(stockApi, 'cancelCount')
      .mockResolvedValue(count({ status: 'cancelled' }));
    await renderApp(sheet, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.counts.sheet.cancel') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.counts.sheet.cancelConfirm') }),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(COUNT));
  });
});

describe('I02 counts list', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.count']));
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ]);
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([]);
    vi.spyOn(stockApi, 'counts').mockResolvedValue({
      items: [count({ lines_counted: 1 })],
      page: 1,
      pageSize: 50,
      total: 1,
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)('lists counts and starts a new one (%s)', async (lang) => {
    const create = vi
      .spyOn(stockApi, 'createCount')
      .mockRejectedValueOnce(new ApiError(409, 'STOCK_COUNT_OPEN', 'Open.'));
    await renderApp(<CountsPage />, { lang });
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: t('stock.counts.title') });
    const row = within(table).getByRole('row', { name: /MAIN-SC-26-000001/ });
    expect(within(row).getByText(t('stock.counts.statuses.open'))).toBeInTheDocument();
    expect(within(row).getByText(t('stock.counts.wholeBranch'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('stock.counts.new') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('stock.counts.form.submit') }));
    expect(await within(dialog).findByText(t('stock.counts.errors.open'))).toBeVisible();
    expect(create.mock.calls[0]![0]).toEqual({ branch_id: MAIN });
  });
});

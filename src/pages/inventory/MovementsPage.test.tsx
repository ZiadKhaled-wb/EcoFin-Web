import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { StockAdjustment, StockMovement } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { stockApi } from '@/services/stockApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import AdjustmentsPage from './AdjustmentsPage';
import MovementsPage from './MovementsPage';
import { movementsCsv } from './movementShared';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0f00000-0000-4000-8000-000000000001';
const TV = 'a0f00000-0000-4000-8000-000000000002';
const ADJ = 'a0f00000-0000-4000-8000-000000000003';
const TR = 'a0f00000-0000-4000-8000-000000000004';
const UNIT = 'a0f00000-0000-4000-8000-000000000005';

let n = 0;
const movement = (over: Partial<StockMovement> = {}): StockMovement => ({
  id: `a0f00000-0000-4000-8000-0000000001${String(++n).padStart(2, '0')}`,
  created_at: '2026-10-09T08:00:00.000Z',
  business_date: '2026-10-09',
  product_id: TV,
  product_name_ar: 'تلفزيون',
  product_name_en: 'TV',
  sku: 'TV-1',
  branch_id: MAIN,
  unit_id: null,
  serial: null,
  type: 'adjustment',
  stock_state: 'sellable',
  quantity: 3,
  balance_after: 3,
  source_type: 'stock_adjustment',
  source_id: ADJ,
  source_number: 'MAIN-SA-26-000001',
  party: null,
  reason: 'found',
  reverses_movement_id: null,
  created_by_name: 'Owner',
  ...over,
});
const rows = [
  movement(),
  movement({
    type: 'transfer_out',
    quantity: -1,
    balance_after: 2,
    source_type: 'transfer',
    source_id: TR,
    source_number: 'MAIN-TR-26-000001',
    party: 'Main → Second',
    reason: null,
  }),
  movement({
    type: 'opening',
    unit_id: UNIT,
    serial: 'IMEI-A',
    quantity: 1,
    balance_after: 1,
    source_type: 'import',
    source_id: 'a0f00000-0000-4000-8000-000000000006',
    source_number: null,
    reason: null,
  }),
  movement({
    type: 'sale_out',
    quantity: -1,
    balance_after: 0,
    source_type: 'sale',
    source_id: 'a0f00000-0000-4000-8000-000000000007',
    source_number: 'MAIN-SL-26-000009',
    party: 'Mona Buyer',
    reason: null,
  }),
];
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 50, total: items.length });
const routes = (
  <Routes>
    <Route path="/inventory/movements" element={<MovementsPage />} />
    <Route path="/inventory/adjustments" element={<AdjustmentsPage />} />
    <Route path="/inventory/transfers/:id" element={<p>transfer page</p>} />
    <Route path="/inventory/units/:id" element={<p>unit page</p>} />
  </Routes>
);
const historyTable = () => screen.findByRole('table', { name: t('stock.history.title') });

describe('I05 movement history', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ]);
    vi.spyOn(stockApi, 'movements').mockResolvedValue(page(rows));
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)(
    'Done when: every movement links to the document that caused it (%s)',
    async (lang) => {
      await renderApp(routes, { lang, route: '/inventory/movements' });
      const table = await historyTable();
      const adj = within(table).getByRole('link', {
        name: t('stock.history.openDocument', { document: 'MAIN-SA-26-000001' }),
      });
      expect(adj).toHaveAttribute('href', `/inventory/adjustments?view=${ADJ}`);
      expect(
        within(table).getByRole('link', {
          name: t('stock.history.openDocument', { document: 'MAIN-TR-26-000001' }),
        }),
      ).toHaveAttribute('href', `/inventory/transfers/${TR}`);
      expect(
        within(table).getByRole('link', {
          name: t('stock.history.openDocument', {
            document: t('stock.history.documents.import'),
          }),
        }),
      ).toHaveAttribute('href', `/inventory/units/${UNIT}`);
      // A sale has no screen until S01: its number is shown, not linked.
      const sale = within(table).getByRole('row', { name: /MAIN-SL-26-000009/ });
      expect(within(sale).queryByRole('link')).toBeNull();
      expect(within(sale).getByText('Mona Buyer')).toBeInTheDocument();
      expect(within(sale).getByText(t('stock.types.sale_out'))).toBeInTheDocument();
      const transfer = within(table).getByRole('row', { name: /MAIN-TR-26-000001/ });
      expect(within(transfer).getByText('Main → Second')).toBeInTheDocument();
      expect(
        within(table).getByText(`${t('stock.types.adjustment')} · ${t('stock.reasons.found')}`),
      ).toBeInTheDocument();
      // No export.data: no export button.
      expect(
        screen.queryByRole('button', { name: t('stock.history.export.button') }),
      ).not.toBeInTheDocument();
    },
  );

  it('reads its filters from the URL and sends them; a branch change goes to page 1', async () => {
    await renderApp(routes, {
      lang: 'en',
      route: `/inventory/movements?product_id=${TV}&type=sales&serial=IMEI-A&from=2026-10-01&to=2026-10-09&page=2`,
    });
    await historyTable();
    expect(stockApi.movements).toHaveBeenCalledWith({
      product_id: TV,
      serial: 'IMEI-A',
      types: ['sale_out', 'delivery_out'],
      from: '2026-10-01',
      to: '2026-10-09',
      page: 2,
      pageSize: 50,
    });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(t('stock.branch')), MAIN);
    await waitFor(() =>
      expect(stockApi.movements).toHaveBeenLastCalledWith(
        expect.objectContaining({ branch_id: MAIN, page: 1 }),
      ),
    );
  });

  it('exports the filtered rows as a CSV (with export.data)', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['stock.view', 'export.data']),
    );
    const exported = vi
      .spyOn(stockApi, 'exportMovements')
      .mockResolvedValue({ items: rows, total: rows.length });
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:movements';
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await renderApp(routes, { lang: 'en', route: '/inventory/movements?type=adjustments' });
    await historyTable();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.history.export.button') }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(exported).toHaveBeenCalledWith({ types: ['adjustment'] });
    const text = await blobs[0]!.text();
    expect(text.split('\r\n')[0]).toContain(t('stock.history.csv.balance'));
    expect(text).toContain('MAIN-TR-26-000001');
    expect(
      await screen.findByText(t('stock.history.export.done', { count: '4' })),
    ).toBeInTheDocument();
  });

  it('too many rows: says how many and the limit', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['stock.view', 'export.data']),
    );
    vi.spyOn(stockApi, 'exportMovements').mockRejectedValue(
      Object.assign(new ApiError(422, 'EXPORT_TOO_LARGE', 'Too large.'), {
        details: { total: 12000, limit: 10000 },
      }),
    );
    await renderApp(routes, { lang: 'en', route: '/inventory/movements' });
    await historyTable();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.history.export.button') }));
    expect(
      await screen.findByText(
        t('stock.history.export.tooLarge', { total: '12,000', limit: '10,000' }),
      ),
    ).toBeInTheDocument();
  });

  it('a document link opens the adjustment it names', async () => {
    const adjustment: StockAdjustment = {
      id: ADJ,
      number: 'MAIN-SA-26-000001',
      branch_id: MAIN,
      reason: 'found',
      note: null,
      count_id: null,
      count_number: null,
      created_at: '2026-10-09T08:00:00.000Z',
      created_by_name: 'Owner',
      lines_count: 0,
      quantity_in: 3,
      quantity_out: 0,
      lines: [],
    };
    vi.spyOn(stockApi, 'adjustments').mockResolvedValue(page([]));
    vi.spyOn(stockApi, 'adjustment').mockResolvedValue(adjustment);
    await renderApp(routes, { lang: 'en', route: '/inventory/movements' });
    const user = userEvent.setup();
    await user.click(
      within(await historyTable()).getByRole('link', {
        name: t('stock.history.openDocument', { document: 'MAIN-SA-26-000001' }),
      }),
    );
    expect(
      await screen.findByRole('dialog', {
        name: t('stock.adjustments.detailTitle', { number: 'MAIN-SA-26-000001' }),
      }),
    ).toBeInTheDocument();
    expect(stockApi.adjustment).toHaveBeenCalledWith(ADJ);
  });
});

describe('I05 CSV', () => {
  it('starts with a BOM, keeps commas and quotes, and defuses formulas', () => {
    const csv = movementsCsv(
      [movement({ party: '=HYPERLINK("x")', created_by_name: 'Ali, Sr.', quantity: -2 })],
      () => 'Main',
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const line = csv.split('\r\n')[1]!;
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain('"Ali, Sr."');
    expect(line).toContain(',-2,');
  });
});

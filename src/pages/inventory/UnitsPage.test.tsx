import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { Product, UnitDetail, UnitSummary } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SerialFindBox from '@/components/layout/SerialFindBox';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { productsApi } from '@/services/productsApi';
import { unitsApi } from '@/services/unitsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import UnitPage from './UnitPage';
import UnitsPage from './UnitsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0e00000-0000-4000-8000-000000000001';
const PHONE = 'a0e00000-0000-4000-8000-000000000002';
const UNIT = 'a0e00000-0000-4000-8000-000000000003';

const summary = (over: Partial<UnitSummary> = {}): UnitSummary => ({
  id: UNIT,
  serial: 'IMEI-001',
  product_id: PHONE,
  name_ar: 'موبايل',
  name_en: 'Phone',
  sku: 'PH-1',
  branch_id: MAIN,
  branch_name: 'Main',
  status: 'in_stock',
  ...over,
});
const detail: UnitDetail = {
  ...summary({ status: 'sold' }),
  cost: '7000.50',
  created_at: '2026-10-10T08:00:00.000Z',
  purchase_invoice_id: null,
  purchase_invoice_number: null,
  supplier_name: null,
  history: [
    {
      id: 'a0e00000-0000-4000-8000-000000000010',
      created_at: '2026-10-10T08:00:00.000Z',
      business_date: '2026-10-10',
      type: 'opening',
      quantity: 1,
      branch_id: MAIN,
      branch_name: 'Main',
      source_type: 'import',
      source_id: 'a0e00000-0000-4000-8000-000000000011',
      source_number: null,
      party_name: null,
      reason: null,
      created_by_name: 'Owner',
    },
    {
      id: 'a0e00000-0000-4000-8000-000000000012',
      created_at: '2026-10-11T08:00:00.000Z',
      business_date: '2026-10-11',
      type: 'sale_out',
      quantity: -1,
      branch_id: MAIN,
      branch_name: 'Main',
      source_type: 'sale',
      source_id: 'a0e00000-0000-4000-8000-000000000013',
      source_number: 'MAIN-SL-26-000001',
      party_name: 'Mona Buyer',
      reason: null,
      created_by_name: 'Cashier',
    },
  ],
};
const phone: Product = {
  id: PHONE,
  name_ar: 'موبايل',
  name_en: 'Phone',
  sku: 'PH-1',
  barcode: null,
  category_id: null,
  unit_of_measure: 'piece',
  cash_price: '9000.00',
  installment_price: null,
  avg_cost: '0.0000',
  tax_class_id: 'a0e00000-0000-4000-8000-000000000009',
  warranty_months: 12,
  is_serialized: true,
  min_stock: 0,
  image_file_id: null,
  eta_item_code: null,
  eta_item_type: null,
  archived_at: null,
  created_at: '2026-10-10T08:00:00.000Z',
  updated_at: '2026-10-10T08:00:00.000Z',
};
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 50, total: items.length });
const routes = (
  <Routes>
    <Route path="/" element={<UnitsPage />} />
    <Route path="/inventory/units" element={<UnitsPage />} />
    <Route path="/inventory/units/:id" element={<UnitPage />} />
  </Routes>
);

describe('I04 serial units', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['stock.view', 'stock.adjust']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ]);
    vi.spyOn(unitsApi, 'search').mockResolvedValue(page([summary()]));
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)(
    'lists serials with product, branch and status (%s)',
    async (lang) => {
      await renderApp(<UnitsPage />, { lang });
      const table = await screen.findByRole('table', { name: t('stock.units.title') });
      const row = within(table).getByRole('row', { name: /IMEI-001/ });
      expect(within(row).getByText('Main')).toBeInTheDocument();
      expect(within(row).getByText(t('stock.units.statuses.in_stock'))).toBeInTheDocument();
    },
  );

  it('the header box opens a unit by its serial, with its history and buyer', async () => {
    const find = vi.spyOn(unitsApi, 'find').mockResolvedValue(detail);
    vi.spyOn(unitsApi, 'get').mockResolvedValue(detail);
    await renderApp(
      <>
        <SerialFindBox />
        {routes}
      </>,
      { lang: 'en' },
    );
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: t('stock.units.find.label') });
    await user.type(box, ' imei-001 {Enter}');
    await waitFor(() => expect(find).toHaveBeenCalledWith('imei-001'));
    expect(
      await screen.findByRole('heading', {
        name: t('stock.units.detail.title', { serial: 'IMEI-001' }),
      }),
    ).toBeInTheDocument();
    const history = screen.getByRole('table', {
      name: t('stock.units.detail.historyTitle', { serial: 'IMEI-001' }),
    });
    const sale = within(history).getByRole('row', { name: /MAIN-SL-26-000001/ });
    expect(within(sale).getByText('Mona Buyer')).toBeInTheDocument();
    expect(within(sale).getByText(t('stock.types.sale_out'))).toBeInTheDocument();
  });

  it('an unknown serial says so and lists similar ones', async () => {
    vi.spyOn(unitsApi, 'find').mockRejectedValue(new ApiError(404, 'UNIT_NOT_FOUND', 'Not found.'));
    await renderApp(routes, { lang: 'en', route: '/inventory/units?serial=IMEI-00' });
    expect(
      await screen.findByText(t('stock.units.notFound', { serial: 'IMEI-00' })),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(unitsApi.search).toHaveBeenLastCalledWith({
        search: 'IMEI-00',
        page: 1,
        pageSize: 50,
      }),
    );
  });

  it('registers scanned and typed serials with one key; a taken serial is named', async () => {
    vi.spyOn(productsApi, 'list').mockResolvedValue({ ...page([phone]), pageSize: 8 });
    const register = vi
      .spyOn(unitsApi, 'register')
      .mockRejectedValueOnce(
        Object.assign(new ApiError(409, 'SERIAL_TAKEN', 'Serial taken.'), {
          details: { serials: ['IMEI-002'] },
        }),
      )
      .mockResolvedValueOnce({
        import_job_id: UNIT,
        product_id: PHONE,
        branch_id: MAIN,
        cost: '7000.50',
        note: null,
        count: 2,
        units: [],
      });
    await renderApp(<UnitsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('stock.units.register.open') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('searchbox', { name: t('stock.units.register.productSearch') }),
      'phone',
    );
    await user.click(
      await within(dialog).findByRole('button', { name: t('stock.units.register.choose') }),
    );
    await user.type(within(dialog).getByLabelText(t('stock.units.register.cost')), '7000.50');
    await user.type(
      within(dialog).getByLabelText(t('stock.units.register.scan')),
      'imei-001{Enter}',
    );
    await user.type(
      within(dialog).getByLabelText(t('stock.units.register.serials')),
      '{End}{Enter}IMEI-002',
    );
    expect(within(dialog).getByText(t('stock.units.register.count', { count: 2 }))).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.units.register.submit') }),
    );
    expect(
      await within(dialog).findByText(t('stock.units.register.taken', { serials: 'IMEI-002' })),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: t('stock.units.register.submit') }),
    );
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    expect(register.mock.calls[0]![0]).toEqual({
      product_id: PHONE,
      branch_id: MAIN,
      cost: '7000.50',
      serials: ['IMEI-001', 'IMEI-002'],
    });
    expect(register.mock.calls[1]![1]).toBe(register.mock.calls[0]![1]);
  });

  it('without stock.adjust there is no register button', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['stock.view']));
    await renderApp(<UnitsPage />, { lang: 'en' });
    await screen.findByRole('table', { name: t('stock.units.title') });
    expect(screen.queryByRole('button', { name: t('stock.units.register.open') })).toBeNull();
  });
});

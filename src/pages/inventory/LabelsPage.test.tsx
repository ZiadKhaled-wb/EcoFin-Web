import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Product, ProductUnit } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { productsApi } from '@/services/productsApi';
import { ean13CheckDigit } from '@/lib/barcode';
import { t } from '@/i18n';
import LabelsPage from './LabelsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const TV_ID = 'a0700000-0000-4000-8000-000000000001';
const PHONE_ID = 'a0700000-0000-4000-8000-000000000002';
const BRANCH = 'a0700000-0000-4000-8000-000000000003';
const timestamp = '2026-10-08T09:00:00.000Z';
const EAN = '200000000001' + ean13CheckDigit('200000000001');

const product = (over: Partial<Product> = {}): Product => ({
  id: TV_ID,
  name_ar: 'تلفزيون',
  name_en: 'Television',
  sku: 'TV-55',
  barcode: EAN,
  category_id: null,
  unit_of_measure: 'piece',
  cash_price: '15000.00',
  installment_price: null,
  avg_cost: '0.0000',
  tax_class_id: 'a0700000-0000-4000-8000-000000000009',
  warranty_months: 0,
  is_serialized: false,
  min_stock: 0,
  image_file_id: null,
  eta_item_code: null,
  eta_item_type: null,
  archived_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});
const phone = product({
  id: PHONE_ID,
  name_ar: 'موبايل',
  name_en: 'Phone',
  sku: 'PH-1',
  barcode: null,
  is_serialized: true,
});
const unit = (serial: string, n: number): ProductUnit => ({
  id: `a0700000-0000-4000-8000-00000000010${n}`,
  serial,
  branch_id: BRANCH,
  status: 'in_stock',
});

function preview() {
  return screen.getByRole('region', { name: t('labels.preview') });
}

describe('C03 labels page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture([]));
    vi.spyOn(productsApi, 'list').mockResolvedValue({
      items: [product(), phone],
      page: 1,
      pageSize: 8,
      total: 2,
    });
    try {
      window.localStorage.removeItem('ecofin-label-template');
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('adds a product, sets the label count and prints (ar)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await renderApp(<LabelsPage />, { lang: 'ar' });
    const user = userEvent.setup();
    const addButtons = await screen.findAllByRole('button', { name: t('labels.addProduct') });
    expect(screen.getByRole('button', { name: t('labels.print') })).toBeDisabled();
    await user.click(addButtons[0]!);

    // One EAN-13 label with the price.
    const bars = within(preview()).getByRole('img', { name: EAN });
    expect(bars).toHaveAttribute('data-symbology', 'ean13');
    expect(screen.getByText(t('labels.count', { count: 1 }))).toBeInTheDocument();

    const qty = screen.getByLabelText(t('labels.quantity'));
    await user.clear(qty);
    await user.type(qty, '3');
    expect(screen.getByText(t('labels.count', { count: 3 }))).toBeInTheDocument();
    expect(within(preview()).getAllByRole('img', { name: EAN })).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: t('labels.print') }));
    expect(print).toHaveBeenCalled();
  });

  it('prints one Code 128 label per chosen unit, with its serial (en)', async () => {
    const units = vi
      .spyOn(productsApi, 'units')
      .mockResolvedValue([unit('356938035643809', 1), unit('356938035643817', 2)]);
    await renderApp(<LabelsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('labels.chooseUnits') }));
    expect(units).toHaveBeenCalledWith(PHONE_ID);
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByLabelText('356938035643809'));
    await user.click(within(dialog).getByLabelText('356938035643817'));
    await user.click(within(dialog).getByRole('button', { name: t('labels.addUnits') }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const bars = within(preview()).getAllByRole('img');
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      '356938035643809',
      '356938035643817',
    ]);
    expect(bars.every((b) => b.getAttribute('data-symbology') === 'code128')).toBe(true);
    expect(within(preview()).getAllByText('Phone')).toHaveLength(2);
  });

  it('shows a message when the product has no units', async () => {
    vi.spyOn(productsApi, 'units').mockResolvedValue([]);
    await renderApp(<LabelsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('labels.chooseUnits') }));
    expect(await screen.findByText(t('labels.noUnits'))).toBeInTheDocument();
  });

  it('remembers the template and can hide the price', async () => {
    await renderApp(<LabelsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: t('labels.addProduct') }))[0]!);
    expect(within(preview()).getByText(/15,000\.00/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(t('labels.template')), 'a4-3x8');
    expect(window.localStorage.getItem('ecofin-label-template')).toBe('a4-3x8');
    // The A4 template lays the labels out as a 3-column grid.
    expect(preview().querySelector('.grid')).not.toBeNull();
    await user.click(screen.getByLabelText(t('labels.showPrice')));
    expect(within(preview()).queryByText(/15,000\.00/)).not.toBeInTheDocument();
  });

  it('starts with the product given in the link', async () => {
    vi.spyOn(productsApi, 'get').mockResolvedValue(product());
    await renderApp(<LabelsPage />, { lang: 'en', route: `/inventory/labels?product=${TV_ID}` });
    expect(await screen.findByText(t('labels.count', { count: 1 }))).toBeInTheDocument();
    expect(productsApi.get).toHaveBeenCalledWith(TV_ID);
  });
});

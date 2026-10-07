import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Category, PermissionKey, Product, TaxClass } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { categoriesApi } from '@/services/categoriesApi';
import { productsApi } from '@/services/productsApi';
import { settingsApi } from '@/services/settingsApi';
import { taxClassesApi } from '@/services/taxClassesApi';
import { t } from '@/i18n';
import ProductsPage from './ProductsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const PRODUCT_ID = 'a0600000-0000-4000-8000-000000000001';
const CATEGORY_ID = 'a0600000-0000-4000-8000-000000000002';
const TAX_STD = 'a0600000-0000-4000-8000-000000000003';
const TAX_ZERO = 'a0600000-0000-4000-8000-000000000004';
const timestamp = '2026-10-08T09:00:00.000Z';

const product = (over: Partial<Product> = {}): Product => ({
  id: PRODUCT_ID,
  name_ar: 'تلفزيون سامسونج',
  name_en: 'Samsung TV',
  sku: 'TV-55',
  barcode: '2000000000015',
  category_id: CATEGORY_ID,
  unit_of_measure: 'piece',
  cash_price: '15000.00',
  installment_price: null,
  avg_cost: '12000.5000',
  tax_class_id: TAX_STD,
  warranty_months: 12,
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
const category: Category = {
  id: CATEGORY_ID,
  name: 'شاشات',
  parent_id: null,
  archived_at: null,
  active_product_count: 1,
  created_at: timestamp,
  updated_at: timestamp,
};
const taxClass = (id: string, name: string): TaxClass => ({
  id,
  name,
  kind: 'standard',
  rate: '14',
  eta_tax_type: 'T1',
  eta_subtype: 'V009',
  archived_at: null,
  updated_at: timestamp,
});

function page(items: Product[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
async function productRow() {
  const table = await screen.findByRole('table', { name: t('products.title') });
  return within(table).getByRole('row', { name: /TV-55/ });
}

describe('C02 products page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['catalog.manage', 'catalog.price_change']);
    vi.spyOn(productsApi, 'list').mockResolvedValue(page([product()]));
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([category]);
    vi.spyOn(taxClassesApi, 'list').mockResolvedValue([
      taxClass(TAX_STD, 'VAT 14%'),
      taxClass(TAX_ZERO, 'Zero rated'),
    ]);
    vi.spyOn(settingsApi, 'get').mockResolvedValue({
      default_tax_class_id: TAX_ZERO,
    } as Awaited<ReturnType<typeof settingsApi.get>>);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists products with the old Arabic labels', async () => {
    await renderApp(<ProductsPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: t('products.title') });
    for (const label of ['المنتج', 'الكود SKU', 'التصنيف', 'سعر التكلفة', 'السعر كاش']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await productRow();
    expect(within(row).getByText('تلفزيون سامسونج')).toBeInTheDocument();
    expect(within(row).getByText('Samsung TV')).toBeInTheDocument();
    expect(within(row).getByText('شاشات')).toBeInTheDocument();
    expect(within(row).getByText('VAT 14%')).toBeInTheDocument();
    expect(within(row).getByText(t('products.fromPolicy'))).toBeInTheDocument();
    expect(within(row).getByText('TV-55')).toHaveAttribute('dir', 'ltr');
  });

  it('sends the search and the category filter to the server', async () => {
    const list = vi.spyOn(productsApi, 'list');
    await renderApp(<ProductsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await productRow();
    await user.type(screen.getByRole('searchbox', { name: t('products.search') }), 'tv');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        search: 'tv',
        status: 'active',
        page: 1,
        pageSize: 20,
      }),
    );
    await user.selectOptions(screen.getByLabelText(t('products.category')), CATEGORY_ID);
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        search: 'tv',
        category_id: CATEGORY_ID,
        include_subcategories: true,
        status: 'active',
        page: 1,
        pageSize: 20,
      }),
    );
    await user.click(screen.getByLabelText(t('products.includeSubcategories')));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category_id: CATEGORY_ID, include_subcategories: false }),
      ),
    );
  });

  it.each(['ar', 'en'] as const)(
    'creates a product in %s without a barcode and with the default tax class',
    async (lang) => {
      const create = vi.spyOn(productsApi, 'create').mockResolvedValue(product());
      await renderApp(<ProductsPage />, { lang });
      const user = userEvent.setup();
      await productRow();
      await user.click(screen.getByRole('button', { name: t('products.add') }));
      expect(screen.getByLabelText(t('products.fields.taxClass'))).toHaveValue(TAX_ZERO);
      await user.type(screen.getByLabelText(t('products.fields.nameAr')), 'كابل');
      await user.type(screen.getByLabelText(t('products.fields.sku')), 'cb-1');
      expect(screen.getByLabelText(t('products.fields.sku'))).toHaveValue('CB-1');
      await user.type(screen.getByLabelText(t('products.fields.cashPrice')), '50');
      await user.click(screen.getByRole('button', { name: t('products.save') }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const body = create.mock.calls[0]![0];
      expect(body).toMatchObject({
        name_ar: 'كابل',
        sku: 'CB-1',
        cash_price: '50.00',
        tax_class_id: TAX_ZERO,
        unit_of_measure: t('products.units.piece'),
      });
      expect(body).not.toHaveProperty('barcode');
      expect(body).not.toHaveProperty('avg_cost');
    },
  );

  it('shows a duplicate SKU under the SKU field', async () => {
    vi.spyOn(productsApi, 'create').mockRejectedValue(
      new ApiError(409, 'PRODUCT_SKU_TAKEN', 'Duplicate SKU.'),
    );
    await renderApp(<ProductsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await productRow();
    await user.click(screen.getByRole('button', { name: t('products.add') }));
    await user.type(screen.getByLabelText(t('products.fields.nameAr')), 'x');
    await user.type(screen.getByLabelText(t('products.fields.sku')), 'TV-55');
    await user.type(screen.getByLabelText(t('products.fields.cashPrice')), '1');
    await user.click(screen.getByRole('button', { name: t('products.save') }));

    expect(await screen.findByText(t('products.errors.skuTaken'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('products.fields.sku'))).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the price fields on edit without catalog.price_change', async () => {
    setPermissions(['catalog.manage']);
    const update = vi.spyOn(productsApi, 'update').mockResolvedValue(product());
    await renderApp(<ProductsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await productRow()).getByRole('button', { name: t('products.editAction') }),
    );
    expect(screen.getByLabelText(t('products.fields.cashPrice'))).toBeDisabled();
    expect(screen.getByLabelText(t('products.fields.installmentPrice'))).toBeDisabled();
    expect(screen.getAllByText(t('products.fields.priceLocked')).length).toBeGreaterThan(0);
    // A rename still goes through, with only the changed key.
    await user.type(screen.getByLabelText(t('products.fields.nameEn')), ' 55');
    await user.click(screen.getByRole('button', { name: t('products.save') }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(PRODUCT_ID, { name_en: 'Samsung TV 55' }),
    );
  });

  it('asks for confirmation before archiving', async () => {
    const archive = vi
      .spyOn(productsApi, 'archive')
      .mockResolvedValue(product({ archived_at: timestamp }));
    await renderApp(<ProductsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await productRow()).getByRole('button', { name: t('products.archive') }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('products.archiveConfirm'))).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: t('products.archive') }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith(PRODUCT_ID));
  });

  it('shows a translated message when a restore is refused', async () => {
    vi.spyOn(productsApi, 'list').mockResolvedValue(page([product({ archived_at: timestamp })]));
    vi.spyOn(productsApi, 'restore').mockRejectedValue(
      new ApiError(409, 'PRODUCT_CATEGORY_ARCHIVED', 'Category archived.'),
    );
    await renderApp(<ProductsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await productRow()).getByRole('button', { name: t('products.restore') }),
    );
    expect(await screen.findByText(t('products.errors.categoryArchived'))).toBeInTheDocument();
  });

  it('hides the cost column and the write buttons without catalog.manage', async () => {
    setPermissions([]);
    await renderApp(<ProductsPage />, { lang: 'en' });
    const table = await screen.findByRole('table', { name: t('products.title') });
    await productRow();
    expect(
      within(table).queryByRole('columnheader', { name: t('products.columns.cost') }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('products.add') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('products.archive') })).not.toBeInTheDocument();
  });

  it('shows the cost column for catalog managers', async () => {
    await renderApp(<ProductsPage />, { lang: 'en' });
    const table = await screen.findByRole('table', { name: t('products.title') });
    await waitFor(() =>
      expect(
        within(table).getByRole('columnheader', { name: t('products.columns.cost') }),
      ).toBeInTheDocument(),
    );
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { productsApi } from '@/services/productsApi';
import { purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { suppliersApi } from '@/services/suppliersApi';
import { taxClassesApi } from '@/services/taxClassesApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import PurchaseInvoiceFormPage from './PurchaseInvoiceFormPage';
import {
  CHAIR,
  EXEMPT,
  MAIN,
  PHONE,
  STD,
  SUPPLIER,
  TV,
  branches,
  invoice,
  product,
  taxClasses,
} from './purchaseFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ts = '2026-10-11T08:00:00.000Z';
const routes = (
  <Routes>
    <Route path="/purchasing/invoices/new" element={<PurchaseInvoiceFormPage />} />
    <Route path="/purchasing/invoices/:id/edit" element={<PurchaseInvoiceFormPage />} />
    <Route path="/purchasing/invoices/:id" element={<p>invoice page</p>} />
  </Routes>
);
const tv = product();
const chair = product({
  id: CHAIR,
  name_ar: 'كرسي',
  name_en: 'Chair',
  sku: 'CH-1',
  tax_class_id: EXEMPT,
});
const phone = product({
  id: PHONE,
  name_ar: 'موبايل',
  name_en: 'Phone',
  sku: 'PH-1',
  is_serialized: true,
});

async function addProduct(user: ReturnType<typeof userEvent.setup>, name: string) {
  const search = screen.getByRole('searchbox', { name: t('purchases.form.search') });
  await user.clear(search);
  await user.type(search, name);
  // The result row with this name (toasts are list items too, so look for the Add button).
  const add = await waitFor(() => {
    const button = screen
      .getAllByRole('button', { name: t('purchases.form.add') })
      .find((b) => b.closest('li')?.textContent?.includes(name));
    if (!button) throw new Error(`no result for ${name}`);
    return button;
  });
  await user.click(add);
}
async function chooseSupplier(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'Nile Traders' });
  await user.selectOptions(screen.getByLabelText(t('purchases.form.supplier')), SUPPLIER);
}
async function setLine(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  quantity: string,
  cost: string,
) {
  const qty = screen.getByLabelText(`${t('purchases.form.quantity')}: ${name}`);
  await user.clear(qty);
  await user.type(qty, quantity);
  await user.type(screen.getByLabelText(`${t('purchases.form.unitCost')}: ${name}`), cost);
}

describe('U02 purchase invoice form', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['purchase.invoice_create']),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(taxClassesApi, 'list').mockResolvedValue(taxClasses);
    vi.spyOn(suppliersApi, 'list').mockResolvedValue({
      items: [
        {
          id: SUPPLIER,
          name: 'Nile Traders',
          phone: null,
          tax_registration_no: null,
          address: null,
          payment_terms_days: 0,
          notes: null,
          archived_at: null,
          created_at: ts,
          updated_at: ts,
          balance: '0.00',
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.spyOn(productsApi, 'list').mockResolvedValue({
      items: [tv, chair, phone],
      page: 1,
      pageSize: 8,
      total: 3,
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('live totals: a 14% line and an exempt line (the product class is the default)', async () => {
    await renderApp(routes, { lang: 'en', route: '/purchasing/invoices/new' });
    const user = userEvent.setup();
    await addProduct(user, 'TV');
    await setLine(user, 'TV', '10', '130');
    await addProduct(user, 'Chair');
    await setLine(user, 'Chair', '4', '55.50');
    expect(screen.getByLabelText(`${t('purchases.form.taxClass')}: Chair`)).toHaveValue(EXEMPT);
    expect(screen.getByTestId(`net-${TV}`)).toHaveTextContent('1,300.00 EGP');
    expect(screen.getByTestId(`vat-${TV}`)).toHaveTextContent('182.00 EGP');
    expect(screen.getByTestId(`vat-${CHAIR}`)).toHaveTextContent('0.00 EGP');
    expect(screen.getByTestId(`total-${CHAIR}`)).toHaveTextContent('222.00 EGP');
    expect(screen.getByTestId('doc-subtotal')).toHaveTextContent('1,522.00 EGP');
    expect(screen.getByTestId('doc-tax')).toHaveTextContent('182.00 EGP');
    expect(screen.getByTestId('doc-total')).toHaveTextContent('1,704.00 EGP');
    // Changing the class changes the VAT.
    await user.selectOptions(screen.getByLabelText(`${t('purchases.form.taxClass')}: Chair`), STD);
    expect(screen.getByTestId(`vat-${CHAIR}`)).toHaveTextContent('31.08 EGP');
  });

  it('creates with the same idempotency key on the second click', async () => {
    const create = vi
      .spyOn(purchaseInvoicesApi, 'create')
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Offline.'))
      .mockResolvedValueOnce(invoice());
    await renderApp(routes, { lang: 'en', route: '/purchasing/invoices/new' });
    const user = userEvent.setup();
    await chooseSupplier(user);
    await user.type(screen.getByLabelText(t('purchases.form.supplierInvoiceNo')), ' S-100 ');
    await addProduct(user, 'TV');
    await setLine(user, 'TV', '10', '130');
    const save = screen.getByRole('button', { name: t('purchases.form.save') });
    await user.click(save);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await user.click(save);
    expect(await screen.findByText('invoice page')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![1]).toBe(create.mock.calls[1]![1]);
    expect(create.mock.calls[0]![0]).toEqual({
      supplier_id: SUPPLIER,
      branch_id: MAIN,
      supplier_invoice_no: 'S-100',
      invoice_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown as string,
      lines: [{ product_id: TV, quantity: 10, unit_cost: '130.00', tax_class_id: STD }],
    });
  });

  it('checks the serial count of a serialized line before sending (ar)', async () => {
    const create = vi.spyOn(purchaseInvoicesApi, 'create');
    await renderApp(routes, { lang: 'ar', route: '/purchasing/invoices/new' });
    const user = userEvent.setup();
    await chooseSupplier(user);
    await addProduct(user, 'موبايل');
    await setLine(user, 'موبايل', '2', '900');
    const serials = screen.getByLabelText(`${t('purchases.form.serials')}: موبايل`);
    expect(screen.getByText(t('purchases.form.serialsLater'))).toBeInTheDocument();
    await user.type(serials, 'sn-1');
    expect(
      screen.getByText(t('purchases.form.serialsCount', { entered: 1, needed: '2' })),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('purchases.form.save') }));
    expect(await screen.findByText(t('purchases.errors.validation'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('sends the serials upper-cased when the count matches', async () => {
    const create = vi.spyOn(purchaseInvoicesApi, 'create').mockResolvedValue(invoice());
    await renderApp(routes, { lang: 'en', route: '/purchasing/invoices/new' });
    const user = userEvent.setup();
    await chooseSupplier(user);
    await addProduct(user, 'Phone');
    await setLine(user, 'Phone', '2', '900');
    await user.type(
      screen.getByLabelText(`${t('purchases.form.serials')}: Phone`),
      'sn-1{enter} SN-2 ',
    );
    await user.click(screen.getByRole('button', { name: t('purchases.form.save') }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0].lines[0]!.serials).toEqual(['SN-1', 'SN-2']);
  });

  it('shows a taken supplier invoice number on its field', async () => {
    vi.spyOn(purchaseInvoicesApi, 'create').mockRejectedValue(
      new ApiError(409, 'SUPPLIER_INVOICE_NO_TAKEN', 'Taken.'),
    );
    await renderApp(routes, { lang: 'en', route: '/purchasing/invoices/new' });
    const user = userEvent.setup();
    await chooseSupplier(user);
    await user.type(screen.getByLabelText(t('purchases.form.supplierInvoiceNo')), 'S-100');
    await addProduct(user, 'TV');
    await setLine(user, 'TV', '1', '1');
    await user.click(screen.getByRole('button', { name: t('purchases.form.save') }));
    expect(
      await screen.findByText(t('purchases.errors.supplierInvoiceNoTaken')),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(t('purchases.form.supplierInvoiceNo'))).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('names the taken serials on their line', async () => {
    vi.spyOn(purchaseInvoicesApi, 'create').mockRejectedValue(
      Object.assign(new ApiError(409, 'SERIAL_TAKEN', 'Taken.'), {
        details: { serials: ['SN-1'] },
      }),
    );
    await renderApp(routes, { lang: 'en', route: '/purchasing/invoices/new' });
    const user = userEvent.setup();
    await chooseSupplier(user);
    await addProduct(user, 'Phone');
    await setLine(user, 'Phone', '1', '900');
    await user.type(screen.getByLabelText(`${t('purchases.form.serials')}: Phone`), 'SN-1');
    await user.click(screen.getByRole('button', { name: t('purchases.form.save') }));
    const message = t('purchases.errors.serialTaken', { serials: 'SN-1' });
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(`${t('purchases.form.serials')}: Phone`)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('edit: loads the draft, keeps supplier and branch fixed, sends the update', async () => {
    vi.spyOn(purchaseInvoicesApi, 'get').mockResolvedValue(invoice());
    const update = vi.spyOn(purchaseInvoicesApi, 'update').mockResolvedValue(invoice());
    await renderApp(routes, { lang: 'en', route: `/purchasing/invoices/${invoice().id}/edit` });
    const user = userEvent.setup();
    expect(await screen.findByLabelText(t('purchases.form.supplier'))).toBeDisabled();
    expect(screen.getByLabelText(t('purchases.form.branch'))).toBeDisabled();
    await user.type(
      screen.getByLabelText(`${t('purchases.form.serials')}: Phone`),
      'SN-1{enter}SN-2',
    );
    await user.click(screen.getByRole('button', { name: t('purchases.form.save') }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]![1].lines![1]).toEqual({
      product_id: PHONE,
      quantity: 2,
      unit_cost: '900.00',
      tax_class_id: STD,
      serials: ['SN-1', 'SN-2'],
    });
  });

  it('edit: an approved invoice is not editable; a non-UUID id makes no call', async () => {
    const get = vi
      .spyOn(purchaseInvoicesApi, 'get')
      .mockResolvedValue(invoice({ status: 'approved' }));
    await renderApp(routes, { lang: 'en', route: `/purchasing/invoices/${invoice().id}/edit` });
    expect(await screen.findByText(t('purchases.detail.notEditable'))).toBeInTheDocument();
    get.mockClear();
    await renderApp(routes, { lang: 'en', route: '/purchasing/invoices/not-a-uuid/edit' });
    expect(await screen.findAllByText(t('purchases.detail.notFound'))).not.toHaveLength(0);
    expect(get).not.toHaveBeenCalled();
  });
});

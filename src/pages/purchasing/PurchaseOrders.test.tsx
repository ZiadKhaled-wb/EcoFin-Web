import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { PermissionKey, PurchaseOrder, StockRow } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiErrorCode } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { productsApi } from '@/services/productsApi';
import { purchaseOrdersApi } from '@/services/purchaseOrdersApi';
import { stockApi } from '@/services/stockApi';
import { suppliersApi } from '@/services/suppliersApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import PurchaseOrdersPage from './PurchaseOrdersPage';
import PurchaseOrderPage from './PurchaseOrderPage';
import PurchaseOrderFormPage from './PurchaseOrderFormPage';
import { INVOICE, MAIN, PHONE, SUPPLIER, TV, branches, invoice, product } from './purchaseFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ORDER = 'a0590000-0000-4000-8000-000000000001';
const LINE_TV = 'a0590000-0000-4000-8000-000000000002';
const LINE_PHONE = 'a0590000-0000-4000-8000-000000000003';
const ts = '2026-10-11T08:00:00.000Z';

const order = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: ORDER,
  number: 'MAIN-PO-26-000001',
  supplier_id: SUPPLIER,
  supplier_name: 'Nile Traders',
  branch_id: MAIN,
  status: 'partially_received',
  expected_date: '2026-10-20',
  notes: 'Call first',
  created_by_name: 'Owner',
  created_at: ts,
  updated_at: ts,
  lines: [
    {
      id: LINE_TV,
      product_id: TV,
      name_ar: 'تلفزيون',
      name_en: 'TV',
      sku: 'TV-55',
      is_serialized: false,
      quantity: 10,
      expected_unit_cost: '100.00',
      received: 6,
      remaining: 4,
      on_draft_invoices: 0,
      customer_order: { order_id: ORDER, number: 'MAIN-SO-26-000001', line_id: LINE_TV },
    },
    {
      id: LINE_PHONE,
      product_id: PHONE,
      name_ar: 'موبايل',
      name_en: 'Phone',
      sku: 'PH-1',
      is_serialized: true,
      quantity: 2,
      expected_unit_cost: null,
      received: 2,
      remaining: 0,
      on_draft_invoices: 0,
      customer_order: null,
    },
  ],
  invoices: [{ id: INVOICE, number: 'MAIN-PI-26-000001', status: 'approved', total: '684.00' }],
  ...over,
});
const summary = (over: Partial<PurchaseOrder> = {}) => {
  const { lines, invoices, ...rest } = order(over);
  void invoices;
  return { ...rest, lines_count: lines.length, ordered: 12, received: 8 };
};
const lowRow = (over: Partial<StockRow>): StockRow => ({
  product_id: TV,
  name_ar: 'تلفزيون',
  name_en: 'TV',
  sku: 'TV-55',
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
  min_level: 5,
  min_source: 'shop',
  low: true,
  ...over,
});

const detail = (
  <Routes>
    <Route path="/purchasing/orders/:id" element={<PurchaseOrderPage />} />
    <Route path="/purchasing/invoices/:id/edit" element={<p>draft invoice editor</p>} />
  </Routes>
);
const form = (
  <Routes>
    <Route path="/purchasing/orders/new" element={<PurchaseOrderFormPage />} />
    <Route path="/purchasing/orders/:id" element={<p>saved order</p>} />
  </Routes>
);
const route = `/purchasing/orders/${ORDER}`;
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}

describe('U05 purchase orders', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['purchase.order_manage', 'purchase.invoice_create']);
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
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
          balance: '0.00',
          archived_at: null,
          created_at: ts,
          updated_at: ts,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    } as Awaited<ReturnType<typeof suppliersApi.list>>);
    vi.spyOn(purchaseOrdersApi, 'list').mockResolvedValue({
      items: [summary()],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    vi.spyOn(purchaseOrdersApi, 'get').mockResolvedValue(order());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists orders in Arabic: number, status and received / ordered', async () => {
    await renderApp(<PurchaseOrdersPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: 'أوامر الشراء' });
    for (const label of ['الرقم', 'المورد', 'الفرع', 'التاريخ المتوقع', 'الحالة', 'البنود']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await within(table).findByRole('row', { name: /MAIN-PO-26-000001/ });
    expect(within(row).getByText('مستلم جزئيًا')).toBeInTheDocument();
    expect(within(row).getByText('8 / 12')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'MAIN-PO-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/orders/${ORDER}`,
    );
  });

  it('lists orders in English; New order needs purchase.order_manage', async () => {
    await renderApp(<PurchaseOrdersPage />, { lang: 'en' });
    const table = await screen.findByRole('table', { name: 'Purchase orders' });
    expect(await within(table).findByText('Partly received')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'New order' })).toHaveAttribute(
      'href',
      '/purchasing/orders/new',
    );
  });

  it('the detail shows what arrived, what is still to come, the customer order and the invoices', async () => {
    await renderApp(detail, { lang: 'en', route });
    expect(
      await screen.findByRole('heading', { name: 'Purchase order MAIN-PO-26-000001' }),
    ).toBeInTheDocument();
    const lines = screen.getByRole('table', { name: t('purchases.orders.detail.lines') });
    const tv = within(lines).getByRole('row', { name: /TV-55/ });
    expect(within(tv).getByText('MAIN-SO-26-000001')).toBeInTheDocument();
    expect(
      within(tv)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(expect.arrayContaining(['10', '6', '4']));
    const invoices = screen.getByRole('table', { name: t('purchases.orders.detail.invoices') });
    expect(within(invoices).getByRole('link', { name: 'MAIN-PI-26-000001' })).toHaveAttribute(
      'href',
      `/purchasing/invoices/${INVOICE}`,
    );
  });

  it('Receive defaults to what is still to come at the expected cost and opens the draft invoice', async () => {
    const receive = vi
      .spyOn(purchaseOrdersApi, 'invoice')
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(invoice({ po_id: ORDER })), 50)),
      );
    await renderApp(detail, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    const dialog = await screen.findByRole('dialog');
    // Only the line with something still to come is offered.
    expect(within(dialog).getByLabelText('Quantity to receive of TV')).toHaveValue('4');
    expect(within(dialog).getByLabelText('Unit cost of TV')).toHaveValue('100.00');
    expect(within(dialog).queryByLabelText('Quantity to receive of Phone')).not.toBeInTheDocument();
    await user.dblClick(within(dialog).getByRole('button', { name: 'Create draft invoice' }));
    expect(await screen.findByText('draft invoice editor')).toBeInTheDocument();
    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive.mock.calls[0]!.slice(0, 2)).toEqual([
      ORDER,
      { lines: [{ po_line_id: LINE_TV, quantity: 4, unit_cost: '100.00' }] },
    ]);
    expect(receive.mock.calls[0]![2]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('PO_OVER_RECEIPT shows what is still to come on the line', async () => {
    vi.spyOn(purchaseOrdersApi, 'invoice').mockRejectedValue(
      Object.assign(new ApiError(409, 'PO_OVER_RECEIPT', 'Too many.'), {
        details: { po_line_id: LINE_TV, remaining: 3 },
      }),
    );
    await renderApp(detail, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create draft invoice' }));
    expect(
      (await within(dialog).findAllByText('Only 3 are still to come on this line.')).length,
    ).toBeGreaterThan(0);
  });

  it.each<[ApiErrorCode, string]>([
    ['PO_NOT_SENT', 'Send the order before receiving it.'],
    ['PO_CLOSED', 'This order is closed: nothing more can be received.'],
    ['PO_LINE_MISMATCH', 'A line does not belong to this order.'],
  ])('%s shows its message', async (code, message) => {
    vi.spyOn(purchaseOrdersApi, 'invoice').mockRejectedValue(new ApiError(409, code, 'No.'));
    await renderApp(detail, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create draft invoice' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('a draft is sent after a confirmation and cancelled with a reason', async () => {
    vi.spyOn(purchaseOrdersApi, 'get').mockResolvedValue(order({ status: 'draft', invoices: [] }));
    const send = vi.spyOn(purchaseOrdersApi, 'send').mockResolvedValue(order({ status: 'sent' }));
    const cancel = vi
      .spyOn(purchaseOrdersApi, 'cancel')
      .mockResolvedValue(order({ status: 'cancelled' }));
    await renderApp(detail, { lang: 'en', route });
    const user = userEvent.setup();
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/purchasing/orders/${ORDER}/edit`,
    );
    expect(screen.queryByRole('button', { name: 'Receive' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const confirm = await screen.findByRole('dialog');
    expect(send).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(ORDER));

    await user.click(await screen.findByRole('button', { name: 'Cancel order' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    expect(
      await within(dialog).findByText(t('purchases.orders.detail.reasonInvalid')),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), '  Ordered twice ');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(ORDER, 'Ordered twice'));
  });

  it('buttons are hidden without the permissions; a non-UUID id makes no call', async () => {
    setPermissions(['report.financial']);
    const get = vi.spyOn(purchaseOrdersApi, 'get').mockResolvedValue(order());
    await renderApp(detail, { lang: 'en', route });
    await screen.findByRole('heading', { name: 'Purchase order MAIN-PO-26-000001' });
    expect(screen.queryByRole('button', { name: 'Receive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    get.mockClear();
    signOut();
    signIn();
    await renderApp(detail, { lang: 'en', route: '/purchasing/orders/not-a-uuid' });
    expect(
      (await screen.findAllByText(t('purchases.orders.detail.notFound'))).length,
    ).toBeGreaterThan(0);
    expect(get).not.toHaveBeenCalled();
  });

  it('the form creates an order once, with one idempotency key', async () => {
    vi.spyOn(productsApi, 'list').mockResolvedValue({
      items: [product()],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    const create = vi
      .spyOn(purchaseOrdersApi, 'create')
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(order({ status: 'draft' })), 50)),
      );
    await renderApp(form, { lang: 'en', route: '/purchasing/orders/new' });
    const user = userEvent.setup();
    const supplier = await screen.findByLabelText(t('purchases.orders.form.supplier'));
    await waitFor(() =>
      expect(supplier.querySelector(`option[value="${SUPPLIER}"]`)).not.toBeNull(),
    );
    await user.selectOptions(supplier, SUPPLIER);
    await user.type(screen.getByLabelText(t('purchases.orders.form.search')), 'tv');
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    const qty = await screen.findByLabelText('Quantity of TV');
    await user.clear(qty);
    await user.type(qty, '10');
    await user.type(screen.getByLabelText('Expected unit cost of TV'), '100');
    await user.dblClick(screen.getByRole('button', { name: 'Save order' }));
    expect(await screen.findByText('saved order')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toEqual({
      supplier_id: SUPPLIER,
      branch_id: MAIN,
      expected_date: null,
      notes: null,
      lines: [{ product_id: TV, quantity: 10, expected_unit_cost: '100.00' }],
    });
    expect(create.mock.calls[0]![1]).toMatch(/^[0-9a-f-]{36}$/);
  }, 20_000);

  it('from the low-stock list the form starts with minimum − available for each low product', async () => {
    const low = vi.spyOn(stockApi, 'list').mockResolvedValue({
      items: [
        lowRow({}),
        lowRow({ product_id: PHONE, name_en: 'Phone', sku: 'PH-1', available: 1, min_level: 3 }),
        // Not short: skipped.
        lowRow({ product_id: SUPPLIER, name_en: 'Chair', sku: 'CH-1', available: 5, min_level: 5 }),
      ],
      page: 1,
      pageSize: 100,
      total: 3,
    });
    await renderApp(form, {
      lang: 'en',
      route: `/purchasing/orders/new?branch_id=${MAIN}&from=low`,
    });
    expect(await screen.findByLabelText('Quantity of TV')).toHaveValue('3');
    expect(screen.getByLabelText('Quantity of Phone')).toHaveValue('2');
    expect(screen.queryByLabelText('Quantity of Chair')).not.toBeInTheDocument();
    expect(screen.getByText(t('purchases.orders.form.lowLoaded'))).toBeInTheDocument();
    expect(low).toHaveBeenCalledWith({ low_only: true, branch_id: MAIN, pageSize: 100 });
  });

  it('a branch_id that is not a UUID loads no stock', async () => {
    const low = vi.spyOn(stockApi, 'list');
    await renderApp(form, {
      lang: 'en',
      route: '/purchasing/orders/new?branch_id=not-a-uuid&from=low',
    });
    expect(await screen.findByRole('heading', { name: 'New purchase order' })).toBeInTheDocument();
    expect(low).not.toHaveBeenCalled();
  });
});

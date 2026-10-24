import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  SalesOrder,
  type Product,
  type ProductUnit,
  type PurchaseOrder,
} from '@ziadkhaled-wb/contracts';
import { renderApp } from '@/test/renderApp';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { customersApi } from '@/services/customersApi';
import { productsApi } from '@/services/productsApi';
import { purchaseOrdersApi } from '@/services/purchaseOrdersApi';
import { useCan } from '@/features/me/useCan';
import { customerAccountApi } from '@/services/customerAccountApi';
import { useOfflineStore } from '@/offline/store';
import { initialMode } from '@/offline/mode';
import type { PurchaseOrderPrefill } from '@/pages/purchasing/PurchaseOrderFormPage';
import NewSalesOrderPage from './NewSalesOrderPage';
import SalesOrdersPage, { SalesOrderDetailPage } from './SalesOrdersPage';
import { SalesOrderPrint } from './SalesOrderPrintPage';
import { salesOrderErrorMessage, serialsReady } from './salesOrderRules';
const ID = vi.hoisted(() => 'a7100000-0000-4000-8000-000000000001');
const LINE2 = 'a7100000-0000-4000-8000-000000000002';
const LINE3 = 'a7100000-0000-4000-8000-000000000003';
vi.mock('@/features/me/useBranches', () => ({
  useBranches: () => ({ data: [{ id: ID, name: 'Main' }] }),
}));
vi.mock('@/services/salesOrdersApi', () => ({
  salesOrdersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    deposit: vi.fn(),
    reserve: vi.fn(),
    linkPo: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock('@/services/customerAccountApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/customerAccountApi')>()),
  customerAccountApi: { account: vi.fn() },
}));
vi.mock('@/features/me/useCan', () => ({ useCan: vi.fn(() => false) }));
vi.mock('@/services/purchaseOrdersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/purchaseOrdersApi')>()),
  purchaseOrdersApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('@/services/salesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/salesApi')>()),
  salesApi: { paymentAccounts: vi.fn().mockResolvedValue({ items: [] }) },
}));
vi.mock('@/services/productsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/productsApi')>()),
  productsApi: { list: vi.fn(), units: vi.fn() },
}));
vi.mock('@/services/customersApi', () => ({
  customersApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
}));
const product = { id: ID, sku: 'SKU-1', name_ar: 'كرسي', name_en: 'Chair', is_serialized: true };
const line = (over: Record<string, unknown>) => ({
  id: ID,
  order_id: ID,
  line_no: 1,
  product_id: ID,
  custom_notes: 'Blue fabric',
  quantity: 2,
  unit_price: '100.00',
  discount_amount: '0.00',
  tax_class_id: ID,
  tax_rate: '14.00',
  tax_amount: '28.00',
  line_total: '228.00',
  fulfilment: 'from_stock',
  po_line_id: null,
  created_at: '2026-10-23T10:00:00Z',
  created_by: null,
  product,
  delivered: 0,
  reserved: 2,
  remaining: 2,
  purchase_order: null,
  reserved_units: [
    { id: ID, serial: 'SN-001' },
    { id: LINE2, serial: 'SN-002' },
  ],
  ...over,
});
const fixture = () =>
  SalesOrder.parse({
    id: ID,
    number: 'BR1-SO-26-1',
    customer_id: ID,
    branch_id: ID,
    quotation_id: ID,
    status: 'open',
    prices_include_vat: false,
    subtotal: '500.00',
    discount_total: '0.00',
    tax_total: '70.00',
    total: '570.00',
    delivery_address: '12 Nile St, Cairo',
    notes: 'Call before delivery',
    cancelled_reason: null,
    created_at: '2026-10-23T10:00:00Z',
    created_by: null,
    updated_at: '2026-10-23T10:00:00Z',
    updated_by: null,
    customer: { id: ID, name: 'Mona Ali', phone: '01012345678' },
    branch: { id: ID, name: 'Main', address: 'Cairo' },
    quotation: { id: ID, number: 'BR1-QT-26-7' },
    lines: [
      line({}),
      line({
        id: LINE2,
        line_no: 2,
        custom_notes: null,
        quantity: 1,
        fulfilment: 'to_order',
        reserved: 0,
        remaining: 1,
        reserved_units: [],
        line_total: '114.00',
      }),
      line({
        id: LINE3,
        line_no: 3,
        custom_notes: null,
        quantity: 1,
        fulfilment: 'to_order',
        po_line_id: LINE3,
        reserved: 0,
        remaining: 1,
        reserved_units: [],
        purchase_order: {
          po_id: ID,
          number: 'BR1-PO-26-4',
          status: 'sent',
          ordered: 3,
          received: 1,
          remaining: 2,
        },
      }),
    ],
    payments: [
      {
        id: ID,
        number: 'BR1-RC-26-1',
        direction: 'in',
        method: 'cash',
        amount: '200.00',
        reference: null,
        paid_at: '2026-10-23T10:00:00Z',
      },
      {
        id: LINE2,
        number: 'BR1-RF-26-1',
        direction: 'out',
        method: 'bank_transfer',
        amount: '50.00',
        reference: 'TRX-9',
        paid_at: '2026-10-23T11:00:00Z',
      },
    ],
    balances: {
      deposits_paid: '150.00',
      financed: '0.00',
      delivered_value: '0.00',
      unpaid: '420.00',
    },
  });
const money = (v: string) => new RegExp(v.replace('.', '\\.'));
beforeEach(() => {
  vi.clearAllMocks();
});
describe('S10 sales orders', () => {
  it('orders list renders number, customer, branch, status and money columns', async () => {
    vi.mocked(salesOrdersApi.list).mockResolvedValue({ total: 1, items: [fixture()] });
    await renderApp(
      <Routes>
        <Route path="/sales/orders" element={<SalesOrdersPage />} />
      </Routes>,
      { lang: 'en', route: '/sales/orders' },
    );
    const row = (await screen.findByRole('link', { name: 'BR1-SO-26-1' })).closest('tr')!;
    const cells = within(row);
    expect(cells.getByText('Mona Ali')).toBeInTheDocument();
    expect(cells.getByText('01012345678')).toBeInTheDocument();
    expect(cells.getByText('Main')).toBeInTheDocument();
    expect(cells.getByText('Open')).toBeInTheDocument();
    expect(cells.getByText(money('570.00'))).toBeInTheDocument();
    expect(cells.getByText(money('150.00'))).toBeInTheDocument();
    expect(cells.getByText(money('420.00'))).toBeInTheDocument();
    expect(salesOrdersApi.list).toHaveBeenCalledWith({ page: 1, page_size: 20 });
  });
  it('orders list sends the status, branch, date and search filters to the server', async () => {
    vi.mocked(salesOrdersApi.list).mockResolvedValue({ total: 0, items: [] });
    const user = userEvent.setup();
    await renderApp(
      <Routes>
        <Route path="/sales/orders" element={<SalesOrdersPage />} />
      </Routes>,
      { lang: 'en', route: '/sales/orders' },
    );
    await screen.findByText('No orders match these filters.');
    await user.selectOptions(screen.getByLabelText('Status'), 'partially_delivered');
    await user.selectOptions(screen.getByLabelText('Branch'), ID);
    await user.type(screen.getByLabelText('From'), '2026-10-01');
    await user.type(screen.getByLabelText('Search'), 'Mona');
    await waitFor(() =>
      expect(salesOrdersApi.list).toHaveBeenLastCalledWith({
        status: 'partially_delivered',
        branch_id: ID,
        from: '2026-10-01',
        search: 'Mona',
        page: 1,
        page_size: 20,
      }),
    );
  });
  async function detail() {
    vi.mocked(salesOrdersApi.get).mockResolvedValue(fixture());
    await renderApp(
      <Routes>
        <Route path="/sales/orders/:id" element={<SalesOrderDetailPage />} />
      </Routes>,
      { lang: 'en', route: '/sales/orders/' + ID },
    );
    await screen.findByRole('heading', { name: 'BR1-SO-26-1' });
  }
  it('order detail header shows customer, delivery address, notes and the quotation link', async () => {
    await detail();
    expect(salesOrdersApi.get).toHaveBeenCalledWith(ID);
    expect(screen.getByText('Mona Ali')).toBeInTheDocument();
    expect(screen.getByText('12 Nile St, Cairo')).toBeInTheDocument();
    expect(screen.getByText('Call before delivery')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BR1-QT-26-7' })).toHaveAttribute(
      'href',
      '/sales/quotations/' + ID,
    );
    expect(screen.getByRole('region', { name: 'Order actions' })).toBeEmptyDOMElement();
  });
  it('order detail lines show product, notes, money and fulfilment by mode', async () => {
    await detail();
    const rows = within(
      screen.getByRole('region', { name: 'Lines' }).querySelector('tbody')!,
    ).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const stock = within(rows[0]!);
    expect(stock.getByText('Chair')).toBeInTheDocument();
    expect(stock.getByText('Blue fabric')).toBeInTheDocument();
    expect(stock.getByText(money('228.00'))).toBeInTheDocument();
    expect(stock.getByText('From stock')).toBeInTheDocument();
    expect(stock.getByText('2 of 2 reserved')).toBeInTheDocument();
    expect(stock.getByText('Serials: SN-001, SN-002')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('To order, no purchase order')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Purchase order BR1-PO-26-4 (Sent)')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('1 of 3 received')).toBeInTheDocument();
  });
  it('order detail payments list deposits and refunds by direction', async () => {
    await detail();
    const rows = within(
      screen.getByRole('region', { name: 'Payments' }).querySelector('tbody')!,
    ).getAllByRole('row');
    expect(within(rows[0]!).getByText('Deposit')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Cash')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(money('200.00'))).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Refund')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('TRX-9')).toBeInTheDocument();
  });
  it('order detail balances show deposits paid, delivered value and unpaid', async () => {
    await detail();
    const balances = within(screen.getByRole('region', { name: 'Balances' }));
    expect(balances.getByText('Deposits paid').nextSibling).toHaveTextContent(money('150.00'));
    expect(balances.getByText('Delivered value').nextSibling).toHaveTextContent(money('0.00'));
    expect(balances.getByText('Unpaid').nextSibling).toHaveTextContent(money('420.00'));
  });
  it('error messages: every S10 code has its own text in AR and EN, with the detail amounts', () => {
    const codes = [
      'ORDER_NOT_FOUND',
      'ORDER_NOT_OPEN',
      'ORDER_HAS_DELIVERIES',
      'QUOTATION_NOT_ACCEPTED',
      'QUOTATION_ALREADY_ORDERED',
      'LINE_NOT_TO_ORDER',
      'PO_LINE_OVERCOMMITTED',
      'PO_NOT_OPEN',
      'DEPOSIT_EXCEEDS_BALANCE',
      'ORDER_LINES_INVALID',
      'QUOTE_LINE_NEEDS_PRODUCT',
      'UNITS_REQUIRED',
      'PO_LINE_PRODUCT_MISMATCH',
      'REFUND_MUST_EQUAL_DEPOSITS',
      'NOT_ENOUGH_STOCK_TO_RESERVE',
      'UNIT_NOT_AVAILABLE_TO_RESERVE',
      'SHIFT_REQUIRED',
      'REASON_REQUIRED',
      'PRICE_OVERRIDE_REQUIRED',
      'DISCOUNT_ABOVE_CAP',
      'VALIDATION_FAILED',
      'SHIFT_CLOSED',
      'BRANCH_DENIED',
    ] as const;
    for (const lang of ['en', 'ar'] as const) {
      const fallback = t('salesOrders.errors.fallback', undefined, lang);
      for (const code of codes) {
        const key = `salesOrders.errors.${code}` as const;
        const text = t(key, { max: '1', deposits: '1', refund: '1' }, lang);
        expect(text).not.toContain('errors.');
        expect(text).not.toBe(fallback);
      }
    }
    const over = new ApiError(409, 'DEPOSIT_EXCEEDS_BALANCE', 'x');
    over.details = { max: '420.00' };
    expect(salesOrderErrorMessage(over)).toMatch(money('420.00'));
    expect(salesOrderErrorMessage(new ApiError(409, 'CONFLICT', 'x'))).toBe(
      t('salesOrders.errors.fallback'),
    );
  });
  describe('W1 new order: serial picker for serialized from_stock lines', () => {
    const PHONE = 'a7100000-0000-4000-8000-0000000000a1';
    const CHAIR = 'a7100000-0000-4000-8000-0000000000a2';
    const OTHER = 'a7100000-0000-4000-8000-0000000000b9';
    const item = (over: Partial<Product>) =>
      ({ sku: 'SKU', cash_price: '100.00', name_ar: 'منتج', ...over }) as Product;
    const phone = item({ id: PHONE, name_en: 'Phone', is_serialized: true });
    const chair = item({ id: CHAIR, name_en: 'Desk', is_serialized: false });
    const unit = (id: string, serial: string, branch_id = ID) =>
      ({ id, serial, branch_id, status: 'in_stock' }) as ProductUnit;
    async function newOrder(products: Product[]) {
      vi.mocked(customersApi.list).mockResolvedValue({
        items: [{ id: ID, full_name: 'Mona Ali', phones: ['0100'] }],
      } as never);
      vi.mocked(productsApi.list).mockResolvedValue({
        items: products,
        total: products.length,
        page: 1,
        pageSize: 20,
      });
      vi.mocked(productsApi.units).mockResolvedValue([
        unit(LINE2, 'SN-001'),
        unit(LINE3, 'SN-002'),
        unit(OTHER, 'SN-OTHER-BRANCH', OTHER),
      ]);
      vi.mocked(salesOrdersApi.create).mockResolvedValue(fixture());
      const user = userEvent.setup();
      await renderApp(
        <Routes>
          <Route path="/sales/orders/new" element={<NewSalesOrderPage />} />
          <Route path="/sales/orders/:id" element={<p>order page</p>} />
        </Routes>,
        { lang: 'en', route: '/sales/orders/new' },
      );
      await user.selectOptions(screen.getByLabelText('Branch'), ID);
      await user.selectOptions(await screen.findByLabelText('Customer'), ID);
      for (const p of products) {
        await user.type(screen.getByLabelText('Add a product'), 'x');
        await user.click(await screen.findByRole('button', { name: new RegExp(p.name_en!) }));
      }
      return { user, submit: screen.getByRole('button', { name: 'Create order' }) };
    }
    it('W1 submit is blocked until exactly quantity distinct units are picked', async () => {
      const { user, submit } = await newOrder([phone]);
      const line = within(screen.getByRole('group', { name: /Phone/ }));
      await user.clear(line.getByLabelText('Quantity'));
      await user.type(line.getByLabelText('Quantity'), '2');
      expect(await line.findByRole('checkbox', { name: 'SN-001' })).toBeInTheDocument();
      // Only the units in stock at the order's branch are offered.
      expect(line.queryByRole('checkbox', { name: 'SN-OTHER-BRANCH' })).not.toBeInTheDocument();
      expect(submit).toBeDisabled();
      await user.click(line.getByRole('checkbox', { name: 'SN-001' }));
      expect(line.getByText('Serials: 1 of 2 picked')).toBeInTheDocument();
      expect(submit).toBeDisabled();
      await user.click(line.getByRole('checkbox', { name: 'SN-002' }));
      expect(submit).toBeEnabled();
      await user.click(submit);
      await screen.findByText('order page');
      expect(salesOrdersApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          branch_id: ID,
          customer_id: ID,
          lines: [
            expect.objectContaining({
              product_id: PHONE,
              quantity: 2,
              unit_price: '100.00',
              fulfilment: 'from_stock',
              unit_ids: [LINE2, LINE3],
            }),
          ],
        }),
        expect.any(String),
      );
    });
    it('W1 a to_order serialized line and a non-serialized line need no serials', async () => {
      const { user, submit } = await newOrder([phone, chair]);
      expect(submit).toBeDisabled();
      const line = within(screen.getByRole('group', { name: /Phone/ }));
      await user.selectOptions(line.getByLabelText('Fulfilment'), 'to_order');
      expect(line.queryByRole('group', { name: /Serials/ })).not.toBeInTheDocument();
      const desk = within(screen.getByRole('group', { name: /Desk/ }));
      expect(desk.queryByRole('group', { name: /Serials/ })).not.toBeInTheDocument();
      expect(submit).toBeEnabled();
      await user.click(submit);
      await screen.findByText('order page');
      const body = vi.mocked(salesOrdersApi.create).mock.calls[0]![0];
      expect(body.lines[0]).toMatchObject({ product_id: PHONE, fulfilment: 'to_order' });
      expect(body.lines[0]).not.toHaveProperty('unit_ids');
      expect(body.lines[1]).not.toHaveProperty('unit_ids');
    });
    it('W1 serialsReady wants exactly quantity distinct units, only when needed', () => {
      const l = (fulfilment: 'from_stock' | 'to_order', unit_ids: string[]) => ({
        fulfilment,
        quantity: 2,
        unit_ids,
      });
      expect(serialsReady(l('from_stock', ['a']), true)).toBe(false);
      expect(serialsReady(l('from_stock', ['a', 'a']), true)).toBe(false);
      expect(serialsReady(l('from_stock', ['a', 'b', 'c']), true)).toBe(false);
      expect(serialsReady(l('from_stock', ['a', 'b']), true)).toBe(true);
      expect(serialsReady(l('to_order', []), true)).toBe(true);
      expect(serialsReady(l('from_stock', []), false)).toBe(true);
    });
  });
  describe('S10 actions: order detail (order.manage)', () => {
    const PO = 'a7100000-0000-4000-8000-0000000000c1';
    const PO_LINE = 'a7100000-0000-4000-8000-0000000000c2';
    const OTHER_PO_LINE = 'a7100000-0000-4000-8000-0000000000c3';
    const OTHER_PRODUCT = 'a7100000-0000-4000-8000-0000000000c4';
    const poLine = (id: string, product_id: string, name_en: string) => ({
      id,
      product_id,
      name_ar: 'منتج',
      name_en,
      sku: 'SKU',
      is_serialized: false,
      quantity: 5,
      expected_unit_cost: null,
      received: 0,
      remaining: 5,
      on_draft_invoices: 0,
      customer_order: null,
    });
    const purchaseOrder = (): PurchaseOrder => ({
      id: PO,
      number: 'BR1-PO-26-9',
      supplier_id: ID,
      supplier_name: 'Nile Traders',
      branch_id: ID,
      status: 'draft',
      expected_date: null,
      notes: null,
      created_by_name: null,
      created_at: '2026-10-23T10:00:00Z',
      updated_at: '2026-10-23T10:00:00Z',
      lines: [poLine(OTHER_PO_LINE, OTHER_PRODUCT, 'Lamp'), poLine(PO_LINE, ID, 'Chair')],
      invoices: [],
    });
    beforeEach(() => {
      vi.mocked(useCan).mockReturnValue(true);
    });
    afterEach(() => {
      vi.mocked(useCan).mockReturnValue(false);
    });
    const toOrderLine = () => within(screen.getByRole('group', { name: 'Line 2: Chair' }));

    it('S10 actions: the deposit posts with a key and updates the balances', async () => {
      const paid = fixture();
      paid.balances = { ...paid.balances, deposits_paid: '250.00', unpaid: '320.00' };
      vi.mocked(salesOrdersApi.deposit).mockResolvedValue(paid);
      const user = userEvent.setup();
      await detail();
      await user.click(screen.getByRole('button', { name: 'Add deposit' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Add deposit' }));
      expect(dialog.getByTestId('pay-total')).toHaveTextContent(money('420.00'));
      const amount = dialog.getByLabelText('Amount: Cash');
      await user.clear(amount);
      await user.type(amount, '100');
      // Part of the balance is enough for a deposit.
      await user.click(dialog.getByRole('button', { name: 'Pay' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(salesOrdersApi.deposit).toHaveBeenCalledWith(
        ID,
        { payments: [{ method: 'cash', amount: '100.00' }] },
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );
      const balances = within(screen.getByRole('region', { name: 'Balances' }));
      expect(balances.getByText('Deposits paid').nextSibling).toHaveTextContent(money('250.00'));
      expect(balances.getByText('Unpaid').nextSibling).toHaveTextContent(money('320.00'));
    });

    it('S10 actions: reserve now on a serialized to_order line requires the serials', async () => {
      vi.mocked(productsApi.units).mockResolvedValue([
        { id: PO_LINE, serial: 'SN-NEW', branch_id: ID, status: 'in_stock' } as ProductUnit,
      ]);
      vi.mocked(salesOrdersApi.reserve).mockResolvedValue(fixture());
      const user = userEvent.setup();
      await detail();
      // Both to_order lines can be reserved; the from_stock line has no line actions.
      expect(screen.getAllByRole('button', { name: 'Reserve now' })).toHaveLength(2);
      await user.click(toOrderLine().getByRole('button', { name: 'Reserve now' }));
      const dialog = within(await screen.findByRole('dialog'));
      const reserve = dialog.getByRole('button', { name: 'Reserve' });
      expect(reserve).toBeDisabled();
      await user.click(await dialog.findByRole('checkbox', { name: 'SN-NEW' }));
      expect(reserve).toBeEnabled();
      await user.click(reserve);
      await waitFor(() =>
        expect(salesOrdersApi.reserve).toHaveBeenCalledWith(ID, LINE2, { unit_ids: [PO_LINE] }),
      );
    });

    it('S10 actions: link PO lists only same-product open PO lines', async () => {
      vi.mocked(purchaseOrdersApi.list).mockImplementation(async (params) => ({
        items: params?.status === 'draft' ? [{ id: PO } as never] : [],
        total: params?.status === 'draft' ? 1 : 0,
        page: 1,
        pageSize: 100,
      }));
      vi.mocked(purchaseOrdersApi.get).mockResolvedValue(purchaseOrder());
      vi.mocked(salesOrdersApi.linkPo).mockResolvedValue(fixture());
      const user = userEvent.setup();
      await detail();
      await user.click(toOrderLine().getByRole('button', { name: 'Link purchase order' }));
      const dialog = within(await screen.findByRole('dialog'));
      const options = await dialog.findAllByRole('radio');
      expect(options).toHaveLength(1);
      expect(dialog.getByText(/BR1-PO-26-9 · Nile Traders/)).toBeInTheDocument();
      for (const status of ['draft', 'sent', 'partially_received'])
        expect(purchaseOrdersApi.list).toHaveBeenCalledWith({
          status,
          branch_id: ID,
          pageSize: 100,
        });
      expect(purchaseOrdersApi.list).toHaveBeenCalledTimes(3);
      await user.click(options[0]!);
      await user.click(dialog.getByRole('button', { name: 'Link' }));
      await waitFor(() =>
        expect(salesOrdersApi.linkPo).toHaveBeenCalledWith(ID, LINE2, { po_line_id: PO_LINE }),
      );
    });

    it('S10 actions: the create-PO return calls linkPo', async () => {
      /** Stands in for U05's form: shows the prefill and "saves" back to the return target. */
      function FakePoForm() {
        const location = useLocation();
        const prefill = location.state as PurchaseOrderPrefill;
        const navigate = useNavigate();
        return (
          <button
            type="button"
            onClick={() =>
              void navigate(prefill.returnTo, { state: { purchaseOrder: purchaseOrder() } })
            }
          >
            {`save ${prefill.line.product_id} x${prefill.line.quantity} ${location.search}`}
          </button>
        );
      }
      vi.mocked(salesOrdersApi.get).mockResolvedValue(fixture());
      vi.mocked(salesOrdersApi.linkPo).mockResolvedValue(fixture());
      const user = userEvent.setup();
      await renderApp(
        <Routes>
          <Route path="/sales/orders/:id" element={<SalesOrderDetailPage />} />
          <Route path="/purchasing/orders/new" element={<FakePoForm />} />
        </Routes>,
        { lang: 'en', route: '/sales/orders/' + ID },
      );
      await screen.findByRole('heading', { name: 'BR1-SO-26-1' });
      await user.click(toOrderLine().getByRole('button', { name: 'Create purchase order' }));
      await user.click(
        await screen.findByRole('button', { name: `save ${ID} x1 ?branch_id=${ID}` }),
      );
      await waitFor(() =>
        expect(salesOrdersApi.linkPo).toHaveBeenCalledWith(ID, LINE2, { po_line_id: PO_LINE }),
      );
      expect(salesOrdersApi.linkPo).toHaveBeenCalledTimes(1);
    });

    describe('idempotency keys of the deposit and cancel dialogs', () => {
      const keyOf = (fn: unknown, call: number) =>
        (vi.mocked(fn as typeof salesOrdersApi.deposit).mock.calls[call] as unknown[])[2];
      const refuse = () => new ApiError(409, 'ORDER_NOT_OPEN', 'x');

      async function openDeposit(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByRole('button', { name: 'Add deposit' }));
        return within(await screen.findByRole('dialog', { name: 'Add deposit' }));
      }
      async function openCancel(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByRole('button', { name: 'Cancel order' }));
        const dialog = within(await screen.findByRole('dialog', { name: 'Cancel order' }));
        await user.type(dialog.getByLabelText('Reason'), 'Customer changed mind');
        return dialog;
      }

      it('a refused deposit retried in the same dialog sends the same key', async () => {
        vi.mocked(salesOrdersApi.deposit)
          .mockRejectedValueOnce(refuse())
          .mockResolvedValue(fixture());
        const user = userEvent.setup();
        await detail();
        const dialog = await openDeposit(user);
        await user.click(dialog.getByRole('button', { name: 'Pay' }));
        await dialog.findByRole('alert');
        await user.click(dialog.getByRole('button', { name: 'Pay' }));
        await waitFor(() => expect(salesOrdersApi.deposit).toHaveBeenCalledTimes(2));
        expect(keyOf(salesOrdersApi.deposit, 1)).toBe(keyOf(salesOrdersApi.deposit, 0));
      });

      it('closing and reopening the deposit dialog sends a new key', async () => {
        vi.mocked(salesOrdersApi.deposit)
          .mockRejectedValueOnce(refuse())
          .mockResolvedValue(fixture());
        const user = userEvent.setup();
        await detail();
        const first = await openDeposit(user);
        await user.click(first.getByRole('button', { name: 'Pay' }));
        await first.findByRole('alert');
        await user.click(first.getAllByRole('button', { name: 'Close' })[0]!);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        const second = await openDeposit(user);
        await user.click(second.getByRole('button', { name: 'Pay' }));
        await waitFor(() => expect(salesOrdersApi.deposit).toHaveBeenCalledTimes(2));
        expect(keyOf(salesOrdersApi.deposit, 1)).not.toBe(keyOf(salesOrdersApi.deposit, 0));
      });

      it('a refused cancel retried in the same dialog sends the same key', async () => {
        vi.mocked(salesOrdersApi.cancel)
          .mockRejectedValueOnce(refuse())
          .mockResolvedValue(fixture());
        const user = userEvent.setup();
        await detail();
        const dialog = await openCancel(user);
        await user.click(dialog.getByRole('button', { name: 'Confirm cancellation' }));
        await dialog.findByRole('alert');
        await user.click(dialog.getByRole('button', { name: 'Confirm cancellation' }));
        await waitFor(() => expect(salesOrdersApi.cancel).toHaveBeenCalledTimes(2));
        expect(keyOf(salesOrdersApi.cancel, 1)).toBe(keyOf(salesOrdersApi.cancel, 0));
      });

      it('closing and reopening the cancel dialog sends a new key', async () => {
        vi.mocked(salesOrdersApi.cancel)
          .mockRejectedValueOnce(refuse())
          .mockResolvedValue(fixture());
        const user = userEvent.setup();
        await detail();
        const first = await openCancel(user);
        await user.click(first.getByRole('button', { name: 'Confirm cancellation' }));
        await first.findByRole('alert');
        await user.click(first.getAllByRole('button', { name: 'Close' })[0]!);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        const second = await openCancel(user);
        await user.click(second.getByRole('button', { name: 'Confirm cancellation' }));
        await waitFor(() => expect(salesOrdersApi.cancel).toHaveBeenCalledTimes(2));
        expect(keyOf(salesOrdersApi.cancel, 1)).not.toBe(keyOf(salesOrdersApi.cancel, 0));
      });
    });

    it('S10 actions: cancelling the PO form returns without a purchase order and shows no error', async () => {
      function FakePoForm() {
        const prefill = useLocation().state as PurchaseOrderPrefill;
        const navigate = useNavigate();
        return (
          <button type="button" onClick={() => void navigate(prefill.returnTo)}>
            cancel form
          </button>
        );
      }
      function Where() {
        return <output data-testid="where">{useLocation().search}</output>;
      }
      vi.mocked(salesOrdersApi.get).mockResolvedValue(fixture());
      const user = userEvent.setup();
      await renderApp(
        <>
          <Routes>
            <Route path="/sales/orders/:id" element={<SalesOrderDetailPage />} />
            <Route path="/purchasing/orders/new" element={<FakePoForm />} />
          </Routes>
          <Where />
        </>,
        { lang: 'en', route: '/sales/orders/' + ID },
      );
      await screen.findByRole('heading', { name: 'BR1-SO-26-1' });
      await user.click(toOrderLine().getByRole('button', { name: 'Create purchase order' }));
      await user.click(await screen.findByRole('button', { name: 'cancel form' }));
      await screen.findByRole('heading', { name: 'BR1-SO-26-1' });
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^$/));
      expect(
        screen.queryByText(t('salesOrders.actions.linkReturnMissing')),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(salesOrdersApi.linkPo).not.toHaveBeenCalled();
    });

    it('S10 actions: Link purchase order needs a purchasing read key', async () => {
      vi.mocked(useCan).mockImplementation((key) => key === 'order.manage');
      await detail();
      expect(screen.getAllByRole('button', { name: 'Reserve now' })).toHaveLength(2);
      expect(screen.queryByRole('button', { name: 'Link purchase order' })).not.toBeInTheDocument();
    });

    it('S10 actions: any one purchasing read key shows Link purchase order', async () => {
      vi.mocked(useCan).mockImplementation(
        (key) => key === 'order.manage' || key === 'report.financial',
      );
      await detail();
      expect(screen.getAllByRole('button', { name: 'Link purchase order' })).toHaveLength(2);
    });

    describe('W2 cancel order: refund lines must equal the net deposits', () => {
      const openCancel = async () => {
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Cancel order' }));
        const dialog = within(await screen.findByRole('dialog', { name: 'Cancel order' }));
        const submit = dialog.getByRole('button', { name: 'Confirm cancellation' });
        return { user, dialog, submit };
      };

      it('W2 prefills one cash line equal to the deposits; another sum blocks submit', async () => {
        vi.mocked(salesOrdersApi.cancel).mockResolvedValue(fixture());
        await detail();
        const { user, dialog, submit } = await openCancel();
        expect(dialog.getAllByRole('group', { name: /Refund line/ })).toHaveLength(1);
        expect(dialog.getByLabelText('Method, line 1')).toHaveValue('cash');
        expect(dialog.getByLabelText('Amount, line 1')).toHaveValue('150.00');
        await user.type(dialog.getByLabelText('Reason'), 'Customer changed mind');
        expect(submit).toBeEnabled();
        // 100 is not the 150 of deposits: blocked.
        const amount = dialog.getByLabelText('Amount, line 1');
        await user.clear(amount);
        await user.type(amount, '100');
        expect(submit).toBeDisabled();
        // A second line: 50.01 is still off by a piaster; 50 restores the exact sum.
        await user.click(dialog.getByRole('button', { name: 'Add a refund line' }));
        await user.selectOptions(dialog.getByLabelText('Method, line 2'), 'store_credit');
        await user.type(dialog.getByLabelText('Amount, line 2'), '50.01');
        expect(submit).toBeDisabled();
        await user.clear(dialog.getByLabelText('Amount, line 2'));
        await user.type(dialog.getByLabelText('Amount, line 2'), '50');
        expect(submit).toBeEnabled();
        await user.click(submit);
        await waitFor(() =>
          expect(salesOrdersApi.cancel).toHaveBeenCalledWith(
            ID,
            {
              reason: 'Customer changed mind',
              refund: [
                { method: 'cash', amount: '100.00' },
                { method: 'store_credit', amount: '50.00' },
              ],
            },
            expect.stringMatching(/^[0-9a-f-]{36}$/),
          ),
        );
      });

      it('W2 two cash lines that sum correctly keep submit disabled', async () => {
        await detail();
        const { user, dialog, submit } = await openCancel();
        await user.type(dialog.getByLabelText('Reason'), 'Customer changed mind');
        expect(submit).toBeEnabled();
        // The new line takes the next method still allowed, not a second cash line.
        await user.click(dialog.getByRole('button', { name: 'Add a refund line' }));
        expect(dialog.getByLabelText('Method, line 2')).toHaveValue('store_credit');
        await user.selectOptions(dialog.getByLabelText('Method, line 2'), 'cash');
        const amount = dialog.getByLabelText('Amount, line 1');
        await user.clear(amount);
        await user.type(amount, '100');
        await user.type(dialog.getByLabelText('Amount, line 2'), '50');
        // 100 + 50 balances the 150 of deposits, but the server takes one cash line at most.
        expect(submit).toBeDisabled();
        await user.selectOptions(dialog.getByLabelText('Method, line 2'), 'store_credit');
        expect(submit).toBeEnabled();
      });

      it('W2 adding refund lines walks cash, store credit, bank transfer and then stops', async () => {
        await detail();
        const { user, dialog } = await openCancel();
        const addLine = dialog.getByRole('button', { name: 'Add a refund line' });
        for (const [no, method] of [
          [2, 'store_credit'],
          [3, 'bank_transfer'],
          [4, 'bank_transfer'],
          [5, 'bank_transfer'],
        ] as const) {
          await user.click(addLine);
          expect(dialog.getByLabelText(`Method, line ${no}`)).toHaveValue(method);
        }
        expect(addLine).toBeDisabled();
      });

      it('W2 a bank refund line needs an account and a reference', async () => {
        await detail();
        const { user, dialog, submit } = await openCancel();
        await user.type(dialog.getByLabelText('Reason'), 'Out of stock');
        expect(submit).toBeEnabled();
        await user.selectOptions(dialog.getByLabelText('Method, line 1'), 'bank_transfer');
        expect(submit).toBeDisabled();
      });

      it('W2 with no deposits there are no refund lines and submit sends refund: []', async () => {
        const none = fixture();
        none.balances = { ...none.balances, deposits_paid: '0.00' };
        vi.mocked(salesOrdersApi.get).mockResolvedValue(none);
        vi.mocked(salesOrdersApi.cancel).mockResolvedValue(none);
        await renderApp(
          <Routes>
            <Route path="/sales/orders/:id" element={<SalesOrderDetailPage />} />
          </Routes>,
          { lang: 'en', route: '/sales/orders/' + ID },
        );
        await screen.findByRole('heading', { name: 'BR1-SO-26-1' });
        const { user, dialog, submit } = await openCancel();
        expect(dialog.queryByRole('group', { name: /Refund line/ })).not.toBeInTheDocument();
        expect(submit).toBeDisabled();
        // "ok" trimmed is under 3 characters.
        await user.type(dialog.getByLabelText('Reason'), '  ok  ');
        expect(submit).toBeDisabled();
        await user.type(dialog.getByLabelText('Reason'), 'ay');
        await user.click(submit);
        await waitFor(() =>
          expect(salesOrdersApi.cancel).toHaveBeenCalledWith(
            ID,
            { reason: 'ok  ay', refund: [] },
            expect.stringMatching(/^[0-9a-f-]{36}$/),
          ),
        );
      });

      it('W2 no Cancel order without order.cancel', async () => {
        vi.mocked(useCan).mockImplementation((key) => key !== 'order.cancel');
        await detail();
        expect(screen.getByRole('button', { name: 'Add deposit' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
        vi.mocked(useCan).mockImplementation(() => false);
      });
    });

    it('S10 actions: the deposit dialog receives the customer store-credit balance', async () => {
      vi.mocked(customerAccountApi.account).mockResolvedValue({
        balance: { store_credit: '75.00' },
      } as Awaited<ReturnType<typeof customerAccountApi.account>>);
      const user = userEvent.setup();
      await detail();
      await user.click(screen.getByRole('button', { name: 'Add deposit' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Add deposit' }));
      expect(await dialog.findByRole('button', { name: 'Add store credit' })).toBeInTheDocument();
      expect(customerAccountApi.account).toHaveBeenCalledWith(ID);
    });

    it('S10 actions: no store credit is offered when the account read fails', async () => {
      vi.mocked(customerAccountApi.account).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
      const user = userEvent.setup();
      await detail();
      await user.click(screen.getByRole('button', { name: 'Add deposit' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Add deposit' }));
      await waitFor(() => expect(customerAccountApi.account).toHaveBeenCalled());
      expect(dialog.queryByRole('button', { name: 'Add store credit' })).not.toBeInTheDocument();
    });

    it('S10 actions: the detail links to the print view', async () => {
      await detail();
      expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute(
        'href',
        `/sales/orders/${ID}/print`,
      );
    });

    describe('W3 offline POS hides the orders', () => {
      beforeEach(() => {
        useOfflineStore.setState({ mode: { ...initialMode(), mode: 'offline' } });
      });
      afterEach(() => {
        useOfflineStore.setState({ mode: initialMode() });
      });

      it('W3 the order actions are hidden in the offline POS', async () => {
        await detail();
        for (const name of [
          'Add deposit',
          'Cancel order',
          'Reserve now',
          'Link purchase order',
          'Create purchase order',
        ])
          expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Print' })).not.toBeInTheDocument();
      });

      it('W3 New order and Create order are hidden in the offline POS', async () => {
        vi.mocked(salesOrdersApi.list).mockResolvedValue({
          items: [],
          total: 0,
        } as unknown as Awaited<ReturnType<typeof salesOrdersApi.list>>);
        const view = await renderApp(<SalesOrdersPage />, { lang: 'en' });
        await waitFor(() => expect(salesOrdersApi.list).toHaveBeenCalled());
        expect(screen.queryByRole('link', { name: 'New order' })).not.toBeInTheDocument();
        view.unmount();
        await renderApp(<NewSalesOrderPage />, { lang: 'en' });
        expect(screen.queryByRole('button', { name: 'Create order' })).not.toBeInTheDocument();
      });
    });
  });

  for (const lang of ['ar', 'en'] as const)
    it('S10 print shows the balance due at delivery in ' + lang, async () => {
      await renderApp(<SalesOrderPrint order={fixture()} />, { lang });
      expect(screen.getByTestId('print-balance-due')).toHaveTextContent(money('420.00'));
      expect(screen.getByText('Call before delivery')).toBeInTheDocument();
      expect(screen.getByText('12 Nile St, Cairo')).toBeInTheDocument();
      expect(document.querySelector('article')).toHaveAttribute(
        'dir',
        lang === 'ar' ? 'rtl' : 'ltr',
      );
    });
});

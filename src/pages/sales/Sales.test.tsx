import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  PermissionKey,
  Product,
  ProductUnit,
  Sale,
  SaleQuote,
  SaleQuoteBody,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { productsApi } from '@/services/productsApi';
import { salesApi } from '@/services/salesApi';
import { shiftsApi } from '@/services/shiftsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import PosPage from './PosPage';
import SalePage from './SalePage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0620000-0000-4000-8000-000000000001';
const OTHER = 'a0620000-0000-4000-8000-000000000002';
const CHAIR = 'a0620000-0000-4000-8000-000000000003';
const PHONE = 'a0620000-0000-4000-8000-000000000004';
const UNIT = 'a0620000-0000-4000-8000-000000000005';
const UNIT_ELSEWHERE = 'a0620000-0000-4000-8000-000000000006';
const SALE = 'a0620000-0000-4000-8000-000000000007';
const ts = '2026-10-12T08:00:00.000Z';

const product = (over: Partial<Product>) =>
  ({
    id: CHAIR,
    name_ar: 'كرسي',
    name_en: 'Chair',
    sku: 'S01-CH',
    cash_price: '250.00',
    is_serialized: false,
    ...over,
  }) as Product;
const chair = product({});
const phone = product({
  id: PHONE,
  name_ar: 'هاتف',
  name_en: 'Phone',
  sku: 'S01-PH',
  cash_price: '5000.00',
  is_serialized: true,
});
const unit = (id: string, serial: string, branch_id: string) =>
  ({ id, serial, branch_id, status: 'in_stock' }) as ProductUnit;

/** What the server would answer for a cart: 14% VAT inside the price. */
function quoteOf(body: SaleQuoteBody, available = 10): SaleQuote {
  const lines = body.lines.map((l) => {
    const p = l.product_id === PHONE ? phone : chair;
    const price = l.unit_price ?? p.cash_price;
    const total = (Number(price) * l.quantity).toFixed(2);
    return {
      product_id: p.id,
      name_ar: p.name_ar,
      name_en: p.name_en,
      sku: p.sku,
      is_serialized: p.is_serialized,
      unit_id: l.unit_id ?? null,
      serial: l.unit_id ? 'IMEI-0001' : null,
      quantity: l.quantity,
      list_price: p.cash_price,
      unit_price: Number(price).toFixed(2),
      overridden: Number(price) !== Number(p.cash_price),
      tax_rate: '14.00',
      tax_amount: (Number(total) - Number(total) / 1.14).toFixed(2),
      line_total: total,
      available,
    };
  });
  const total = lines.reduce((sum, l) => sum + Number(l.line_total), 0).toFixed(2);
  return {
    prices_include_vat: true,
    lines,
    subtotal: total,
    tax_total: lines.reduce((sum, l) => sum + Number(l.tax_amount), 0).toFixed(2),
    total,
  };
}
const sale = (over: Partial<Sale> = {}): Sale => ({
  id: SALE,
  number: 'MAIN-SL-26-000001',
  branch_id: MAIN,
  shift_id: OTHER,
  shift_number: 'MAIN-SH-26-000003',
  customer_id: null,
  customer_name: null,
  prices_include_vat: true,
  subtotal: '5500.00',
  discount_total: '0.00',
  tax_total: '675.44',
  total: '5500.00',
  business_date: '2026-10-12',
  issued_at: ts,
  created_by_name: 'Mona Cashier',
  lines: [
    {
      id: CHAIR,
      line_no: 1,
      product_id: CHAIR,
      name_ar: 'كرسي',
      name_en: 'Chair',
      sku: 'S01-CH',
      is_serialized: false,
      unit_id: null,
      serial: null,
      quantity: 2,
      unit_price: '250.00',
      tax_rate: '14.00',
      tax_amount: '61.40',
      line_total: '500.00',
      warranty_until: null,
    },
    {
      id: PHONE,
      line_no: 2,
      product_id: PHONE,
      name_ar: 'هاتف',
      name_en: 'Phone',
      sku: 'S01-PH',
      is_serialized: true,
      unit_id: UNIT,
      serial: 'IMEI-0001',
      quantity: 1,
      unit_price: '5000.00',
      tax_rate: '14.00',
      tax_amount: '614.04',
      line_total: '5000.00',
      warranty_until: '2027-10-12',
    },
  ],
  payments: [
    {
      id: UNIT,
      number: 'MAIN-PY-26-000001',
      method: 'cash',
      amount: '5500.00',
      cash_account_id: OTHER,
      cash_account_name: 'Drawer of Mona',
      reference: null,
    },
  ],
  ...over,
});
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const refused = (status: number, code: ApiError['code'], details?: unknown) => {
  const error = new ApiError(status, code, 'refused');
  error.details = details;
  return error;
};
/** Finds a product by typing in the search box and presses its button. */
async function addFromSearch(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
  button: string,
) {
  const search = screen.getByRole('searchbox', { name: 'Find a product by name, SKU or barcode' });
  await user.clear(search);
  await user.type(search, text);
  await user.click(await screen.findByRole('button', { name: button }));
}
const detail = (
  <Routes>
    <Route path="/sales/:id" element={<SalePage />} />
  </Routes>
);

describe('S01 sale screen', () => {
  let quote: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    signIn();
    setPermissions(['sale.create']);
    vi.spyOn(shiftsApi, 'current').mockResolvedValue({
      id: OTHER,
      number: 'MAIN-SH-26-000003',
      branch_id: MAIN,
    } as Awaited<ReturnType<typeof shiftsApi.current>>);
    vi.spyOn(productsApi, 'list').mockResolvedValue({
      items: [chair, phone],
      page: 1,
      pageSize: 8,
      total: 2,
    });
    vi.spyOn(productsApi, 'units').mockResolvedValue([
      unit(UNIT, 'IMEI-0001', MAIN),
      unit(UNIT_ELSEWHERE, 'IMEI-0002', OTHER),
    ]);
    quote = vi.spyOn(salesApi, 'quote').mockImplementation(async (body) => quoteOf(body));
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('without an open shift the page only points to the shifts page, in Arabic', async () => {
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(null);
    await renderApp(<PosPage />, { lang: 'ar' });
    expect(await screen.findByRole('heading', { name: 'بيع جديد' })).toBeInTheDocument();
    expect(await screen.findByText('تحتاج إلى وردية مفتوحة لتبيع.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'فتح وردية' })).toHaveAttribute(
      'href',
      '/accounting/shifts',
    );
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(quote).not.toHaveBeenCalled();
  });

  it('the cart shows the prices the server answered and follows the quantity', async () => {
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    expect(await screen.findByText('Shift MAIN-SH-26-000003')).toBeInTheDocument();
    expect(screen.getByText('The cart is empty. Find a product to start.')).toBeInTheDocument();
    await addFromSearch(user, 'cha', 'Add');
    await waitFor(() =>
      expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 1 }] }),
    );
    expect(await screen.findByTestId('sale-total')).toHaveTextContent('250.00');
    expect(screen.getByText('Prices include VAT.')).toBeInTheDocument();
    // Adding the same product again doesn't make a second line.
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);

    const quantity = screen.getByLabelText('Quantity: Chair');
    await user.clear(quantity);
    await user.type(quantity, '3');
    await waitFor(() =>
      expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 3 }] }),
    );
    await waitFor(() => expect(screen.getByTestId('sale-total')).toHaveTextContent('750.00'));
    // A cashier can't type a price.
    expect(screen.queryByLabelText('Price: Chair')).not.toBeInTheDocument();
  });

  it('a serialized product is sold by its serial, from the branch of the shift only', async () => {
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Shift MAIN-SH-26-000003');
    await addFromSearch(user, 'pho', 'Choose serial');
    const dialog = await screen.findByRole('dialog', { name: 'Serials of Phone' });
    expect(await within(dialog).findByText('IMEI-0001')).toBeInTheDocument();
    expect(within(dialog).queryByText('IMEI-0002')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add to the cart' })).toBeDisabled();
    await user.click(within(dialog).getByText('IMEI-0001'));
    await user.click(within(dialog).getByRole('button', { name: 'Add to the cart' }));
    await waitFor(() =>
      expect(quote).toHaveBeenLastCalledWith({
        lines: [{ product_id: PHONE, quantity: 1, unit_id: UNIT }],
      }),
    );
    expect(await screen.findByTestId('sale-total')).toHaveTextContent(/5[,٬]?000\.00/);
    expect(screen.queryByLabelText('Quantity: Phone')).not.toBeInTheDocument();
  });

  it('confirm sells the quoted cart once for a double click, then offers a new sale', async () => {
    const create = vi
      .spyOn(salesApi, 'create')
      .mockImplementation(() => new Promise((r) => setTimeout(() => r(sale()), 50)));
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Shift MAIN-SH-26-000003');
    await addFromSearch(user, 'cha', 'Add');
    const confirm = screen.getByRole('button', { name: 'Confirm cash sale' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.dblClick(confirm);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [body, key] = create.mock.calls[0]!;
    expect(body).toEqual({ lines: [{ product_id: CHAIR, quantity: 1 }], expected_total: '250.00' });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      await screen.findByRole('heading', { name: 'Sale MAIN-SL-26-000001 completed' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sale-paid')).toHaveTextContent(/5[,٬]?500\.00/);
    expect(screen.getByRole('link', { name: 'View the sale' })).toHaveAttribute(
      'href',
      `/sales/${SALE}`,
    );
    await user.click(screen.getByRole('button', { name: 'New sale' }));
    expect(
      await screen.findByText('The cart is empty. Find a product to start.'),
    ).toBeInTheDocument();
  });

  it('a changed price is explained, quoted again and sold at the new total with the same key', async () => {
    const create = vi
      .spyOn(salesApi, 'create')
      .mockRejectedValueOnce(
        refused(409, 'PRICE_CHANGED', { expected_total: '250.00', total: '260.00' }),
      )
      .mockResolvedValue(sale());
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Shift MAIN-SH-26-000003');
    await addFromSearch(user, 'cha', 'Add');
    const confirm = screen.getByRole('button', { name: 'Confirm cash sale' });
    await waitFor(() => expect(confirm).toBeEnabled());
    // The price rises on the server between the quote and the sale.
    quote.mockImplementation(async (body: SaleQuoteBody) => ({
      ...quoteOf(body),
      total: '260.00',
      subtotal: '260.00',
    }));
    const quotesBefore = quote.mock.calls.length;
    await user.click(confirm);
    expect(
      await screen.findByText('Prices changed. Check the new total, then confirm again.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(quote.mock.calls.length).toBeGreaterThan(quotesBefore));
    await waitFor(() => expect(screen.getByTestId('sale-total')).toHaveTextContent('260.00'));
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]![0]).toMatchObject({ expected_total: '260.00' });
    // The cart didn't change, so it is still the same sale for the server.
    expect(create.mock.calls[1]![1]).toBe(create.mock.calls[0]![1]);
  });

  it('more than is in stock is marked on the line and can not be confirmed', async () => {
    quote.mockImplementation(async (body: SaleQuoteBody) => quoteOf(body, 1));
    const create = vi.spyOn(salesApi, 'create').mockResolvedValue(sale());
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Shift MAIN-SH-26-000003');
    await addFromSearch(user, 'cha', 'Add');
    const confirm = screen.getByRole('button', { name: 'Confirm cash sale' });
    await waitFor(() => expect(confirm).toBeEnabled());
    const quantity = screen.getByLabelText('Quantity: Chair');
    await user.clear(quantity);
    await user.type(quantity, '2');
    expect(await screen.findByText('Only 1 in stock')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });

  it('a refused sale shows why (the last unit went to another till) and can be tried again', async () => {
    const create = vi
      .spyOn(salesApi, 'create')
      .mockRejectedValueOnce(
        refused(409, 'OUT_OF_STOCK', { product_id: CHAIR, requested: 1, available: 0 }),
      )
      .mockRejectedValueOnce(refused(409, 'SHIFT_CLOSED'));
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Shift MAIN-SH-26-000003');
    await addFromSearch(user, 'cha', 'Add');
    const confirm = screen.getByRole('button', { name: 'Confirm cash sale' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    expect(await screen.findByText('Not enough stock: only 0 left.')).toBeInTheDocument();
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    expect(await screen.findByText('Your shift was closed. Open a new one.')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('with price.override a typed price is quoted and marked', async () => {
    setPermissions(['sale.create', 'price.override']);
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Shift MAIN-SH-26-000003');
    await addFromSearch(user, 'cha', 'Add');
    await user.type(await screen.findByLabelText('Price: Chair'), '200');
    await waitFor(() => {
      const last = quote.mock.calls.at(-1)![0] as SaleQuoteBody;
      expect(Number(last.lines[0]!.unit_price)).toBe(200);
    });
    expect(await screen.findByText(/Price changed from/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('sale-total')).toHaveTextContent('200.00'));
  });

  it('a quote the server refuses is explained and nothing can be confirmed', async () => {
    quote.mockRejectedValue(refused(409, 'UNIT_NOT_AVAILABLE'));
    await renderApp(<PosPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Shift MAIN-SH-26-000003');
    await addFromSearch(user, 'cha', 'Add');
    expect(
      await screen.findByText('This serial is no longer in stock in this branch.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm cash sale' })).toBeDisabled();
  });
});

describe('S01 sale details', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['sale.create']));
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows the lines with serial and warranty, the totals and the payment', async () => {
    const get = vi.spyOn(salesApi, 'get').mockResolvedValue(sale());
    await renderApp(detail, { lang: 'en', route: `/sales/${SALE}` });
    expect(
      await screen.findByRole('heading', { name: 'Sale MAIN-SL-26-000001' }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(SALE);
    const items = screen.getByRole('table', { name: 'Items' });
    expect(within(items).getByText('IMEI-0001')).toBeInTheDocument();
    expect(within(items).getByText(/Warranty until/)).toBeInTheDocument();
    expect(screen.getByTestId('sale-total')).toHaveTextContent(/5[,٬]?500\.00/);
    expect(screen.getByText('Walk-in customer')).toBeInTheDocument();
    const payments = screen.getByRole('table', { name: 'Payments' });
    expect(within(payments).getByText('Cash')).toBeInTheDocument();
    expect(within(payments).getByText('MAIN-PY-26-000001')).toBeInTheDocument();
  });

  it('in Arabic; a sale that is not the caller’s is not found; a bad id makes no call', async () => {
    const get = vi.spyOn(salesApi, 'get').mockResolvedValue(sale());
    const first = await renderApp(detail, { lang: 'ar', route: `/sales/${SALE}` });
    expect(
      await screen.findByRole('heading', { name: 'فاتورة بيع MAIN-SL-26-000001' }),
    ).toBeInTheDocument();
    expect(screen.getByText('عميل نقدي')).toBeInTheDocument();
    first.unmount();

    get.mockRejectedValue(new ApiError(404, 'SALE_NOT_FOUND', 'no'));
    const second = await renderApp(detail, { lang: 'en', route: `/sales/${OTHER}` });
    expect(await screen.findByText('Sale not found')).toBeInTheDocument();
    second.unmount();

    get.mockClear();
    await renderApp(detail, { lang: 'en', route: '/sales/not-a-uuid' });
    expect(await screen.findByText('Sale not found')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});

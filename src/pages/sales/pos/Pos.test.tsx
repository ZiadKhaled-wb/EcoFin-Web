import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  Category,
  Customer,
  DiscountApproval,
  PermissionKey,
  Product,
  ProductUnit,
  Sale,
  SaleQuote,
  SaleQuoteBody,
  UnitDetail,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { approvalsApi } from '@/services/approvalsApi';
import { categoriesApi } from '@/services/categoriesApi';
import { customersApi } from '@/services/customersApi';
import { productsApi, type ProductListParams } from '@/services/productsApi';
import { salesApi } from '@/services/salesApi';
import { shiftsApi } from '@/services/shiftsApi';
import { unitsApi } from '@/services/unitsApi';
import { useAuthStore } from '@/store/authStore';
import { ORG_A, USER_ID } from '@/test/authFixtures';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import PosPage from '../PosPage';
import { MAX_HELD_CARTS, posScope } from './posStorage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MAIN = 'a0660000-0000-4000-8000-000000000001';
const OTHER = 'a0660000-0000-4000-8000-000000000002';
const CHAIR = 'a0660000-0000-4000-8000-000000000003';
const PHONE = 'a0660000-0000-4000-8000-000000000004';
const UNIT = 'a0660000-0000-4000-8000-000000000005';
const UNIT_ELSEWHERE = 'a0660000-0000-4000-8000-000000000006';
const SALE = 'a0660000-0000-4000-8000-000000000007';
const FURNITURE = 'a0660000-0000-4000-8000-000000000008';
const PHONES = 'a0660000-0000-4000-8000-000000000009';
const MONA = 'a0660000-0000-4000-8000-00000000000a';
const NEW_CUSTOMER = 'a0660000-0000-4000-8000-00000000000b';
const APPROVAL = 'a0660000-0000-4000-8000-00000000000c';
const OTHER_USER = 'a0660000-0000-4000-8000-00000000000d';
const ts = '2026-10-12T08:00:00.000Z';
const BARCODE = '6220000000017';
const SCOPE = posScope(ORG_A, USER_ID);
const ACTIVE_KEY = `ecofin.pos.cart.${SCOPE}`;
const HELD_KEY = `ecofin.pos.held.${SCOPE}`;
const SEARCH_EN = 'Find a product by name, SKU or barcode';

const chair = {
  id: CHAIR,
  name_ar: 'كرسي',
  name_en: 'Chair',
  sku: 'S06-CH',
  cash_price: '250.00',
  is_serialized: false,
} as Product;
const phone = {
  id: PHONE,
  name_ar: 'هاتف',
  name_en: 'Phone',
  sku: 'S06-PH',
  cash_price: '5000.00',
  is_serialized: true,
} as Product;
const category = (id: string, name: string) => ({ id, name, archived_at: null }) as Category;
const unitDetail = (id: string, serial: string, branch_id: string, status = 'in_stock') =>
  ({
    id,
    serial,
    product_id: PHONE,
    name_ar: 'هاتف',
    name_en: 'Phone',
    sku: 'S06-PH',
    branch_id,
    branch_name: branch_id === MAIN ? 'Main' : 'Second',
    status,
  }) as UnitDetail;
const customer = (over: Partial<Customer> = {}) =>
  ({
    id: MONA,
    full_name: 'Mona Adel',
    phones: ['01001234567'],
    national_id: null,
    national_id_masked: '**********1234',
    status: 'active',
    ...over,
  }) as Customer;
const approvalOf = (over: Partial<DiscountApproval>) =>
  ({
    id: APPROVAL,
    status: 'pending',
    decided_by_name: null,
    decision_note: null,
    used: false,
    ...over,
  }) as DiscountApproval;

const amountOf = (d: { type: string; value: string } | undefined, base: number) =>
  d ? (d.type === 'percent' ? (base * Number(d.value)) / 100 : Number(d.value)) : 0;
/** What the server would answer: VAT inside the price, discounts taken off. */
function quoteOf(body: SaleQuoteBody): SaleQuote {
  const lines = body.lines.map((l) => {
    const p = l.product_id === PHONE ? phone : chair;
    const gross = Number(l.unit_price ?? p.cash_price) * l.quantity;
    const discount = amountOf(l.discount, gross);
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
      unit_price: Number(l.unit_price ?? p.cash_price).toFixed(2),
      overridden: false,
      tax_rate: '14.00',
      tax_amount: '0.00',
      line_total: (gross - discount).toFixed(2),
      discount_amount: discount.toFixed(2),
      effective_pct: ((discount / gross) * 100).toFixed(2),
      available: 50,
    };
  });
  const net = lines.reduce((sum, l) => sum + Number(l.line_total), 0);
  const saleDiscount = amountOf(body.sale_discount, net);
  const total = (net - saleDiscount).toFixed(2);
  return {
    prices_include_vat: true,
    lines,
    subtotal: net.toFixed(2),
    discount_total: (
      lines.reduce((sum, l) => sum + Number(l.discount_amount), 0) + saleDiscount
    ).toFixed(2),
    max_effective_pct: '0.00',
    tax_total: '0.00',
    total,
    paid: total,
    remaining: '0.00',
    change: '0.00',
    store_credit_balance: body.customer_id ? '300.00' : null,
  };
}
const sale = (): Sale =>
  ({
    id: SALE,
    number: 'MAIN-SL-26-000009',
    total: '500.00',
    payments: [{ id: UNIT, method: 'cash', amount: '500.00' }],
    change_total: '0.00',
  }) as Sale;
const refused = (status: number, code: ApiError['code'], details?: unknown) => {
  const error = new ApiError(status, code, 'refused');
  error.details = details;
  return error;
};
const heldCart = (id: string) => ({
  id,
  at: ts,
  note: '',
  lines: [
    {
      key: CHAIR,
      product_id: CHAIR,
      name: 'Chair',
      sku: 'S06-CH',
      unit_id: null,
      serial: null,
      quantity: '1',
      price: '',
      discount: { type: 'percent', value: '' },
    },
  ],
  customer: null,
  saleDiscount: { type: 'percent', value: '' },
  reason: '',
});
const uuidOf = (n: number) => `b0660000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('S06 POS screen', () => {
  let quote: ReturnType<typeof vi.spyOn>;
  let create: ReturnType<typeof vi.spyOn>;
  let list: ReturnType<typeof vi.spyOn>;
  let lookup: ReturnType<typeof vi.spyOn>;

  function setPermissions(keys: PermissionKey[]) {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
  }

  beforeEach(() => {
    signIn('CASHIER');
    setPermissions(['sale.create', 'customer.create']);
    vi.spyOn(shiftsApi, 'current').mockResolvedValue({
      id: OTHER,
      number: 'MAIN-SH-26-000003',
      branch_id: MAIN,
    } as Awaited<ReturnType<typeof shiftsApi.current>>);
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([
      category(FURNITURE, 'Furniture'),
      category(PHONES, 'Phones'),
    ]);
    list = vi.spyOn(productsApi, 'list').mockImplementation(async (params = {}) => {
      const { search, category_id } = params as ProductListParams;
      const items = [chair, phone].filter(
        (p) =>
          (!search || p.name_en!.toLowerCase().includes(search.toLowerCase())) &&
          (!category_id || (category_id === PHONES) === p.is_serialized),
      );
      return { items, page: 1, pageSize: 24, total: items.length };
    });
    lookup = vi.spyOn(productsApi, 'lookup').mockImplementation(async (code) => {
      if (code === chair.sku || code === BARCODE) return chair;
      if (code === phone.sku) return phone;
      throw refused(404, 'PRODUCT_NOT_FOUND');
    });
    vi.spyOn(productsApi, 'units').mockResolvedValue([
      { id: UNIT, serial: 'IMEI-0001', branch_id: MAIN, status: 'in_stock' } as ProductUnit,
    ]);
    vi.spyOn(unitsApi, 'find').mockImplementation(async (serial) => {
      if (serial === 'IMEI-0001') return unitDetail(UNIT, 'IMEI-0001', MAIN);
      if (serial === 'IMEI-0002') return unitDetail(UNIT_ELSEWHERE, 'IMEI-0002', OTHER);
      if (serial === 'IMEI-SOLD') return unitDetail(UNIT_ELSEWHERE, 'IMEI-SOLD', MAIN, 'sold');
      throw refused(404, 'UNIT_NOT_FOUND');
    });
    quote = vi.spyOn(salesApi, 'quote').mockImplementation(async (body) => quoteOf(body));
    create = vi.spyOn(salesApi, 'create').mockResolvedValue(sale());
    vi.spyOn(salesApi, 'paymentAccounts').mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    signOut();
  });

  async function open(route = '/sales/pos') {
    const view = await renderApp(<PosPage />, { lang: 'en', route });
    const user = userEvent.setup();
    const search = await screen.findByRole('searchbox', { name: SEARCH_EN });
    await waitFor(() => expect(search).toHaveFocus());
    return { user, search, view };
  }
  const lastQuote = () => quote.mock.calls.at(-1)![0] as SaleQuoteBody;
  const confirmButton = () => screen.getByRole('button', { name: 'Confirm and pay' });
  async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
    await user.keyboard(`${code}{Enter}`);
  }
  /** Scans the chair and waits for its quote. */
  async function withChair(user: ReturnType<typeof userEvent.setup>) {
    await scan(user, chair.sku);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
  }

  describe('the slice check', () => {
    it('a cash sale with the keyboard only: scan, scan, F10, Enter, Enter', async () => {
      const { user, search } = await open();
      await scan(user, chair.sku);
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 1 }] }),
      );
      await scan(user, chair.sku);
      await waitFor(() => expect(screen.getByLabelText('Quantity: Chair')).toHaveValue('2'));
      expect(search).toHaveFocus();
      expect(search).toHaveValue('');
      await waitFor(() => expect(screen.getByTestId('sale-total')).toHaveTextContent('500.00'));
      await waitFor(() => expect(confirmButton()).toBeEnabled());

      await user.keyboard('{F10}');
      const dialog = await screen.findByRole('dialog', { name: 'Payment' });
      await waitFor(() =>
        expect(within(dialog).getByLabelText('Received from the customer')).toHaveFocus(),
      );
      await user.keyboard('{Enter}');
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      const [body, key] = create.mock.calls[0]!;
      expect(body).toEqual({
        lines: [{ product_id: CHAIR, quantity: 2 }],
        expected_total: '500.00',
        payments: [{ method: 'cash', amount: '500.00' }],
      });
      expect(key).toMatch(/^[0-9a-f-]{36}$/);

      expect(
        await screen.findByRole('heading', { name: 'Sale MAIN-SL-26-000009 completed' }),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: 'New sale' })).toHaveFocus());
      await user.keyboard('{Enter}');
      expect(
        await screen.findByText('The cart is empty. Find a product to start.'),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('searchbox', { name: SEARCH_EN })).toHaveFocus());
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('the same sale in Arabic', async () => {
      await renderApp(<PosPage />, { lang: 'ar' });
      const user = userEvent.setup();
      const search = await screen.findByRole('searchbox');
      await waitFor(() => expect(search).toHaveFocus());
      await scan(user, BARCODE);
      const confirm = await screen.findByRole('button', { name: 'تأكيد ودفع' });
      await waitFor(() => expect(confirm).toBeEnabled());
      expect(screen.getByText('عميل نقدي')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'تعليق' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'التصنيفات' })).toBeInTheDocument();
      await user.keyboard('{F10}');
      const dialog = await screen.findByRole('dialog', { name: 'الدفع' });
      await waitFor(() => expect(within(dialog).getByLabelText('المستلم من العميل')).toHaveFocus());
      await user.keyboard('{Enter}');
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(
        await screen.findByRole('heading', { name: 'تم البيع MAIN-SL-26-000009' }),
      ).toBeInTheDocument();
    });
  });

  describe('scan', () => {
    it('a barcode adds the product; a serial adds that exact unit; a serialized SKU asks for the serial', async () => {
      const { user } = await open();
      await scan(user, BARCODE);
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 1 }] }),
      );
      await scan(user, 'IMEI-0001');
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({
          lines: [
            { product_id: CHAIR, quantity: 1 },
            { product_id: PHONE, quantity: 1, unit_id: UNIT },
          ],
        }),
      );
      expect(screen.getByText('IMEI-0001')).toBeInTheDocument();
      // The same serial again is refused, not added twice.
      await scan(user, 'IMEI-0001');
      expect(await screen.findByText('This serial is already in the cart.')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(3);

      await scan(user, phone.sku);
      expect(await screen.findByRole('dialog', { name: 'Serials of Phone' })).toBeInTheDocument();
    });

    it('a serial of another branch, a sold one and an unknown code are refused with the text selected', async () => {
      const { user, search } = await open();
      await scan(user, 'IMEI-0002');
      expect(
        await screen.findByText('This serial is in another branch: Second.'),
      ).toBeInTheDocument();
      await waitFor(() => expect(search).toHaveValue('IMEI-0002'));
      // The next scan replaces the selected text.
      await scan(user, 'IMEI-SOLD');
      expect(
        await screen.findByText('This serial is not in stock (sold or moved).'),
      ).toBeInTheDocument();
      await waitFor(() => expect(search).toHaveValue('IMEI-SOLD'));
      await scan(user, 'NOPE');
      expect(await screen.findByText('No product or serial with this code.')).toBeInTheDocument();
      await waitFor(() => expect(search).toHaveValue('NOPE'));
      expect((search as HTMLInputElement).selectionEnd).toBe(4);
      expect(screen.getByText('The cart is empty. Find a product to start.')).toBeInTheDocument();
      expect(quote).not.toHaveBeenCalled();
    });

    it('ten quick scans of one barcode end as quantity 10', async () => {
      lookup.mockImplementation(
        (code: string) =>
          new Promise((resolve, reject) =>
            setTimeout(
              () => (code === BARCODE ? resolve(chair) : reject(refused(404, 'PRODUCT_NOT_FOUND'))),
              5,
            ),
          ),
      );
      const { user } = await open();
      await user.keyboard(`${BARCODE}{Enter}`.repeat(10));
      await waitFor(() => expect(screen.getByLabelText('Quantity: Chair')).toHaveValue('10'));
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 10 }] }),
      );
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });

    it('Enter with a name that shows one tile adds that tile', async () => {
      const { user, search } = await open();
      await user.type(search, 'cha');
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
      await user.keyboard('{Enter}');
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 1 }] }),
      );
    });

    it('a character typed with the focus nowhere goes to the search box', async () => {
      const { user, search } = await open();
      search.blur();
      expect(document.body).toHaveFocus();
      await user.keyboard('S');
      expect(search).toHaveFocus();
    });
  });

  describe('products', () => {
    it('a category chip filters the list; the arrow keys walk the tiles and Enter adds', async () => {
      const { user, search } = await open();
      expect(await screen.findByRole('button', { name: 'Add Chair' })).toBeInTheDocument();
      expect(list).toHaveBeenLastCalledWith({ status: 'active', pageSize: 24 });
      await user.click(screen.getByRole('button', { name: 'Phones' }));
      await waitFor(() =>
        expect(list).toHaveBeenLastCalledWith({
          category_id: PHONES,
          include_subcategories: true,
          status: 'active',
          pageSize: 24,
        }),
      );
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Add Chair' })).toBeNull());
      expect(screen.getByRole('button', { name: 'Phones' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await user.click(screen.getByRole('button', { name: 'All' }));
      const chairTile = await screen.findByRole('button', { name: 'Add Chair' });
      // A tile shows the name, the SKU and the price, and no stock number.
      expect(chairTile).toHaveTextContent('Chair');
      expect(chairTile).toHaveTextContent('S06-CH');
      expect(chairTile).toHaveTextContent('250.00');

      search.focus();
      await user.keyboard('{ArrowDown}');
      expect(chairTile).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', { name: 'Choose serial: Phone' })).toHaveFocus();
      await user.keyboard('{ArrowLeft}{Enter}');
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 1 }] }),
      );
      expect(search).toHaveFocus();
    });

    it('the cart has - and + beside the quantity', async () => {
      const { user } = await open();
      await withChair(user);
      await user.click(screen.getByRole('button', { name: 'One more: Chair' }));
      await user.click(screen.getByRole('button', { name: 'One more: Chair' }));
      expect(screen.getByLabelText('Quantity: Chair')).toHaveValue('3');
      await user.click(screen.getByRole('button', { name: 'One less: Chair' }));
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 2 }] }),
      );
      // Never below one.
      await user.click(screen.getByRole('button', { name: 'One less: Chair' }));
      await user.click(screen.getByRole('button', { name: 'One less: Chair' }));
      expect(screen.getByLabelText('Quantity: Chair')).toHaveValue('1');
    });
  });

  describe('customer', () => {
    let listCustomers: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      listCustomers = vi.spyOn(customersApi, 'list').mockResolvedValue({
        items: [customer(), customer({ id: OTHER, full_name: 'Mona Blocked', status: 'blocked' })],
        page: 1,
        pageSize: 10,
        total: 2,
      });
    });

    it('search and pick sends customer_id to the quote and the sale; clear returns to walk-in', async () => {
      const { user } = await open();
      await withChair(user);
      expect(screen.getByTestId('pos-customer')).toHaveTextContent('Walk-in customer');
      await user.keyboard('{F4}');
      const dialog = await screen.findByRole('dialog', { name: 'Customer' });
      await user.type(within(dialog).getByRole('searchbox'), 'm');
      // One character searches nothing.
      await new Promise((r) => setTimeout(r, 350));
      expect(listCustomers).not.toHaveBeenCalled();
      await user.type(within(dialog).getByRole('searchbox'), 'ona');
      await waitFor(() =>
        expect(listCustomers).toHaveBeenCalledWith({ search: 'mona', pageSize: 10 }),
      );
      const row = await within(dialog).findByRole('button', { name: /Mona Adel/ });
      expect(row).toHaveTextContent('01001234567');
      expect(row).toHaveTextContent('**********1234');
      expect(within(dialog).getByText('Blocked')).toBeInTheDocument();
      await user.click(row);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByTestId('pos-customer')).toHaveTextContent('Mona Adel');
      expect(screen.getByTestId('pos-customer')).toHaveTextContent('01001234567');
      await waitFor(() => expect(lastQuote().customer_id).toBe(MONA));
      // The quote reports the customer's store credit.
      expect(await screen.findByText(/Store credit:.*300\.00/)).toBeInTheDocument();

      await waitFor(() => expect(confirmButton()).toBeEnabled());
      await user.keyboard('{F10}');
      await screen.findByRole('dialog', { name: 'Payment' });
      await user.keyboard('{Enter}');
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]![0]).toMatchObject({ customer_id: MONA });
    });

    it('Clear returns to the walk-in customer', async () => {
      const { user } = await open(`/sales/pos?customer=${MONA}`);
      vi.spyOn(customersApi, 'get').mockResolvedValue(customer());
      await withChair(user);
      await waitFor(() => expect(lastQuote().customer_id).toBe(MONA));
      await user.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.getByTestId('pos-customer')).toHaveTextContent('Walk-in customer');
      await waitFor(() =>
        expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 1 }] }),
      );
    });

    it('?customer=<id> names the customer and reads the name; a value that is no UUID makes no call', async () => {
      const get = vi.spyOn(customersApi, 'get').mockResolvedValue(customer());
      const first = await open(`/sales/pos?customer=${MONA}`);
      await waitFor(() =>
        expect(screen.getByTestId('pos-customer')).toHaveTextContent('Mona Adel'),
      );
      expect(get).toHaveBeenCalledWith(MONA);
      first.view.unmount();
      sessionStorage.clear();
      get.mockClear();

      const second = await open('/sales/pos?customer=not-a-uuid');
      await withChair(second.user);
      expect(screen.getByTestId('pos-customer')).toHaveTextContent('Walk-in customer');
      expect(get).not.toHaveBeenCalled();
      expect(lastQuote().customer_id).toBeUndefined();
    });

    it('a new customer is made with a name and a phone, then chosen', async () => {
      const make = vi
        .spyOn(customersApi, 'create')
        .mockResolvedValue(
          customer({ id: NEW_CUSTOMER, full_name: 'Omar Said', phones: ['01112223334'] }),
        );
      const { user } = await open();
      await user.keyboard('{F4}');
      const dialog = await screen.findByRole('dialog', { name: 'Customer' });
      await user.click(await within(dialog).findByRole('button', { name: 'New customer' }));
      await user.click(within(dialog).getByRole('button', { name: 'Add and choose' }));
      expect(
        await within(dialog).findByText('Enter the name (2 to 150 characters).'),
      ).toBeInTheDocument();
      expect(within(dialog).getByText('Enter a valid phone number.')).toBeInTheDocument();
      expect(make).not.toHaveBeenCalled();
      await user.type(within(dialog).getByLabelText('Name'), 'Omar Said');
      await user.type(within(dialog).getByLabelText('Phone'), '0111 222 3334');
      await user.click(within(dialog).getByRole('button', { name: 'Add and choose' }));
      await waitFor(() => expect(make).toHaveBeenCalledTimes(1));
      expect(make.mock.calls[0]![0]).toMatchObject({
        full_name: 'Omar Said',
        phones: ['01112223334'],
      });
      await waitFor(() =>
        expect(screen.getByTestId('pos-customer')).toHaveTextContent('Omar Said'),
      );
    });

    it('without customer.create the picker has no New customer', async () => {
      setPermissions(['sale.create']);
      const { user } = await open();
      await user.keyboard('{F4}');
      const dialog = await screen.findByRole('dialog', { name: 'Customer' });
      await user.type(within(dialog).getByRole('searchbox'), 'mona');
      await within(dialog).findByRole('button', { name: /Mona Adel/ });
      expect(within(dialog).queryByRole('button', { name: 'New customer' })).toBeNull();
    });

    it('MODULE_NOT_IN_PLAN hides the customer row: sales stay walk-in', async () => {
      listCustomers.mockRejectedValue(refused(403, 'MODULE_NOT_IN_PLAN'));
      const { user } = await open();
      await user.keyboard('{F4}');
      const dialog = await screen.findByRole('dialog', { name: 'Customer' });
      await user.type(within(dialog).getByRole('searchbox'), 'mona');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.queryByTestId('pos-customer')).toBeNull();
      await user.keyboard('{F4}');
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('discounts', () => {
    async function discounted(user: ReturnType<typeof userEvent.setup>) {
      await withChair(user);
      await user.click(screen.getByRole('button', { name: 'Add a discount: Chair' }));
      await user.type(screen.getByLabelText('Discount: Chair'), '10');
    }

    it('a line percent and a sale amount go to the quote and the sale with the reason', async () => {
      const { user } = await open();
      await discounted(user);
      await waitFor(() =>
        expect(lastQuote().lines[0]!.discount).toEqual({ type: 'percent', value: '10' }),
      );
      // The quote's numbers are the ones shown.
      expect(await screen.findByTestId('line-discount')).toHaveTextContent('25.00');
      expect(screen.getByTestId('line-discount')).toHaveTextContent('10.00%');
      // No reason yet: nothing can be confirmed.
      expect(confirmButton()).toBeDisabled();
      expect(
        screen.getByText('Write a reason for the discount (3 to 200 characters).'),
      ).toBeInTheDocument();

      await user.keyboard('{F7}');
      const saleDiscount = screen.getByLabelText('Sale discount');
      expect(saleDiscount).toHaveFocus();
      await user.selectOptions(screen.getByLabelText('Sale discount type'), 'amount');
      await user.type(saleDiscount, '5');
      await waitFor(() =>
        expect(lastQuote().sale_discount).toEqual({ type: 'amount', value: '5' }),
      );
      await waitFor(() => expect(screen.getByTestId('sale-discount')).toHaveTextContent('30.00'));
      await waitFor(() => expect(screen.getByTestId('sale-total')).toHaveTextContent('220.00'));

      await user.type(screen.getByLabelText('Discount reason'), 'ab');
      expect(confirmButton()).toBeDisabled();
      await user.type(screen.getByLabelText('Discount reason'), 'c customer');
      await waitFor(() => expect(confirmButton()).toBeEnabled());
      await user.click(confirmButton());
      const dialog = await screen.findByRole('dialog', { name: 'Payment' });
      await user.click(within(dialog).getByRole('button', { name: 'Pay' }));
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]![0]).toEqual({
        lines: [{ product_id: CHAIR, quantity: 1, discount: { type: 'percent', value: '10.00' } }],
        expected_total: '220.00',
        payments: [{ method: 'cash', amount: '220.00' }],
        sale_discount: { type: 'amount', value: '5.00' },
        discount_reason: 'abc customer',
      });
    });

    it('DISCOUNT_INVALID from the quote is shown on the cart and nothing can be confirmed', async () => {
      const { user } = await open();
      await withChair(user);
      quote.mockRejectedValue(refused(400, 'DISCOUNT_INVALID'));
      await user.click(screen.getByRole('button', { name: 'Add a discount: Chair' }));
      await user.selectOptions(screen.getByLabelText('Discount type: Chair'), 'amount');
      await user.type(screen.getByLabelText('Discount: Chair'), '900');
      expect(
        await screen.findByText('The discount is not valid for this cart.'),
      ).toBeInTheDocument();
      expect(confirmButton()).toBeDisabled();
    });

    it('a percent above 100 is not sent at all', async () => {
      const { user } = await open();
      await withChair(user);
      const before = quote.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Add a discount: Chair' }));
      await user.type(screen.getByLabelText('Discount: Chair'), '101');
      expect(
        await screen.findByText('The discount is not valid for this cart.'),
      ).toBeInTheDocument();
      expect(confirmButton()).toBeDisabled();
      expect(
        quote.mock.calls.slice(before).every((call: unknown[]) => {
          const value = (call[0] as SaleQuoteBody).lines[0]!.discount?.value;
          return value === undefined || Number(value) <= 100;
        }),
      ).toBe(true);
    });

    describe('above the cap', () => {
      const aboveCap = () =>
        refused(403, 'DISCOUNT_ABOVE_CAP', { line_no: 1, cap_pct: '5.00', effective_pct: '10.00' });
      let request: ReturnType<typeof vi.spyOn>;
      let read: ReturnType<typeof vi.spyOn>;
      let cancel: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        request = vi.spyOn(approvalsApi, 'requestDiscountApproval').mockResolvedValue({
          approval_id: APPROVAL,
          max_effective_pct: '10.00',
          cap_pct: '5.00',
        });
        read = vi
          .spyOn(approvalsApi, 'getDiscountApproval')
          .mockResolvedValue(approvalOf({ status: 'pending' }));
        cancel = vi
          .spyOn(approvalsApi, 'cancelDiscountApproval')
          .mockResolvedValue({ id: APPROVAL, status: 'cancelled' } as Awaited<
            ReturnType<typeof approvalsApi.cancelDiscountApproval>
          >);
      });

      /** A 10 % discount with a reason, refused at the sale: the panel is open. */
      async function refusedSale(user: ReturnType<typeof userEvent.setup>) {
        await discounted(user);
        await user.type(screen.getByLabelText('Discount reason'), 'Old customer');
        await waitFor(() => expect(confirmButton()).toBeEnabled());
        await user.keyboard('{F10}');
        await screen.findByRole('dialog', { name: 'Payment' });
        await user.keyboard('{Enter}');
        return screen.findByRole('region', { name: 'Discount above your limit' });
      }

      it('the panel shows both percents; ask, wait, approved: the sale carries the approval', async () => {
        create.mockRejectedValueOnce(aboveCap());
        read
          .mockResolvedValueOnce(approvalOf({ status: 'pending' }))
          .mockResolvedValue(approvalOf({ status: 'approved', decided_by_name: 'Sara Manager' }));
        const { user } = await open();
        const panel = await refusedSale(user);
        expect(screen.queryByRole('dialog', { name: 'Payment' })).toBeNull();
        expect(panel).toHaveTextContent('10.00%');
        expect(panel).toHaveTextContent('5.00%');
        const ask = within(panel).getByRole('button', { name: 'Ask a manager' });
        await waitFor(() => expect(ask).toHaveFocus());
        await user.keyboard('{Enter}');
        await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
        expect(request.mock.calls[0]![0]).toEqual({
          branch_id: MAIN,
          lines: [
            { product_id: CHAIR, quantity: 1, discount: { type: 'percent', value: '10.00' } },
          ],
          reason: 'Old customer',
        });
        expect(await within(panel).findByText('Waiting for a manager…')).toBeInTheDocument();
        expect(confirmButton()).toBeDisabled();
        // The request is read again every 3 seconds.
        expect(
          await within(panel).findByText(/Approved by Sara Manager/, {}, { timeout: 6000 }),
        ).toBeInTheDocument();
        expect(read).toHaveBeenCalledWith(APPROVAL);
        await waitFor(() => expect(confirmButton()).toBeEnabled());
        await user.keyboard('{F10}');
        await screen.findByRole('dialog', { name: 'Payment' });
        await user.keyboard('{Enter}');
        await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
        expect(create.mock.calls[1]![0]).toMatchObject({
          discount_reason: 'Old customer',
          discount_approval_id: APPROVAL,
        });
        // The cart did not change: one sale for the server.
        expect(create.mock.calls[1]![1]).toBe(create.mock.calls[0]![1]);
        expect(cancel).not.toHaveBeenCalled();
      }, 20_000);

      it('a rejected request shows the manager’s note', async () => {
        create.mockRejectedValueOnce(aboveCap());
        read.mockResolvedValue(
          approvalOf({
            status: 'rejected',
            decided_by_name: 'Sara Manager',
            decision_note: 'Too much for this item',
          }),
        );
        const { user } = await open();
        const panel = await refusedSale(user);
        await user.click(within(panel).getByRole('button', { name: 'Ask a manager' }));
        expect(await within(panel).findByText(/Rejected by Sara Manager/)).toBeInTheDocument();
        expect(within(panel).getByText('Too much for this item')).toBeInTheDocument();
        await user.click(within(panel).getByRole('button', { name: 'Change the discount' }));
        expect(screen.queryByRole('region', { name: 'Discount above your limit' })).toBeNull();
        expect(cancel).not.toHaveBeenCalled();
      });

      it('changing the cart takes a waiting request back; Cancel request does too', async () => {
        create.mockRejectedValue(aboveCap());
        const { user } = await open();
        let panel = await refusedSale(user);
        await user.click(within(panel).getByRole('button', { name: 'Ask a manager' }));
        await within(panel).findByText('Waiting for a manager…');
        await user.click(screen.getByRole('button', { name: 'One more: Chair' }));
        await waitFor(() => expect(cancel).toHaveBeenCalledWith(APPROVAL));
        expect(screen.queryByRole('region', { name: 'Discount above your limit' })).toBeNull();

        await waitFor(() => expect(confirmButton()).toBeEnabled());
        await user.keyboard('{F10}');
        await screen.findByRole('dialog', { name: 'Payment' });
        await user.keyboard('{Enter}');
        panel = await screen.findByRole('region', { name: 'Discount above your limit' });
        await user.click(within(panel).getByRole('button', { name: 'Ask a manager' }));
        await user.click(await within(panel).findByRole('button', { name: 'Cancel request' }));
        await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole('region', { name: 'Discount above your limit' })).toBeNull();
      });

      it('APPROVAL_NOT_NEEDED goes on to the payment', async () => {
        create.mockRejectedValueOnce(aboveCap());
        request.mockRejectedValue(refused(409, 'APPROVAL_NOT_NEEDED'));
        const { user } = await open();
        const panel = await refusedSale(user);
        await user.click(within(panel).getByRole('button', { name: 'Ask a manager' }));
        expect(await screen.findByRole('dialog', { name: 'Payment' })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Discount above your limit' })).toBeNull();
        expect(read).not.toHaveBeenCalled();
      });

      it('APPROVAL_INVALID at the sale drops the approval and says so', async () => {
        create
          .mockRejectedValueOnce(aboveCap())
          .mockRejectedValueOnce(refused(409, 'APPROVAL_INVALID'));
        read.mockResolvedValue(approvalOf({ status: 'approved', decided_by_name: 'Sara' }));
        const { user } = await open();
        const panel = await refusedSale(user);
        await user.click(within(panel).getByRole('button', { name: 'Ask a manager' }));
        await within(panel).findByText(/Approved by Sara/);
        await user.keyboard('{F10}');
        await screen.findByRole('dialog', { name: 'Payment' });
        await user.keyboard('{Enter}');
        expect(
          await screen.findByText(
            'This approval does not fit the sale: it may be used, expired, or for another cart.',
          ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('dialog', { name: 'Payment' })).toBeNull();
        expect(screen.queryByRole('region', { name: 'Discount above your limit' })).toBeNull();
        expect(create.mock.calls[1]![0]).toMatchObject({ discount_approval_id: APPROVAL });
      });

      it('Esc closes the panel', async () => {
        create.mockRejectedValueOnce(aboveCap());
        const { user } = await open();
        await refusedSale(user);
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('region', { name: 'Discount above your limit' })).toBeNull();
      });
    });
  });

  describe('hold and resume', () => {
    const storedKey = () =>
      (JSON.parse(sessionStorage.getItem(ACTIVE_KEY) ?? '{}') as { key?: string }).key;

    it('hold empties the cart, the list survives a remount, resume quotes again with a new key', async () => {
      const first = await open();
      await withChair(first.user);
      const keyBefore = storedKey();
      expect(keyBefore).toMatch(/^[0-9a-f-]{36}$/);
      await first.user.keyboard('{F8}');
      const hold = await screen.findByRole('dialog', { name: 'Hold this cart' });
      await first.user.type(within(hold).getByLabelText('Note (optional)'), 'back in 5{Enter}');
      expect(
        await screen.findByText('The cart is empty. Find a product to start.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Held carts (1)' })).toBeInTheDocument();
      // Hold removes the cart on screen from the session too.
      await waitFor(() => expect(sessionStorage.getItem(ACTIVE_KEY)).toBeNull());
      // Not kept: the quote, the approval, the key.
      const kept = JSON.parse(localStorage.getItem(HELD_KEY)!) as Record<string, unknown>[];
      expect(kept).toHaveLength(1);
      expect(kept[0]).not.toHaveProperty('key');
      expect(kept[0]).toMatchObject({ note: 'back in 5', customer: null });
      first.view.unmount();

      const second = await open();
      const quotesBefore = quote.mock.calls.length;
      await second.user.keyboard('{F9}');
      const list = await screen.findByRole('dialog', { name: 'Held carts' });
      expect(within(list).getByText('back in 5')).toBeInTheDocument();
      expect(within(list).getByText('Walk-in customer')).toBeInTheDocument();
      await second.user.click(within(list).getByRole('button', { name: 'Resume' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByRole('button', { name: 'Held carts (0)' })).toBeInTheDocument();
      await waitFor(() => expect(quote.mock.calls.length).toBeGreaterThan(quotesBefore));
      expect(quote).toHaveBeenLastCalledWith({ lines: [{ product_id: CHAIR, quantity: 1 }] });
      await waitFor(() => expect(storedKey()).toMatch(/^[0-9a-f-]{36}$/));
      expect(storedKey()).not.toBe(keyBefore);
    });

    it('resume is not offered while the cart is not empty; Delete removes a held cart', async () => {
      localStorage.setItem(HELD_KEY, JSON.stringify([heldCart(uuidOf(1))]));
      const { user } = await open();
      await withChair(user);
      await user.keyboard('{F9}');
      const list = await screen.findByRole('dialog', { name: 'Held carts' });
      expect(within(list).queryByRole('button', { name: 'Resume' })).toBeNull();
      expect(
        within(list).getByText('Finish or hold the cart on screen to take one back.'),
      ).toBeInTheDocument();
      await user.click(within(list).getByRole('button', { name: 'Delete' }));
      expect(await within(list).findByText('No cart is on hold.')).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem(HELD_KEY)!)).toEqual([]);
    });

    it('the 11th hold is refused', async () => {
      localStorage.setItem(
        HELD_KEY,
        JSON.stringify(Array.from({ length: MAX_HELD_CARTS }, (_, i) => heldCart(uuidOf(i + 1)))),
      );
      const { user } = await open();
      expect(screen.getByRole('button', { name: 'Held carts (10)' })).toBeInTheDocument();
      await withChair(user);
      await user.keyboard('{F8}');
      expect(
        await screen.findByText('10 carts are already on hold. Finish or delete one first.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });

    it('another employee sees no held carts and no cart on screen', async () => {
      localStorage.setItem(HELD_KEY, JSON.stringify([heldCart(uuidOf(1))]));
      sessionStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({ ...heldCart(uuidOf(1)), key: uuidOf(2) }),
      );
      const user = useAuthStore.getState().user!;
      useAuthStore.setState({ user: { ...user, id: OTHER_USER } });
      await open();
      expect(screen.getByRole('button', { name: 'Held carts (0)' })).toBeInTheDocument();
      expect(screen.getByText('The cart is empty. Find a product to start.')).toBeInTheDocument();
    });

    it('broken stored data is ignored', async () => {
      localStorage.setItem(
        HELD_KEY,
        JSON.stringify([{ nonsense: true }, heldCart(uuidOf(1)), { ...heldCart('x'), lines: 5 }]),
      );
      sessionStorage.setItem(ACTIVE_KEY, '{not json');
      const first = await open();
      expect(screen.getByRole('button', { name: 'Held carts (1)' })).toBeInTheDocument();
      expect(screen.getByText('The cart is empty. Find a product to start.')).toBeInTheDocument();
      first.view.unmount();

      localStorage.setItem(HELD_KEY, 'not json at all');
      await open();
      expect(screen.getByRole('button', { name: 'Held carts (0)' })).toBeInTheDocument();
    });

    it('the screen works when the storage throws', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      // The signed-in session is in memory already.
      const { user } = await open();
      await withChair(user);
      await user.keyboard('{F8}');
      const hold = await screen.findByRole('dialog', { name: 'Hold this cart' });
      await user.click(within(hold).getByRole('button', { name: 'Hold the cart' }));
      expect(await screen.findByRole('button', { name: 'Held carts (1)' })).toBeInTheDocument();
    });
  });

  describe('refresh', () => {
    it('a remount restores the cart with the same key; a completed sale clears it', async () => {
      const first = await open();
      await withChair(first.user);
      await first.user.click(screen.getByRole('button', { name: 'One more: Chair' }));
      await waitFor(() =>
        expect(JSON.parse(sessionStorage.getItem(ACTIVE_KEY)!)).toMatchObject({
          lines: [{ product_id: CHAIR, quantity: '2' }],
        }),
      );
      const key = (JSON.parse(sessionStorage.getItem(ACTIVE_KEY)!) as { key: string }).key;
      first.view.unmount();

      const second = await open();
      expect(await screen.findByLabelText('Quantity: Chair')).toHaveValue('2');
      await waitFor(() => expect(confirmButton()).toBeEnabled());
      await second.user.keyboard('{F10}');
      await screen.findByRole('dialog', { name: 'Payment' });
      await second.user.keyboard('{Enter}');
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]![1]).toBe(key);
      await screen.findByRole('heading', { name: 'Sale MAIN-SL-26-000009 completed' });
      await waitFor(() => expect(sessionStorage.getItem(ACTIVE_KEY)).toBeNull());
    });
  });

  describe('shortcuts', () => {
    it('F2 and F7 move the focus; F4, F8, F9 and F10 open their dialogs; Esc closes them', async () => {
      vi.spyOn(customersApi, 'list').mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
      });
      const { user, search } = await open();
      await withChair(user);
      await user.keyboard('{F7}');
      expect(screen.getByLabelText('Sale discount')).toHaveFocus();
      await user.keyboard('{F2}');
      expect(search).toHaveFocus();

      const dialogs: [string, string][] = [
        ['{F4}', 'Customer'],
        ['{F8}', 'Hold this cart'],
        ['{F9}', 'Held carts'],
        ['{F10}', 'Payment'],
      ];
      for (const [key, name] of dialogs) {
        await user.keyboard(key);
        expect(await screen.findByRole('dialog', { name })).toBeInTheDocument();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        // The search box gets the focus back when a dialog closes.
        await waitFor(() => expect(search).toHaveFocus());
      }
      expect(create).not.toHaveBeenCalled();
    });

    it('no key fires an action behind an open dialog', async () => {
      const { user } = await open();
      await withChair(user);
      await user.keyboard('{F9}');
      const list = await screen.findByRole('dialog', { name: 'Held carts' });
      await user.keyboard('{F4}{F8}{F10}{F2}{F7}');
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(list).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Payment' })).toBeNull();
      expect(screen.queryByRole('dialog', { name: 'Customer' })).toBeNull();
      expect(screen.queryByRole('dialog', { name: 'Hold this cart' })).toBeNull();
      expect(create).not.toHaveBeenCalled();
    });

    it('the buttons show their keys and the help lists them', async () => {
      const { user } = await open();
      await withChair(user);
      expect(confirmButton()).toHaveAttribute('aria-keyshortcuts', 'F10');
      expect(confirmButton()).toHaveTextContent('F10');
      expect(screen.getByRole('button', { name: 'Hold' })).toHaveTextContent('F8');
      await user.click(screen.getByRole('button', { name: 'Shortcuts' }));
      const help = await screen.findByRole('dialog', { name: 'Shortcuts' });
      for (const key of ['F2', 'F4', 'F7', 'F8', 'F9', 'F10', 'Esc', 'Enter']) {
        expect(within(help).getByText(key)).toBeInTheDocument();
      }
    });
  });
});

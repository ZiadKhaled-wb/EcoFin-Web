import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import {
  Quotation,
  type Product,
  type ProductUnit,
  type QuotationStatus,
  type SalesOrder,
} from '@ziadkhaled-wb/contracts';
import { renderApp } from '@/test/renderApp';
import { ApiError } from '@/lib/api';
import { quotationsApi } from '@/services/quotationsApi';
import { salesOrdersApi } from '@/services/salesOrdersApi';
import { productsApi } from '@/services/productsApi';
import { useOfflineStore } from '@/offline/store';
import { initialMode } from '@/offline/mode';
import { QuotationEditor, QuotationPrint } from './QuotationsPage';
import { duplicateQuotation, priceLocked, quotationActions } from './quotationRules';
const ID = vi.hoisted(() => 'a7090000-0000-4000-8000-000000000001');
const permission = vi.hoisted(() => ({ override: false, order: false }));
vi.mock('@/features/me/useCan', () => ({
  useCan: (key: string) => (key === 'order.manage' ? permission.order : permission.override),
}));
vi.mock('@/services/salesOrdersApi', () => ({
  salesOrdersApi: { list: vi.fn(), fromQuote: vi.fn() },
}));
vi.mock('@/features/me/useBranches', () => ({
  useBranches: () => ({ data: [{ id: ID, name: 'Main' }] }),
}));
vi.mock('@/features/me/useMe', () => ({
  useMe: () => ({ data: { org: { timezone: 'Africa/Cairo' } } }),
}));
vi.mock('@/services/quotationsApi', () => ({
  quotationsApi: { get: vi.fn(), create: vi.fn(), update: vi.fn(), move: vi.fn() },
}));
vi.mock('@/services/customersApi', () => ({
  customersApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
}));
vi.mock('@/services/settingsApi', () => ({
  settingsApi: {
    get: vi.fn().mockResolvedValue({
      prices_include_vat: true,
      default_tax_class_id: ID,
      tax_class_options: [{ id: ID, rate: '14' }],
    }),
  },
}));
const fixture = (status: QuotationStatus = 'draft') =>
  Quotation.parse({
    id: ID,
    number: 'BR1-QT-26-1',
    branch_id: ID,
    customer_id: ID,
    status,
    effective_status: status,
    valid_until: '2026-11-05',
    prices_include_vat: true,
    subtotal: '114.00',
    discount_total: '0.00',
    tax_total: '14.00',
    total: '114.00',
    notes: 'Quote notes',
    status_reason: null,
    created_at: '2026-10-23T10:00:00Z',
    updated_at: '2026-10-23T10:00:00Z',
    sent_at: null,
    accepted_at: null,
    customer: { id: ID, name: 'Customer', phone: '01012345678' },
    branch: { id: ID, name: 'Main', address: 'Cairo' },
    shop: { legal_name: 'Shop' },
    lines: [
      {
        id: ID,
        line_no: 1,
        product_id: ID,
        description: 'Chair',
        custom_notes: 'Blue fabric',
        quantity: 1,
        unit_price: '114.00',
        discount_amount: '0.00',
        tax_class_id: ID,
        tax_rate: '14.00',
        tax_amount: '14.00',
        line_total: '114.00',
      },
    ],
  });
async function editor(status: QuotationStatus = 'draft') {
  vi.mocked(quotationsApi.get).mockResolvedValue(fixture(status));
  await renderApp(
    <Routes>
      <Route path="/sales/quotations/:id" element={<QuotationEditor />} />
    </Routes>,
    { lang: 'en', route: '/sales/quotations/' + ID },
  );
  await screen.findByRole('heading', { name: 'BR1-QT-26-1' });
}
beforeEach(() => {
  vi.clearAllMocks();
  permission.override = false;
  permission.order = false;
});
describe('S09 quotations', () => {
  it('W1 locks product price without override and permits custom price', async () => {
    await editor();
    expect(screen.getByLabelText('Unit price')).toHaveAttribute('readonly');
    expect(priceLocked({ ...fixture().lines[0]!, product_id: null }, false)).toBe(false);
    expect(priceLocked(fixture().lines[0]!, true)).toBe(false);
  });
  it('W2 draft and sent actions match the state machine', () => {
    expect(quotationActions('draft')).toEqual(['send', 'cancel']);
    expect(quotationActions('sent')).toEqual(['accept', 'reject', 'cancel']);
  });
  for (const status of ['accepted', 'rejected', 'cancelled', 'expired'] as const)
    it('W2 ' + status + ' is read only', async () => {
      await editor(status);
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Unit price')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
    });
  it('W3 cancel requires a reason', async () => {
    const user = userEvent.setup();
    await editor();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: 'Reason' }),
      'Customer requested cancellation',
    );
    expect(confirm).toBeEnabled();
  });
  it('W3 stale save reports the conflict and reloads', async () => {
    vi.mocked(quotationsApi.update).mockRejectedValue(
      new ApiError(409, 'QUOTATION_STALE', 'stale'),
    );
    const user = userEvent.setup();
    await editor();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('This quote was changed by someone else');
    await waitFor(() => expect(quotationsApi.get).toHaveBeenCalledTimes(2));
  });
  it('W4 duplicate copies editable inputs and customer without frozen state', () => {
    const q = fixture('accepted'),
      copy = duplicateQuotation(q);
    expect(copy.customer_id).toBe(q.customer_id);
    expect(copy.lines[0]).toMatchObject({
      product_id: ID,
      description: 'Chair',
      unit_price: '114.00',
      quantity: 1,
    });
    expect(copy).not.toHaveProperty('status');
    expect(copy.lines[0]).not.toHaveProperty('tax_amount');
  });
  for (const lang of ['ar', 'en'] as const)
    it('E1 print uses stored totals in ' + lang, async () => {
      await renderApp(<QuotationPrint quote={fixture('accepted')} />, { lang });
      expect(screen.getAllByText('114.00').length).toBeGreaterThan(0);
      expect(screen.getByText('Blue fabric')).toBeInTheDocument();
      expect(document.querySelector('article')).toHaveAttribute(
        'dir',
        lang === 'ar' ? 'rtl' : 'ltr',
      );
    });
  describe('W4 create order from an accepted quote', () => {
    const ORDER = 'a7090000-0000-4000-8000-0000000000f1';
    const orders = (quotationId: string | null) => ({
      total: 1,
      items: [
        {
          id: ORDER,
          number: 'BR1-SO-26-9',
          quotation: quotationId ? { id: quotationId, number: 'BR1-QT-26-1' } : null,
        } as SalesOrder,
      ],
    });
    it('W4 shows Create order on an accepted quote without an order', async () => {
      permission.order = true;
      vi.mocked(salesOrdersApi.list).mockResolvedValue(orders(null));
      await editor('accepted');
      expect(await screen.findByRole('button', { name: 'Create order' })).toBeEnabled();
      expect(salesOrdersApi.list).toHaveBeenCalledWith({ customer_id: ID, page_size: 100 });
    });
    for (const status of ['draft', 'sent'] as const)
      it('W4 no Create order on a ' + status + ' quote', async () => {
        permission.order = true;
        vi.mocked(salesOrdersApi.list).mockResolvedValue(orders(null));
        await editor(status);
        expect(screen.queryByRole('button', { name: 'Create order' })).not.toBeInTheDocument();
        expect(salesOrdersApi.list).not.toHaveBeenCalled();
      });
    it('W4 an already ordered accepted quote links to its order instead', async () => {
      permission.order = true;
      vi.mocked(salesOrdersApi.list).mockResolvedValue(orders(ID));
      await editor('accepted');
      expect(await screen.findByRole('link', { name: 'Order BR1-SO-26-9' })).toHaveAttribute(
        'href',
        '/sales/orders/' + ORDER,
      );
      expect(screen.queryByRole('button', { name: 'Create order' })).not.toBeInTheDocument();
    });
    describe('W3 offline POS hides Create order', () => {
      beforeEach(() => {
        useOfflineStore.setState({ mode: { ...initialMode(), mode: 'offline' } });
      });
      afterEach(() => {
        useOfflineStore.setState({ mode: initialMode() });
      });
      it('W3 no Create order on an accepted quote in the offline POS', async () => {
        permission.order = true;
        vi.mocked(salesOrdersApi.list).mockResolvedValue(orders(null));
        await editor('accepted');
        await waitFor(() => expect(salesOrdersApi.list).toHaveBeenCalled());
        expect(screen.queryByRole('button', { name: 'Create order' })).not.toBeInTheDocument();
      });
    });
    it('W4 no Create order without order.manage', async () => {
      vi.mocked(salesOrdersApi.list).mockResolvedValue(orders(null));
      await editor('accepted');
      expect(screen.queryByRole('button', { name: 'Create order' })).not.toBeInTheDocument();
      expect(salesOrdersApi.list).not.toHaveBeenCalled();
    });
    it('W4 conversion needs a product for a custom line and serials, then opens the order', async () => {
      const PHONE = 'a7090000-0000-4000-8000-0000000000a1';
      const UNIT = 'a7090000-0000-4000-8000-0000000000c1';
      permission.order = true;
      const quote = fixture('accepted');
      vi.mocked(quotationsApi.get).mockResolvedValue({
        ...quote,
        lines: [
          ...quote.lines,
          { ...quote.lines[0]!, id: UNIT, line_no: 2, product_id: null, description: 'Custom' },
        ],
      });
      vi.mocked(salesOrdersApi.list).mockResolvedValue(orders(null));
      vi.mocked(salesOrdersApi.fromQuote).mockResolvedValue({ id: ORDER } as SalesOrder);
      const chair = { id: ID, name_ar: 'كرسي', name_en: 'Chair', sku: 'C', is_serialized: false };
      const phone = { id: PHONE, name_ar: 'هاتف', name_en: 'Phone', sku: 'P', is_serialized: true };
      const get = vi.spyOn(productsApi, 'get').mockResolvedValue(chair as Product);
      const list = vi
        .spyOn(productsApi, 'list')
        .mockResolvedValue({ items: [phone as Product], total: 1, page: 1, pageSize: 20 });
      const units = vi
        .spyOn(productsApi, 'units')
        .mockResolvedValue([
          { id: UNIT, serial: 'SN-9', branch_id: ID, status: 'in_stock' } as ProductUnit,
        ]);
      const user = userEvent.setup();
      await renderApp(
        <Routes>
          <Route path="/sales/quotations/:id" element={<QuotationEditor />} />
          <Route path="/sales/orders/:id" element={<p>order page</p>} />
        </Routes>,
        { lang: 'en', route: '/sales/quotations/' + ID },
      );
      await user.click(await screen.findByRole('button', { name: 'Create order' }));
      const dialog = within(await screen.findByRole('dialog'));
      const confirm = dialog.getByRole('button', { name: 'Confirm order' });
      await waitFor(() => expect(get).toHaveBeenCalledWith(ID));
      expect(confirm).toBeDisabled();
      await user.type(dialog.getByLabelText('Product for this line'), 'ph');
      await user.click(await dialog.findByRole('button', { name: /Phone/ }));
      expect(confirm).toBeDisabled();
      await user.click(await dialog.findByRole('checkbox', { name: 'SN-9' }));
      expect(confirm).toBeEnabled();
      await user.type(dialog.getByLabelText('Delivery address'), '12 Nile St');
      await user.click(confirm);
      await screen.findByText('order page');
      expect(salesOrdersApi.fromQuote).toHaveBeenCalledWith(
        ID,
        {
          delivery_address: '12 Nile St',
          line_options: {
            '1': { fulfilment: 'from_stock' },
            '2': { fulfilment: 'from_stock', product_id: PHONE, unit_ids: [UNIT] },
          },
        },
        expect.any(String),
      );
      for (const spy of [get, list, units]) spy.mockRestore();
    });
  });
});

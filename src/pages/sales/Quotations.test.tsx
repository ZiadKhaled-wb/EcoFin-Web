import { beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Quotation, type QuotationStatus } from '@ziadkhaled-wb/contracts';
import { renderApp } from '@/test/renderApp';
import { ApiError } from '@/lib/api';
import { quotationsApi } from '@/services/quotationsApi';
import { QuotationEditor, QuotationPrint } from './QuotationsPage';
import { duplicateQuotation, priceLocked, quotationActions } from './quotationRules';
const ID = vi.hoisted(() => 'a7090000-0000-4000-8000-000000000001');
const permission = vi.hoisted(() => ({ override: false }));
vi.mock('@/features/me/useCan', () => ({ useCan: () => permission.override }));
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
});

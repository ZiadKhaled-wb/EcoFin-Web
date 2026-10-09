import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { SupplierStatement } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { branchApi } from '@/services/branchApi';
import { suppliersApi } from '@/services/suppliersApi';
import { renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import SupplierStatementPage from './SupplierStatementPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const SUPPLIER_ID = 'a0530000-0000-4000-8000-000000000001';
const MAIN = 'a0530000-0000-4000-8000-000000000011';
const OTHER = 'a0530000-0000-4000-8000-000000000012';
const doc = (n: number) => `a0530000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const timestamp = '2026-10-11T09:00:00.000Z';

const statement = (over: Partial<SupplierStatement> = {}): SupplierStatement => ({
  supplier: {
    id: SUPPLIER_ID,
    name: 'Nile Traders',
    phone: '01012345678',
    tax_registration_no: '123-456-789',
    address: 'Giza',
    payment_terms_days: 30,
    notes: null,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    balance: '1050.25',
  },
  from: '2026-09-10',
  to: null,
  opening_balance: '600.00',
  closing_balance: '1050.25',
  totals: { invoiced: '500.50', paid: '0.00', returned: '50.25' },
  rows: [
    {
      date: '2026-09-10',
      kind: 'invoice',
      document_id: doc(1),
      number: 'PI-2026-000002',
      reference: 'S-200',
      branch_id: MAIN,
      refund_mode: null,
      debit: '500.50',
      credit: '0.00',
      balance: '1100.50',
    },
    {
      date: '2026-09-12',
      kind: 'payment',
      document_id: doc(2),
      number: 'SP-2026-000002',
      reference: null,
      branch_id: MAIN,
      refund_mode: null,
      debit: '0.00',
      credit: '100.00',
      balance: '1000.50',
    },
    {
      date: '2026-09-13',
      kind: 'payment_reversal',
      document_id: doc(3),
      number: 'SP-2026-000003',
      reference: null,
      branch_id: MAIN,
      refund_mode: null,
      debit: '100.00',
      credit: '0.00',
      balance: '1100.50',
    },
    {
      date: '2026-09-15',
      kind: 'return',
      document_id: doc(4),
      number: 'PR-2026-000001',
      reference: 'PI-2026-000001',
      branch_id: OTHER,
      refund_mode: 'supplier_credit',
      debit: '0.00',
      credit: '50.25',
      balance: '1050.25',
    },
    {
      date: '2026-09-16',
      kind: 'return',
      document_id: doc(5),
      number: 'PR-2026-000002',
      reference: 'PI-2026-000002',
      branch_id: MAIN,
      refund_mode: 'cash',
      debit: '0.00',
      credit: '0.00',
      balance: '1050.25',
    },
  ],
  ...over,
});

const page = (
  <Routes>
    <Route path="/suppliers/:id" element={<SupplierStatementPage />} />
  </Routes>
);
async function rows() {
  const table = await screen.findByRole('table', { name: t('suppliers.statement.caption') });
  return within(table).getAllByRole('row');
}

describe('U01 supplier statement page', () => {
  beforeEach(() => {
    signIn();
    // Only the main branch is the caller's: the statement is shop-wide, so OTHER shows "—".
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: MAIN, code: 'B1', name: 'Main', is_main: true },
    ] as Awaited<ReturnType<typeof branchApi.list>>);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows the opening row, every row with its running balance, the closing balance and totals', async () => {
    const api = vi.spyOn(suppliersApi, 'statement').mockResolvedValue(statement());
    await renderApp(page, { lang: 'en', route: `/suppliers/${SUPPLIER_ID}?from=2026-09-10` });
    const all = await rows();
    // header, opening, 5 documents, closing
    expect(all).toHaveLength(8);
    expect(within(all[1]!).getByText(t('suppliers.statement.opening'))).toBeInTheDocument();
    expect(within(all[1]!).getByText('600.00 EGP')).toBeInTheDocument();

    const invoice = all[2]!;
    expect(within(invoice).getByText('Purchase invoice')).toBeInTheDocument();
    expect(within(invoice).getByText('PI-2026-000002')).toHaveAttribute('dir', 'ltr');
    expect(within(invoice).getByText('S-200')).toBeInTheDocument();
    expect(within(invoice).getByText('Main')).toBeInTheDocument();
    expect(within(invoice).getByText('500.50 EGP')).toBeInTheDocument();
    expect(within(invoice).getByText('1,100.50 EGP')).toBeInTheDocument();
    expect(within(all[3]!).getByText('1,000.50 EGP')).toBeInTheDocument();
    expect(within(all[4]!).getByText('Payment reversal')).toBeInTheDocument();
    expect(within(all[5]!).getByText('—')).toBeInTheDocument();
    const cash = all[6]!;
    expect(within(cash).getByText(t('suppliers.statement.cashRefund'))).toBeInTheDocument();
    expect(within(cash).getAllByText('0.00 EGP')).toHaveLength(2);

    const closing = all[7]!;
    expect(within(closing).getByText(t('suppliers.statement.closing'))).toBeInTheDocument();
    expect(within(closing).getByText('1,050.25 EGP')).toBeInTheDocument();
    expect(screen.getByText(t('suppliers.statement.invoiced')).nextSibling).toHaveTextContent(
      '500.50 EGP',
    );
    expect(screen.getByText(t('suppliers.statement.returned')).nextSibling).toHaveTextContent(
      '50.25 EGP',
    );
    expect(screen.getByRole('heading', { name: 'Nile Traders' })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(SUPPLIER_ID, { from: '2026-09-10' });
  });

  it('works in Arabic', async () => {
    vi.spyOn(suppliersApi, 'statement').mockResolvedValue(statement());
    await renderApp(page, { lang: 'ar', route: `/suppliers/${SUPPLIER_ID}` });
    const all = await rows();
    expect(within(all[0]!).getByRole('columnheader', { name: 'مدين' })).toBeInTheDocument();
    expect(within(all[0]!).getByRole('columnheader', { name: 'دائن' })).toBeInTheDocument();
    expect(within(all[1]!).getByText('رصيد أول المدة')).toBeInTheDocument();
    expect(within(all[2]!).getByText('فاتورة مشتريات')).toBeInTheDocument();
    expect(within(all[7]!).getByText('1,050.25 ج.م')).toBeInTheDocument();
    expect(screen.getByText('إجمالي المستحق')).toBeInTheDocument();
  });

  it('keeps the dates in the URL and sends them', async () => {
    const api = vi.spyOn(suppliersApi, 'statement').mockResolvedValue(statement());
    await renderApp(page, {
      lang: 'en',
      route: `/suppliers/${SUPPLIER_ID}?from=2026-09-01&to=2026-09-30`,
    });
    await rows();
    expect(api).toHaveBeenCalledWith(SUPPLIER_ID, { from: '2026-09-01', to: '2026-09-30' });
    expect(screen.getByLabelText(t('suppliers.statement.from'))).toHaveValue('2026-09-01');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('suppliers.statement.clearDates') }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith(SUPPLIER_ID, {}));
  });

  it('ignores a malformed date in the URL', async () => {
    const api = vi.spyOn(suppliersApi, 'statement').mockResolvedValue(statement());
    await renderApp(page, { lang: 'en', route: `/suppliers/${SUPPLIER_ID}?from=yesterday` });
    await rows();
    expect(api).toHaveBeenCalledWith(SUPPLIER_ID, {});
  });

  it('shows an empty period', async () => {
    vi.spyOn(suppliersApi, 'statement').mockResolvedValue(
      statement({ rows: [], opening_balance: '1050.25', closing_balance: '1050.25' }),
    );
    await renderApp(page, { lang: 'en', route: `/suppliers/${SUPPLIER_ID}` });
    expect(await screen.findByText(t('suppliers.statement.empty'))).toBeInTheDocument();
  });

  it('makes no API call for an id that is not a UUID', async () => {
    const api = vi.spyOn(suppliersApi, 'statement');
    await renderApp(page, { lang: 'en', route: '/suppliers/not-a-uuid' });
    expect(await screen.findByText(t('suppliers.statement.notFound'))).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("shows not found for another shop's supplier", async () => {
    vi.spyOn(suppliersApi, 'statement').mockRejectedValue(
      new ApiError(404, 'SUPPLIER_NOT_FOUND', 'Not found.'),
    );
    await renderApp(page, { lang: 'en', route: `/suppliers/${SUPPLIER_ID}` });
    expect(await screen.findByText(t('suppliers.statement.notFound'))).toBeInTheDocument();
  });
});

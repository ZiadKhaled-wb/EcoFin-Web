import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { CustomerStatement } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { meFixture, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { customerAccountApi } from '@/services/customerAccountApi';
import { t } from '@/i18n';
import CustomerStatementPage from './CustomerStatementPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER_ID = 'a0740000-0000-4000-8000-0000000000c1';
const ID = 'a0740000-0000-4000-8000-0000000000a1';

const statement = (over: Partial<CustomerStatement> = {}): CustomerStatement => ({
  customer: {
    id: CUSTOMER_ID,
    full_name: 'Statement Customer',
    status: 'active',
    phones: ['01001234567'],
  },
  from: null,
  to: null,
  opening_balance: '0.00',
  closing_balance: '3560.00',
  totals: { debit: '6900.00', credit: '3340.00' },
  rows: [
    {
      date: '2026-09-20',
      kind: 'sale',
      document_id: ID,
      number: 'BR1-SL-26-000020',
      detail: null,
      reference: null,
      debit: '5000.00',
      credit: '0.00',
      balance: '5000.00',
    },
    {
      date: '2026-09-20',
      kind: 'contract',
      document_id: 'a0740000-0000-4000-8000-0000000000a2',
      number: 'BR1-CT-26-000003',
      detail: 'BR1-SL-26-000020',
      reference: null,
      debit: '800.00',
      credit: '0.00',
      balance: '5800.00',
    },
    {
      date: '2026-09-20',
      kind: 'payment_in',
      document_id: 'a0740000-0000-4000-8000-0000000000a3',
      number: 'BR1-PY-26-000031',
      detail: 'bank_transfer',
      reference: 'TRX-31',
      debit: '0.00',
      credit: '1000.00',
      balance: '4800.00',
    },
    {
      date: '2026-10-06',
      kind: 'return',
      document_id: 'a0740000-0000-4000-8000-0000000000a4',
      number: 'BR1-RT-26-000004',
      detail: 'void',
      reference: null,
      debit: '0.00',
      credit: '500.00',
      balance: '4300.00',
    },
  ],
  ...over,
});

const renderPage = (route = `/customers/${CUSTOMER_ID}/statement`, lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/customers/:id/statement" element={<CustomerStatementPage />} />
    </Routes>,
    { lang, route },
  );
const table = () => screen.findByRole('table', { name: t('customerAccount.statement.caption') });

describe('R02 customer statement page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['customer.create']));
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    vi.spyOn(customerAccountApi, 'statement').mockResolvedValue(statement());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['en', 'ar'] as const)(
    'shows the rows with the running balance, opening and closing (%s)',
    async (lang) => {
      await renderPage(undefined, lang);
      const rows = within(await table());
      expect(rows.getByText(t('customerAccount.statement.opening'))).toBeInTheDocument();
      expect(rows.getByText(t('customerAccount.statement.closing'))).toBeInTheDocument();
      expect(rows.getByText(t('customerAccount.statement.kind.contract'))).toBeInTheDocument();
      expect(
        rows.getByText(t('customerAccount.statement.ofSale', { number: 'BR1-SL-26-000020' })),
      ).toBeInTheDocument();
      expect(
        rows.getByText(t('customerAccount.payments.methodName.bank_transfer')),
      ).toBeInTheDocument();
      expect(rows.getByText('TRX-31')).toBeInTheDocument();
      expect(rows.getByText(t('customerAccount.returns.kind.void'))).toBeInTheDocument();
      expect(rows.getAllByText(formatMoney('3560.00')).length).toBeGreaterThan(0);
      expect(rows.getByRole('link', { name: 'BR1-SL-26-000020' })).toHaveAttribute(
        'href',
        `/sales/${ID}`,
      );
      expect(customerAccountApi.statement).toHaveBeenCalledWith(CUSTOMER_ID, {});
    },
  );

  it('the dates live in the URL and are sent to the server', async () => {
    await renderPage(`/customers/${CUSTOMER_ID}/statement?from=2026-10-01&to=2026-10-15`);
    await table();
    expect(customerAccountApi.statement).toHaveBeenCalledWith(CUSTOMER_ID, {
      from: '2026-10-01',
      to: '2026-10-15',
    });
    await userEvent.click(
      screen.getByRole('button', { name: t('customerAccount.statement.clearDates') }),
    );
    await waitFor(() =>
      expect(customerAccountApi.statement).toHaveBeenLastCalledWith(CUSTOMER_ID, {}),
    );
  });

  it('a range the server refuses shows the range message and no print', async () => {
    vi.spyOn(customerAccountApi, 'statement').mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', 'Validation failed.'),
    );
    await renderPage(`/customers/${CUSTOMER_ID}/statement?from=2020-01-01&to=2026-01-01`);
    expect(
      await screen.findByText(t('customerAccount.errors.VALIDATION_FAILED')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('customerAccount.statement.print') }),
    ).toBeDisabled();
  });

  it('another shop’s or an unknown customer shows not found', async () => {
    vi.spyOn(customerAccountApi, 'statement').mockRejectedValue(
      new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.'),
    );
    await renderPage();
    expect(await screen.findByText(t('customerAccount.statement.notFound'))).toBeInTheDocument();
  });

  it('prints an A4 sheet with the shop, the customer, the period and the rows', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await renderPage();
    await table();
    const button = screen.getByRole('button', { name: t('customerAccount.statement.print') });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(print).toHaveBeenCalled();
    const sheet = document.querySelector('.print-root .customer-statement');
    expect(sheet).not.toBeNull();
    const s = within(sheet as HTMLElement);
    expect(s.getByText(meFixture().org.name)).toBeInTheDocument();
    expect(s.getByText('Statement Customer')).toBeInTheDocument();
    expect(s.getByText('01001234567')).toBeInTheDocument();
    expect(s.getByText('BR1-RT-26-000004')).toBeInTheDocument();
    // Printed rows are plain text, not links.
    expect(s.queryByRole('link')).toBeNull();
  });
});

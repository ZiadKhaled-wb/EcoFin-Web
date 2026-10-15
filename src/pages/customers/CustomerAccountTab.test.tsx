import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  Customer,
  CustomerAccount,
  CustomerContractSchedule,
  CustomerContractSummary,
  PermissionKey,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { creditApi } from '@/services/creditApi';
import { customerAccountApi } from '@/services/customerAccountApi';
import { customersApi } from '@/services/customersApi';
import { guarantorsApi } from '@/services/guarantorsApi';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { t } from '@/i18n';
import CustomerPage from './CustomerPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER_ID = 'a0740000-0000-4000-8000-0000000000c1';
const CONTRACT_ID = 'a0740000-0000-4000-8000-0000000000a1';
const SALE_ID = 'a0740000-0000-4000-8000-0000000000a2';
const BRANCH = { id: 'a0740000-0000-4000-8000-0000000000b1', name: 'Main' };
const AT = '2026-10-16T09:00:00.000Z';

const customer = (): Customer => ({
  id: CUSTOMER_ID,
  full_name: 'Ahmed Ali Hassan',
  phones: ['01001234567'],
  national_id: null,
  national_id_masked: '**********0015',
  birth_date: '1990-01-01',
  gender: 'male',
  governorate_code: '01',
  address: null,
  city: null,
  job: null,
  employer: null,
  monthly_income: '8000.00',
  is_business: false,
  tax_registration_no: null,
  status: 'active',
  notes: null,
  id_photos_count: 0,
  created_at: AT,
  updated_at: AT,
});

const contract = (over: Partial<CustomerContractSummary> = {}): CustomerContractSummary => ({
  id: CONTRACT_ID,
  number: 'BR1-CT-26-000001',
  status: 'active',
  branch: BRANCH,
  sale_id: SALE_ID,
  sale_number: 'BR1-SL-26-000010',
  issued_at: AT,
  is_migrated: false,
  cash_price: '10000.00',
  down_payment: '0.00',
  financed_amount: '10000.00',
  markup_amount: '2000.00',
  total_payable: '12000.00',
  contract_total: '12000.00',
  paid: '3000.00',
  remaining: '9000.00',
  fees_due: '100.00',
  overdue_amount: '3000.00',
  overdue_lines: 1,
  max_days_late: 5,
  next_due_date: '2026-10-11',
  installments_count: 4,
  frequency: 'monthly',
  first_due_date: '2026-09-16',
  ...over,
});

const zeroAging = {
  not_yet_due: '0.00',
  late_1_30: '0.00',
  late_31_60: '0.00',
  late_61_90: '0.00',
  late_90_plus: '0.00',
};

const account = (over: Partial<CustomerAccount> = {}): CustomerAccount => ({
  customer: { id: CUSTOMER_ID, full_name: 'Ahmed Ali Hassan', status: 'active', phones: [] },
  balance: {
    contract_totals: '19200.00',
    payments: '3000.00',
    returns: '1200.00',
    open_balance: '15000.00',
    fees_due: '100.00',
    total_due: '15100.00',
    store_credit: '50.00',
    credit_limit: '20000.00',
    available: '6000.00',
  },
  overdue: {
    overdue_amount: '3000.00',
    overdue_lines: 1,
    max_days_late: 5,
    next_due_date: '2026-10-11',
    next_due_amount: '3000.00',
    aging: { ...zeroAging, not_yet_due: '6000.00', late_1_30: '3000.00' },
  },
  totals: {
    purchases_count: 2,
    purchases_total: '16000.00',
    returns_count: 1,
    returns_total: '1200.00',
    payments_in: '3000.00',
    payments_out: '0.00',
    last_purchase_at: AT,
    last_payment_at: AT,
  },
  contracts: [contract()],
  recent_payments: [
    {
      id: 'a0740000-0000-4000-8000-0000000000b3',
      number: 'BR1-PY-26-000001',
      direction: 'in',
      method: 'bank_transfer',
      amount: '3000.00',
      reference: 'TRX-77',
      received_at: AT,
      business_date: '2026-10-16',
      branch: BRANCH,
      allocated_to: [
        { kind: 'schedule_line', document_number: 'BR1-CT-26-000001 #1', amount: '3000.00' },
      ],
    },
  ],
  recent_returns: [
    {
      id: 'a0740000-0000-4000-8000-0000000000b4',
      number: 'BR1-RT-26-000001',
      kind: 'return',
      refund_method: 'contract_adjustment',
      total: '1200.00',
      sale_id: 'a0740000-0000-4000-8000-0000000000b5',
      sale_number: 'BR1-SL-26-000011',
      business_date: '2026-10-15',
      created_at: AT,
    },
  ],
  documents_count: 0,
  ...over,
});

const emptyAccount = () =>
  account({
    balance: {
      contract_totals: '0.00',
      payments: '0.00',
      returns: '0.00',
      open_balance: '0.00',
      fees_due: '0.00',
      total_due: '0.00',
      store_credit: '0.00',
      credit_limit: '0.00',
      available: '0.00',
    },
    overdue: {
      overdue_amount: '0.00',
      overdue_lines: 0,
      max_days_late: null,
      next_due_date: null,
      next_due_amount: null,
      aging: zeroAging,
    },
    totals: {
      purchases_count: 0,
      purchases_total: '0.00',
      returns_count: 0,
      returns_total: '0.00',
      payments_in: '0.00',
      payments_out: '0.00',
      last_purchase_at: null,
      last_payment_at: null,
    },
    contracts: [],
    recent_payments: [],
    recent_returns: [],
  });

const schedule = (): CustomerContractSchedule => {
  const line = (
    seq: number,
    status: CustomerContractSchedule['lines'][number]['status'],
    over = {},
  ) => ({
    id: `a0740000-0000-4000-8000-00000000${String(10 + seq).padStart(4, '0')}`,
    version: 2,
    seq,
    due_date: '2026-10-11',
    principal: '2500.00',
    profit: '500.00',
    amount: '3000.00',
    paid: status === 'paid' ? '3000.00' : '0.00',
    remaining: status === 'paid' ? '0.00' : '3000.00',
    fees_due: '0.00',
    days_late: status === 'overdue' ? 5 : 0,
    status,
    superseded: false,
    ...over,
  });
  return {
    contract: contract(),
    lines: [
      line(1, 'paid'),
      line(2, 'overdue'),
      line(3, 'upcoming'),
      line(1, 'superseded', { version: 1, superseded: true }),
    ],
    charges: [
      {
        id: 'a0740000-0000-4000-8000-0000000000c9',
        schedule_line_id: 'a0740000-0000-4000-8000-000000000012',
        seq: 2,
        kind: 'late_fee',
        assessed_on: '2026-10-13',
        amount: '150.00',
        waived: '50.00',
        paid: '0.00',
        due: '100.00',
      },
    ],
  };
};

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}

const renderTab = (lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/customers/:id" element={<CustomerPage />} />
    </Routes>,
    { lang, route: `/customers/${CUSTOMER_ID}?tab=account` },
  );

describe('R02 customer account tab', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['customer.create', 'sale.create']);
    vi.spyOn(customersApi, 'get').mockResolvedValue(customer());
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([]);
    vi.spyOn(creditApi, 'profile').mockRejectedValue(new Error('not on this tab'));
    vi.spyOn(customerAccountApi, 'account').mockResolvedValue(account());
    vi.spyOn(salesHistoryApi, 'list').mockResolvedValue({
      items: [
        {
          id: 'a0740000-0000-4000-8000-0000000000d2',
          number: 'BR1-SL-26-000010',
          issued_at: AT,
          business_date: '2026-10-16',
          branch: BRANCH,
          cashier: { id: null, name: 'Mona' },
          customer: { id: CUSTOMER_ID, name: 'Ahmed Ali Hassan' },
          total: '10000.00',
          status: 'completed',
          items_count: 1,
        },
      ],
      total: 1,
    });
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it.each(['en', 'ar'] as const)(
    'shows the balance, overdue, contracts, payments and returns from the server (%s)',
    async (lang) => {
      await renderTab(lang);
      expect(
        await screen.findByRole('tab', { name: t('customerAccount.tabs.account'), selected: true }),
      ).toBeInTheDocument();
      const balance = within(
        (await screen.findByRole('heading', { name: t('customerAccount.balance.title') })).closest(
          'section',
        )!,
      );
      expect(balance.getByText(formatMoney('15000.00'))).toBeInTheDocument();
      expect(balance.getByText(formatMoney('15100.00'))).toBeInTheDocument();
      expect(
        balance.getByText(
          t('customerAccount.balance.formula', {
            totals: formatMoney('19200.00'),
            payments: formatMoney('3000.00'),
            returns: formatMoney('1200.00'),
          }),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(t('customerAccount.overdue.daysValue', { count: formatNumber(5) })),
      ).toBeInTheDocument();
      const contracts = screen.getByRole('table', { name: t('customerAccount.contracts.caption') });
      expect(within(contracts).getByText('BR1-CT-26-000001')).toBeInTheDocument();
      expect(
        within(contracts).getByText(t('customerAccount.contracts.status.active')),
      ).toBeInTheDocument();
      const payments = screen.getByRole('table', { name: t('customerAccount.payments.caption') });
      expect(within(payments).getByText('TRX-77')).toBeInTheDocument();
      expect(
        within(payments).getByText(
          t('customerAccount.payments.allocation.schedule_line', { number: 'BR1-CT-26-000001 #1' }),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(t('customerAccount.returns.refund.contract_adjustment'), { exact: false }),
      ).toBeInTheDocument();
      expect(await screen.findByRole('link', { name: 'BR1-SL-26-000010' })).toHaveAttribute(
        'href',
        expect.stringContaining('/sales/'),
      );
      expect(
        screen.getByRole('link', { name: t('customerAccount.statement.open') }),
      ).toHaveAttribute('href', `/customers/${CUSTOMER_ID}/statement`);
      expect(salesHistoryApi.list).toHaveBeenCalledWith({
        customer_id: CUSTOMER_ID,
        page: 1,
        page_size: 10,
      });
    },
  );

  it('a customer without money shows the empty states', async () => {
    vi.spyOn(customerAccountApi, 'account').mockResolvedValue(emptyAccount());
    await renderTab();
    expect(await screen.findByText(t('customerAccount.contracts.empty'))).toBeInTheDocument();
    expect(screen.getByText(t('customerAccount.overdue.none'))).toBeInTheDocument();
    expect(screen.getByText(t('customerAccount.payments.empty'))).toBeInTheDocument();
    expect(screen.getByText(t('customerAccount.returns.empty'))).toBeInTheDocument();
    expect(screen.getByText(t('customerAccount.documents.empty'))).toBeInTheDocument();
    expect(screen.getAllByText(t('customerAccount.totals.never'))).toHaveLength(2);
  });

  it('opens a contract schedule with its line statuses, an earlier version and the late fee', async () => {
    const read = vi.spyOn(customerAccountApi, 'schedule').mockResolvedValue(schedule());
    await renderTab();
    await userEvent.click(
      await screen.findByRole('button', { name: t('customerAccount.contracts.schedule') }),
    );
    const drawer = await screen.findByRole('dialog', {
      name: t('customerAccount.schedule.title', { number: 'BR1-CT-26-000001' }),
    });
    expect(read).toHaveBeenCalledWith(CUSTOMER_ID, contract().id);
    const d = within(drawer);
    expect(
      await d.findByText(t('customerAccount.schedule.status.paid'), { selector: '.badge' }),
    ).toBeInTheDocument();
    expect(
      d.getByText(t('customerAccount.schedule.status.overdue'), { selector: '.badge' }),
    ).toBeInTheDocument();
    expect(
      d.getByText(t('customerAccount.schedule.daysLate', { count: formatNumber(5) })),
    ).toBeInTheDocument();
    expect(
      d.getByRole('heading', {
        name: t('customerAccount.schedule.superseded', { version: formatNumber(1) }),
      }),
    ).toBeInTheDocument();
    expect(
      d.getByText(t('customerAccount.schedule.chargeDue', { amount: formatMoney('100.00') }), {
        exact: false,
      }),
    ).toBeInTheDocument();
  }, 20_000);

  it('a schedule the server refuses says the contract is not the customer’s', async () => {
    vi.spyOn(customerAccountApi, 'schedule').mockRejectedValue(
      new ApiError(404, 'CONTRACT_NOT_FOUND', 'Contract not found.'),
    );
    await renderTab();
    await userEvent.click(
      await screen.findByRole('button', { name: t('customerAccount.contracts.schedule') }),
    );
    expect(
      await screen.findByText(t('customerAccount.errors.CONTRACT_NOT_FOUND')),
    ).toBeInTheDocument();
  });

  it('purchases are hidden from a user who neither sells nor sees reports', async () => {
    setPermissions(['customer.create']);
    await renderTab();
    expect(await screen.findByText(t('customerAccount.purchases.hidden'))).toBeInTheDocument();
    expect(salesHistoryApi.list).not.toHaveBeenCalled();
  });

  it('lists the documents of the customer and their contracts and opens one', async () => {
    vi.spyOn(customerAccountApi, 'account').mockResolvedValue(account({ documents_count: 1 }));
    vi.spyOn(customerAccountApi, 'documents').mockResolvedValue([
      {
        file: {
          id: 'a0740000-0000-4000-8000-0000000000e9',
          purpose: 'contract_pdf',
          mime: 'application/pdf',
          sizeBytes: 100,
          originalName: 'contract.pdf',
          entityType: 'contract',
          entityId: contract().id,
          createdAt: AT,
        },
        contractNumber: 'BR1-CT-26-000001',
      },
    ]);
    const url = vi
      .spyOn(customersApi, 'photoUrl')
      .mockResolvedValue({ url: 'https://files.test/x', expiresAt: AT });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderTab();
    expect(
      await screen.findByText(t('customerAccount.documents.purpose.contract_pdf')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('customerAccount.documents.ofContract', { number: 'BR1-CT-26-000001' }), {
        exact: false,
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: t('customerAccount.documents.open') }),
    );
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://files.test/x', '_blank', 'noopener,noreferrer'),
    );
    expect(url).toHaveBeenCalledWith('a0740000-0000-4000-8000-0000000000e9');
  });

  it('the details tab is the default and switching keeps the choice in the URL', async () => {
    await renderApp(
      <Routes>
        <Route path="/customers/:id" element={<CustomerPage />} />
      </Routes>,
      { route: `/customers/${CUSTOMER_ID}` },
    );
    expect(
      await screen.findByRole('tab', { name: t('customerAccount.tabs.details'), selected: true }),
    ).toBeInTheDocument();
    expect(customerAccountApi.account).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('tab', { name: t('customerAccount.tabs.account') }));
    expect(
      await screen.findByRole('heading', { name: t('customerAccount.balance.title') }),
    ).toBeInTheDocument();
    expect(customerAccountApi.account).toHaveBeenCalledWith(CUSTOMER_ID);
  });
});

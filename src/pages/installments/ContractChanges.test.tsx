import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  Contract,
  ContractChange,
  ContractChangeHistory,
  PermissionKey,
  SettlementQuote,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { contractChangesApi } from '@/services/contractChangesApi';
import { installmentsApi } from '@/services/installmentsApi';
import { salesApi } from '@/services/salesApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import ContractPage from './ContractPage';
import ContractChangesPage from './ContractChangesPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID = 'a0800000-0000-4000-8000-0000000000c1';
const CUSTOMER = 'a0800000-0000-4000-8000-0000000000c2';
const BRANCH = 'a0800000-0000-4000-8000-0000000000c5';
const RECEIPT = 'a0800000-0000-4000-8000-0000000000c6';

const line = (seq: number, paid = '0.00') => ({
  seq,
  due_date: `2026-1${seq}-16`,
  principal: '5000.00',
  profit: '1000.00',
  amount: '6000.00',
  paid,
  remaining: paid === '0.00' ? '6000.00' : '0.00',
  status: (paid === '0.00' ? 'upcoming' : 'paid') as 'upcoming' | 'paid',
});
const contract = (over: Partial<Contract> = {}): Contract => ({
  id: ID,
  number: 'MAIN-CT-26-000009',
  status: 'active',
  branch_id: BRANCH,
  sale_id: null,
  sale_number: null,
  customer: { id: CUSTOMER, name: 'Mona Adel', phone: '01001234567' },
  guarantors: [],
  policy_version: 3,
  creditor: 'in_house',
  cash_price: '12000.00',
  down_payment: '2000.00',
  financed_amount: '10000.00',
  markup_pct: '20',
  markup_amount: '2000.00',
  total_payable: '12000.00',
  installments_count: 2,
  frequency: 'monthly',
  first_due_date: '2026-11-16',
  last_due_date: '2026-12-16',
  current_version: 1,
  credit_approval_id: null,
  created_at: '2026-10-16T08:00:00.000Z',
  created_by_name: 'Cashier',
  lines: [line(1), line(2)],
  balance: { paid: '0.00', remaining: '12000.00', overdue: '0.00' },
  ...over,
});
const quote: SettlementQuote = {
  contract_id: ID,
  number: 'MAIN-CT-26-000009',
  status: 'active',
  remaining: '12000.00',
  principal_left: '10000.00',
  profit_left: '2000.00',
  future_profit: '2000.00',
  suggested_waiver: '1000.00',
  max_waiver: '2000.00',
  policy_rule: { early_settlement_rule: 'percent_of_future_profit', early_settlement_pct: '50.00' },
};
const change = (over: Partial<ContractChange> = {}): ContractChange => ({
  id: 'a0800000-0000-4000-8000-0000000000d1',
  kind: 'reschedule',
  contract_id: ID,
  old_version: 1,
  new_version: 2,
  amount: '12000.00',
  principal_amount: '10000.00',
  profit_amount: '2000.00',
  profit_waived: '0.00',
  reason: 'Lost his job',
  business_date: '2026-10-18',
  created_at: '2026-10-18T08:00:00.000Z',
  created_by: { id: null, name: 'Manager' },
  approved_by: null,
  payment_id: null,
  ...over,
});
const emptyHistory: ContractChangeHistory = { changes: [], versions: [] };

const renderAt = (lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/contracts/:id" element={<ContractPage />} />
      <Route path="/collections/:id" element={<p>Receipt page</p>} />
    </Routes>,
    { lang, route: `/contracts/${ID}` },
  );

const OWNER_KEYS = [
  'customer.create',
  'collection.create',
  'contract.settle_early',
  'schedule.change',
  'contract.write_off',
];

function as(role: 'OWNER' | 'CASHIER', keys: string[]) {
  signIn(role);
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys as PermissionKey[]));
}

describe('N05 contract changes on the contract page', () => {
  beforeEach(() => {
    vi.spyOn(contractChangesApi, 'history').mockResolvedValue(emptyHistory);
    vi.spyOn(salesApi, 'paymentAccounts').mockResolvedValue({ items: [] });
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('hides the change actions from a cashier without the keys', async () => {
    as('CASHIER', ['customer.create', 'collection.create']);
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    await renderAt();
    await screen.findByRole('heading', { name: 'Contract MAIN-CT-26-000009' });
    expect(screen.queryByRole('button', { name: 'Settle early' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Write off' })).not.toBeInTheDocument();
  });

  it('shows no action on a closed contract, even to the owner', async () => {
    as('OWNER', OWNER_KEYS);
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract({ status: 'completed' }));
    await renderAt();
    await screen.findByRole('heading', { name: 'Contract MAIN-CT-26-000009' });
    expect(screen.queryByRole('button', { name: 'Write off' })).not.toBeInTheDocument();
  });

  it('settles early: the suggestion is only a suggestion, the max is enforced, then N03 payment', async () => {
    const user = userEvent.setup();
    as('OWNER', OWNER_KEYS);
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    vi.spyOn(contractChangesApi, 'quote').mockResolvedValue(quote);
    const settle = vi.spyOn(contractChangesApi, 'settle').mockResolvedValue({
      change: change({ kind: 'early_settlement', profit_waived: '1000.00', payment_id: RECEIPT }),
      collection: { id: RECEIPT } as never,
    });
    await renderAt();
    await user.click(await screen.findByRole('button', { name: 'Settle early' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('settle-payoff')).toHaveTextContent('12,000.00');
    expect(dialog).toHaveTextContent('suggestion only');
    const waiver = within(dialog).getByLabelText(/Profit waived/);
    await user.type(waiver, '2500');
    expect(dialog).toHaveTextContent('The waiver can be at most');
    expect(within(dialog).getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
    await user.clear(waiver);
    await user.click(within(dialog).getByRole('button', { name: 'Use the suggestion' }));
    // A waiver needs a reason.
    expect(within(dialog).getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason for the waiver'), 'Good customer');
    expect(within(dialog).getByTestId('settle-to-pay')).toHaveTextContent('11,000.00');
    await user.click(within(dialog).getByRole('button', { name: 'Continue to payment' }));
    const pay = await screen.findByRole('dialog');
    await user.click(within(pay).getByRole('button', { name: 'Pay' }));
    expect(await screen.findByText('Receipt page')).toBeInTheDocument();
    expect(settle).toHaveBeenCalledWith(
      ID,
      {
        waiver: '1000.00',
        reason: 'Good customer',
        expected_remaining: '12000.00',
        payments: [expect.objectContaining({ method: 'cash', amount: '11000.00' })],
      },
      expect.any(String),
    );
  });

  it('reschedules with a preview that keeps the total, and a reason', async () => {
    const user = userEvent.setup();
    as('OWNER', OWNER_KEYS);
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    const preview = vi.spyOn(contractChangesApi, 'previewReschedule').mockResolvedValue({
      remaining: '12000.00',
      principal_left: '10000.00',
      profit_left: '2000.00',
      lines: [1, 2, 3].map((seq) => ({
        seq,
        due_date: `2026-1${seq - 1}-20`,
        principal: '3333.33',
        profit: '666.67',
        amount: '4000.00',
      })),
      violations: [],
    });
    const reschedule = vi
      .spyOn(contractChangesApi, 'reschedule')
      .mockResolvedValue({ change: change(), contract: contract({ status: 'rescheduled' }) });
    await renderAt();
    await user.click(await screen.findByRole('button', { name: 'Reschedule' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Number of installments'), '3');
    expect(
      await within(dialog).findByText(
        'The new installments add up to 12,000.00 EGP, exactly what is left.',
        {
          exact: false,
        },
      ),
    ).toBeInTheDocument();
    expect(preview).toHaveBeenCalledWith(ID, expect.objectContaining({ installments_count: 3 }));
    const confirm = within(dialog).getByRole('button', { name: 'Reschedule' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'Lost his job');
    await user.click(confirm);
    expect(reschedule).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({
        installments_count: 3,
        frequency: 'monthly',
        reason: 'Lost his job',
        expected_remaining: '12000.00',
      }),
      expect.any(String),
    );
  });

  it('writes off (owner) and shows a refusal from the server', async () => {
    const user = userEvent.setup();
    as('OWNER', OWNER_KEYS);
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    vi.spyOn(contractChangesApi, 'writeOff').mockRejectedValue(
      new ApiError(409, 'COLLECTION_DUE_CHANGED', 'changed'),
    );
    await renderAt();
    await user.click(await screen.findByRole('button', { name: 'Write off' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('write-off-amount')).toHaveTextContent('12,000.00');
    expect(dialog).toHaveTextContent("This can't be undone.");
    await user.type(within(dialog).getByLabelText('Reason'), 'Customer emigrated');
    await user.click(within(dialog).getByRole('button', { name: 'Write off' }));
    expect(
      await within(dialog).findByText(/What is left on this contract changed/),
    ).toBeInTheDocument();
  });

  it('keeps the old schedule visible: history and versions', async () => {
    const user = userEvent.setup();
    as('OWNER', OWNER_KEYS);
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(
      contract({ status: 'rescheduled', current_version: 2 }),
    );
    vi.mocked(contractChangesApi.history).mockResolvedValue({
      changes: [change()],
      versions: [
        { version: 2, superseded: false, change_id: change().id, lines: [line(1)] },
        { version: 1, superseded: true, change_id: null, lines: [line(1, '6000.00'), line(2)] },
      ],
    });
    await renderAt();
    expect(await screen.findByText('Changes to this contract')).toBeInTheDocument();
    expect(screen.getByText('Lost his job')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Schedule'), '1');
    expect(screen.getByTestId('superseded-note')).toHaveTextContent('Replaced by a Reschedule.');
    const old = screen.getByRole('table', { name: 'Schedule 1' });
    expect(within(old).getAllByRole('row')).toHaveLength(3);
  });

  it('reads in Arabic without interest or a promised discount', async () => {
    as('OWNER', OWNER_KEYS);
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    await renderAt('ar');
    expect(await screen.findByRole('button', { name: 'سداد مبكر' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعدام الدين' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('فائدة');
    expect(document.body).not.toHaveTextContent('خصم');
  });
});

describe('N05 contract changes list', () => {
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the changes with totals and filters by kind', async () => {
    const user = userEvent.setup();
    as('OWNER', OWNER_KEYS);
    const list = vi.spyOn(contractChangesApi, 'list').mockResolvedValue({
      items: [
        {
          ...change({ kind: 'write_off', new_version: null, amount: '11000.00' }),
          contract: { id: ID, number: 'MAIN-CT-26-000009', branch_id: BRANCH },
          customer: { id: CUSTOMER, name: 'Mona Adel' },
        },
      ],
      next_cursor: null,
      totals: [{ kind: 'write_off', count: 1, amount: '11000.00', profit_waived: '0.00' }],
    });
    await renderApp(<ContractChangesPage />, { lang: 'en' });
    expect(await screen.findByRole('link', { name: 'MAIN-CT-26-000009' })).toHaveAttribute(
      'href',
      `/contracts/${ID}`,
    );
    expect(screen.getByTestId('change-totals')).toHaveTextContent('11,000.00');
    await user.selectOptions(screen.getByLabelText('Change'), 'write_off');
    expect(list).toHaveBeenLastCalledWith({ kind: 'write_off' });
  });
});

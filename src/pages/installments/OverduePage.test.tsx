import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  OverdueAction,
  OverdueContractRow,
  OverdueListPage,
  PermissionKey,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { overdueApi } from '@/services/overdueApi';
import { branchApi } from '@/services/branchApi';
import { BRANCH_MAIN, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import OverduePage from './OverduePage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER = 'a0790000-0000-4000-8000-0000000000a1';
const C1 = 'a0790000-0000-4000-8000-0000000000b1';
const W1 = 'a0790000-0000-4000-8000-0000000000c1';

const row: OverdueContractRow = {
  contract: { id: C1, number: 'MAIN-CT-26-000001', frequency: 'monthly', branch_id: BRANCH_MAIN },
  customer: {
    id: CUSTOMER,
    name: 'Bassem Ban',
    phone: '01011110003',
    status: 'blocked',
    collector_id: null,
  },
  overdue_amount: '2000.00',
  overdue_lines: 2,
  max_days_late: 64,
  oldest_due_date: '2026-08-14',
  remaining: '9000.00',
  last_payment_at: null,
  open_warning: { id: W1, business_date: '2026-10-17' },
  legal_referral: { id: W1, status: 'open', business_date: '2026-10-17' },
};
const page: OverdueListPage = {
  items: [row],
  next_cursor: null,
  totals: {
    contracts: 1,
    overdue_amount: '2000.00',
    late_1_30: '1000.00',
    late_31_60: '0.00',
    late_61_90: '1000.00',
    late_90_plus: '0.00',
  },
};
const action = (over: Partial<OverdueAction> = {}): OverdueAction => ({
  id: W1,
  kind: 'warning',
  status: 'open',
  business_date: '2026-10-17',
  days_late: 4,
  overdue_amount: '1000.00',
  contract: row.contract,
  customer: row.customer,
  current: { overdue_amount: '1000.00', max_days_late: 4 },
  outcome: null,
  note: null,
  handled_at: null,
  handled_by_name: null,
  legal_case_id: null,
  created_at: '2026-10-17T00:30:00.000Z',
  ...over,
});

function mockBranches() {
  vi.spyOn(branchApi, 'list').mockResolvedValue([
    { id: BRANCH_MAIN, name: 'Main', is_main: true },
  ] as Awaited<ReturnType<typeof branchApi.list>>);
}

describe('N04 overdue page (owner)', () => {
  beforeEach(() => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['overdue.view', 'overdue.handle'] as PermissionKey[], {
        allBranches: true,
      }),
    );
    mockBranches();
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists overdue contracts worst first with totals, flags and a collect link; no fees', async () => {
    const list = vi.spyOn(overdueApi, 'list').mockResolvedValue(page);
    await renderApp(<OverduePage />, { lang: 'en' });
    expect(await screen.findByText('Bassem Ban')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Blocked')).toBeInTheDocument();
    expect(within(table).getByText('Open warning')).toBeInTheDocument();
    expect(within(table).getByText('Legal referral')).toBeInTheDocument();
    expect(screen.getByText('Over 90 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Collect' })).toHaveAttribute(
      'href',
      `/collections/new?customer=${CUSTOMER}&contract=${C1}`,
    );
    expect(table).not.toHaveTextContent(/fee/i);
    expect(document.body).not.toHaveTextContent(/interest/i);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('At least days late'), '30');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ min_days: 30 }));
  });

  it('runs the check now and shows what it did', async () => {
    vi.spyOn(overdueApi, 'list').mockResolvedValue(page);
    const run = vi.spyOn(overdueApi, 'run').mockResolvedValue({
      business_date: '2026-10-17',
      warnings_created: 3,
      warnings_resolved: 0,
      bans: 1,
      customers_blocked: 1,
      legal_referrals: 2,
    });
    await renderApp(<OverduePage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Run the check now' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        'Check done: 3 new warnings, 1 customers blocked, 2 legal referrals.',
      ),
    ).toBeInTheDocument();
  });

  it('dismisses a legal referral with a reason (owner only)', async () => {
    vi.spyOn(overdueApi, 'list').mockResolvedValue(page);
    vi.spyOn(overdueApi, 'referrals').mockResolvedValue({
      items: [action({ kind: 'legal_referral', days_late: 64 })],
      next_cursor: null,
    });
    const dismiss = vi
      .spyOn(overdueApi, 'dismissReferral')
      .mockResolvedValue(action({ kind: 'legal_referral', status: 'dismissed' }));
    await renderApp(<OverduePage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Legal referrals' }));
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Dismiss' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'Agreed a payment plan');
    await user.click(confirm);
    expect(dismiss).toHaveBeenCalledWith(W1, { reason: 'Agreed a payment plan' });
    expect(await screen.findByText('Referral dismissed.')).toBeInTheDocument();
  });
});

describe('N04 overdue page (collector: view and handle)', () => {
  beforeEach(() => {
    signIn('CASHIER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['overdue.view', 'overdue.handle'] as PermissionKey[], {
        allBranches: true,
      }),
    );
    mockBranches();
    vi.spyOn(overdueApi, 'list').mockResolvedValue(page);
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('has no run button and no dismiss button', async () => {
    vi.spyOn(overdueApi, 'referrals').mockResolvedValue({
      items: [action({ kind: 'legal_referral' })],
      next_cursor: null,
    });
    await renderApp(<OverduePage />, { lang: 'en' });
    expect(await screen.findByText('Bassem Ban')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run the check now' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Legal referrals' }));
    expect(await screen.findByText('MAIN-CT-26-000001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('marks a warning handled; "other" needs a note; a warning someone else handled says so', async () => {
    vi.spyOn(overdueApi, 'warnings').mockResolvedValue({ items: [action()], next_cursor: null });
    const handle = vi
      .spyOn(overdueApi, 'handleWarning')
      .mockRejectedValueOnce(new ApiError(409, 'OVERDUE_ACTION_NOT_OPEN', 'not open'))
      .mockResolvedValueOnce(action({ status: 'handled', outcome: 'promised' }));
    await renderApp(<OverduePage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Warnings' }));
    await user.click(await screen.findByRole('button', { name: 'Mark handled' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('What happened'), 'other');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('What happened'), 'promised');
    await user.type(within(dialog).getByLabelText('Note'), 'Thursday');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText(
        'Someone already dealt with this. The list has been refreshed.',
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(handle).toHaveBeenLastCalledWith(W1, { outcome: 'promised', note: 'Thursday' });
    expect(await screen.findByText('Warning marked handled.')).toBeInTheDocument();
  }, 20_000);

  it('reads right to left in Arabic', async () => {
    await renderApp(<OverduePage />, { lang: 'ar' });
    expect(await screen.findByRole('heading', { name: 'الأقساط المتأخرة' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('tab', { name: 'التنبيهات' })).toBeInTheDocument();
  });
});

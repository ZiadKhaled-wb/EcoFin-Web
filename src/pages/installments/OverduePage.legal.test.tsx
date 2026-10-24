import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  OverdueAction,
  OverdueContractRow,
  OverdueListPage,
  PermissionKey,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { overdueApi } from '@/services/overdueApi';
import { branchApi } from '@/services/branchApi';
import { BRANCH_MAIN, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { CASE_ID } from '@/test/legalFixtures';
import OverduePage from './OverduePage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER = 'a1010000-0000-4000-8000-0000000000c1';
const C1 = 'a1010000-0000-4000-8000-0000000000b1';
const A1 = 'a1010000-0000-4000-8000-0000000000a1';

const row = (legal: OverdueContractRow['legal_case']): OverdueContractRow => ({
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
  open_warning: null,
  legal_referral: null,
  legal_case: legal,
});
const page = (r: OverdueContractRow): OverdueListPage => ({
  items: [r],
  next_cursor: null,
  totals: {
    contracts: 1,
    overdue_amount: '2000.00',
    late_1_30: '0.00',
    late_31_60: '0.00',
    late_61_90: '2000.00',
    late_90_plus: '0.00',
  },
});
const referral = (over: Partial<OverdueAction> = {}): OverdueAction => ({
  id: A1,
  kind: 'legal_referral',
  status: 'open',
  business_date: '2026-10-17',
  days_late: 64,
  overdue_amount: '2000.00',
  contract: row(null).contract,
  customer: row(null).customer,
  current: { overdue_amount: '2000.00', max_days_late: 64 },
  outcome: null,
  note: null,
  handled_at: null,
  handled_by_name: null,
  legal_case_id: null,
  created_at: '2026-10-17T00:30:00.000Z',
  ...over,
});

describe('L01 + N09 on the overdue page', () => {
  beforeEach(() => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(
        ['overdue.view', 'overdue.handle', 'legal.view', 'legal.manage'] as PermissionKey[],
        {
          allBranches: true,
        },
      ),
    );
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: BRANCH_MAIN, name: 'Main', is_main: true },
    ] as Awaited<ReturnType<typeof branchApi.list>>);
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it("shows the contract's open legal case as a badge that links to it", async () => {
    vi.spyOn(overdueApi, 'list').mockResolvedValue(
      page(row({ id: CASE_ID, number: 'MAIN-LC-26-000001', status: 'in_court' })),
    );
    await renderApp(<OverduePage />, { lang: 'en' });
    const badge = await screen.findByRole('link', { name: 'Legal: In court' });
    expect(badge).toHaveAttribute('href', `/legal/cases/${CASE_ID}`);
  });

  it('an open legal referral can become a case or be dismissed', async () => {
    vi.spyOn(overdueApi, 'referrals').mockResolvedValue({ items: [referral()], next_cursor: null });
    await renderApp(<OverduePage />, { lang: 'en', route: '/?tab=referrals' });
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('button', { name: 'Open legal case' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(table).getByRole('button', { name: 'Open legal case' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('a referral that became a case says so and links to the case instead of "dismiss"', async () => {
    vi.spyOn(overdueApi, 'referrals').mockResolvedValue({
      items: [referral({ status: 'case_opened', legal_case_id: CASE_ID })],
      next_cursor: null,
    });
    await renderApp(<OverduePage />, { lang: 'en', route: '/?tab=referrals' });
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('link', { name: 'View the case' })).toHaveAttribute(
      'href',
      `/legal/cases/${CASE_ID}`,
    );
    expect(within(table).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: 'Open legal case' }),
    ).not.toBeInTheDocument();
  });
});

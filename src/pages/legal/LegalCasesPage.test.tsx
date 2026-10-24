import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { shopToday } from '@/lib/format';
import { meApi } from '@/features/me/meApi';
import { legalApi } from '@/services/legalApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { CASE_ID, CONTRACT_ID, LAWYER_ID, legalRow } from '@/test/legalFixtures';
import LegalCasesPage from './LegalCasesPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe('L01 legal cases list (owner)', () => {
  beforeEach(() => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['legal.view', 'legal.manage'] as PermissionKey[], { allBranches: true }),
    );
    vi.spyOn(legalApi, 'lawyers').mockResolvedValue({
      items: [{ id: LAWYER_ID, full_name: 'Lawyer One', phone: null, open_cases: 1 }],
    });
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the open cases with contract, customer, lawyer, status, hearing, claim and remaining', async () => {
    const list = vi.spyOn(legalApi, 'list').mockResolvedValue({
      rows: [legalRow({ next_hearing_date: addDays(shopToday(), 3) })],
      next_cursor: null,
    });
    await renderApp(<LegalCasesPage />, { lang: 'en' });
    expect(await screen.findByText('Bassem Ban')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ status: 'open' });
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: 'MAIN-LC-26-000001' })).toHaveAttribute(
      'href',
      `/legal/cases/${CASE_ID}`,
    );
    expect(within(table).getByRole('link', { name: 'MAIN-CT-26-000001' })).toHaveAttribute(
      'href',
      `/contracts/${CONTRACT_ID}`,
    );
    expect(within(table).getByText('Blocked')).toBeInTheDocument();
    expect(within(table).getByText('Lawyer One')).toBeInTheDocument();
    expect(within(table).getByText('Preparing')).toBeInTheDocument();
    expect(within(table).getByText(/11,000\.00/)).toBeInTheDocument();
    expect(within(table).getByText(/10,500\.00/)).toBeInTheDocument();
    expect(within(table).getByText('within 7 days')).toBeInTheDocument();
    expect(table).not.toHaveTextContent(/fee|interest/i);
  });

  it('highlights a hearing within 7 days and not a later one', async () => {
    vi.spyOn(legalApi, 'list').mockResolvedValue({
      rows: [
        legalRow({ next_hearing_date: addDays(shopToday(), 7) }),
        legalRow({
          id: 'a1010000-0000-4000-8000-0000000000a2',
          number: 'MAIN-LC-26-000002',
          next_hearing_date: addDays(shopToday(), 8),
        }),
      ],
      next_cursor: null,
    });
    const { container } = await renderApp(<LegalCasesPage />, { lang: 'en' });
    await screen.findAllByText('Bassem Ban');
    const marked = container.querySelectorAll('[data-soon="true"]');
    expect(marked).toHaveLength(1);
  });

  it('shows the status tabs, a lawyer filter for the owner and the search', async () => {
    const list = vi.spyOn(legalApi, 'list').mockResolvedValue({ rows: [], next_cursor: null });
    await renderApp(<LegalCasesPage />, { lang: 'en' });
    expect(await screen.findByText('No open legal cases.')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Closed' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ status: 'closed' }));
    expect(await screen.findByText('No closed legal cases.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'All' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ status: 'all' }));
    await user.selectOptions(await screen.findByLabelText('Lawyer'), LAWYER_ID);
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ status: 'all', lawyer_id: LAWYER_ID }),
    );
    await user.type(screen.getByRole('searchbox'), 'Bassem');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ status: 'all', lawyer_id: LAWYER_ID, q: 'Bassem' }),
    );
  });

  it('reads in Arabic', async () => {
    vi.spyOn(legalApi, 'list').mockResolvedValue({ rows: [legalRow()], next_cursor: null });
    await renderApp(<LegalCasesPage />, { lang: 'ar' });
    expect(await screen.findByRole('heading', { name: 'القضايا القانونية' })).toBeInTheDocument();
    expect(screen.getByText('قيد التجهيز')).toBeInTheDocument();
  });

  it('says so when the plan has no legal module', async () => {
    vi.spyOn(legalApi, 'list').mockRejectedValue(
      new ApiError(403, 'MODULE_NOT_IN_PLAN', 'not in plan'),
    );
    await renderApp(<LegalCasesPage />, { lang: 'en' });
    expect(
      await screen.findByText("Legal cases are not part of this shop's plan."),
    ).toBeInTheDocument();
  });
});

describe('L01 legal cases list (lawyer)', () => {
  beforeEach(() => {
    signIn('CASHIER'); // not the owner: the signed-in role decides the lawyer filter
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(
        ['legal.view', 'legal.manage', 'customer.view_pii', 'overdue.view'] as PermissionKey[],
        { allBranches: true },
      ),
    );
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('has no lawyer filter and never asks for the lawyers', async () => {
    const lawyers = vi.spyOn(legalApi, 'lawyers');
    vi.spyOn(legalApi, 'list').mockResolvedValue({ rows: [legalRow()], next_cursor: null });
    await renderApp(<LegalCasesPage />, { lang: 'en' });
    expect(await screen.findByText('Bassem Ban')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lawyer')).not.toBeInTheDocument();
    expect(lawyers).not.toHaveBeenCalled();
  });
});

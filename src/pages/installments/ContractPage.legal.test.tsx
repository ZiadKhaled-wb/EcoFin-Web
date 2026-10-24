import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Contract, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { installmentsApi } from '@/services/installmentsApi';
import { subscriptionApi } from '@/services/subscriptionApi';
import { useAuthStore } from '@/store/authStore';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { CASE_ID } from '@/test/legalFixtures';
import ContractPage from './ContractPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID = 'a1010000-0000-4000-8000-0000000000b1';
const SALE = 'a1010000-0000-4000-8000-0000000000b3';

const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    id: ID,
    number: 'MAIN-CT-26-000001',
    status: 'active',
    branch_id: 'a1010000-0000-4000-8000-0000000000e1',
    sale_id: SALE,
    sale_number: 'MAIN-SL-26-000001',
    customer: {
      id: 'a1010000-0000-4000-8000-0000000000c1',
      name: 'Mona Adel',
      phone: '01001234567',
    },
    guarantors: [],
    policy_version: 1,
    creditor: 'in_house',
    cash_price: '12000.00',
    down_payment: '2000.00',
    financed_amount: '10000.00',
    markup_pct: '20',
    markup_amount: '2000.00',
    total_payable: '12000.00',
    installments_count: 2,
    frequency: 'monthly',
    first_due_date: '2026-08-16',
    last_due_date: '2026-09-16',
    current_version: 1,
    credit_approval_id: null,
    created_at: '2026-07-16T08:00:00.000Z',
    created_by_name: 'Cashier',
    lines: [],
    balance: { paid: '0.00', remaining: '12000.00', overdue: '6000.00' },
    ...over,
  }) as Contract;

const renderAt = () =>
  renderApp(
    <Routes>
      <Route path="/contracts/:id" element={<ContractPage />} />
    </Routes>,
    { lang: 'en', route: `/contracts/${ID}` },
  );

const flag = {
  id: CASE_ID,
  number: 'MAIN-LC-26-000001',
  status: 'filed',
  opened_on: '2026-10-24',
} as const;

describe('L01 + N09 the legal flag on the contract page', () => {
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows "Legal: Filed" linked to the case for a reader of legal cases, and no open button', async () => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['legal.view', 'legal.manage', 'customer.create'] as PermissionKey[]),
    );
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract({ legal_case: flag }));
    await renderAt();
    const badge = await screen.findByRole('link', { name: 'Legal: Filed' });
    expect(badge).toHaveAttribute('href', `/legal/cases/${CASE_ID}`);
    expect(screen.queryByRole('button', { name: 'Open legal case' })).not.toBeInTheDocument();
  });

  it('offers the owner "Open legal case" on an overdue contract with no case', async () => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['legal.view', 'legal.manage', 'customer.create'] as PermissionKey[]),
    );
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    await renderAt();
    expect(await screen.findByRole('button', { name: 'Open legal case' })).toBeInTheDocument();
    expect(screen.queryByText(/^Legal:/)).not.toBeInTheDocument();
  });

  it('offers nothing when nothing is overdue, or the viewer is not the owner, or the plan has no legal module', async () => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['customer.create'] as PermissionKey[]),
    );
    const get = vi
      .spyOn(installmentsApi, 'contract')
      .mockResolvedValue(
        contract({ balance: { paid: '0.00', remaining: '12000.00', overdue: '0.00' } }),
      );
    const { unmount } = await renderAt();
    await screen.findByRole('heading', { name: 'Contract MAIN-CT-26-000001' });
    expect(screen.queryByRole('button', { name: 'Open legal case' })).not.toBeInTheDocument();
    unmount();

    get.mockResolvedValue(contract());
    signOut();
    signIn('CASHIER');
    const second = await renderAt();
    await screen.findByRole('heading', { name: 'Contract MAIN-CT-26-000001' });
    expect(screen.queryByRole('button', { name: 'Open legal case' })).not.toBeInTheDocument();
    second.unmount();

    signOut();
    signIn('OWNER');
    vi.spyOn(subscriptionApi, 'status').mockResolvedValue({
      plan_key: 'retail',
      plan_name: 'Retail',
      subscription_end: null,
      days_left: null,
      state: 'active',
      read_only: false,
      usage: {},
      modules: ['pos'],
    } as never);
    await renderAt();
    await screen.findByRole('heading', { name: 'Contract MAIN-CT-26-000001' });
    await vi.waitFor(() => expect(subscriptionApi.status).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Open legal case' })).not.toBeInTheDocument();
  });

  it('shows a lawyer the contract with the sale number but no link to the sale, the customer or printing', async () => {
    signIn('CASHIER');
    useAuthStore.setState((s) => ({ user: { ...s.user!, role: 'LAWYER' } }));
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(
        ['legal.view', 'legal.manage', 'customer.view_pii', 'overdue.view'] as PermissionKey[],
        { allBranches: true },
      ),
    );
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract({ legal_case: flag }));
    await renderAt();
    await screen.findByRole('heading', { name: 'Contract MAIN-CT-26-000001' });
    expect(screen.getByText('MAIN-SL-26-000001')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'MAIN-SL-26-000001' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mona Adel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /customer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /print|promissory/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Legal: Filed' })).toBeInTheDocument();
  });

  it('keeps the sale link for whoever may open sales', async () => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['sale.create', 'customer.create'] as PermissionKey[]),
    );
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    await renderAt();
    const link = await screen.findByRole('link', { name: 'MAIN-SL-26-000001' });
    expect(link).toHaveAttribute('href', `/sales/${SALE}`);
    expect(within(document.body).getByRole('link', { name: 'Mona Adel' })).toBeInTheDocument();
  });
});

import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Contract, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { installmentsApi } from '@/services/installmentsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import ContractPage from './ContractPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID = 'a0770000-0000-4000-8000-0000000000c1';
const CUSTOMER = 'a0770000-0000-4000-8000-0000000000c2';
const SALE = 'a0770000-0000-4000-8000-0000000000c3';
const GUARANTOR = 'a0770000-0000-4000-8000-0000000000c4';
const BRANCH = 'a0770000-0000-4000-8000-0000000000c5';

const contract = (over: Partial<Contract> = {}): Contract => ({
  id: ID,
  number: 'MAIN-CT-26-000001',
  status: 'active',
  branch_id: BRANCH,
  sale_id: SALE,
  sale_number: 'MAIN-SL-26-000001',
  customer: { id: CUSTOMER, name: 'Mona Adel', phone: '01001234567' },
  guarantors: [{ id: GUARANTOR, name: 'Ahmed Adel', relation: 'brother' }],
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
  lines: [
    {
      seq: 1,
      due_date: '2026-11-16',
      principal: '5000.00',
      profit: '1000.00',
      amount: '6000.00',
      paid: '0.00',
      remaining: '6000.00',
      status: 'upcoming',
    },
    {
      seq: 2,
      due_date: '2026-12-16',
      principal: '5000.00',
      profit: '1000.00',
      amount: '6000.00',
      paid: '0.00',
      remaining: '6000.00',
      status: 'upcoming',
    },
  ],
  balance: { paid: '0.00', remaining: '12000.00', overdue: '0.00' },
  ...over,
});

const renderAt = (id: string, lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/contracts/:id" element={<ContractPage />} />
    </Routes>,
    { lang, route: `/contracts/${id}` },
  );

describe('N02 contract page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      // L01: the sale link needs a sales permission (a lawyer reads the contract without one).
      permissionsFixture(['customer.create', 'sale.create'] as PermissionKey[]),
    );
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows the terms, the guarantors, the schedule and the balance', async () => {
    const get = vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    await renderAt(ID);
    expect(
      await screen.findByRole('heading', { name: 'Contract MAIN-CT-26-000001' }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(ID);
    expect(screen.getByTestId('contract-profit')).toHaveTextContent('2,000.00');
    expect(screen.getByTestId('contract-total')).toHaveTextContent('12,000.00');
    expect(screen.getByTestId('contract-remaining')).toHaveTextContent('12,000.00');
    expect(screen.getByRole('link', { name: 'Ahmed Adel' })).toHaveAttribute(
      'href',
      `/customers/guarantors/${GUARANTOR}`,
    );
    expect(screen.getByRole('link', { name: 'MAIN-SL-26-000001' })).toHaveAttribute(
      'href',
      `/sales/${SALE}`,
    );
    const table = screen.getByRole('table', { name: 'Installment schedule' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(document.body).not.toHaveTextContent(/interest/i);
  });

  it('answers not found for an unknown contract and for a bad id', async () => {
    vi.spyOn(installmentsApi, 'contract').mockRejectedValue(
      new ApiError(404, 'CONTRACT_NOT_FOUND', 'not found'),
    );
    await renderAt(ID);
    expect(await screen.findByText('Contract not found')).toBeInTheDocument();
  });

  it('never asks the server for an id that is not a UUID', async () => {
    const get = vi.spyOn(installmentsApi, 'contract');
    await renderAt('not-a-uuid');
    expect(await screen.findByText('Contract not found')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('reads in Arabic with the word profit (ربح), never interest', async () => {
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    await renderAt(ID, 'ar');
    expect(await screen.findByText('ربح البيع بالتقسيط')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('فائدة');
  });
});

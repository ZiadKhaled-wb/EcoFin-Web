import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  Collection,
  CollectionPreview,
  ContractListItem,
  PermissionKey,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { collectionsApi } from '@/services/collectionsApi';
import { shiftsApi } from '@/services/shiftsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import CollectPage from './CollectPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER = 'a0900000-0000-4000-8000-0000000000e1';
const C1 = 'a0900000-0000-4000-8000-0000000000e2';
const BRANCH = 'a0900000-0000-4000-8000-0000000000e3';
const RECEIPT = 'a0900000-0000-4000-8000-0000000000e4';

const item: ContractListItem = {
  id: C1,
  number: 'MAIN-CT-26-000001',
  status: 'active',
  customer: { id: CUSTOMER, name: 'Cairo Ahmed', phone: '01033330001' },
  branch_id: BRANCH,
  total_payable: '12000.00',
  paid: '0.00',
  remaining: '10000.00',
  overdue_amount: '0.00',
  max_days_late: null,
  next_due_date: '2026-11-16',
};
const preview = (amount?: string): CollectionPreview => ({
  contract: {
    id: C1,
    number: 'MAIN-CT-26-000001',
    status: 'active',
    customer: item.customer,
    branch_id: BRANCH,
    total_payable: '12000.00',
  },
  due: {
    overdue_amount: '0.00',
    overdue_lines: 0,
    due_today: '0.00',
    next_due_date: '2026-11-16',
    next_due_amount: '1000.00',
    remaining: '10000.00',
  },
  lines: [],
  allocation: amount
    ? {
        lines: [
          {
            seq: 1,
            due_date: '2026-11-16',
            profit: '166.67',
            principal: '833.33',
            amount: '1000.00',
            pays_off: true,
          },
        ],
        completes_contract: false,
        exceeds_remaining: false,
      }
    : null,
});

const renderField = () =>
  renderApp(
    <Routes>
      <Route path="/collections/new" element={<CollectPage />} />
      <Route path="/collections/:id" element={<p>receipt page</p>} />
    </Routes>,
    { lang: 'en', route: `/collections/new?customer=${CUSTOMER}&contract=${C1}&mode=field` },
  );

describe('N06 field collect screen', () => {
  beforeEach(() => {
    signIn('CASHIER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['collection.create'] as PermissionKey[]),
    );
    vi.spyOn(collectionsApi, 'contracts').mockResolvedValue({ items: [item], next_cursor: null });
    vi.spyOn(collectionsApi, 'preview').mockImplementation((_id, amount) =>
      Promise.resolve(preview(amount)),
    );
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('needs no shift: it never asks for one, says the cash goes to the wallet, and takes cash only', async () => {
    const user = userEvent.setup();
    const shift = vi.spyOn(shiftsApi, 'current');
    const counter = vi.spyOn(collectionsApi, 'collect');
    const field = vi
      .spyOn(collectionsApi, 'collectField')
      .mockResolvedValue({ id: RECEIPT } as Collection);
    await renderField();
    expect(await screen.findByText(/the cash goes into your wallet/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Next installment/ }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/1,000\.00/);
    await user.click(within(dialog).getByRole('button', { name: 'Take payment' }));
    expect(await screen.findByText('receipt page')).toBeInTheDocument();
    expect(field).toHaveBeenCalledTimes(1);
    expect(field).toHaveBeenCalledWith(
      {
        customer_id: CUSTOMER,
        contracts: [{ contract_id: C1, amount: '1000.00', expected_remaining: '10000.00' }],
        payments: [{ method: 'cash', amount: '1000.00' }],
      },
      expect.any(String),
    );
    expect(counter).not.toHaveBeenCalled();
    expect(shift).not.toHaveBeenCalled();
  });

  it('says so when the customer is not assigned to the collector', async () => {
    const user = userEvent.setup();
    vi.spyOn(collectionsApi, 'collectField').mockRejectedValue(
      new ApiError(403, 'CUSTOMER_NOT_ASSIGNED', 'no'),
    );
    await renderField();
    await user.click(await screen.findByRole('button', { name: /Next installment/ }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Take payment' }));
    expect(await screen.findByText(/not assigned to you/)).toBeInTheDocument();
  });
});

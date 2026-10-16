import { screen, waitFor, within } from '@testing-library/react';
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
import { salesApi } from '@/services/salesApi';
import { shiftsApi } from '@/services/shiftsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import CollectPage from './CollectPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER = 'a0780000-0000-4000-8000-0000000000a1';
const C1 = 'a0780000-0000-4000-8000-0000000000b1';
const C2 = 'a0780000-0000-4000-8000-0000000000b2';
const BRANCH = 'a0780000-0000-4000-8000-0000000000c1';
const RECEIPT = 'a0780000-0000-4000-8000-0000000000d1';

const item = (id: string, number: string, remaining: string): ContractListItem => ({
  id,
  number,
  status: 'active',
  customer: { id: CUSTOMER, name: 'Nadia Payer', phone: '01011112222' },
  branch_id: BRANCH,
  total_payable: '12000.00',
  paid: '0.00',
  remaining,
  overdue_amount: '0.00',
  max_days_late: null,
  next_due_date: '2026-11-16',
});

const preview = (id: string, remaining: string, amount?: string): CollectionPreview => ({
  contract: {
    id,
    number: id === C1 ? 'MAIN-CT-26-000001' : 'MAIN-CT-26-000002',
    status: 'active',
    customer: { id: CUSTOMER, name: 'Nadia Payer', phone: '01011112222' },
    branch_id: BRANCH,
    total_payable: '12000.00',
  },
  due: {
    overdue_amount: '0.00',
    overdue_lines: 0,
    due_today: '0.00',
    next_due_date: '2026-11-16',
    next_due_amount: '1000.00',
    remaining,
  },
  lines: [
    {
      seq: 1,
      due_date: '2026-11-16',
      amount: '1000.00',
      paid: '0.00',
      remaining: '1000.00',
      status: 'upcoming',
      days_late: 0,
    },
  ],
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

const receipt = { id: RECEIPT } as Collection;

const renderAt = (query: string) =>
  renderApp(
    <Routes>
      <Route path="/collections/new" element={<CollectPage />} />
      <Route path="/collections/:id" element={<p>receipt page</p>} />
    </Routes>,
    { lang: 'en', route: `/collections/new?${query}` },
  );

describe('N03 collect screen', () => {
  beforeEach(() => {
    signIn('CASHIER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['collection.create'] as PermissionKey[]),
    );
    vi.spyOn(shiftsApi, 'current').mockResolvedValue({
      number: 'MAIN-SH-26-000001',
    } as Awaited<ReturnType<typeof shiftsApi.current>>);
    vi.spyOn(salesApi, 'paymentAccounts').mockResolvedValue({ items: [] });
    vi.spyOn(collectionsApi, 'contracts').mockResolvedValue({
      items: [item(C1, 'MAIN-CT-26-000001', '12000.00'), item(C2, 'MAIN-CT-26-000002', '600.00')],
      next_cursor: null,
    });
    vi.spyOn(collectionsApi, 'preview').mockImplementation((id, amount) =>
      Promise.resolve(preview(id, id === C1 ? '12000.00' : '600.00', amount)),
    );
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('ticks the linked contract, fills the next installment and collects it once', async () => {
    let settle: (c: Collection) => void = () => undefined;
    const collect = vi
      .spyOn(collectionsApi, 'collect')
      .mockImplementation(() => new Promise((resolve) => (settle = resolve)));
    await renderAt(`customer=${CUSTOMER}&contract=${C1}`);
    const user = userEvent.setup();
    expect(await screen.findByText('Customer: Nadia Payer')).toBeInTheDocument();
    expect(screen.getByLabelText('Pay contract MAIN-CT-26-000001')).toBeChecked();
    await user.click(await screen.findByRole('button', { name: /Next installment/ }));
    expect(await screen.findByText(/Installment 1 .*: 1,000\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('collect-total')).toHaveTextContent('1,000.00');
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Collect the payment' });
    expect(within(dialog).queryByRole('button', { name: /store credit/i })).toBeNull();
    const pay = within(dialog).getByRole('button', { name: 'Pay' });
    await user.click(pay);
    await user.click(pay);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(collect.mock.calls[0]![0]).toEqual({
      customer_id: CUSTOMER,
      contracts: [{ contract_id: C1, amount: '1000.00', expected_remaining: '12000.00' }],
      payments: [{ method: 'cash', amount: '1000.00' }],
    });
    settle(receipt);
    expect(await screen.findByText('receipt page')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/interest|late fee/i);
  });

  it('pays two contracts in one collection', async () => {
    const collect = vi.spyOn(collectionsApi, 'collect').mockResolvedValue(receipt);
    await renderAt(`customer=${CUSTOMER}&contract=${C1}`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^Amount for MAIN-CT-26-000001/), '500');
    await user.click(screen.getByLabelText('Pay contract MAIN-CT-26-000002'));
    // The second card's quick amount: the whole of contract 2.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Pay off the contract/ })).toHaveLength(2),
    );
    await user.click(screen.getAllByRole('button', { name: /Pay off the contract/ })[1]!);
    await waitFor(() => expect(screen.getByTestId('collect-total')).toHaveTextContent('1,100.00'));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Pay' }),
    );
    await waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
    expect(collect.mock.calls[0]![0].contracts).toEqual([
      { contract_id: C1, amount: '500.00', expected_remaining: '12000.00' },
      { contract_id: C2, amount: '600.00', expected_remaining: '600.00' },
    ]);
  }, 20_000);

  it('refuses more than what is left on a contract', async () => {
    await renderAt(`customer=${CUSTOMER}&contract=${C2}`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^Amount for MAIN-CT-26-000002/), '600.01');
    expect(await screen.findByText(/More than what is left on this contract/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take payment' })).toBeDisabled();
  }, 20_000);

  it('reloads when another till took a payment a moment ago', async () => {
    vi.spyOn(collectionsApi, 'collect').mockRejectedValue(
      new ApiError(409, 'COLLECTION_DUE_CHANGED', 'changed'),
    );
    await renderAt(`customer=${CUSTOMER}&contract=${C2}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Pay off the contract/ }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Pay' }),
    );
    expect(
      await screen.findByText(/Another payment was taken on this contract a moment ago/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('asks for an open shift first', async () => {
    vi.spyOn(shiftsApi, 'current').mockResolvedValue(null);
    await renderAt(`customer=${CUSTOMER}`);
    expect(await screen.findByText(/Open a shift to take payments/)).toBeInTheDocument();
  });

  it('never asks the server for a customer id that is not a UUID', async () => {
    const list = vi.spyOn(collectionsApi, 'contracts');
    await renderAt('customer=nope');
    expect(await screen.findByText('This contract was not found.')).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { Collection, ContractListItem, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { collectionsApi } from '@/services/collectionsApi';
import { settingsApi } from '@/services/settingsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import CollectionsPage from './CollectionsPage';
import CollectionReceiptPage from './CollectionReceiptPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER = 'a0780000-0000-4000-8000-0000000000a1';
const C1 = 'a0780000-0000-4000-8000-0000000000b1';
const BRANCH = 'a0780000-0000-4000-8000-0000000000c1';
const RECEIPT = 'a0780000-0000-4000-8000-0000000000d1';
const PAY2 = 'a0780000-0000-4000-8000-0000000000d2';

const item: ContractListItem = {
  id: C1,
  number: 'MAIN-CT-26-000001',
  status: 'active',
  customer: { id: CUSTOMER, name: 'Nadia Payer', phone: '01011112222' },
  branch_id: BRANCH,
  total_payable: '12000.00',
  paid: '1000.00',
  remaining: '11000.00',
  overdue_amount: '1000.00',
  max_days_late: 12,
  next_due_date: '2026-10-04',
};

const collection = (over: Partial<Collection> = {}): Collection => ({
  id: RECEIPT,
  number: 'MAIN-PY-26-000010',
  business_date: '2026-10-16',
  paid_at: '2026-10-16T08:00:00.000Z',
  received_by_name: 'Mona',
  branch_id: BRANCH,
  branch_name: 'Main',
  shift_id: BRANCH,
  amount: '1000.00',
  customer: { id: CUSTOMER, name: 'Nadia Payer', phone: '01011112222' },
  payments: [
    {
      id: RECEIPT,
      number: 'MAIN-PY-26-000010',
      method: 'cash',
      amount: '600.00',
      tendered: '700.00',
      change: '100.00',
      reference: null,
      cash_account_id: BRANCH,
    },
    {
      id: PAY2,
      number: 'MAIN-PY-26-000011',
      method: 'bank_transfer',
      amount: '400.00',
      tendered: null,
      change: null,
      reference: 'TRX-1',
      cash_account_id: BRANCH,
    },
  ],
  contracts: [
    {
      id: C1,
      number: 'MAIN-CT-26-000001',
      amount: '1000.00',
      status: 'active',
      allocation: {
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
      },
      after: { remaining: '11000.00', next_due_date: '2026-12-16', next_due_amount: '1000.00' },
    },
  ],
  reversal: null,
  receipt_prints: 0,
  ...over,
});

describe('N03 collections search', () => {
  beforeEach(() => {
    signIn('CASHIER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['collection.create'] as PermissionKey[]),
    );
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('searches the contracts and links each row to the collect screen', async () => {
    const list = vi
      .spyOn(collectionsApi, 'contracts')
      .mockResolvedValue({ items: [item], next_cursor: null });
    await renderApp(<CollectionsPage />, { lang: 'en' });
    const user = userEvent.setup();
    expect(await screen.findByText('Nadia Payer')).toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: /Contract number, customer name/ }),
      'nadia',
    );
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ q: 'nadia' }));
    await user.click(screen.getByLabelText('Overdue only'));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ q: 'nadia', overdue: 'true' }));
    expect(screen.getByRole('link', { name: 'Collect' })).toHaveAttribute(
      'href',
      `/collections/new?customer=${CUSTOMER}&contract=${C1}`,
    );
  });
});

const renderReceipt = (id: string, lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/collections/:id" element={<CollectionReceiptPage />} />
    </Routes>,
    { lang, route: `/collections/${id}` },
  );

describe('N03 collection receipt', () => {
  beforeEach(() => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['collection.create', 'collection.reverse'] as PermissionKey[]),
    );
    vi.spyOn(settingsApi, 'get').mockResolvedValue({
      name: 'Proof Shop',
      timezone: 'Africa/Cairo',
      receipt_width_mm: 80,
      default_language: 'en',
    } as Awaited<ReturnType<typeof settingsApi.get>>);
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows what was paid, how, and what is left, without interest or late fees', async () => {
    vi.spyOn(collectionsApi, 'receipt').mockResolvedValue(collection());
    await renderReceipt(RECEIPT);
    expect(
      await screen.findByRole('heading', { name: 'Receipt MAIN-PY-26-000010' }),
    ).toBeInTheDocument();
    const doc = document.querySelector('[data-receipt="collection"]') as HTMLElement;
    expect(doc).toHaveTextContent('Contract MAIN-CT-26-000001');
    expect(doc).toHaveTextContent(/Installment 1/);
    expect(doc).toHaveTextContent('Bank transfer');
    expect(doc).toHaveTextContent('TRX-1');
    expect(doc).toHaveTextContent(/Left on the contract/);
    expect(document.body).not.toHaveTextContent(/interest|late fee/i);
  });

  it('logs the print and prints', async () => {
    vi.spyOn(collectionsApi, 'receipt').mockResolvedValue(collection());
    const logged = vi
      .spyOn(collectionsApi, 'recordPrint')
      .mockResolvedValue(collection({ receipt_prints: 1, print: { print_no: 1, copy: false } }));
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await renderReceipt(RECEIPT);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Print receipt' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Print' }),
    );
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(logged).toHaveBeenCalledWith(RECEIPT);
  }, 20_000);

  it('reverses with a reason and explains a refusal', async () => {
    const notLatest = new ApiError(409, 'COLLECTION_NOT_REVERSIBLE', 'no');
    notLatest.details = { reason: 'not_latest' };
    vi.spyOn(collectionsApi, 'receipt').mockResolvedValue(collection());
    const reverse = vi
      .spyOn(collectionsApi, 'reverse')
      .mockRejectedValueOnce(notLatest)
      .mockResolvedValueOnce(
        collection({
          reversal: {
            id: PAY2,
            number: 'MAIN-PY-26-000012',
            reversed_at: '2026-10-16T09:00:00.000Z',
            reversed_by_name: 'Owner',
            reason: 'changed mind',
          },
        }),
      );
    await renderReceipt(RECEIPT);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reverse collection' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reverse' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'changed mind');
    await user.click(confirm);
    expect(
      await within(dialog).findByText(/A later payment was taken on one of these contracts/),
    ).toBeInTheDocument();
    await user.click(confirm);
    expect(await screen.findByText('The collection was reversed.')).toBeInTheDocument();
    expect(reverse).toHaveBeenCalledTimes(2);
    expect(reverse.mock.calls[0]![2]).toBe(reverse.mock.calls[1]![2]);
  }, 20_000);

  it('hides Reverse without collection.reverse, and for a bad id asks nothing', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['collection.create'] as PermissionKey[]),
    );
    vi.spyOn(collectionsApi, 'receipt').mockResolvedValue(collection());
    await renderReceipt(RECEIPT);
    expect(await screen.findByRole('button', { name: 'Print receipt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reverse collection' })).toBeNull();
  });

  it('never asks the server for an id that is not a UUID', async () => {
    const get = vi.spyOn(collectionsApi, 'receipt');
    await renderReceipt('nope');
    expect(await screen.findByText('This receipt was not found.')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('reads in Arabic', async () => {
    vi.spyOn(collectionsApi, 'receipt').mockResolvedValue(collection());
    await renderReceipt(RECEIPT, 'ar');
    expect(
      await screen.findByRole('heading', { name: 'إيصال MAIN-PY-26-000010' }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('فائدة');
  });
});

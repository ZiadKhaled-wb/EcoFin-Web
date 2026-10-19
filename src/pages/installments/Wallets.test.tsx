import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  CollectorRoute,
  CashAccount,
  MyWallet,
  PermissionKey,
  WalletMovementPage,
  WalletRow,
} from '@ziadkhaled-wb/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { cashApi } from '@/services/cashApi';
import { walletsApi } from '@/services/walletsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import FieldHomePage from '../collections/FieldHomePage';
import WalletPage from './WalletPage';
import WalletsPage from './WalletsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const WALLET = 'a0900000-0000-4000-8000-0000000000a1';
const COLLECTOR = 'a0900000-0000-4000-8000-0000000000a2';
const BRANCH = 'a0900000-0000-4000-8000-0000000000a3';
const SAFE = 'a0900000-0000-4000-8000-0000000000a4';
const CUSTOMER = 'a0900000-0000-4000-8000-0000000000a5';
const CONTRACT = 'a0900000-0000-4000-8000-0000000000a6';

const row = (over: Partial<WalletRow> = {}): WalletRow => ({
  id: WALLET,
  name: 'Wallet · Hany Collector',
  is_active: true,
  collector: { id: COLLECTOR, name: 'Hany Collector' },
  branch_id: BRANCH,
  branch_name: 'Main',
  balance: '1500.00',
  oldest_unsettled_date: '2026-10-17',
  last_settlement: null,
  ...over,
});
const safe: CashAccount = {
  id: SAFE,
  name: 'Main safe',
  kind: 'safe',
  branch_id: BRANCH,
  branch_name: 'Main',
  is_active: true,
  archived_at: null,
  balance: '10000.00',
  is_default: true,
  created_at: '2026-10-01T08:00:00.000Z',
  updated_at: '2026-10-01T08:00:00.000Z',
} as CashAccount;
const settlement = {
  id: 'a0900000-0000-4000-8000-0000000000b1',
  number: 'MAIN-CX-26-000001',
  business_date: '2026-10-19',
  wallet_id: WALLET,
  wallet_name: 'Wallet',
  collector: { id: COLLECTOR, name: 'Hany Collector' },
  to_account_id: SAFE,
  to_account_name: 'Main safe',
  handed: '900.00',
  shortage: '100.00',
  reason: 'Torn note',
  balance_after: '500.00',
  created_by_name: 'Manager',
  created_at: '2026-10-19T08:00:00.000Z',
};

function as(keys: PermissionKey[], role: 'OWNER' | 'CASHIER' = 'OWNER') {
  signIn(role);
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}

afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe('N06 wallets page', () => {
  const renderList = (lang: 'ar' | 'en' = 'en') =>
    renderApp(
      <Routes>
        <Route path="/installments/wallets" element={<WalletsPage />} />
      </Routes>,
      { lang, route: '/installments/wallets' },
    );

  it('lists the wallets with their balance and the oldest cash', async () => {
    as(['collector.settle', 'cash.view']);
    vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [row()] });
    await renderList();
    expect(await screen.findByText('Hany Collector')).toBeInTheDocument();
    expect(screen.getByText(/1,500\.00/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute(
      'href',
      `/installments/wallets/${WALLET}`,
    );
  });

  it('settles part of a wallet with a shortage and a reason (never twice for one attempt)', async () => {
    const user = userEvent.setup();
    as(['collector.settle', 'cash.view']);
    vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [row()] });
    vi.spyOn(cashApi, 'list').mockResolvedValue([safe]);
    const settle = vi.spyOn(walletsApi, 'settle').mockResolvedValue(settlement);
    await renderList();
    await user.click(await screen.findByRole('button', { name: 'Settle' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('settle-balance')).toHaveTextContent('1,500.00');
    await user.selectOptions(await within(dialog).findByLabelText(/Safe/), SAFE);
    const handed = within(dialog).getByLabelText(/Handed in/);
    await user.clear(handed);
    await user.type(handed, '900');
    await user.type(within(dialog).getByLabelText(/^Shortage/), '100');
    expect(within(dialog).getByTestId('settle-left')).toHaveTextContent('500.00');
    // A shortage needs a reason.
    await user.click(within(dialog).getByRole('button', { name: 'Settle' }));
    expect(settle).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('A shortage needs a reason.');
    await user.type(within(dialog).getByLabelText(/Reason for the shortage/), 'Torn note');
    await user.click(within(dialog).getByRole('button', { name: 'Settle' }));
    expect(settle).toHaveBeenCalledWith(
      WALLET,
      {
        to_account_id: SAFE,
        handed: '900.00',
        shortage: '100.00',
        reason: 'Torn note',
        expected_balance: '1500.00',
      },
      expect.any(String),
    );
  });

  it('refuses handing in more than the balance without calling the server', async () => {
    const user = userEvent.setup();
    as(['collector.settle', 'cash.view']);
    vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [row()] });
    vi.spyOn(cashApi, 'list').mockResolvedValue([safe]);
    const settle = vi.spyOn(walletsApi, 'settle').mockResolvedValue(settlement);
    await renderList();
    await user.click(await screen.findByRole('button', { name: 'Settle' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText(/Safe/), SAFE);
    const handed = within(dialog).getByLabelText(/Handed in/);
    await user.clear(handed);
    await user.type(handed, '1600');
    await user.click(within(dialog).getByRole('button', { name: 'Settle' }));
    expect(dialog).toHaveTextContent("can't be more than the balance");
    expect(settle).not.toHaveBeenCalled();
  });

  it('shows the server answer when the balance moved meanwhile', async () => {
    const user = userEvent.setup();
    as(['collector.settle', 'cash.view']);
    vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [row()] });
    vi.spyOn(cashApi, 'list').mockResolvedValue([safe]);
    vi.spyOn(walletsApi, 'settle').mockRejectedValue(
      Object.assign(new ApiError(409, 'WALLET_BALANCE_CHANGED', 'changed'), {
        details: { balance: '1700.00' },
      }),
    );
    await renderList();
    await user.click(await screen.findByRole('button', { name: 'Settle' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText(/Safe/), SAFE);
    await user.click(within(dialog).getByRole('button', { name: 'Settle' }));
    expect(await within(dialog).findByText(/balance changed while you were typing/)).toBeVisible();
  });

  it('hides the settle button from someone who only reads (cash.view)', async () => {
    as(['cash.view'], 'CASHIER');
    vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [row()] });
    await renderList();
    await screen.findByText('Hany Collector');
    expect(screen.queryByRole('button', { name: 'Settle' })).not.toBeInTheDocument();
  });

  it('reads in Arabic', async () => {
    as(['collector.settle']);
    vi.spyOn(walletsApi, 'list').mockResolvedValue({ items: [row()] });
    await renderList('ar');
    expect(await screen.findByRole('heading', { name: 'عُهد المحصلين' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'توريد' })).toBeInTheDocument();
  });
});

describe('N06 wallet ledger', () => {
  it('shows the movements with the running balance and the shortage of a settlement', async () => {
    as(['collector.settle', 'cash.view']);
    const page: WalletMovementPage = {
      wallet: row({ balance: '500.00' }),
      items: [
        {
          id: 'a0900000-0000-4000-8000-0000000000c1',
          business_date: '2026-10-19',
          created_at: '2026-10-19T09:00:00.000Z',
          type: 'adjustment',
          amount: '-100.00',
          balance_after: '500.00',
          source_type: 'cash_transfer',
          source_id: settlement.id,
          source_number: 'MAIN-CX-26-000001',
          note: 'Shortage',
          created_by_name: 'Manager',
          settlement: { handed: '900.00', shortage: '100.00', reason: 'Torn note' },
        },
        {
          id: 'a0900000-0000-4000-8000-0000000000c2',
          business_date: '2026-10-18',
          created_at: '2026-10-18T09:00:00.000Z',
          type: 'collection',
          amount: '1500.00',
          balance_after: '1500.00',
          source_type: 'payment',
          source_id: CONTRACT,
          source_number: 'MAIN-PY-26-000004',
          note: null,
          created_by_name: 'Hany',
          settlement: null,
        },
      ],
      next_cursor: null,
    };
    const ledger = vi.spyOn(walletsApi, 'ledger').mockResolvedValue(page);
    await renderApp(
      <Routes>
        <Route path="/installments/wallets/:id" element={<WalletPage />} />
      </Routes>,
      { lang: 'en', route: `/installments/wallets/${WALLET}` },
    );
    expect(await screen.findByRole('heading', { name: 'Wallet of Hany Collector' })).toBeVisible();
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('500.00');
    expect(screen.getByText(/Shortage .*100\.00.*: Torn note/)).toBeInTheDocument();
    expect(screen.getByText('MAIN-PY-26-000004')).toBeInTheDocument();
    expect(ledger).toHaveBeenCalledWith(WALLET, {});
  });

  it('says not found for an unknown wallet', async () => {
    as(['collector.settle']);
    vi.spyOn(walletsApi, 'ledger').mockRejectedValue(new ApiError(404, 'WALLET_NOT_FOUND', 'nope'));
    await renderApp(
      <Routes>
        <Route path="/installments/wallets/:id" element={<WalletPage />} />
      </Routes>,
      { lang: 'en', route: `/installments/wallets/${WALLET}` },
    );
    expect(await screen.findByText('This wallet was not found.')).toBeInTheDocument();
  });
});

describe('N06 field home', () => {
  const wallet = (over: Partial<MyWallet> = {}): MyWallet => ({
    wallet: { id: WALLET, name: 'Wallet', branch_id: BRANCH, branch_name: 'Main' },
    balance: '1500.00',
    today: { count: 2, amount: '1500.00', cash: '1500.00' },
    oldest_unsettled_date: '2026-10-17',
    last_settlement: null,
    ...over,
  });
  const route = (over: Partial<CollectorRoute> = {}): CollectorRoute => ({
    employee_id: COLLECTOR,
    employee_name: 'Hany Collector',
    date: '2026-10-19',
    stops: [
      {
        customer: {
          id: CUSTOMER,
          name: 'Cairo Ahmed',
          phone: '01033330001',
          address: '5 B Street',
          city: 'Cairo',
        },
        amount_due: '2000.00',
        amount_overdue: '1000.00',
        max_days_late: 12,
        next_due_date: '2026-11-19',
        contracts: [
          {
            id: CONTRACT,
            number: 'MAIN-CT-26-000001',
            amount_due: '2000.00',
            amount_overdue: '1000.00',
          },
        ],
      },
    ],
    totals: { customers: 1, amount_due: '2000.00', amount_overdue: '1000.00' },
    ...over,
  });
  const renderHome = (lang: 'ar' | 'en' = 'en') =>
    renderApp(
      <Routes>
        <Route path="/field" element={<FieldHomePage />} />
      </Routes>,
      { lang, route: '/field' },
    );

  it("shows my wallet and today's route with call, map and collect links", async () => {
    as(['collection.create'], 'CASHIER');
    vi.spyOn(walletsApi, 'mine').mockResolvedValue(wallet());
    vi.spyOn(walletsApi, 'route').mockResolvedValue(route());
    await renderHome();
    expect(await screen.findByTestId('wallet-balance')).toHaveTextContent('1,500.00');
    const stop = await screen.findByTestId('route-stop');
    expect(within(stop).getByText('Cairo Ahmed')).toBeInTheDocument();
    expect(within(stop).getByRole('link', { name: 'Call' })).toHaveAttribute(
      'href',
      'tel:01033330001',
    );
    expect(within(stop).getByRole('link', { name: 'Map' }).getAttribute('href')).toContain(
      encodeURIComponent('5 B Street Cairo'),
    );
    expect(within(stop).getByRole('link', { name: 'Collect' })).toHaveAttribute(
      'href',
      `/collections/new?customer=${CUSTOMER}&mode=field`,
    );
  });

  it('tells a new collector they have no wallet yet, and shows an empty route', async () => {
    as(['collection.create'], 'CASHIER');
    vi.spyOn(walletsApi, 'mine').mockResolvedValue(
      wallet({
        wallet: null,
        balance: '0.00',
        today: { count: 0, amount: '0.00', cash: '0.00' },
        oldest_unsettled_date: null,
      }),
    );
    vi.spyOn(walletsApi, 'route').mockResolvedValue(
      route({ stops: [], totals: { customers: 0, amount_due: '0.00', amount_overdue: '0.00' } }),
    );
    await renderHome();
    expect(await screen.findByText(/You have no wallet yet/)).toBeInTheDocument();
    expect(
      await screen.findByText('None of your customers has anything due today.'),
    ).toBeInTheDocument();
  });

  it('reads in Arabic', async () => {
    as(['collection.create'], 'CASHIER');
    vi.spyOn(walletsApi, 'mine').mockResolvedValue(wallet());
    vi.spyOn(walletsApi, 'route').mockResolvedValue(route());
    await renderHome('ar');
    expect(await screen.findByRole('heading', { name: 'عملي الميداني' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'تحصيل' })).toBeInTheDocument();
  });
});

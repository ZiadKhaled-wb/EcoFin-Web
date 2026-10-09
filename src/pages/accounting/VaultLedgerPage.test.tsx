import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { CashLedger } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cashApi } from '@/services/cashApi';
import { BRANCH_MAIN, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import VaultLedgerPage from './VaultLedgerPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const SAFE = 'a0590000-0000-4000-8000-000000000001';
const timestamp = '2026-10-11T09:00:00.000Z';
const page = (
  <Routes>
    <Route path="/accounting/vaults/:id" element={<VaultLedgerPage />} />
  </Routes>
);
const ledger = (): CashLedger => ({
  account: {
    id: SAFE,
    name: 'Main safe',
    kind: 'safe',
    branch_id: BRANCH_MAIN,
    branch_name: 'Main',
    is_active: true,
    archived_at: null,
    balance: '3800.00',
    is_default: true,
    created_at: timestamp,
    updated_at: timestamp,
  },
  from: '2026-10-01',
  to: null,
  opening_balance: '250.00',
  closing_balance: '3800.00',
  items: [
    {
      id: 'a0590000-0000-4000-8000-000000000010',
      business_date: '2026-10-11',
      created_at: timestamp,
      type: 'transfer_out',
      amount: '-1450.00',
      balance_after: '3800.00',
      source_type: 'cash_transfer',
      source_id: 'a0590000-0000-4000-8000-000000000011',
      source_number: 'MAIN-CX-26-000001',
      note: 'To the bank',
      created_by_name: 'Owner',
    },
    {
      id: 'a0590000-0000-4000-8000-000000000012',
      business_date: '2026-10-10',
      created_at: timestamp,
      type: 'opening',
      amount: '5000.00',
      balance_after: '5250.00',
      source_type: 'import',
      source_id: 'a0590000-0000-4000-8000-000000000013',
      source_number: null,
      note: 'Counted',
      created_by_name: 'Owner',
    },
  ],
  page: 1,
  pageSize: 50,
  total: 2,
});

describe('K01 vault ledger page', () => {
  beforeEach(() => signIn());
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows opening, rows with in/out and running balance, closing; dates from the URL', async () => {
    const api = vi.spyOn(cashApi, 'ledger').mockResolvedValue(ledger());
    await renderApp(page, { lang: 'en', route: `/accounting/vaults/${SAFE}?from=2026-10-01` });
    const table = await screen.findByRole('table', { name: t('cash.ledger.caption') });
    expect(api).toHaveBeenCalledWith(SAFE, { from: '2026-10-01', page: 1, pageSize: 50 });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Opening balance');
    expect(rows[1]).toHaveTextContent('250.00 EGP');
    expect(rows[2]).toHaveTextContent('Transfer out');
    expect(rows[2]).toHaveTextContent('MAIN-CX-26-000001');
    expect(rows[2]).toHaveTextContent('1,450.00 EGP');
    expect(rows[2]).toHaveTextContent('3,800.00 EGP');
    expect(rows[3]).toHaveTextContent('5,000.00 EGP');
    expect(rows[3]).toHaveTextContent('5,250.00 EGP');
    expect(rows[rows.length - 1]).toHaveTextContent('Closing balance');
    expect(rows[rows.length - 1]).toHaveTextContent('3,800.00 EGP');
    expect(screen.getByRole('heading', { name: 'Main safe' })).toBeInTheDocument();
  });

  it('shows the ledger in Arabic', async () => {
    vi.spyOn(cashApi, 'ledger').mockResolvedValue(ledger());
    await renderApp(page, { lang: 'ar', route: `/accounting/vaults/${SAFE}` });
    const table = await screen.findByRole('table', { name: t('cash.ledger.caption') });
    expect(within(table).getByText('الرصيد الافتتاحي')).toBeInTheDocument();
    expect(within(table).getByText('تحويل صادر')).toBeInTheDocument();
    expect(within(table).getByText('الرصيد الختامي')).toBeInTheDocument();
  });

  it('a non-UUID id makes no call', async () => {
    const api = vi.spyOn(cashApi, 'ledger');
    await renderApp(page, { lang: 'en', route: '/accounting/vaults/not-a-uuid' });
    expect(await screen.findByText(t('cash.ledger.notFound'))).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
});

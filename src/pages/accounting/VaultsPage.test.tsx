import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CashAccount, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { cashApi } from '@/services/cashApi';
import { BRANCH_MAIN, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import VaultsPage from './VaultsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const SAFE = 'a0590000-0000-4000-8000-000000000001';
const BANK = 'a0590000-0000-4000-8000-000000000002';
const timestamp = '2026-10-11T09:00:00.000Z';

const account = (over: Partial<CashAccount> = {}): CashAccount => ({
  id: SAFE,
  name: 'الخزنة الرئيسية',
  kind: 'safe',
  branch_id: BRANCH_MAIN,
  branch_name: 'Main',
  is_active: true,
  archived_at: null,
  balance: '3800.00',
  is_default: true,
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});
const bank = account({
  id: BANK,
  name: 'NBE',
  kind: 'bank',
  branch_id: null,
  branch_name: null,
  balance: '0.00',
  is_default: false,
});

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
async function rowOf(name: string) {
  const table = await screen.findByRole('table', { name: t('cash.title') });
  return within(table).findByRole('row', { name: new RegExp(name) });
}

describe('K01 vaults page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['cash.view', 'cash.account_manage', 'cash.adjust', 'cash.transfer']);
    vi.spyOn(cashApi, 'list').mockResolvedValue([account(), bank]);
    vi.spyOn(branchApi, 'list').mockResolvedValue([
      { id: BRANCH_MAIN, code: 'B1', name: 'Main', is_main: true },
    ] as Awaited<ReturnType<typeof branchApi.list>>);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the accounts in Arabic: kind, branch or shop-wide, balance, default badge', async () => {
    await renderApp(<VaultsPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: t('cash.title') });
    for (const label of ['الاسم', 'النوع', 'الفرع', 'الرصيد', 'الحالة']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const safe = await rowOf('الخزنة الرئيسية');
    expect(within(safe).getByText('خزنة')).toBeInTheDocument();
    expect(within(safe).getByText('3,800.00 ج.م')).toBeInTheDocument();
    expect(within(safe).getByText('افتراضية')).toBeInTheDocument();
    expect(within(safe).getByRole('link', { name: 'الخزنة الرئيسية' })).toHaveAttribute(
      'href',
      `/accounting/vaults/${SAFE}`,
    );
    const nbe = await rowOf('NBE');
    expect(within(nbe).getByText('على مستوى المحل')).toBeInTheDocument();
    expect(within(nbe).getByText('حساب بنكي')).toBeInTheDocument();
  });

  it('lists the accounts in English; opening balance only on the empty one', async () => {
    await renderApp(<VaultsPage />, { lang: 'en' });
    const safe = await rowOf('الخزنة الرئيسية');
    expect(within(safe).getByText('Safe')).toBeInTheDocument();
    expect(within(safe).getByText('3,800.00 EGP')).toBeInTheDocument();
    expect(within(safe).queryByRole('button', { name: 'Opening balance' })).toBeNull();
    const nbe = await rowOf('NBE');
    expect(within(nbe).getByText('Shop-wide')).toBeInTheDocument();
    expect(within(nbe).getByRole('button', { name: 'Opening balance' })).toBeInTheDocument();
  });

  it('sends the status and branch filters', async () => {
    const list = vi.spyOn(cashApi, 'list');
    await renderApp(<VaultsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await rowOf('NBE');
    expect(list).toHaveBeenLastCalledWith({ status: 'active' });
    await user.selectOptions(screen.getByLabelText(t('cash.statusFilter')), 'inactive');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ status: 'inactive' }));
    await user.selectOptions(screen.getByLabelText(t('cash.branchFilter')), BRANCH_MAIN);
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ status: 'inactive', branch_id: BRANCH_MAIN }),
    );
  });

  it('create sends the trimmed body; a safe without a branch is refused by the form', async () => {
    const create = vi.spyOn(cashApi, 'create').mockResolvedValue(account({ name: 'Back safe' }));
    await renderApp(<VaultsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await rowOf('NBE');
    await user.click(screen.getByRole('button', { name: t('cash.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('cash.fields.name'))),
      '  Back safe ',
    );
    await user.selectOptions(within(dialog).getByLabelText(t('cash.fields.branch')), '');
    await user.click(within(dialog).getByRole('button', { name: t('cash.save') }));
    expect(await within(dialog).findByText(t('cash.errors.safeNeedsBranch'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText(t('cash.fields.branch')), BRANCH_MAIN);
    await user.click(within(dialog).getByRole('button', { name: t('cash.save') }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'Back safe',
        kind: 'safe',
        branch_id: BRANCH_MAIN,
      }),
    );
  });

  it('deactivate asks first and shows CASH_ACCOUNT_HAS_BALANCE', async () => {
    const deactivate = vi
      .spyOn(cashApi, 'deactivate')
      .mockRejectedValue(new ApiError(409, 'CASH_ACCOUNT_HAS_BALANCE', 'Has balance.'));
    await renderApp(<VaultsPage />, { lang: 'en' });
    const user = userEvent.setup();
    const safe = await rowOf('الخزنة الرئيسية');
    await user.click(within(safe).getByRole('button', { name: t('cash.deactivate') }));
    expect(deactivate).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('dialog');
    await user.click(within(confirm).getByRole('button', { name: t('cash.deactivate') }));
    await waitFor(() => expect(deactivate).toHaveBeenCalledWith(SAFE));
    expect(await screen.findByText(t('cash.errors.hasBalance'))).toBeInTheDocument();
  });

  it('the transfer dialog sends one key across two clicks and shows INSUFFICIENT_FUNDS', async () => {
    const transfer = vi
      .spyOn(cashApi, 'transfer')
      .mockRejectedValue(new ApiError(409, 'INSUFFICIENT_FUNDS', 'Not enough.'));
    await renderApp(<VaultsPage />, { lang: 'en' });
    const user = userEvent.setup();
    const safe = await rowOf('الخزنة الرئيسية');
    await user.click(within(safe).getByRole('button', { name: t('cash.transfer') }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(t('cash.fields.to')), BANK);
    await user.type(within(dialog).getByLabelText(new RegExp(t('cash.fields.amount'))), '5000');
    const send = within(dialog).getByRole('button', { name: t('cash.transfer') });
    await user.click(send);
    expect(
      await within(dialog).findByText('Not enough money in the source vault.'),
    ).toBeInTheDocument();
    await user.click(send);
    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(2));
    const body = { from_account_id: SAFE, to_account_id: BANK, amount: '5000.00' };
    expect(transfer.mock.calls[0]![0]).toMatchObject(body);
    expect(transfer.mock.calls[1]![1]).toBe(transfer.mock.calls[0]![1]);
  });

  it('hides every button without the permissions', async () => {
    setPermissions(['cash.view']);
    await renderApp(<VaultsPage />, { lang: 'en' });
    const nbe = await rowOf('NBE');
    expect(within(nbe).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: t('cash.add') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('cash.transfer') })).toBeNull();
  });
});

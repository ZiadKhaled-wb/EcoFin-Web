import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { BranchDetail } from '@ziadkhaled-wb/contracts';
import { branchApi } from '@/services/branchApi';
import { ApiError } from '@/lib/api';
import { renderApp, signIn, signOut, BRANCH_MAIN, BRANCH_TWO } from '@/test/renderApp';
import { ORG_A } from '@/test/authFixtures';
import { t } from '@/i18n';
import { filterNav, NAV } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';
import BranchesPage from './BranchesPage';
import BranchSwitcher from '@/components/layout/BranchSwitcher';
import { meApi } from '@/features/me/meApi';
import { meFixture } from '@/test/renderApp';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const main: BranchDetail = {
  id: BRANCH_MAIN,
  organization_id: ORG_A,
  name: 'Main',
  code: 'MAIN',
  is_main: true,
  is_active: true,
  address: null,
  city: null,
  governorate: null,
  phone: null,
  eta_branch_code: null,
  default_cash_account_id: null,
  default_vault: null,
  created_at: '2026-10-06T00:00:00Z',
  updated_at: '2026-10-06T00:00:00Z',
  created_by: null,
  updated_by: null,
  archived_at: null,
  vault_options: [],
};
const second: BranchDetail = {
  ...main,
  id: BRANCH_TWO,
  name: 'Second',
  code: 'B2',
  is_main: false,
};
beforeEach(() => {
  signIn();
  vi.spyOn(branchApi, 'manage').mockResolvedValue([main, second]);
  vi.spyOn(branchApi, 'detail').mockResolvedValue(second);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});
describe('O01 branch management', () => {
  it('refreshes the switcher after a create', async () => {
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    vi.spyOn(branchApi, 'list')
      .mockResolvedValueOnce([{ id: BRANCH_MAIN, name: 'Main', code: 'MAIN', is_main: true }])
      .mockResolvedValue([
        { id: BRANCH_MAIN, name: 'Main', code: 'MAIN', is_main: true },
        { id: BRANCH_TWO, name: 'Second', code: 'B2', is_main: false },
      ]);
    vi.spyOn(branchApi, 'create').mockResolvedValue({ id: BRANCH_TWO });
    await renderApp(
      <>
        <BranchSwitcher />
        <BranchesPage />
      </>,
      { lang: 'en' },
    );
    const u = userEvent.setup();
    await screen.findByText('Second');
    expect(screen.queryByRole('button', { name: /Branch:/ })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: t('branches.create') }));
    await u.type(screen.getByLabelText(t('branches.fields.name')), 'Second');
    await u.type(screen.getByLabelText(t('branches.fields.code')), 'b2');
    await u.click(screen.getByRole('button', { name: t('branches.save') }));
    await u.click(await screen.findByRole('button', { name: 'Branch: Main' }));
    expect(await screen.findByRole('menuitem', { name: 'Second' })).toBeInTheDocument();
  });
  it('uppercases code, validates regex, and shows duplicate inline', async () => {
    const create = vi
      .spyOn(branchApi, 'create')
      .mockRejectedValue(new ApiError(409, 'BRANCH_CODE_TAKEN', 'taken'));
    await renderApp(<BranchesPage />, { lang: 'en' });
    const u = userEvent.setup();
    await screen.findByText('Second');
    await u.click(screen.getByRole('button', { name: t('branches.create') }));
    await u.type(screen.getByLabelText(t('branches.fields.name')), 'New');
    await u.type(screen.getByLabelText(t('branches.fields.code')), 'bad-');
    expect(screen.getByLabelText(t('branches.fields.code'))).toHaveValue('BAD-');
    await u.click(screen.getByRole('button', { name: t('branches.save') }));
    expect(await screen.findByText(t('branches.codeInvalid'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await u.clear(screen.getByLabelText(t('branches.fields.code')));
    await u.type(screen.getByLabelText(t('branches.fields.code')), 'b2');
    await u.click(screen.getByRole('button', { name: t('branches.save') }));
    expect(await screen.findByText(t('branches.codeTaken'))).toBeInTheDocument();
  });
  it('edit code is read-only and main has no deactivate action', async () => {
    await renderApp(<BranchesPage />, { lang: 'en' });
    const u = userEvent.setup();
    const mainRow = (await screen.findByText('Main')).closest('tr')!;
    expect(
      within(mainRow).queryByRole('button', { name: t('branches.deactivate') }),
    ).not.toBeInTheDocument();
    await u.click(
      within(screen.getByText('Second').closest('tr')!).getByRole('button', {
        name: t('branches.edit'),
      }),
    );
    expect(await screen.findByLabelText(t('branches.fields.code'))).toHaveAttribute('readonly');
  });
  it('warns with counts and submits explicit confirmation', async () => {
    vi.spyOn(branchApi, 'check').mockResolvedValue({
      open_shifts: 1,
      stock_units: 5,
      cash_balance: '30.25',
    });
    const deactivate = vi
      .spyOn(branchApi, 'deactivate')
      .mockResolvedValue({ id: BRANCH_TWO, is_active: false });
    await renderApp(<BranchesPage />, { lang: 'en' });
    const u = userEvent.setup();
    await screen.findByText('Second');
    await u.click(screen.getByRole('button', { name: t('branches.deactivate') }));
    expect(await screen.findByText(t('branches.warning'))).toBeInTheDocument();
    expect(screen.getByText(/30.25/)).toBeInTheDocument();
    await u.type(screen.getByLabelText(t('branches.reason')), 'Close');
    await u.click(screen.getByRole('button', { name: t('branches.deactivateAnyway') }));
    expect(deactivate).toHaveBeenCalledWith(BRANCH_TWO, { reason: 'Close', confirm: true });
  });
  it('uses a simple confirmation for clean branches', async () => {
    vi.spyOn(branchApi, 'check').mockResolvedValue({
      open_shifts: 0,
      stock_units: 0,
      cash_balance: '0.00',
    });
    const deactivate = vi
      .spyOn(branchApi, 'deactivate')
      .mockResolvedValue({ id: BRANCH_TWO, is_active: false });
    await renderApp(<BranchesPage />, { lang: 'en' });
    const u = userEvent.setup();
    await screen.findByText('Second');
    await u.click(screen.getByRole('button', { name: t('branches.deactivate') }));
    await screen.findByLabelText(t('branches.reason'));
    expect(screen.queryByText(t('branches.warning'))).not.toBeInTheDocument();
    await u.type(screen.getByLabelText(t('branches.reason')), 'Close');
    await u.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('branches.deactivate') }),
    );
    expect(deactivate).toHaveBeenCalledWith(BRANCH_TWO, { reason: 'Close', confirm: false });
  });
  it('menu requires branch.manage', () => {
    const user = useAuthStore.getState().user!;
    expect(JSON.stringify(filterNav(NAV, { ...user, permissions: [] }))).not.toContain(
      'settings/branches',
    );
    expect(JSON.stringify(filterNav(NAV, { ...user, permissions: ['branch.manage'] }))).toContain(
      'settings/branches',
    );
  });
});

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderApp,
  signIn,
  signOut,
  BRANCH_MAIN,
  meFixture,
  permissionsFixture,
} from '@/test/renderApp';
import { USER_ID } from '@/test/authFixtures';
import { staffApi } from '@/services/staffApi';
import { branchApi } from '@/services/branchApi';
import { meApi } from '@/features/me/meApi';
import { ApiError } from '@/lib/api';
import { filterNav, NAV } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import EmployeesPage from './EmployeesPage';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const row = {
  id: '66666666-6666-4666-8666-666666666666',
  full_name: 'Staff',
  email: null,
  phone: null,
  username: 'staff.user',
  role: 'CASHIER' as const,
  is_active: true,
  default_branch_id: BRANCH_MAIN,
  branch_ids: [BRANCH_MAIN],
  invite_status: 'pending' as const,
  override_count: 0,
  created_at: '2026-10-06T00:00:00Z',
};
beforeEach(() => {
  signIn();
  vi.spyOn(staffApi, 'list').mockResolvedValue({
    items: [
      { ...row, id: USER_ID, full_name: 'Owner', role: 'OWNER', invite_status: 'accepted' },
      row,
    ],
    total: 2,
  });
  vi.spyOn(branchApi, 'list').mockResolvedValue([
    { id: BRANCH_MAIN, name: 'Main', code: 'MAIN', is_main: true },
  ]);
  vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
  vi.spyOn(meApi, 'permissions').mockResolvedValue(
    permissionsFixture(['employee.manage', 'sale.create'], { allBranches: true }),
  );
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});
describe('O02 employees UI', () => {
  it('menu visibility depends on employee.manage', () => {
    const user = useAuthStore.getState().user!;
    expect(JSON.stringify(filterNav(NAV, { ...user, permissions: [] }))).not.toContain(
      '/settings/employees',
    );
    expect(JSON.stringify(filterNav(NAV, { ...user, permissions: ['employee.manage'] }))).toContain(
      '/settings/employees',
    );
  });
  it('owner/self have no actions, pending can resend and cannot reset', async () => {
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Staff');
    const owner = screen
      .getAllByText('Owner')
      .find((n) => n.closest('tr'))!
      .closest('tr')!;
    expect(within(owner).queryByRole('button')).not.toBeInTheDocument();
    const staff = screen.getByText('Staff').closest('tr')!;
    expect(within(staff).getByRole('button', { name: t('employees.resend') })).toBeInTheDocument();
    expect(
      within(staff).queryByRole('button', { name: t('employees.reset') }),
    ).not.toBeInTheDocument();
  });
  it('create requires a login and prechecks role defaults', async () => {
    const create = vi.spyOn(staffApi, 'create');
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Staff');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: t('employees.create') }));
    expect(screen.getByLabelText(t('employees.permissions.sale_create'))).toBeChecked();
    expect(screen.getByLabelText(t('employees.permissions.org_settings_manage'))).toBeDisabled();
    await u.type(screen.getByLabelText(t('employees.fields.full_name')), 'New');
    await u.click(screen.getByRole('button', { name: t('employees.save') }));
    expect(await screen.findByText(t('employees.loginRequired'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
  it('email conflict is shown inline', async () => {
    vi.spyOn(staffApi, 'create').mockRejectedValue(new ApiError(409, 'EMAIL_TAKEN', 'private'));
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Staff');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: t('employees.create') }));
    await u.type(screen.getByLabelText(t('employees.fields.full_name')), 'New');
    await u.type(screen.getByLabelText(t('employees.fields.email')), 'new@example.com');
    await u.click(screen.getByLabelText('Main'));
    await u.click(screen.getByRole('button', { name: t('employees.save') }));
    expect(await screen.findByText(t('employees.emailTaken'))).toBeInTheDocument();
  });
  it('one-time link copy and WhatsApp encode the link and close clears it', async () => {
    const link = 'http://localhost:5173/invite/accept#token=one-time';
    vi.spyOn(staffApi, 'invite').mockResolvedValue({
      delivery: 'link',
      invite_link: link,
      invite_expires_at: '2026-10-07T00:00:00Z',
    });
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Staff');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: t('employees.resend') }));
    const share = await screen.findByRole('link', { name: t('employees.whatsapp') });
    expect(share).toHaveAttribute(
      'href',
      'https://wa.me/?text=' + encodeURIComponent(t('employees.shareMessage') + ' ' + link),
    );
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await u.click(screen.getByRole('button', { name: t('employees.copy') }));
    expect(write).toHaveBeenCalledWith(link);
    await u.click(screen.getByRole('button', { name: t('ui.close') }));
    expect(screen.queryByText(link)).not.toBeInTheDocument();
    expect(localStorage.getItem('one-time')).toBeNull();
  });
});

import { toast } from 'sonner';
import { api } from '@/lib/api';
import { httpError } from '@/test/authFixtures';
it('create user limit shows the global plan toast', async () => {
  const adapter = api.defaults.adapter;
  const toastError = vi.spyOn(toast, 'error');
  api.defaults.adapter = async (config) => {
    throw httpError(config, 409, 'PLAN_LIMIT_REACHED');
  };
  try {
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Staff');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: t('employees.create') }));
    await u.type(screen.getByLabelText(t('employees.fields.full_name')), 'New');
    await u.type(screen.getByLabelText(t('employees.fields.email')), 'new@example.com');
    await u.click(screen.getByLabelText('Main'));
    await u.click(screen.getByRole('button', { name: t('employees.save') }));
    expect(await screen.findByText(t('employees.planLimit'))).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith(t('subscriptions.validation'));
  } finally {
    api.defaults.adapter = adapter;
  }
});
it('linked login fields are read only and reset replaces resend', async () => {
  vi.mocked(staffApi.list).mockResolvedValue({
    items: [{ ...row, invite_status: 'accepted' }],
    total: 1,
  });
  await renderApp(<EmployeesPage />, { lang: 'en' });
  await screen.findByText('Staff');
  expect(screen.getByRole('button', { name: t('employees.reset') })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: t('employees.resend') })).not.toBeInTheDocument();
  const u = userEvent.setup();
  await u.click(screen.getByRole('button', { name: t('employees.edit') }));
  expect(screen.getByLabelText(t('employees.fields.email'))).toHaveAttribute('readonly');
  expect(screen.getByLabelText(t('employees.fields.username'))).toHaveAttribute('readonly');
});
it('a nonowner caller has no self row actions', async () => {
  vi.mocked(staffApi.list).mockResolvedValue({ items: [{ ...row, id: USER_ID }], total: 1 });
  await renderApp(<EmployeesPage />, { lang: 'en' });
  const self = (await screen.findByText('Staff')).closest('tr')!;
  expect(within(self).queryByRole('button')).not.toBeInTheDocument();
});
it('unlinked staff without an open invitation display invite pending', async () => {
  vi.mocked(staffApi.list).mockResolvedValue({
    items: [{ ...row, invite_status: 'none' }],
    total: 1,
  });
  await renderApp(<EmployeesPage />, { lang: 'en' });
  await screen.findByText('Staff');
  const staff = screen.getByText('Staff').closest('tr')!;
  expect(within(staff).getByText(t('employees.statuses.pending'))).toBeInTheDocument();
  expect(within(staff).queryByText(t('employees.statuses.active'))).not.toBeInTheDocument();
});

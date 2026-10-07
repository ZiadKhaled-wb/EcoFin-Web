import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import type { InternalAxiosRequestConfig } from 'axios';
import {
  renderApp,
  signIn,
  signOut,
  BRANCH_MAIN,
  meFixture,
  permissionsFixture,
} from '@/test/renderApp';
import { httpError, httpOk, USER_ID } from '@/test/authFixtures';
import { staffApi } from '@/services/staffApi';
import { branchApi } from '@/services/branchApi';
import { meApi } from '@/features/me/meApi';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import RequireAuth from '@/components/guards/RequireAuth';
import LoginPage from '@/pages/auth/LoginPage';
import { t } from '@/i18n';
import EmployeesPage from './EmployeesPage';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const STAFF_ID = '66666666-6666-4666-8666-666666666666';
const row = {
  id: STAFF_ID,
  full_name: 'Staff',
  email: null,
  phone: null,
  username: 'staff.user',
  role: 'CASHIER' as const,
  is_active: true,
  default_branch_id: BRANCH_MAIN,
  branch_ids: [BRANCH_MAIN],
  invite_status: 'accepted' as const,
  override_count: 0,
  created_at: '2026-10-06T00:00:00Z',
};
const owner = { ...row, id: USER_ID, full_name: 'Owner', role: 'OWNER' as const };
const originalAdapter = api.defaults.adapter;

function allow(keys: Parameters<typeof permissionsFixture>[0] = ['employee.manage']) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys, { allBranches: true }));
}
/** The API answers the PUT with `reply(config)`; returns the requests it saw. */
function answerPut(reply: (config: InternalAxiosRequestConfig) => Promise<never> | unknown) {
  const seen: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async (config) => {
    seen.push(config);
    const result = await reply(config);
    return httpOk(config, result);
  };
  return seen;
}
const ok = (config: InternalAxiosRequestConfig) => ({
  employeeId: STAFF_ID,
  active: JSON.parse(String(config.data)).active,
  id: STAFF_ID,
  is_active: JSON.parse(String(config.data)).active,
});
const failWith = (status: number, code: string) => (config: InternalAxiosRequestConfig) => {
  throw httpError(config, status, code);
};
const rowOf = (name: string) =>
  screen.getAllByRole('row').find((r) => r.querySelector('td')?.textContent === name)!;
async function openDialog(
  user: ReturnType<typeof userEvent.setup>,
  name: 'deactivate' | 'reactivate',
) {
  await screen.findByText('Staff');
  await user.click(within(rowOf('Staff')).getByRole('button', { name: t(`employees.${name}`) }));
}

beforeEach(() => {
  signIn();
  vi.spyOn(staffApi, 'list').mockResolvedValue({ items: [owner, row], total: 2 });
  vi.spyOn(branchApi, 'list').mockResolvedValue([
    { id: BRANCH_MAIN, name: 'Main', code: 'MAIN', is_main: true },
  ]);
  vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
  allow();
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  signOut();
  vi.restoreAllMocks();
});

describe('EC-145 deactivate / reactivate', () => {
  it('is hidden without employee.manage', async () => {
    allow(['sale.create']);
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Staff');
    await screen.findByRole('button', { name: t('employees.edit') });
    expect(screen.queryByRole('button', { name: t('employees.deactivate') })).toBeNull();
  });

  it('is hidden on the owner row and on your own row', async () => {
    vi.mocked(staffApi.list).mockResolvedValue({
      items: [owner, { ...row, id: USER_ID, full_name: 'Me' }, { ...row, full_name: 'Other' }],
      total: 3,
    });
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Other');
    expect(within(rowOf('Owner')).queryByRole('button')).toBeNull();
    expect(within(rowOf('Me')).queryByRole('button')).toBeNull();
    expect(
      within(rowOf('Other')).getByRole('button', { name: t('employees.deactivate') }),
    ).toBeInTheDocument();
  });

  it('shows Deactivate on active rows and Reactivate on inactive rows, greyed and badged', async () => {
    vi.mocked(staffApi.list).mockResolvedValue({
      items: [
        row,
        { ...row, id: '77777777-7777-4777-8777-777777777777', full_name: 'Gone', is_active: false },
      ],
      total: 2,
    });
    await renderApp(<EmployeesPage />, { lang: 'en' });
    await screen.findByText('Staff');
    expect(
      within(rowOf('Staff')).getByRole('button', { name: t('employees.deactivate') }),
    ).toBeInTheDocument();
    expect(within(rowOf('Staff')).getByText(t('employees.statuses.active'))).toBeInTheDocument();
    const gone = rowOf('Gone');
    expect(
      within(gone).getByRole('button', { name: t('employees.reactivate') }),
    ).toBeInTheDocument();
    expect(within(gone).getByText(t('employees.statuses.inactive'))).toBeInTheDocument();
    expect(gone).toHaveClass('text-ink-mute');
    expect(rowOf('Staff')).not.toHaveClass('text-ink-mute');
  });

  it('needs a reason of 3 to 500 characters and shows an inline error', async () => {
    const seen = answerPut(ok);
    await renderApp(<EmployeesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await openDialog(user, 'deactivate');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Staff')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: t('employees.confirm') }));
    expect(await within(dialog).findByText(t('employees.reasonInvalid'))).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), '  ab  ');
    await user.click(within(dialog).getByRole('button', { name: t('employees.confirm') }));
    expect(within(dialog).getByText(t('employees.reasonInvalid'))).toBeInTheDocument();
    expect(seen).toHaveLength(0);
  });

  it('sends PUT /api/employees/<id>/active with the trimmed reason; the list refetches and the badge changes', async () => {
    const seen = answerPut(ok);
    const success = vi.spyOn(toast, 'success');
    vi.mocked(staffApi.list)
      .mockResolvedValueOnce({ items: [owner, row], total: 2 })
      .mockResolvedValue({ items: [owner, { ...row, is_active: false }], total: 2 });
    await renderApp(<EmployeesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await openDialog(user, 'deactivate');
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Reason/), '  Left the shop  ');
    await user.click(within(dialog).getByRole('button', { name: t('employees.confirm') }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('put');
    expect(seen[0]!.url).toBe(`/api/employees/${STAFF_ID}/active`);
    expect(JSON.parse(String(seen[0]!.data))).toEqual({ active: false, reason: 'Left the shop' });
    expect(success).toHaveBeenCalledWith(t('employees.deactivated'));
    expect(
      await within(rowOf('Staff')).findByText(t('employees.statuses.inactive')),
    ).toBeInTheDocument();
    expect(staffApi.list).toHaveBeenCalledTimes(2);

    // and back
    await user.click(
      within(rowOf('Staff')).getByRole('button', { name: t('employees.reactivate') }),
    );
    await user.type(within(screen.getByRole('dialog')).getByLabelText(/Reason/), 'Back on shift');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('employees.confirm') }),
    );
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(JSON.parse(String(seen[1]!.data))).toEqual({ active: true, reason: 'Back on shift' });
    expect(success).toHaveBeenCalledWith(t('employees.reactivated'));
  });

  it('works from the employee detail drawer too', async () => {
    const seen = answerPut(ok);
    await renderApp(<EmployeesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await screen.findByText('Staff');
    await user.click(within(rowOf('Staff')).getByRole('button', { name: t('employees.edit') }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: t('employees.deactivate') }));
    const dialog = await screen.findByRole('dialog', { name: t('employees.deactivateTitle') });
    await user.type(within(dialog).getByLabelText(/Reason/), 'No longer works here');
    await user.click(within(dialog).getByRole('button', { name: t('employees.confirm') }));
    await waitFor(() => expect(seen).toHaveLength(1));
  });

  describe('errors', () => {
    async function submitWith(code: [number, string]) {
      answerPut(failWith(...code));
      await renderApp(<EmployeesPage />, { lang: 'en' });
      const user = userEvent.setup();
      await openDialog(user, 'deactivate');
      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Reason/), 'Left the shop');
      await user.click(within(dialog).getByRole('button', { name: t('employees.confirm') }));
    }

    it('403 FORBIDDEN: permission toast, dialog stays', async () => {
      const toastError = vi.spyOn(toast, 'error');
      await submitWith([403, 'FORBIDDEN']);
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(t('employees.activeErrors.forbidden')),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('404 NOT_FOUND: not-found toast, dialog closes, list refreshes', async () => {
      const toastError = vi.spyOn(toast, 'error');
      await submitWith([404, 'NOT_FOUND']);
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(t('employees.activeErrors.notFound')),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(staffApi.list).toHaveBeenCalledTimes(2));
    });

    it('400 VALIDATION_FAILED: inline error on the reason field', async () => {
      await submitWith([400, 'VALIDATION_FAILED']);
      expect(await screen.findByText(t('employees.reasonInvalid'))).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('409 PLAN_LIMIT_REACHED: the P05 limit toast', async () => {
      const toastError = vi.spyOn(toast, 'error');
      await submitWith([409, 'PLAN_LIMIT_REACHED']);
      await waitFor(() => expect(toastError).toHaveBeenCalledWith(t('subscriptions.validation')));
      expect(toastError).toHaveBeenCalledTimes(1);
    });
  });
});

describe('EC-145 deactivated account is signed out', () => {
  it('a 403 ACCOUNT_DISABLED on any call clears the session and lands on login with the message', async () => {
    api.defaults.adapter = async (config) => {
      throw httpError(config, 403, 'ACCOUNT_DISABLED');
    };
    await renderApp(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route
            path="/work"
            element={
              <button onClick={() => void api.get('/api/anything').catch(() => {})}>act</button>
            }
          />
        </Route>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { lang: 'en', route: '/work' },
    );
    expect(screen.queryByText(t('auth.notice.accountDeactivated'))).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'act' }));
    expect(await screen.findByText(t('auth.notice.accountDeactivated'))).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    // a fresh login clears the message
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().endedReason).toBeNull();
  });
});

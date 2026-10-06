import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { passwordResetApi } from '@/services/staffApi';
import { ApiError } from '@/lib/api';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import SetPasswordPage from './SetPasswordPage';
import LoginPage from './LoginPage';
const info = { full_name: 'Staff User', login: 'staff.user', shop_name: 'Shop' };
beforeEach(() => {
  window.history.replaceState(null, '', '/password/set#token=reset-secret');
  vi.spyOn(passwordResetApi, 'lookup').mockImplementation(async () => {
    expect(window.location.hash).toBe('');
    return info;
  });
  vi.spyOn(passwordResetApi, 'complete').mockResolvedValue({
    login: info.login,
    tenant_slug: 'staff-shop',
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
  window.history.replaceState(null, '', '/');
});
function page() {
  return render(
    <MemoryRouter initialEntries={['/password/set']}>
      <Routes>
        <Route path="/password/set" element={<SetPasswordPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('O02 public password set', () => {
  it('clears fragment before request and shows name/login/shop', async () => {
    page();
    expect(await screen.findByText(info.login)).toBeInTheDocument();
    expect(screen.getByText(info.full_name)).toBeInTheDocument();
    expect(screen.getByText(info.shop_name)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });
  it.each(['RESET_USED', 'RESET_NOT_FOUND', 'RESET_EXPIRED'] as const)('shows %s', async (code) => {
    vi.mocked(passwordResetApi.lookup).mockRejectedValue(
      new ApiError(code === 'RESET_NOT_FOUND' ? 404 : 410, code, 'private'),
    );
    page();
    expect(
      await screen.findByText(
        t(code === 'RESET_EXPIRED' ? 'employees.resetPage.expired' : 'employees.resetPage.invalid'),
      ),
    ).toBeInTheDocument();
  });
  it('no token does not request lookup', async () => {
    window.history.replaceState(null, '', '/password/set');
    page();
    expect(await screen.findByText(t('employees.resetPage.invalid'))).toBeInTheDocument();
    expect(passwordResetApi.lookup).not.toHaveBeenCalled();
  });
  it('password rules prevent submission', async () => {
    page();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText(t('shops.invite.password')), 'short');
    await u.type(screen.getByLabelText(t('shops.invite.confirm')), 'short');
    await u.click(screen.getByRole('button', { name: t('employees.resetPage.submit') }));
    expect(await screen.findByText(t('auth.password.tooShort'))).toBeInTheDocument();
    expect(passwordResetApi.complete).not.toHaveBeenCalled();
  });
  it('redirects with login prefilled and username shop context', async () => {
    page();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText(t('shops.invite.password')), 'New-Password-2026!');
    await u.type(screen.getByLabelText(t('shops.invite.confirm')), 'New-Password-2026!');
    await u.click(screen.getByRole('button', { name: t('employees.resetPage.submit') }));
    await waitFor(() =>
      expect(screen.getByLabelText(t('auth.login.identifier'))).toHaveValue(info.login),
    );
    expect(useAuthStore.getState().tenantSlug).toBe('staff-shop');
    expect(passwordResetApi.complete).toHaveBeenCalledWith({
      token: 'reset-secret',
      password: 'New-Password-2026!',
    });
  });
  it('spent token after admin failure instructs a new reset', async () => {
    vi.mocked(passwordResetApi.complete).mockRejectedValue(
      new ApiError(500, 'RESET_FAILED', 'private'),
    );
    page();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText(t('shops.invite.password')), 'New-Password-2026!');
    await u.type(screen.getByLabelText(t('shops.invite.confirm')), 'New-Password-2026!');
    await u.click(screen.getByRole('button', { name: t('employees.resetPage.submit') }));
    expect(await screen.findByText(t('employees.resetPage.failed'))).toBeInTheDocument();
  });
});

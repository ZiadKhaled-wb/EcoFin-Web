import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { inviteApi } from '@/services/shopApi';
import { useAuthStore } from '@/store/authStore';
import InviteAcceptPage from './InviteAcceptPage';
import LoginPage from './LoginPage';
const info = {
  shop_name: 'Test Shop',
  full_name: 'Test Owner',
  email: 'owner@example.com',
  account_exists: false,
};
beforeEach(() => {
  window.history.replaceState(null, '', '/invite/accept#token=secret-invite');
  vi.spyOn(inviteApi, 'lookup').mockImplementation(async () => {
    expect(window.location.hash).toBe('');
    return info;
  });
  vi.spyOn(inviteApi, 'accept').mockResolvedValue({ tenant_slug: 'shop-one', email: info.email });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
  window.history.replaceState(null, '', '/');
});
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/invite/accept']}>
      <Routes>
        <Route path="/invite/accept" element={<InviteAcceptPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('InviteAcceptPage', () => {
  it('removes the token before lookup and shows new account fields', async () => {
    renderPage();
    expect(await screen.findByLabelText(t('shops.invite.password'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('shops.invite.confirm'))).toBeInTheDocument();
    expect(inviteApi.lookup).toHaveBeenCalledWith('secret-invite');
    expect(window.location.hash).toBe('');
  });
  it('shows one current-password field for an existing account', async () => {
    vi.mocked(inviteApi.lookup).mockResolvedValue({ ...info, account_exists: true });
    renderPage();
    expect(await screen.findByText(t('shops.invite.existing'))).toBeInTheDocument();
    expect(screen.queryByLabelText(t('shops.invite.confirm'))).not.toBeInTheDocument();
  });
  it.each([
    ['INVITE_EXPIRED', 'expired'],
    ['INVITE_USED', 'invalid'],
    ['INVITE_NOT_FOUND', 'invalid'],
  ] as const)('shows %s state', async (code, key) => {
    vi.mocked(inviteApi.lookup).mockRejectedValue(
      new ApiError(code === 'INVITE_NOT_FOUND' ? 404 : 410, code, 'hidden'),
    );
    renderPage();
    expect(await screen.findByText(t(`shops.invite.${key}`))).toBeInTheDocument();
  });
  it('does not lookup without a token', async () => {
    window.history.replaceState(null, '', '/invite/accept');
    renderPage();
    expect(await screen.findByText(t('shops.invite.invalid'))).toBeInTheDocument();
    expect(inviteApi.lookup).not.toHaveBeenCalled();
  });
  it('checks password confirmation and rules before accepting', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('shops.invite.password')), 'short');
    await user.type(screen.getByLabelText(t('shops.invite.confirm')), 'short');
    await user.click(screen.getByRole('button', { name: t('shops.invite.accept') }));
    expect(await screen.findByText(t('auth.password.tooShort'))).toBeInTheDocument();
    expect(inviteApi.accept).not.toHaveBeenCalled();
  });
  it('redirects to login with email prefilled and an acceptance notice', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('shops.invite.password')), 'password-123');
    await user.type(screen.getByLabelText(t('shops.invite.confirm')), 'password-123');
    await user.click(screen.getByRole('button', { name: t('shops.invite.accept') }));
    await waitFor(() =>
      expect(screen.getByLabelText(t('auth.login.identifier'))).toHaveValue(info.email),
    );
    expect(screen.getByText(t('shops.invite.success'))).toBeInTheDocument();
    expect(inviteApi.accept).toHaveBeenCalledWith({
      token: 'secret-invite',
      password: 'password-123',
    });
  });
  it('shows a wrong existing password without changing the form', async () => {
    vi.mocked(inviteApi.lookup).mockResolvedValue({ ...info, account_exists: true });
    vi.mocked(inviteApi.accept).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'hidden'),
    );
    renderPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('shops.invite.password')), 'old');
    await user.click(screen.getByRole('button', { name: t('shops.invite.accept') }));
    expect(await screen.findByText(t('auth.errors.invalidCredentials'))).toBeInTheDocument();
  });
});

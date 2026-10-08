import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { api, ApiError, type ApiErrorCode } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { loginResponse, ORG_A, shopA, shopB } from '@/test/authFixtures';
import LoginPage from './LoginPage';

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
  useAuthStore.setState({ tenantSlug: null });
});

function renderLogin(initial = '/login') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/select-shop" element={<p>picker page</p>} />
        <Route path="/change-password" element={<p>change page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fill(identifier: string, password = 'secret-pw') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(t('auth.login.identifier')), identifier);
  await user.type(screen.getByLabelText(t('auth.login.password')), password);
  return user;
}

const submit = () => screen.getByRole('button', { name: t('auth.login.submit') });

describe('LoginPage', () => {
  it('logs in with an email: contract body without a shop, then goes to the dashboard', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: loginResponse() });
    renderLogin();
    expect(screen.queryByLabelText(t('auth.shop.label'))).not.toBeInTheDocument();
    const user = await fill('Owner@Example.com');
    await user.click(submit());

    await screen.findByText('dashboard page');
    expect(post).toHaveBeenCalledWith(
      '/api/auth/login',
      { identifier: 'Owner@Example.com', password: 'secret-pw' },
      { skipAuth: true },
    );
    expect(useAuthStore.getState().orgId).toBe(ORG_A);
    expect(useAuthStore.getState().accessToken).toBeTruthy();
  });

  it('P02: the first login after an invite opens the setup wizard', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: loginResponse() });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { afterLogin: 'onboarding' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<p>wizard page</p>} />
          <Route path="/dashboard" element={<p>dashboard page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const user = await fill('Owner@Example.com');
    await user.click(submit());
    await screen.findByText('wizard page');
  });

  it('ignores any other after-login target from navigation state', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: loginResponse() });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { afterLogin: '/audit' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>dashboard page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const user = await fill('Owner@Example.com');
    await user.click(submit());
    await screen.findByText('dashboard page');
  });

  it('logs in with shop + username: lowercases the username and sends tenantSlug', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: loginResponse() });
    renderLogin();
    const user = await fill('Ahmed.Ali');
    await user.type(screen.getByLabelText(t('auth.shop.label')), 'Shop-A');
    await user.click(submit());

    await screen.findByText('dashboard page');
    expect(post.mock.calls[0]?.[1]).toEqual({
      identifier: 'ahmed.ali',
      tenantSlug: 'shop-a',
      password: 'secret-pw',
    });
    expect(useAuthStore.getState().user?.username).toBe('ahmed.ali');
  });

  it('asks for the shop and sends nothing when a username has none', async () => {
    const post = vi.spyOn(api, 'post');
    renderLogin();
    const user = await fill('ahmed');
    await user.click(submit());
    expect(await screen.findByText(t('auth.errors.shopRequired'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('goes to the shop picker when the login has several shops', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: loginResponse({ shops: [shopA, shopB], requiresShopSelection: true }),
    });
    renderLogin();
    const user = await fill('owner@example.com');
    await user.click(submit());
    await screen.findByText('picker page');
    expect(useAuthStore.getState().orgId).toBeNull();
    expect(useAuthStore.getState().shops).toHaveLength(2);
  });

  it('sends a must-change-password user to the change page', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: loginResponse({ mustChangePassword: true }) });
    renderLogin();
    const user = await fill('owner@example.com');
    await user.click(submit());
    await screen.findByText('change page');
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'auth.errors.invalidCredentials'],
    ['ACCOUNT_DISABLED', 403, 'auth.errors.accountDisabled'],
    ['SHOP_INACTIVE', 403, 'auth.errors.shopInactive'],
    ['SUBSCRIPTION_EXPIRED', 403, 'auth.errors.subscriptionExpired'],
    ['TOO_MANY_LOGIN_ATTEMPTS', 429, 'auth.errors.tooManyAttempts'],
  ] as const)(
    'shows the translated message for %s, never server text',
    async (code, status, key) => {
      vi.spyOn(api, 'post').mockRejectedValue(
        new ApiError(status, code as ApiErrorCode, 'x', undefined, undefined, 'raw server text'),
      );
      renderLogin();
      const user = await fill('owner@example.com');
      await user.click(submit());
      expect(await screen.findByRole('alert')).toHaveTextContent(t(key));
      expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument();
    },
  );

  it('shows a countdown when the server sends Retry-After', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(429, 'TOO_MANY_LOGIN_ATTEMPTS', 'x', 45));
    renderLogin();
    const user = await fill('owner@example.com');
    await user.click(submit());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        t('auth.errors.rateLimited', { seconds: 45 }),
      ),
    );
  });

  it('shows the success notice after a password reset', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { notice: 'reset' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(t('auth.notice.reset'))).toBeInTheDocument();
  });
});

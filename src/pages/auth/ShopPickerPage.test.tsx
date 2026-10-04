import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { loginResponse, ORG_B, selectShopResponse, shopA, shopB } from '@/test/authFixtures';
import ShopPickerPage from './ShopPickerPage';

beforeEach(() => {
  useAuthStore
    .getState()
    .setLogin(loginResponse({ shops: [shopA, shopB], requiresShopSelection: true }));
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
});

const renderPicker = () =>
  render(
    <MemoryRouter initialEntries={['/select-shop']}>
      <Routes>
        <Route path="/select-shop" element={<ShopPickerPage />} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/change-password" element={<p>change page</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ShopPickerPage', () => {
  it('lists each shop with its name, slug and role', () => {
    renderPicker();
    expect(screen.getByText('Shop A')).toBeInTheDocument();
    expect(screen.getByText('shop-b')).toBeInTheDocument();
    expect(screen.getByText(t('auth.role.CASHIER'))).toBeInTheDocument();
  });

  it('calls select-shop, keeps the login tokens, stores orgId, then enters the app', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: selectShopResponse(shopB) });
    const tokensBefore = (({ accessToken, refreshToken, expiresAt }) => ({
      accessToken,
      refreshToken,
      expiresAt,
    }))(useAuthStore.getState());
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: /Shop B/ }));

    await screen.findByText('dashboard page');
    expect(post).toHaveBeenCalledWith('/api/auth/select-shop', { orgId: ORG_B });
    const state = useAuthStore.getState();
    expect(state.orgId).toBe(ORG_B);
    expect({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      expiresAt: state.expiresAt,
    }).toEqual(tokensBefore);
    expect(tokensBefore.accessToken).toBeTruthy();
    expect(state.user?.role).toBe('CASHIER');
  });

  it('shows a translated error and stays on the page when select-shop fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError(403, 'SHOP_NOT_ALLOWED', 'x', undefined, undefined, 'raw server text'),
    );
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: /Shop A/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('auth.errors.shopNotAllowed'));
    expect(useAuthStore.getState().orgId).toBeNull();
  });
});

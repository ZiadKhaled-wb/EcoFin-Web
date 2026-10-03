import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { loginResponse, ORG_A } from '@/test/authFixtures';
import ChangePasswordPage from './ChangePasswordPage';

beforeEach(() => {
  useAuthStore
    .getState()
    .setLogin(loginResponse({ mustChangePassword: true }), { identifier: 'owner@example.com' });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/change-password']}>
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );

async function fillAndSubmit(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(t('auth.change.current')), current);
  await user.type(screen.getByLabelText(t('auth.change.new')), next);
  await user.type(screen.getByLabelText(t('auth.change.confirm')), confirm);
  await user.click(screen.getByRole('button', { name: t('auth.change.submit') }));
}

describe('ChangePasswordPage', () => {
  it('sends the contract body, signs in again for a clean token and clears the flag', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { ok: true } })
      .mockResolvedValueOnce({ data: loginResponse({ mustChangePassword: false }) });
    renderPage();
    await fillAndSubmit('temp-password', 'brand-new-pw', 'brand-new-pw');

    await screen.findByText('dashboard page', undefined, { timeout: 3000 });
    expect(post.mock.calls[0]).toEqual([
      '/api/auth/change-password',
      { currentPassword: 'temp-password', newPassword: 'brand-new-pw' },
    ]);
    expect(post.mock.calls[1]?.[1]).toEqual({
      identifier: 'owner@example.com',
      password: 'brand-new-pw',
    });
    expect(useAuthStore.getState().mustChangePassword).toBe(false);
    expect(useAuthStore.getState().orgId).toBe(ORG_A);
  });

  it('shows the wrong-current-password error under the field', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
    renderPage();
    await fillAndSubmit('wrong-password', 'brand-new-pw', 'brand-new-pw');
    expect(await screen.findByText(t('auth.change.currentWrong'))).toBeInTheDocument();
  });

  it('blocks mismatching confirmation before any request', async () => {
    const post = vi.spyOn(api, 'post');
    renderPage();
    await fillAndSubmit('temp-password', 'brand-new-pw', 'other-new-pw');
    expect(await screen.findByText(t('auth.password.mismatch'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

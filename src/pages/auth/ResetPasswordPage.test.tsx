import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import ResetPasswordPage from './ResetPasswordPage';

type Listener = (event: string, session: { access_token: string } | null) => void;

const supa = vi.hoisted(() => ({
  session: null as { access_token: string } | null,
  listeners: [] as unknown[],
  signOut: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: supa.session } }),
      onAuthStateChange: (cb: unknown) => {
        supa.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signOut: supa.signOut,
    },
  },
}));

beforeEach(() => {
  supa.session = null;
  supa.listeners.length = 0;
  supa.signOut.mockClear();
});
afterEach(() => vi.restoreAllMocks());

const renderReset = () =>
  render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/forgot-password" element={<p>forgot page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ResetPasswordPage', () => {
  it('shows the invalid-link state when the URL carried no recovery token', async () => {
    renderReset();
    expect(await screen.findByText(t('auth.reset.invalidLink'))).toBeInTheDocument();
  });

  it('refuses mismatching passwords without calling the server', async () => {
    supa.session = { access_token: 'recovery-token' };
    const post = vi.spyOn(api, 'post');
    renderReset();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('auth.reset.newPassword')), 'new-password-1');
    await user.type(screen.getByLabelText(t('auth.reset.confirm')), 'new-password-2');
    await user.click(screen.getByRole('button', { name: t('auth.reset.submit') }));
    expect(await screen.findByText(t('auth.password.mismatch'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a password shorter than 8 characters', async () => {
    supa.session = { access_token: 'recovery-token' };
    const post = vi.spyOn(api, 'post');
    renderReset();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('auth.reset.newPassword')), 'short');
    await user.type(screen.getByLabelText(t('auth.reset.confirm')), 'short');
    await user.click(screen.getByRole('button', { name: t('auth.reset.submit') }));
    expect(await screen.findByText(t('auth.password.tooShort'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the recovery token and new password, then goes to login', async () => {
    supa.session = { access_token: 'recovery-token' };
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    renderReset();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('auth.reset.newPassword')), 'new-password-1');
    await user.type(screen.getByLabelText(t('auth.reset.confirm')), 'new-password-1');
    await user.click(screen.getByRole('button', { name: t('auth.reset.submit') }));

    await screen.findByText('login page');
    expect(post).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      { token: 'recovery-token', newPassword: 'new-password-1' },
      { skipAuth: true },
    );
    expect(supa.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('picks the token up from the PASSWORD_RECOVERY event', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    renderReset();
    const { act } = await import('@testing-library/react');
    await act(async () => {
      for (const l of supa.listeners as Listener[]) {
        l('PASSWORD_RECOVERY', { access_token: 'event-token' });
      }
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('auth.reset.newPassword')), 'new-password-1');
    await user.type(screen.getByLabelText(t('auth.reset.confirm')), 'new-password-1');
    await user.click(screen.getByRole('button', { name: t('auth.reset.submit') }));
    await screen.findByText('login page');
    expect(post.mock.calls[0]?.[1]).toEqual({
      token: 'event-token',
      newPassword: 'new-password-1',
    });
  });

  it('shows the invalid-link state when the server says the token expired', async () => {
    supa.session = { access_token: 'recovery-token' };
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(401, 'TOKEN_EXPIRED', 'x'));
    renderReset();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(t('auth.reset.newPassword')), 'new-password-1');
    await user.type(screen.getByLabelText(t('auth.reset.confirm')), 'new-password-1');
    await user.click(screen.getByRole('button', { name: t('auth.reset.submit') }));
    expect(await screen.findByText(t('auth.reset.invalidLink'))).toBeInTheDocument();
  });
});

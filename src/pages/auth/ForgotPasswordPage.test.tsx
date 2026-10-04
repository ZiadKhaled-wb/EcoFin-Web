import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import ForgotPasswordPage from './ForgotPasswordPage';

afterEach(() => vi.restoreAllMocks());

async function submitWith(identifier: string, shop?: string) {
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(t('auth.login.identifier')), identifier);
  if (shop) await user.type(screen.getByLabelText(t('auth.shop.label')), shop);
  await user.click(screen.getByRole('button', { name: t('auth.forgot.submit') }));
}

describe('ForgotPasswordPage', () => {
  it('shows the check-your-email message on success (email, no shop)', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    await submitWith('owner@example.com');
    expect(await screen.findByText(t('auth.forgot.sent'))).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      '/api/auth/forgot-password',
      { identifier: 'owner@example.com' },
      { skipAuth: true },
    );
  });

  it('sends the lowercased username with its shop', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    await submitWith('Ahmed', 'shop-a');
    await screen.findByText(t('auth.forgot.sent'));
    expect(post.mock.calls[0]?.[1]).toEqual({ identifier: 'ahmed', tenantSlug: 'shop-a' });
  });

  it.each([404, 429, 500])('shows the same message when the server answers %i', async (status) => {
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(status, 'UNKNOWN', 'x'));
    await submitWith('nobody@example.com');
    expect(await screen.findByText(t('auth.forgot.sent'))).toBeInTheDocument();
  });

  it('only a missing server answer is shown as a retryable error', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    await submitWith('owner@example.com');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('auth.forgot.failed'));
    expect(screen.queryByText(t('auth.forgot.sent'))).not.toBeInTheDocument();
  });
});

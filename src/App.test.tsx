import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

// The real client needs VITE_SUPABASE_URL at import time.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

afterEach(() => {
  useAuthStore.getState().clearSession();
  window.history.pushState({}, '', '/');
});

describe('auth routes', () => {
  it.each(['/activate', '/activate-workspace'])(
    '%s is gone: a signed-out visitor lands on the login page',
    (path) => {
      window.history.pushState({}, '', path);
      render(<App />);
      expect(screen.getByRole('heading', { name: t('auth.login.title') })).toBeInTheDocument();
    },
  );

  it('a signed-out visitor to a protected page goes to login', () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    expect(screen.getByRole('heading', { name: t('auth.login.title') })).toBeInTheDocument();
  });
});

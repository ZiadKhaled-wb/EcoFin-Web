import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { meApi } from '@/features/me/meApi';
import { setLanguage, t } from '@/i18n';
import LanguageProvider from '@/i18n/LanguageProvider';
import { branchApi } from '@/services/branchApi';
import { useAuthStore } from '@/store/authStore';
import { meFixture, permissionsFixture, signIn, signOut } from '@/test/renderApp';

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

describe('signed-in addresses', () => {
  async function open(path: string, keys: Parameters<typeof permissionsFixture>[0]) {
    await setLanguage('en');
    signIn('OWNER');
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
    vi.spyOn(branchApi, 'list').mockResolvedValue([]);
    window.history.pushState({}, '', path);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <LanguageProvider>
        <QueryClientProvider client={client}>
          <App />
        </QueryClientProvider>
      </LanguageProvider>,
    );
  }
  afterEach(async () => {
    signOut();
    vi.restoreAllMocks();
    await setLanguage('ar');
  });

  it('an unknown address shows "page not found" inside the app and keeps the URL', async () => {
    await open('/no-such-page', []);
    expect(await screen.findByText(t('shell.notFound.title'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/no-such-page');
  });

  it('the owner on a page that is not for their role is not told to ask the owner', async () => {
    // /field is the collector's page; whoever settles wallets works from the wallets page instead.
    await open('/field', ['collection.create', 'collector.settle']);
    expect(await screen.findByText(t('shell.forbidden.ownerDescription'))).toBeInTheDocument();
    expect(screen.queryByText(t('shell.forbidden.description'))).not.toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequireAuth from '@/components/guards/RequireAuth';
import RequirePermission from '@/components/guards/RequirePermission';
import { meApi } from '@/features/me/meApi';
import { setLanguage, t } from '@/i18n';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/me/meApi', () => ({
  meApi: { me: vi.fn(), permissions: vi.fn() },
}));

const routes = (
  <Routes>
    <Route path="/login" element={<p>login page</p>} />
    <Route element={<RequireAuth />}>
      <Route element={<RequirePermission permission="audit.view" />}>
        <Route path="/audit" element={<p>audit page</p>} />
      </Route>
    </Route>
  </Routes>
);

beforeEach(() => signIn('CASHIER'));
afterEach(async () => {
  signOut();
  vi.clearAllMocks();
  await setLanguage('ar');
});

describe('RequirePermission', () => {
  it.each(['ar', 'en'] as const)(
    'typing the URL without the permission shows the 403 page (%s)',
    async (lang) => {
      vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['sale.create']));
      await renderApp(routes, { lang, route: '/audit' });
      expect(await screen.findByText(t('shell.forbidden.title'))).toBeInTheDocument();
      expect(screen.queryByText('audit page')).not.toBeInTheDocument();
    },
  );

  it('renders the page when the permission is held', async () => {
    vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['audit.view']));
    await renderApp(routes, { lang: 'en', route: '/audit' });
    expect(await screen.findByText('audit page')).toBeInTheDocument();
  });

  it('shows nothing of the page while permissions load (fails closed)', async () => {
    vi.mocked(meApi.permissions).mockReturnValue(new Promise(() => {}));
    await renderApp(routes, { lang: 'en', route: '/audit' });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('audit page')).not.toBeInTheDocument();
  });

  it('fails closed with a retry when permissions cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.permissions).mockRejectedValueOnce(new Error('boom'));
    await renderApp(routes, { lang: 'en', route: '/audit' });
    expect(await screen.findByText(t('shell.permissionsFailed.title'))).toBeInTheDocument();
    expect(screen.queryByText('audit page')).not.toBeInTheDocument();

    vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['audit.view']));
    await user.click(screen.getByRole('button', { name: t('ui.retry') }));
    expect(await screen.findByText('audit page')).toBeInTheDocument();
  });

  it('a signed-out visitor goes to /login', async () => {
    signOut();
    await renderApp(routes, { lang: 'en', route: '/audit' });
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(meApi.permissions).not.toHaveBeenCalled();
  });
});

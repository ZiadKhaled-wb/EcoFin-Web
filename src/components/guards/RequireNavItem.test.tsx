import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RequireAuth from '@/components/guards/RequireAuth';
import RequireNavItem from '@/components/guards/RequireNavItem';
import { navLeaves } from '@/config/navigation';
import { meApi } from '@/features/me/meApi';
import { setLanguage, t } from '@/i18n';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/me/meApi', () => ({
  meApi: { me: vi.fn(), permissions: vi.fn() },
}));

// The real menu items, routed the way App.tsx routes them.
const leaf = (to: string) => navLeaves().find((i) => i.to === to)!;
const routes = (
  <Routes>
    <Route path="/login" element={<p>login page</p>} />
    <Route element={<RequireAuth />}>
      {['/settings', '/employees', '/customers'].map((to) => (
        <Route
          key={to}
          path={to}
          element={
            <RequireNavItem item={leaf(to)}>
              <p>module page</p>
            </RequireNavItem>
          }
        />
      ))}
    </Route>
  </Routes>
);

afterEach(async () => {
  signOut();
  vi.clearAllMocks();
  await setLanguage('ar');
});

describe('RequireNavItem (INT-1: typing a menu URL follows the menu rule)', () => {
  it.each([
    ['ar', '/settings'],
    ['en', '/employees'],
  ] as const)('a cashier typing %s %s gets the 403 page, not the module', async (lang, route) => {
    signIn('CASHIER');
    vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['sale.create']));
    await renderApp(routes, { lang, route });
    expect(await screen.findByText(t('shell.forbidden.title'))).toBeInTheDocument();
    expect(screen.queryByText('module page')).not.toBeInTheDocument();
  });

  it('a cashier opens a menu item their role allows', async () => {
    signIn('CASHIER');
    vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['sale.create']));
    await renderApp(routes, { lang: 'en', route: '/customers' });
    expect(await screen.findByText('module page')).toBeInTheDocument();
  });

  it('the owner opens an owner-only item', async () => {
    signIn('OWNER');
    vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture([]));
    await renderApp(routes, { lang: 'en', route: '/settings' });
    expect(await screen.findByText('module page')).toBeInTheDocument();
  });

  it('shows nothing of the page while permissions load (fails closed)', async () => {
    signIn('OWNER');
    vi.mocked(meApi.permissions).mockReturnValue(new Promise(() => {}));
    await renderApp(routes, { lang: 'en', route: '/settings' });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('module page')).not.toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '@/components/layout/AppShell';
import { useBranchStore } from '@/features/me/branchStore';
import { meApi } from '@/features/me/meApi';
import { setLanguage, t } from '@/i18n';
import { ORG_A } from '@/test/authFixtures';
import {
  BRANCH_MAIN,
  BRANCH_TWO,
  meFixture,
  permissionsFixture,
  renderApp,
  signIn,
  signOut,
} from '@/test/renderApp';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/me/meApi', () => ({
  meApi: { me: vi.fn(), permissions: vi.fn() },
}));

const shell = (
  <Routes>
    <Route element={<AppShell />}>
      <Route path="/dashboard" element={<p>dashboard body</p>} />
      <Route path="/sales/pos" element={<p>pos body</p>} />
    </Route>
  </Routes>
);

beforeEach(() => {
  signIn('OWNER');
  vi.mocked(meApi.me).mockResolvedValue(meFixture());
  vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['sale.create']));
});
afterEach(async () => {
  signOut();
  useBranchStore.setState({ byOrg: {} });
  vi.clearAllMocks();
  await setLanguage('ar');
  window.localStorage.clear();
});

describe('AppShell menu (small screens)', () => {
  it('the menu button opens the drawer, a link closes it', async () => {
    const user = userEvent.setup();
    await renderApp(shell, { lang: 'en', route: '/dashboard' });

    const button = screen.getByRole('button', { name: t('shell.openMenu') });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);

    const drawer = await screen.findByRole('dialog', { name: t('shell.menu') });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(drawer).getByRole('button', { name: t('nav.sales') }));
    await user.click(within(drawer).getByRole('link', { name: t('nav.pos') }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('pos body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('shell.openMenu') })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('menu labels follow the language', async () => {
    await renderApp(shell, { lang: 'ar', route: '/dashboard' });
    expect(screen.getAllByRole('link', { name: t('nav.dashboard') }).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: t('shell.mainNav') })).toBeInTheDocument();
  });
});

describe('branch switcher', () => {
  it('lists the branches from me and changes the selection', async () => {
    const user = userEvent.setup();
    await renderApp(shell, { lang: 'en', route: '/dashboard' });

    // The main branch is the fallback until the user chooses.
    const trigger = await screen.findByRole('button', { name: /Branch: Main branch/ });
    await user.click(trigger);
    expect(await screen.findByRole('menuitem', { name: /Main branch/ })).toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: /Second branch/ }));

    expect(
      await screen.findByRole('button', { name: /Branch: Second branch/ }),
    ).toBeInTheDocument();
    expect(useBranchStore.getState().byOrg[ORG_A]).toBe(BRANCH_TWO);
  });

  it('starts on the remembered branch for this shop', async () => {
    useBranchStore.setState({ byOrg: { [ORG_A]: BRANCH_TWO } });
    await renderApp(shell, { lang: 'en', route: '/dashboard' });
    expect(
      await screen.findByRole('button', { name: /Branch: Second branch/ }),
    ).toBeInTheDocument();
    expect(BRANCH_MAIN).toBeTruthy();
  });
});

describe('language switch', () => {
  it('flips AR to EN: strings, direction and the remembered choice', async () => {
    const user = userEvent.setup();
    await renderApp(shell, { lang: 'ar', route: '/dashboard' });
    expect(document.documentElement.dir).toBe('rtl');

    await user.click(
      screen.getByRole('button', { name: t('shell.switchTo', { language: 'English' }, 'ar') }),
    );
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('ecofin-lang')).toBe('en');
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
  });
});

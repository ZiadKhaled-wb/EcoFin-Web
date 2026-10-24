import { screen } from '@testing-library/react';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import HomeGate from './HomeGate';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/pages/DashboardPage', () => ({ default: () => <p>The dashboard</p> }));

const renderHome = () =>
  renderApp(
    <Routes>
      <Route path="/dashboard" element={<HomeGate />} />
      <Route path="/legal" element={<p>The legal cases</p>} />
    </Routes>,
    { lang: 'en', route: '/dashboard' },
  );

/**
 * L01 (D92): the first page after sign-in is /dashboard for everyone; a lawyer (only the legal and
 * overdue keys) has no dashboard and is sent to /legal. The same rule (isLegalOnly) hides the
 * dashboard from the lawyer's menu.
 */
describe('the first page after sign-in', () => {
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('sends a lawyer to the legal cases', async () => {
    signIn('CASHIER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(
        ['legal.view', 'legal.manage', 'customer.view_pii', 'overdue.view'] as PermissionKey[],
        { allBranches: true },
      ),
    );
    await renderHome();
    expect(await screen.findByText('The legal cases')).toBeInTheDocument();
    expect(screen.queryByText('The dashboard')).not.toBeInTheDocument();
  });

  it('keeps the owner and a user with other keys on the dashboard', async () => {
    signIn('OWNER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['legal.view', 'legal.manage', 'report.view'] as PermissionKey[], {
        allBranches: true,
      }),
    );
    await renderHome();
    expect(await screen.findByText('The dashboard')).toBeInTheDocument();
  });

  it('keeps a user who can see legal cases but also has sales keys on the dashboard', async () => {
    signIn('CASHIER');
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['legal.view', 'sale.create'] as PermissionKey[], { allBranches: true }),
    );
    await renderHome();
    expect(await screen.findByText('The dashboard')).toBeInTheDocument();
  });
});

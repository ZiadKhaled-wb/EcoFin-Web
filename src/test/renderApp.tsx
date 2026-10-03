import type { AuthMeResponse, MePermissionsResponse, PermissionKey } from '@ecotech/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toast';
import LanguageProvider from '@/i18n/LanguageProvider';
import { setLanguage, type Language } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { ORG_A, USER_ID } from '@/test/authFixtures';

export const BRANCH_MAIN = '44444444-4444-4444-8444-444444444444';
export const BRANCH_TWO = '55555555-5555-4555-8555-555555555555';

export const meFixture = (over: Partial<AuthMeResponse> = {}): AuthMeResponse => ({
  employee: {
    id: USER_ID,
    fullName: 'Test User',
    email: 'owner@example.com',
    username: null,
    role: 'OWNER',
    defaultBranchId: null,
    mustChangePassword: false,
  },
  org: {
    id: ORG_A,
    tenantSlug: 'shop-a',
    name: 'Shop A',
    timezone: 'Africa/Cairo',
    defaultLanguage: 'ar',
    status: 'active',
    planKey: 'basic',
    subscriptionEnd: null,
  },
  branches: [
    { id: BRANCH_MAIN, code: 'MAIN', name: 'Main branch', isMain: true },
    { id: BRANCH_TWO, code: 'B2', name: 'Second branch', isMain: false },
  ],
  ...over,
});

export const permissionsFixture = (
  keys: PermissionKey[],
  over: Partial<MePermissionsResponse> = {},
): MePermissionsResponse => ({ keys, branchIds: [BRANCH_MAIN], allBranches: false, ...over });

/** A signed-in session in the shop, without going through login. */
export function signIn(role: 'OWNER' | 'CASHIER' = 'OWNER') {
  useAuthStore.setState({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    orgId: ORG_A,
    user: {
      id: USER_ID,
      email: 'owner@example.com',
      username: null,
      role,
      permissions: [],
      mustChangePassword: false,
    },
  });
}

export function signOut() {
  useAuthStore.getState().clearSession();
}

/** Renders with the app providers in a language. */
export async function renderApp(ui: ReactElement, opts: { lang?: Language; route?: string } = {}) {
  await setLanguage(opts.lang ?? 'ar');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (node: ReactElement) => (
    <LanguageProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>{node}</MemoryRouter>
        <Toaster />
      </QueryClientProvider>
    </LanguageProvider>
  );
  const result = render(tree(ui));
  return { ...result, rerender: (node: ReactElement) => result.rerender(tree(node)) };
}

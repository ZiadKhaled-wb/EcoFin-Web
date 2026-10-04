import type {
  AuthLoginResponse,
  AuthSelectShopResponse,
  AuthSession,
  ShopMembership,
} from '@ziadkhaled-wb/contracts';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryClient } from '@/lib/queryClient';
import type { AuthUser } from '@/types/auth';

interface Account {
  id: string;
  email: string | null;
  username: string | null;
}

interface AuthState {
  /** Set once a shop is active. Null while the shop picker is pending. */
  user: AuthUser | null;
  account: Account | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** ISO timestamp (contract `AuthSession.expiresAt`). Drives the silent refresh. */
  expiresAt: string | null;
  /** Active shop. Sent as `x-org-id` on every request. */
  orgId: string | null;
  /** Every shop this login belongs to (picker list). */
  shops: ShopMembership[];
  mustChangePassword: boolean;
  /** Public shop identifier. Survives logout on purpose (returning users). */
  tenantSlug: string | null;

  /** Stores a login response. Selects the shop itself when there is exactly one (or `tenantSlug` matched). */
  setLogin: (res: AuthLoginResponse, hint?: { identifier?: string; tenantSlug?: string }) => void;
  setActiveShop: (res: AuthSelectShopResponse) => void;
  setSession: (session: AuthSession) => void;
  flagMustChangePassword: () => void;
  setTenantSlug: (slug: string) => void;
  clearSession: () => void;
}

const EMPTY_SESSION = {
  user: null,
  account: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  orgId: null,
  shops: [] as ShopMembership[],
  mustChangePassword: false,
};

const buildUser = (account: Account, shop: ShopMembership, mustChange: boolean): AuthUser => ({
  id: account.id,
  email: account.email,
  username: account.username,
  role: shop.role,
  permissions: [],
  mustChangePassword: mustChange,
});

// Tokens live in localStorage (persist), as decided in D16. Trade-off: readable by injected JS.
// Mitigation today: no third-party scripts. Follow-up (hardening): move the refresh token to an
// httpOnly cookie and add a strict CSP.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...EMPTY_SESSION,
      tenantSlug: null,

      setLogin: (res, hint) => {
        // A new login must never see the previous user's cached data.
        queryClient.clear();
        const identifier = hint?.identifier?.trim() ?? '';
        const account: Account = {
          id: res.user.id,
          email: res.user.email,
          username: identifier && !identifier.includes('@') ? identifier : null,
        };
        const active = res.requiresShopSelection
          ? undefined
          : (res.shops.find((s) => hint?.tenantSlug && s.tenantSlug === hint.tenantSlug) ??
            (res.shops.length === 1 ? res.shops[0] : undefined));
        set({
          account,
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          expiresAt: res.expiresAt,
          shops: res.shops,
          orgId: active?.orgId ?? null,
          user: active ? buildUser(account, active, res.mustChangePassword) : null,
          mustChangePassword: res.mustChangePassword,
          ...(active ? { tenantSlug: active.tenantSlug } : {}),
        });
      },

      setActiveShop: (res) =>
        set((s) => {
          const account: Account = s.account ?? {
            id: res.user.id,
            email: res.user.email,
            username: null,
          };
          return {
            account,
            // No tokens in the reply (D23): the login tokens stay, only the shop changes.
            orgId: res.shop.orgId,
            tenantSlug: res.shop.tenantSlug,
            user: buildUser(account, res.shop, s.mustChangePassword),
          };
        }),

      setSession: (session) =>
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
        }),

      flagMustChangePassword: () =>
        set((s) => ({
          mustChangePassword: true,
          user: s.user ? { ...s.user, mustChangePassword: true } : s.user,
        })),

      setTenantSlug: (tenantSlug) => set({ tenantSlug }),

      clearSession: () => {
        queryClient.clear();
        set({ ...EMPTY_SESSION });
      },
    }),
    {
      name: 'ecofin-auth',
      // v2: the contract session shape replaced the partner's snake_case one.
      // An older stored session is dropped, so the user signs in again.
      version: 2,
      migrate: () => ({ ...EMPTY_SESSION, tenantSlug: null }),
    },
  ),
);

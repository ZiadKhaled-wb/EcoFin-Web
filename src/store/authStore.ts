import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, Session } from "@/types/auth";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Public org identifier. Survives logout on purpose (returning users). */
  tenantSlug: string | null;

  setLogin: (user: AuthUser, session: Session, mustChangePassword?: boolean) => void;
  setSession: (session: Session) => void;
  flagMustChangePassword: () => void;
  setTenantSlug: (slug: string) => void;
  clearSession: () => void;
}

// Tokens live in localStorage (persist). Trade-off: readable by injected JS,
// mitigated by a strict CSP and no third-party scripts. Revisit with the
// session-revocation work (ADR-0004 open question 1).
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      tenantSlug: null,

      setLogin: (user, session, mustChangePassword) =>
        set({
          user: { ...user, must_change_password: mustChangePassword ?? user.must_change_password },
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        }),
      setSession: (session) =>
        set({ accessToken: session.access_token, refreshToken: session.refresh_token }),
      flagMustChangePassword: () =>
        set((s) => (s.user ? { user: { ...s.user, must_change_password: true } } : s)),
      setTenantSlug: (tenantSlug) => set({ tenantSlug }),
      clearSession: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: "ecofin-auth", version: 1 },
  ),
);

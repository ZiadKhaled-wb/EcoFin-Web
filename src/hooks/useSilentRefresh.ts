import { useEffect } from 'react';
import { refreshAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

/** The refresh runs this long before the access token expires. */
export const REFRESH_LEAD_MS = 60_000;

/**
 * Keeps the session alive: schedules one refresh about 60 s before `expiresAt`.
 * Every successful refresh stores a new `expiresAt`, which re-runs the effect and schedules the
 * next one. A failed refresh clears the session; the route guards then send the user to /login.
 * Mount once, inside the signed-in routes.
 */
export function useSilentRefresh() {
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const hasRefreshToken = useAuthStore((s) => s.refreshToken !== null);

  useEffect(() => {
    if (!expiresAt || !hasRefreshToken) return;
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) return;

    const delay = Math.max(0, expiry - REFRESH_LEAD_MS - Date.now());
    const timer = setTimeout(() => {
      void refreshAccessToken().then((token) => {
        if (!token) useAuthStore.getState().clearSession();
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAt, hasRefreshToken]);
}

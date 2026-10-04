import { useEffect } from 'react';
import { refreshAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

/** The refresh runs this long before the access token expires. */
export const REFRESH_LEAD_MS = 60_000;
/** After a refresh that got no answer (offline, timeout), try again after this long. */
export const REFRESH_RETRY_MS = 15_000;

/**
 * Keeps the session alive: schedules one refresh about 60 s before `expiresAt`.
 * Every successful refresh stores a new `expiresAt`, which re-runs the effect and schedules the
 * next one. If the server rejects the refresh, the session is cleared and the route guards send
 * the user to /login. If there was no answer, the session is kept and the refresh is retried.
 * Mount once, inside the signed-in routes.
 */
export function useSilentRefresh() {
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const hasRefreshToken = useAuthStore((s) => s.refreshToken !== null);

  useEffect(() => {
    if (!expiresAt || !hasRefreshToken) return;
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) return;

    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const run = () => {
      void refreshAccessToken().then((token) => {
        // Success re-runs this effect (new expiresAt). No token and a live session: retry.
        if (!token && !cancelled && useAuthStore.getState().refreshToken) {
          timer = setTimeout(run, REFRESH_RETRY_MS);
        }
      });
    };

    timer = setTimeout(run, Math.max(0, expiry - REFRESH_LEAD_MS - Date.now()));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [expiresAt, hasRefreshToken]);
}

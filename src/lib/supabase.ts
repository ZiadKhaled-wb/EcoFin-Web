import { createClient } from '@supabase/supabase-js';

/**
 * DELIBERATE EXCEPTION — do not "fix" by routing through our backend.
 *
 * Only ResetPasswordPage uses this client, and only to read the recovery token: the emailed
 * link carries it in the URL fragment, and `detectSessionInUrl` exposes it as the in-memory
 * session's access token. The new password is set through our backend
 * (`POST /api/auth/reset-password`), not through Supabase. Everything else in the app talks to
 * the backend via src/lib/api.ts.
 *
 * persistSession is off on purpose: this client must never hold a session
 * that competes with the app's own auth store.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? '',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true } },
);

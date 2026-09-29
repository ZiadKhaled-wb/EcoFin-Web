import { createClient } from "@supabase/supabase-js";

/**
 * DELIBERATE EXCEPTION — do not "fix" by routing through our backend.
 *
 * Only ResetPasswordPage uses this client. The password-recovery flow is
 * Supabase-native: the magic link carries a recovery token in the URL
 * fragment, and the Supabase JS client exchanges it and updates the password.
 * Everything else in the app talks to the backend via src/lib/api.ts.
 *
 * persistSession is off on purpose: this client must never hold a session
 * that competes with the app's own auth store.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true } },
);

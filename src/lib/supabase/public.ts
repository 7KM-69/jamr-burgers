import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * A cookie-less, session-less Supabase client for PUBLIC reads.
 *
 * Why this exists as a third client: the menu is world-readable, and reading it
 * through the cookie-bound server client would make `cookies()` part of the render
 * — which opts the whole route into dynamic rendering. `/menu` would then be
 * re-rendered per request for no reason at all.
 *
 * This client has no session, so RLS evaluates it as `anon`. Use it ONLY for data
 * whose SELECT policy is `using (true)` — today that means `products`, and nothing
 * else. Reading `orders` through this client would return zero rows (RLS would
 * scope it to a user that does not exist), which is a silent, confusing bug.
 *
 * It carries the anon key. There is no privilege escalation here.
 *
 * Module-level singleton on purpose: no per-request state to close over, and
 * reusing one client avoids constructing a fetch stack per invocation.
 */
export const publicClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

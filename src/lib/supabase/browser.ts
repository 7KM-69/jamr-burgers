'use client';

import { createBrowserClient } from '@supabase/ssr';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * The browser Supabase client. Anon key only — RLS is what protects the data.
 *
 * `createBrowserClient` memoises internally, so calling this on every render is
 * cheap and does not spawn a new client each time.
 *
 * This client is for reading auth state in client components (e.g. reacting to a
 * sign-out in another tab). It is NOT how orders are placed: every write goes
 * through a Server Action, because the client is never trusted with a price, a
 * discount, or an order count.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

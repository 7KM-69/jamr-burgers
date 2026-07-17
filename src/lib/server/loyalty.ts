import 'server-only';

import { cache } from 'react';

import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { LOYALTY_CYCLE_LENGTH, type LoyaltyProgress } from '@/lib/types/api';

import { logServerError } from './errors';

/**
 * Loyalty progress — READ from the server, never computed in the browser.
 *
 * `design` renders the dots. It does not decide whether a reward exists, and it
 * does not compute the discount. Even when `availableRewards > 0`, `place_order`
 * re-checks under a row lock and may still answer `REWARD_UNAVAILABLE` — the UI is
 * allowed to be stale, the server is never wrong.
 *
 * Returns `null` for a signed-out visitor. That is not an error; it is the
 * "no meter to show" state.
 *
 * ---------------------------------------------------------------------------
 * THIS RESULT IS USER-SCOPED AND IT IS MEMOIZED. READ THIS BEFORE CHANGING IT.
 * ---------------------------------------------------------------------------
 * Per CLAUDE.md the meter is rendered in TWO places — the account page and the cart
 * drawer — so once part 12 lands this runs twice per render: two `auth.getUser()`
 * verifications plus four table reads, for one number that cannot change between
 * them. React's `cache()` collapses that to one.
 *
 * It is safe here for exactly one reason, and it is worth stating rather than
 * assuming: **React's `cache()` memo lives in a per-request store and is destroyed
 * with the request.** One request carries one cookie jar, therefore one user,
 * therefore the memo can only ever be handed back to the user it was computed for.
 * It is a within-render dedup, not a cache.
 *
 * The thing that would break that, and is therefore FORBIDDEN here:
 *
 *   **Never wrap this in `unstable_cache` / `"use cache"` / the fetch Data Cache.**
 *   Those DO persist across requests and are keyed on the function's arguments — and
 *   this function takes no arguments, because it derives identity from the session
 *   cookie rather than trusting a caller-supplied id (which is the right call and
 *   stays). So every user in the system would share one cache key. The first signed-in
 *   visitor's `confirmedOrdersCount` and reward count would then be served to every
 *   other signed-in visitor. That is a cross-user data leak dressed up as a
 *   performance win, and the type checker will not stop you from writing it.
 *
 * The second invariant, which is quieter: **a mutating action must not call this
 * before its RPC.** A Server Action and the re-render its `revalidatePath` triggers
 * share one request, so a memo populated *before* the write would still be sitting
 * there for the render *after* it, and the meter would show pre-order state. Today no
 * action reads loyalty at all — `src/lib/actions/orders.ts` is deliberately thin and
 * every loyalty decision happens inside Postgres under a row lock — so the memo is
 * only ever filled by a render, after the write. Keep it that way: actions call RPCs,
 * they do not read.
 */
export const getLoyaltyProgress = cache(async (): Promise<LoyaltyProgress | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // Two independent reads. They run in parallel — sequential awaits here would
  // double the latency of every page that shows the meter, for nothing.
  const [profileResult, rewardsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('confirmed_orders_count')
      // RLS already scopes this to the caller. The explicit filter is not
      // redundant: it is what lets Postgres use the primary key index instead of
      // scanning and then filtering by policy.
      .eq('id', user.id)
      // `.returns()` before the terminal `.maybeSingle()` — see products.ts.
      .returns<{ confirmed_orders_count: number }[]>()
      .maybeSingle(),

    supabase
      .from('loyalty_rewards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'available'),
  ]);

  if (profileResult.error) {
    logServerError('loyalty.getLoyaltyProgress.profile', profileResult.error, {
      userId: user.id,
      pgCode: profileResult.error.code ?? null,
    });
    throw new Error('Failed to load loyalty progress.');
  }

  if (rewardsResult.error) {
    logServerError('loyalty.getLoyaltyProgress.rewards', rewardsResult.error, {
      userId: user.id,
      pgCode: rewardsResult.error.code ?? null,
    });
    throw new Error('Failed to load loyalty progress.');
  }

  // A missing profile row means the `on_auth_user_created` trigger did not fire.
  // Every RPC would then fail on the profiles FK, so this is worth surfacing
  // loudly rather than papering over with a zero.
  if (!profileResult.data) {
    logServerError(
      'loyalty.getLoyaltyProgress.profile',
      new Error('Authenticated user has no profiles row — did on_auth_user_created fire?'),
      { userId: user.id },
    );
    throw new Error('Failed to load loyalty progress.');
  }

  const confirmedOrdersCount = profileResult.data.confirmed_orders_count;

  return {
    confirmedOrdersCount,
    // Display only. The server decides eligibility; this number just fills dots.
    progressInCycle: confirmedOrdersCount % LOYALTY_CYCLE_LENGTH,
    availableRewards: rewardsResult.count ?? 0,
  };
});

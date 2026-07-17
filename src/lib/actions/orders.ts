'use server';

import { orderIdSchema, placeOrderSchema, type OrderIdInput, type PlaceOrderInput } from '@/lib/schemas';
import { fail, failUnexpected, failValidation } from '@/lib/server/errors';
import { callOrderRpc } from '@/lib/server/orders';
import { getCurrentUser } from '@/lib/supabase/server';
import type { ActionResult, OrderSummary } from '@/lib/types/api';
import type { OrderIdArg, PlaceOrderArgs } from '@/lib/types/db';

/**
 * Ordering.
 *
 * These are thin. That is the point: **every price, every discount, and every
 * loyalty decision happens inside Postgres**, in one transaction, under a row lock.
 * This file's job is to validate the input, pass it through, and translate the
 * answer. It computes nothing it could get wrong.
 *
 * Every RPC call goes through `callOrderRpc` (`src/lib/server/orders.ts`), which
 * parses the payload and — the part that matters — invalidates the cached surfaces
 * the RPC's write-set touches. Nothing in this file calls `revalidatePath` itself,
 * and nothing in this file may call `supabase.rpc` directly. That is not style: an
 * action that mutates loyalty state and forgets to invalidate it leaves the UI
 * offering a reward the server has already spent, and the invalidation is therefore
 * not something an action is trusted to remember.
 *
 * There is no payment provider here and there will not be one — checkout is
 * simulated by design (CLAUDE.md §Payment).
 *
 * A server action is a public HTTP endpoint. The TypeScript parameter types below
 * are convenience for `design`; they enforce nothing at runtime. The `safeParse` on
 * the first line of each function is what actually stands between a hostile caller
 * and the database.
 */

/**
 * Place a PENDING order.
 *
 * The subtotal is recomputed in Postgres from the `products` table. The discount, if
 * a reward is redeemed, is computed there too. Nothing in `input` can influence
 * either — there is no parameter that accepts a price.
 *
 * Idempotent on `clientToken`: the same token from the same user returns the
 * existing order instead of creating a second one. That holds even for two
 * simultaneous calls carrying the same token, including when they redeem a reward —
 * the loser gets the winner's order, not an error. A double-clicked Confirm button
 * is therefore harmless, which is precisely why the token is mandatory.
 *
 * Failure modes worth knowing, because both leave NO order behind (CONTRACT.md §5):
 *  - a delisted product anywhere in the cart → PRODUCT_UNAVAILABLE, whole order
 *    rejected. A partial order is worse than a rejected one.
 *  - `redeemReward: true` with no available reward → REWARD_UNAVAILABLE. Requesting
 *    a discount you do not have is an error, not a silent no-op. The UI was stale;
 *    re-read the loyalty progress and show the real state.
 *
 * On success this SPENDS a reward (CONTRACT.md §2 step 6: `available` → `redeemed`),
 * so `getLoyaltyProgress().availableRewards` drops. `callOrderRpc` revalidates for
 * that; do not add a `revalidatePath` here.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<ActionResult<OrderSummary>> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) return failValidation(parsed.error);

  const {
    items,
    redeemReward,
    customerName,
    customerPhone,
    customerAddress,
    clientToken,
  } = parsed.data;

  try {
    // The RPC raises UNAUTHENTICATED on a null auth.uid() anyway. Checking here
    // avoids a pointless round trip for a signed-out caller — and it is the check
    // that fails closed if the session ever stops reaching Postgres.
    const user = await getCurrentUser();
    if (!user) return fail('UNAUTHENTICATED', 'No session. Sign in to place an order.');

    // Every argument name is `p_`-prefixed and every key inside `p_items` is
    // snake_case. `.rpc()` binds arguments BY NAME: a camelCase key here does not
    // fail to compile and does not warn — it arrives at Postgres as a missing
    // argument, and the call either errors at runtime or silently takes a default.
    // `PlaceOrderArgs` exists to make that a compile error instead.
    //
    // Note what is NOT here: a price, a discount, a total, a user id. The RPC has no
    // parameter that would accept one. Identity comes from the session cookie via
    // `auth.uid()`, inside Postgres.
    const args: PlaceOrderArgs = {
      p_items: items.map((item) => ({ product_id: item.productId, qty: item.qty })),
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_address: customerAddress,
      p_redeem_reward: redeemReward,
      p_client_token: clientToken,
    };

    return await callOrderRpc('orders.placeOrder', 'place_order', args, { userId: user.id });
  } catch (cause) {
    return failUnexpected('orders.placeOrder', cause);
  }
}

/**
 * Confirm a pending order. This is the step that counts toward loyalty.
 *
 * Idempotent by construction (CONTRACT.md §6): the RPC gates on
 * `update … where id = ? and user_id = auth.uid() and status = 'pending'` and
 * increments `confirmed_orders_count` only in the branch that actually moved a row.
 * Confirming twice returns the order and touches nothing — no second increment, no
 * free reward.
 *
 * Ownership is enforced INSIDE the function on `auth.uid()`, not merely by an RLS
 * select policy. `orderId` is a client-supplied id, so this matters: passing
 * someone else's order id returns NOT_FOUND, deliberately indistinguishable from an
 * id that does not exist, so the API cannot be used to discover whether another
 * user's order exists.
 *
 * The returned summary is the authoritative one. Render THIS total, not the one
 * `placeOrder` returned — a concurrent `cancelOrder` may have repriced this order in
 * between (CONTRACT.md §8.1).
 */
export async function confirmOrder(input: OrderIdInput): Promise<ActionResult<OrderSummary>> {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return failValidation(parsed.error);

  const { orderId } = parsed.data;

  try {
    const user = await getCurrentUser();
    if (!user) return fail('UNAUTHENTICATED', 'No session. Sign in to confirm an order.');

    const args: OrderIdArg = { p_order_id: orderId };

    return await callOrderRpc('orders.confirmOrder', 'confirm_order', args, {
      userId: user.id,
      orderId,
    });
  } catch (cause) {
    return failUnexpected('orders.confirmOrder', cause);
  }
}

/**
 * Cancel an order — `pending` OR `confirmed` → `cancelled`.
 *
 * **This is the most side-effecting call in the app. Read CONTRACT.md §8.1 before
 * you wire a button to it.** It is not "undo". It settles the loyalty ledger, and
 * settling can reach rows the user is currently looking at:
 *
 *  1. It decrements `confirmed_orders_count` (only if the order was `confirmed` — a
 *     pending order was never counted), and on a DOWN-crossing of a multiple of 5 it
 *     REVOKES a reward: one `loyalty_rewards` row goes to `'expired'`. A reward
 *     badge on screen can vanish out from under the user. That is correct — without
 *     it, confirm/cancel/confirm/cancel mints unlimited 50%-off rewards for free.
 *
 *  2. To revoke, it may have to take back a reward that has already been SPENT on a
 *     *different* order — and it then REPRICES that other order: `discount_cents` to
 *     0, `total_cents` up to `subtotal_cents`. **That other order may already be
 *     `confirmed`.** Order history on this project is deliberately not immutable
 *     (there is no payment and no fulfilment, so a "confirmed" order is a row, not a
 *     delivery). Consequence for `design`: never render a total the client cached —
 *     re-read the order, or render the row an RPC just returned.
 *
 * Cancelling twice is a no-op replay: it returns the order, does not decrement
 * twice, and does not revoke twice. Ownership is enforced inside the RPC on
 * `auth.uid()`; another user's order id is `NOT_FOUND`, indistinguishable from a
 * non-existent one.
 *
 * `callOrderRpc` revalidates the whole root layout on success, which is what
 * CONTRACT.md §8.1 demands of this call ("revalidate the account page and the cart
 * drawer after every `cancel_order`") — every cached loyalty meter and every cached
 * order total is stale after this returns, including ones belonging to orders this
 * call was not even about.
 *
 * NOTE FOR `design`: nothing calls this yet. It is the counterpart `confirmOrder`
 * needs in order for CLAUDE.md's loyalty rule 1 ("cancelling a confirmed order
 * decrements the counter") to have any path at all, and the RPC behind it is already
 * granted to `authenticated`. If part 11/12 does not surface a cancel affordance,
 * this action simply goes uncalled — it adds no capability a signed-in user does not
 * already have.
 */
export async function cancelOrder(input: OrderIdInput): Promise<ActionResult<OrderSummary>> {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return failValidation(parsed.error);

  const { orderId } = parsed.data;

  try {
    const user = await getCurrentUser();
    if (!user) return fail('UNAUTHENTICATED', 'No session. Sign in to cancel an order.');

    const args: OrderIdArg = { p_order_id: orderId };

    return await callOrderRpc('orders.cancelOrder', 'cancel_order', args, {
      userId: user.id,
      orderId,
    });
  } catch (cause) {
    return failUnexpected('orders.cancelOrder', cause);
  }
}

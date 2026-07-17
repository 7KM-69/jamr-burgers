import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult, OrderLine, OrderSummary } from '@/lib/types/api';
import type { OrderIdArg, PlaceOrderArgs, RpcOrderPayload } from '@/lib/types/db';

import { failFromRpc, failUnexpected, ok } from './errors';

/**
 * The order/loyalty RPC boundary. **This module is the only way to call one.**
 *
 * Read `callOrderRpc` below before adding anything here. Everything in this file
 * exists to make one class of bug impossible: an action that mutates loyalty or
 * order state and forgets to invalidate the surfaces that render it.
 */

// ---------------------------------------------------------------------------
// 1. Runtime schema for the RPC's `jsonb` payload (CONTRACT.md §4).
// ---------------------------------------------------------------------------

/**
 * Why parse a response we "know" the shape of:
 *
 * `supabase-js` types `.rpc()` on an untyped client as `any`. Every field access on
 * the payload is therefore unchecked — if `db` renames `total_cents`, TypeScript
 * says nothing, the field arrives `undefined`, and the UI renders `NaN` next to a
 * currency symbol. That is precisely the silent cross-layer drift this project's
 * contract exists to prevent, and a type assertion (`as RpcOrderPayload`) would
 * merely restate the assumption instead of checking it.
 *
 * The RPC boundary is an external boundary. It gets parsed, like every other one.
 * A mismatch here fails loudly as INTERNAL, with the reason in the server log.
 */
const rpcOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  slug: z.string(),
  qty: z.number().int(),
  unit_price_cents: z.number().int(),
});

const rpcOrderPayloadSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
  subtotal_cents: z.number().int(),
  discount_cents: z.number().int(),
  total_cents: z.number().int(),
  reward_id: z.string().uuid().nullable(),
  customer_name: z.string(),
  customer_phone: z.string(),
  customer_address: z.string(),
  client_token: z.string().uuid().nullable(),
  created_at: z.string(),
  confirmed_at: z.string().nullable(),
  updated_at: z.string(),
  items: z.array(rpcOrderItemSchema),
});

/**
 * Parse an RPC payload. Returns `null` if it does not match the contract.
 *
 * PRIVATE, deliberately — see `callOrderRpc`. `data` is `unknown` on purpose: it is
 * whatever came back over the wire.
 */
function parseOrderPayload(data: unknown): RpcOrderPayload | null {
  const result = rpcOrderPayloadSchema.safeParse(data);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// 2. Payload → the shape the UI receives.
// ---------------------------------------------------------------------------

/**
 * **Every field is picked by hand. Nothing is spread.**
 *
 * The RPCs build their payload with `to_jsonb(o)`, which means it carries *every*
 * column on `orders` — including `client_token` and `user_id`. Writing
 * `{ ...payload }` here would ship all of them into a Client Component's props and
 * out into the HTML. None of it is a cross-user leak (RLS guarantees the row
 * belongs to the caller), but `client_token` is an idempotency key and `user_id` is
 * an internal identifier; neither has any business being in the page source, and a
 * spread would mean the next column `db` adds to `orders` gets published to the
 * browser automatically, with nobody deciding to.
 *
 * So: an explicit pick. If `db` adds a column, it appears here only when someone
 * chooses to put it here.
 *
 * PRIVATE, deliberately — see `callOrderRpc`.
 */
function toOrderSummary(payload: RpcOrderPayload): OrderSummary {
  const items: OrderLine[] = payload.items.map((item) => ({
    productId: item.product_id,
    slug: item.slug,
    qty: item.qty,
    unitPriceCents: item.unit_price_cents,
  }));

  return {
    id: payload.id,
    status: payload.status,
    subtotalCents: payload.subtotal_cents,
    discountCents: payload.discount_cents,
    totalCents: payload.total_cents,
    // CONTRACT.md §4: a reward was applied iff `reward_id` is non-null. The
    // reward's *id* stays server-side; the UI only needs the boolean.
    rewardApplied: payload.reward_id !== null,
    customerName: payload.customer_name,
    customerPhone: payload.customer_phone,
    customerAddress: payload.customer_address,
    createdAt: payload.created_at,
    confirmedAt: payload.confirmed_at,
    items,
  };

  // Deliberately NOT returned: `user_id` (internal), `reward_id` (internal),
  // `client_token` (idempotency key), `updated_at` (no UI use).
}

// ---------------------------------------------------------------------------
// 3. Write-sets, and the cache surfaces that render them.
// ---------------------------------------------------------------------------

/**
 * A cached surface. `type: 'layout'` invalidates the path *and everything nested
 * under it*, which for `'/'` is the whole app.
 */
interface CacheSurface {
  path: string;
  type: 'layout' | 'page';
}

/**
 * The root layout. Every route in this app is nested under it, and the nav — which
 * is IN the root layout — renders the cart count and the loyalty meter (CLAUDE.md:
 * the meter appears in the cart drawer and on /account). So order state and loyalty
 * state are potentially on screen on *every* page, and there is no narrower surface
 * that is safe.
 *
 * One frozen object, referenced by every entry below, so the `Set` in
 * `revalidateWriteSet` dedupes by identity and `revalidatePath` is called exactly
 * once per action.
 */
const ROOT_LAYOUT: CacheSurface = Object.freeze({ path: '/', type: 'layout' });

/** The tables the RPCs in this module write. */
type MutatedTable = 'orders' | 'order_items' | 'profiles' | 'loyalty_rewards';

/**
 * Which cached surfaces render each table's state.
 *
 * This is a `Record`, not a partial map: a new `MutatedTable` does not compile until
 * someone has said where that table is rendered. That is the point. Narrowing an
 * entry away from `ROOT_LAYOUT` later is allowed — but it must be a decision
 * somebody makes here, not an omission somebody makes in an action.
 */
const CACHE_SURFACES: Record<MutatedTable, readonly CacheSurface[]> = {
  orders: [ROOT_LAYOUT],
  order_items: [ROOT_LAYOUT],
  profiles: [ROOT_LAYOUT],
  loyalty_rewards: [ROOT_LAYOUT],
};

/**
 * Every RPC that mutates order or loyalty state, mapped to its argument type.
 *
 * The `p_` prefixes are load-bearing: `.rpc()` binds arguments **by name**, so a
 * camelCase key does not fail to compile and does not warn — it arrives at Postgres
 * as a missing argument and either errors at runtime or silently takes a default.
 * `PlaceOrderArgs` / `OrderIdArg` (`src/lib/types/db.ts`) turn that runtime seam
 * into a compile error, which is why `callOrderRpc` takes its args through this map
 * rather than as a loose object.
 */
interface OrderRpcArgs {
  place_order: PlaceOrderArgs;
  confirm_order: OrderIdArg;
  cancel_order: OrderIdArg;
}

type OrderRpc = keyof OrderRpcArgs;

/**
 * WHAT EACH RPC WRITES. Transcribed from `supabase/CONTRACT.md`, not guessed.
 *
 * `place_order` looks like a pure insert and is not: CONTRACT.md §2 step 6 flips a
 * `loyalty_rewards` row from `'available'` to `'redeemed'`, so `availableRewards`
 * drops the moment an order redeems a reward. Missing that is exactly the bug this
 * table exists to prevent — a UI that keeps offering a 50%-off badge the server has
 * already spent, and then answers `REWARD_UNAVAILABLE` at the next checkout.
 *
 * `cancel_order` (CONTRACT.md §8.1) is worse: it can expire a reward the user is
 * looking at AND reprice a *different* order — pending or confirmed. Its cached
 * state is stale in ways nobody would guess from its name.
 *
 * A `Record` over `OrderRpc`, so a fourth RPC cannot be added to `OrderRpcArgs`
 * without declaring what it writes.
 */
const ORDER_RPC_WRITE_SET: Record<OrderRpc, readonly MutatedTable[]> = {
  place_order: ['orders', 'order_items', 'loyalty_rewards'],
  confirm_order: ['orders', 'profiles', 'loyalty_rewards'],
  cancel_order: ['orders', 'profiles', 'loyalty_rewards'],
};

function revalidateWriteSet(rpc: OrderRpc): void {
  const surfaces = new Set<CacheSurface>();

  for (const table of ORDER_RPC_WRITE_SET[rpc]) {
    for (const surface of CACHE_SURFACES[table]) surfaces.add(surface);
  }

  for (const surface of surfaces) revalidatePath(surface.path, surface.type);
}

// ---------------------------------------------------------------------------
// 4. The choke point.
// ---------------------------------------------------------------------------

/**
 * Call an order/loyalty RPC, parse its answer, invalidate what it changed.
 *
 * **This is the only place in the codebase that may call one of these RPCs, and it
 * is the only producer of an `OrderSummary` from a database response.**
 * `parseOrderPayload` and `toOrderSummary` are private to this module precisely so
 * that stays true: an action returning `ActionResult<OrderSummary>` has no way to
 * obtain one except through here, and here always revalidates.
 *
 * That is the whole design, and it is deliberate. The defect this replaces was not
 * a wrong function — `placeOrder` and `confirmOrder` were each correct. It was the
 * **asymmetry between them**: one revalidated, one did not, because placing an order
 * does not *look* like a loyalty mutation. Fixing that instance by adding one
 * `revalidatePath` line to `placeOrder` would leave the fourth action free to forget
 * again. So the invalidation is no longer something an action remembers to do; it is
 * something an action cannot avoid.
 *
 * Revalidation happens only on success. A failed RPC changed nothing (CONTRACT.md
 * §5: `PRODUCT_UNAVAILABLE` and `REWARD_UNAVAILABLE` both leave NO order behind), so
 * there is nothing stale to blow away.
 *
 * `scope` is the log label. `context` must never contain a token, a password, or a
 * request body — user id and order id only.
 */
export async function callOrderRpc<K extends OrderRpc>(
  scope: string,
  rpc: K,
  args: OrderRpcArgs[K],
  context: Record<string, string | number | boolean | null> = {},
): Promise<ActionResult<OrderSummary>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(rpc, args);

  if (error) return failFromRpc(scope, error, context);

  const payload = parseOrderPayload(data);
  if (!payload) {
    return failUnexpected(
      scope,
      new Error(`${rpc} returned a payload that does not match CONTRACT.md §4.`),
      context,
    );
  }

  revalidateWriteSet(rpc);

  return ok(toOrderSummary(payload));
}

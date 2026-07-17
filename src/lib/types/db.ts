/**
 * Database row types — derived verbatim from `supabase/CONTRACT.md` (owner: `db`).
 *
 * Every name here is snake_case because that is what Postgres returns. Do not
 * "tidy" these into camelCase: the mapping to camelCase happens exactly once, at
 * the API boundary (`src/lib/server/orders.ts`), and nowhere else. A rename here
 * silently breaks a query that TypeScript cannot check, because `supabase-js`
 * column strings are strings.
 *
 * If `supabase/CONTRACT.md` changes, this file changes with it. It is the only
 * place the schema is transcribed.
 */

// ---------------------------------------------------------------------------
// Enumerations — exact string literals from the CHECK constraints.
// ---------------------------------------------------------------------------

/** `orders.status` */
export type OrderStatus = 'pending' | 'confirmed' | 'cancelled';

/**
 * `loyalty_rewards.status`. All three values are live.
 *
 *  - `available` — spendable. The only status counted by `availableRewards`.
 *  - `redeemed`  — spent on `order_id`. Not spendable.
 *  - `expired`   — REVOKED by `cancel_order`. Dead: never spendable, never counted.
 *
 * The invariant (CONTRACT.md §8.1): rewards granted == `floor(confirmed_orders_count / 5)`.
 * `confirm_order` mints on an UP-crossing of a multiple of 5; `cancel_order` revokes
 * on a DOWN-crossing. Symmetric, and keyed on the COUNT, not on which order is being
 * cancelled.
 *
 * Do not reason about this as "cancelling an order expires the reward that order
 * minted" — that model is the exploit, not the fix. Keying the revoke on order
 * identity lets a user cancel a *different* confirmed order: the count still
 * down-crosses, but the reward survives. Two RPC calls per free reward, forever.
 */
export type RewardStatus = 'available' | 'redeemed' | 'expired';

/** `loyalty_rewards.kind` — the only kind. */
export type RewardKind = 'half_off';

/** `products.bun` — an i18n KEY, not display copy. CONTRACT.md §9.2. */
export type BunKey = 'potato' | 'brioche' | 'sesame' | 'pretzel' | 'sourdough';

/** `products.patty` — an i18n KEY, not display copy. CONTRACT.md §9.2. */
export type PattyKey =
  | 'smash_beef'
  | 'beef'
  | 'double_beef'
  | 'crispy_chicken'
  | 'lamb'
  | 'halloumi_mushroom';

/** `products.spice_level` — 0 none, 1 mild, 2 medium, 3 hot. */
export type SpiceLevel = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** `public.profiles` */
export interface ProfileRow {
  id: string;
  /** Nullable: email+password signup may carry no name. */
  full_name: string | null;
  /** Server-owned. Written ONLY by confirm_order / cancel_order. */
  confirmed_orders_count: number;
  created_at: string;
  updated_at: string;
}

/** `public.products` */
export interface ProductRow {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  desc_en: string;
  desc_ar: string;
  /** Minor units. 3200 = 32.00. The only price that exists. */
  price_cents: number;
  bun: BunKey;
  patty: PattyKey;
  spice_level: SpiceLevel;
  kcal: number;
  protein_g: number;
  prep_min: number;
  /** Root-relative, ready for next/image: `/products/<slug>.jpg`. */
  image_path: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** `public.orders` */
export interface OrderRow {
  id: string;
  user_id: string;
  status: OrderStatus;
  subtotal_cents: number;
  discount_cents: number;
  /** CHECK: total_cents = subtotal_cents - discount_cents */
  total_cents: number;
  reward_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  client_token: string | null;
  created_at: string;
  confirmed_at: string | null;
  updated_at: string;
}

/** `public.order_items` */
export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  qty: number;
  /** Price snapshot taken inside place_order. Not the current products price. */
  unit_price_cents: number;
  created_at: string;
}

/**
 * `public.loyalty_rewards`
 *
 * `order_id` and `source_order_id` are TWO DIFFERENT EDGES. Confusing them is what
 * allowed the original minting exploit, so they are commented separately here:
 *
 *   order_id        — the order this reward was SPENT ON.   Set by `place_order`.
 *   source_order_id — the order whose confirmation MINTED it. Set by `confirm_order`.
 *
 * One order can do both: spend reward A, and — by being the 5th confirmed order —
 * mint reward B. A CHECK guarantees they are never the same order.
 */
export interface LoyaltyRewardRow {
  id: string;
  user_id: string;
  kind: RewardKind;
  status: RewardStatus;
  issued_at: string;
  redeemed_at: string | null;
  /** SPENT-ON. The order this reward paid for. */
  order_id: string | null;
  /** EARNED-BY. The order whose confirmation minted it. UNIQUE where not null. */
  source_order_id: string | null;
}

// ---------------------------------------------------------------------------
// RPC payloads — CONTRACT.md §2, §3, §4
// ---------------------------------------------------------------------------

/**
 * One element of `place_order`'s `p_items` argument.
 * snake_case INSIDE the array too — CONTRACT.md is explicit about this, and
 * getting it wrong fails at runtime, not at compile time.
 *
 * Note what is absent: no price, no total, no user_id. The RPC has no parameter
 * that would accept one.
 */
export interface RpcOrderItemInput {
  product_id: string;
  qty: number;
}

/** `place_order` named arguments. The `p_` prefix is mandatory — `.rpc()` binds by name. */
export interface PlaceOrderArgs {
  p_items: RpcOrderItemInput[];
  p_customer_name: string;
  p_customer_phone: string;
  p_customer_address: string;
  p_redeem_reward: boolean;
  p_client_token: string | null;
}

/** `confirm_order` / `cancel_order` named argument. */
export interface OrderIdArg {
  p_order_id: string;
}

/** One element of the `items` array on the RPC return payload. */
export interface RpcOrderItemPayload {
  product_id: string;
  /** Joined in from `products` so no second query is needed to render a line. */
  slug: string;
  qty: number;
  unit_price_cents: number;
}

/**
 * The jsonb object returned by all three RPCs — every `orders` column, plus `items`.
 * CONTRACT.md §4.
 */
export interface RpcOrderPayload extends OrderRow {
  /** Always present, always an array, ordered by slug ascending. */
  items: RpcOrderItemPayload[];
}

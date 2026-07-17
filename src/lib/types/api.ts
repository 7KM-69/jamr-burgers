/**
 * The API contract `design` codes against.
 *
 * CLIENT-SAFE. This module must never import a Supabase client, `next/headers`,
 * `server-only`, or anything that touches an environment variable. It is types
 * and pure helpers only, so a client component can import `ErrorCode` to map it
 * to an i18n string.
 */

import type {
  BunKey,
  OrderStatus,
  PattyKey,
  ProductRow,
  SpiceLevel,
} from './db';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A stable machine code. This is what `design` switches on.
 *
 * The site is bilingual and CLAUDE.md forbids user-facing strings in components,
 * so the server can never return a renderable message — it returns a code, and
 * `src/i18n/{ar,en}.ts` maps that code to Arabic or English copy.
 *
 * Every member of this union is reachable. There is deliberately no `FORBIDDEN`:
 * per CONTRACT.md §3, an order id belonging to another user returns
 * `ORDER_NOT_FOUND`, indistinguishable from a non-existent id, so that the API
 * does not leak whether someone else's order exists.
 */
export type ErrorCode =
  // input
  | 'VALIDATION_ERROR' // Zod rejected the input; see `fieldErrors`
  // auth
  | 'UNAUTHENTICATED' // no valid session — sign in
  | 'INVALID_CREDENTIALS' // wrong email or password
  | 'EMAIL_ALREADY_REGISTERED' // sign-up on an existing email
  | 'EMAIL_NOT_CONFIRMED' // sign-in before clicking the confirmation link
  | 'WEAK_PASSWORD' // rejected by Supabase's password policy
  | 'RATE_LIMITED' // Supabase Auth 429 — too many attempts, back off
  // orders
  | 'NOT_FOUND' // no such order *for this user*
  | 'PRODUCT_UNAVAILABLE' // a line item is delisted/missing — NO order was created
  | 'REWARD_UNAVAILABLE' // asked to redeem with no available reward — NO order was created
  | 'ORDER_NOT_PENDING' // tried to confirm a cancelled order
  // everything else
  | 'INTERNAL';

export interface ApiError {
  code: ErrorCode;
  /**
   * English, developer-facing. For logs and for debugging.
   * NEVER render this — it is not translated and never will be. Render the `code`.
   */
  message: string;
  /** Present only on VALIDATION_ERROR. Keyed by form field name. */
  fieldErrors?: Record<string, string[]>;
}

/**
 * Every server action returns this. Actions RETURN errors, they do not THROW —
 * a thrown error crosses the RSC boundary as an opaque digest and the UI cannot
 * branch on it.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * A menu product, as the UI receives it. Snake_case, matching the DB row — the
 * one place camelCase is used is `OrderSummary`, because that shape is assembled
 * by hand rather than selected.
 *
 * `active` / `created_at` / `updated_at` are deliberately not selected: the UI
 * has no use for them, and `getProducts()` only ever returns active rows.
 *
 * Reminder for rendering (CONTRACT.md §9.2): `bun`, `patty` and `spice_level`
 * are i18n KEYS, not copy. Printing `product.bun` raw puts English in the Arabic
 * UI. `name_*` / `desc_*` are already bilingual in the row — pick the column by
 * locale.
 */
export type Product = Omit<ProductRow, 'active' | 'created_at' | 'updated_at'>;

export type { BunKey, PattyKey, SpiceLevel };

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderLine {
  productId: string;
  /** Joined from `products` by the RPC. Enough to render the line with no extra fetch. */
  slug: string;
  qty: number;
  /** Price SNAPSHOT at the time the order was placed, in minor units. */
  unitPriceCents: number;
}

/**
 * The authoritative order. Every number here was computed in Postgres from the
 * `products` table.
 *
 * The cart may show an optimistic subtotal while the user shops. This is the one
 * that is true. If they disagree, this one wins — render this, not the cart's.
 *
 * All money is an integer in minor units (3200 = 32.00). Divide by 100 at the
 * render boundary only. Never do money math in floats.
 *
 * ---------------------------------------------------------------------------
 * AN OrderSummary GOES STALE. Do not cache one across a cancel.
 * ---------------------------------------------------------------------------
 * `cancel_order` can REPRICE a *different*, still-pending order (CONTRACT.md §8.1):
 * if the reward it revokes had already been spent on an order that is still pending,
 * that order is rewritten to `discountCents: 0`, `totalCents: subtotalCents` — the
 * discount is taken back, because nothing was ever confirmed and no burger moved.
 *
 * So the summary returned by `placeOrder` may be out of date by the time the user
 * clicks Confirm. Two rules follow, and they are not optional:
 *
 *  1. **Render the confirm RESULT, not the placeOrder result.** `confirmOrder`
 *     returns the authoritative row. If the total changed, that is the number to
 *     show — do not keep displaying the one from the confirm screen.
 *  2. **Never send a total back to the server.** You cannot: `confirmOrder` takes
 *     only `{ orderId }`. There is no field that would accept a price. This is why
 *     the repricing is safe rather than an exploit.
 */
export interface OrderSummary {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  /** 0 unless a reward was redeemed. Server-computed: ceil(subtotal / 2). */
  discountCents: number;
  /** Always exactly subtotalCents - discountCents (a DB CHECK enforces it). */
  totalCents: number;
  /** True iff a loyalty reward was spent on this order. */
  rewardApplied: boolean;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  createdAt: string;
  confirmedAt: string | null;
  items: OrderLine[];
}

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------

/**
 * Read from the server. NEVER computed in the browser.
 *
 * `design` renders the dots. It does not decide whether a reward exists, and it
 * does not compute the discount. Even when `availableRewards > 0`, the server
 * re-checks under a row lock at checkout and may still answer
 * `REWARD_UNAVAILABLE` — that is not a bug. The UI is allowed to be stale; the
 * server is never wrong.
 *
 * Loyalty state goes stale after a cancel. `cancel_order` revokes a reward on a
 * DOWN-crossing of a multiple of 5 (CONTRACT.md §8.1), so a reward badge the user
 * is looking at can be expired out from under them. Re-read this after any cancel.
 * A UI still offering a reward the server has expired produces `REWARD_UNAVAILABLE`
 * at checkout, which looks like a bug and is not.
 */
export interface LoyaltyProgress {
  /** Authoritative lifetime count of confirmed orders. */
  confirmedOrdersCount: number;
  /** confirmedOrdersCount % 5 → the filled dots in the "3 / 5" meter. Display only. */
  progressInCycle: number;
  /** How many unspent 50%-off rewards the user holds. */
  availableRewards: number;
}

/** The denominator of the loyalty meter. 5 confirmed orders earn one reward. */
export const LOYALTY_CYCLE_LENGTH = 5;

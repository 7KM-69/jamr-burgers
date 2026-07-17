# JAMR — Database Contract

**Owner:** `db` (database-architect). **Consumers:** `api`, `design`.
**Status:** the SQL in `supabase/migrations/**` and `supabase/seed.sql` is **written but NOT
EXECUTED** — there is no Supabase project and no credentials. See §11.

This file is the **single source of truth** for the data layer. `api` binds to this; `design` binds
to the API `api` exposes, not to this file directly (except for the two things in §9 it needs:
product slugs and the i18n keys).

> **Copy names from this file. Do not retype them from memory.**
> `supabase-js` `.rpc()` passes arguments **by name**. `redeemReward` instead of `p_redeem_reward`
> does not fail to compile, does not throw a type error, and does not warn. It arrives at Postgres
> as a missing argument and the call fails at runtime — or worse, silently takes a default.
> Everything below is `snake_case`. Every RPC parameter is `p_`-prefixed. Both, always.

---

## 1. Tables

### `public.profiles`
One row per auth user. **Created by a trigger** (`on_auth_user_created` on `auth.users`) — never by
application code, and never with the service-role key.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | — | PK. FK → `auth.users(id)` ON DELETE CASCADE. Equals `auth.uid()`. |
| `full_name` | `text` | **YES** | `null` | 1–80 chars when present. Nullable because email+password signup may carry no name. The only justified null in the schema. |
| `confirmed_orders_count` | `integer` | NO | `0` | `>= 0`. **Server-owned.** Written ONLY by `confirm_order` / `cancel_order`. |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Maintained by trigger. |

**Client access:** `SELECT` own row. `UPDATE` own row — **`full_name` only** (column-level GRANT).
An `UPDATE` touching `confirmed_orders_count` is rejected by Postgres privileges, not by convention.
No `INSERT`, no `DELETE`.

---

### `public.products`
The menu. World-readable, **nobody-writable**. Changes by migration only.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `slug` | `text` | NO | — | **UNIQUE.** `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `name_en` | `text` | NO | — | 1–60 chars |
| `name_ar` | `text` | NO | — | 1–60 chars |
| `desc_en` | `text` | NO | — | 1–240 chars |
| `desc_ar` | `text` | NO | — | 1–240 chars |
| `price_cents` | `integer` | NO | — | `> 0`. Minor units: `3200` = `32.00`. **The only price that exists.** |
| `bun` | `text` | NO | — | **i18n key**, see §9.2 |
| `patty` | `text` | NO | — | **i18n key**, see §9.2 |
| `spice_level` | `smallint` | NO | — | `0..3`. 0 none · 1 mild · 2 medium · 3 hot |
| `kcal` | `integer` | NO | — | `> 0` |
| `protein_g` | `integer` | NO | — | `>= 0` |
| `prep_min` | `integer` | NO | — | `> 0` |
| `image_path` | `text` | NO | — | **Exactly `'/products/' \|\| slug \|\| '.jpg'`, enforced by CHECK.** Root-relative; goes straight into `next/image`. File lives at `public/products/<slug>.jpg`. |
| `active` | `boolean` | NO | `true` | Soft delete. |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | |

**Client access:** `SELECT` only, to `anon` **and** `authenticated` (the menu is public). No write
grant and no write policy for anyone.

**The `SELECT` policy is `using (true)`, NOT `using (active)`** — deliberately. A past order may
reference a retired product; if the policy hid inactive rows, that user's own order history would
render with a hole in it. **`api` must filter `.eq('active', true)` in the menu query.** The policy
will not do it for you.

**Stable menu order:** `order by price_cents asc, slug asc`. There is no `sort_order` column (none
was specified). This ordering is covered by the partial index `products_active_price_idx`.

---

### `public.orders`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NO | — | FK → `profiles(id)` ON DELETE CASCADE |
| `status` | `text` | NO | `'pending'` | `'pending'` \| `'confirmed'` \| `'cancelled'` — exact literals |
| `subtotal_cents` | `integer` | NO | — | `>= 0`. Computed in Postgres from `products`. |
| `discount_cents` | `integer` | NO | `0` | `>= 0`, `<= subtotal_cents` |
| `total_cents` | `integer` | NO | — | `>= 0`. **CHECK: `total_cents = subtotal_cents - discount_cents`** |
| `reward_id` | `uuid` | **YES** | `null` | FK → `loyalty_rewards(id)` ON DELETE SET NULL. **UNIQUE** where not null. Cleared by `cancel_order`. |
| `customer_name` | `text` | NO | — | 1–80 chars |
| `customer_phone` | `text` | NO | — | 5–32 chars |
| `customer_address` | `text` | NO | — | 1–300 chars |
| `client_token` | `uuid` | **YES** | `null` | Idempotency key. **UNIQUE `(user_id, client_token)`** where not null. |
| `created_at` | `timestamptz` | NO | `now()` | |
| `confirmed_at` | `timestamptz` | **YES** | `null` | CHECK: non-null whenever `status = 'confirmed'` |
| `updated_at` | `timestamptz` | NO | `now()` | Maintained by trigger. |

**Client access:** `SELECT` own rows only. **No `INSERT` / `UPDATE` / `DELETE` grant or policy — at
all.** Orders are written exclusively by the three RPCs. There is no way to `.from('orders').insert()`
from any client; it will be rejected.

**There is no DELETE path for an order, by design.** Cancellation is a status transition
(`cancel_order`), so history survives and the loyalty counter stays reconcilable.

---

### `public.order_items`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `order_id` | `uuid` | NO | — | FK → `orders(id)` ON DELETE **CASCADE** |
| `product_id` | `uuid` | NO | — | FK → `products(id)` ON DELETE **RESTRICT** |
| `qty` | `integer` | NO | — | `1..20` |
| `unit_price_cents` | `integer` | NO | — | `> 0`. **Price snapshot** taken from `products.price_cents` inside `place_order`. |
| `created_at` | `timestamptz` | NO | `now()` | |

**UNIQUE `(order_id, product_id)`** — one line per product per order. `place_order` merges duplicate
cart lines by summing `qty` before insert.

**Client access:** `SELECT` items of your own orders (policy joins to `orders`). No write path.

---

### `public.loyalty_rewards`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NO | — | FK → `profiles(id)` ON DELETE CASCADE |
| `kind` | `text` | NO | `'half_off'` | CHECK: `= 'half_off'` — the only kind |
| `status` | `text` | NO | `'available'` | `'available'` \| `'redeemed'` \| `'expired'` — exact literals |
| `issued_at` | `timestamptz` | NO | `now()` | |
| `redeemed_at` | `timestamptz` | **YES** | `null` | CHECK: non-null whenever `status = 'redeemed'` |
| `order_id` | `uuid` | **YES** | `null` | FK → `orders(id)` ON DELETE SET NULL. The order this reward was **SPENT ON**. Set by `place_order`. |
| `source_order_id` | `uuid` | **YES** | `null` | FK → `orders(id)` ON DELETE SET NULL. The order whose confirmation **MINTED** it. Set by `confirm_order`. **UNIQUE** where not null — one order mints at most one reward, ever. |

**`order_id` and `source_order_id` are two different edges and must not be confused.** `order_id` is
the order a reward was *spent on*; `source_order_id` is the order that *earned* it. One order can do
both — it can spend reward A and, by being the 5th confirmed order, mint reward B. CHECK
`loyalty_rewards_spend_is_not_source` guarantees they are never the same order.

**All three `status` values are live.** `'expired'` means **revoked** — see §8.1. An earlier draft of
this contract said nothing ever writes `'expired'`; that was true then and is false now. `expired`
rewards are dead: they cannot be redeemed and must not be counted in `availableRewards`.

**Client access:** `SELECT` own rows only. No write path — a client with `INSERT` here could mint
itself unlimited 50%-off rewards; one with `UPDATE` could flip a `redeemed` reward back to
`available` and spend it twice.

---

## 2. RPC — `place_order`

Creates a **pending** order. Recomputes the subtotal from `products`. Redeems at most one reward.

```
public.place_order(
  p_items            jsonb,                     -- required
  p_customer_name    text,                      -- required
  p_customer_phone   text,                      -- required
  p_customer_address text,                      -- required
  p_redeem_reward    boolean  default false,
  p_client_token     uuid     default null
) returns jsonb
```

### `p_items` — exact JSON shape
A **JSON array of objects**. Each object has exactly these two keys, `snake_case`:

```json
[
  { "product_id": "6f1c9e2a-....-....-....-............", "qty": 2 },
  { "product_id": "b3a7d148-....-....-....-............", "qty": 1 }
]
```

- `product_id` — `uuid` string. Must exist in `products` **and** have `active = true`.
- `qty` — integer. After merging duplicate lines for the same `product_id`, each product's total
  must land in `1..20`.
- **No `price`, no `unit_price_cents`, no `total`, no `user_id`.** There is no parameter that would
  accept them. A client-sent price cannot reach a query because nothing reads one.

### Call it like this (`supabase-js`)
```ts
const { data, error } = await supabase.rpc('place_order', {
  p_items: [{ product_id: productId, qty }],   // snake_case INSIDE the array too
  p_customer_name:    customerName,
  p_customer_phone:   customerPhone,
  p_customer_address: customerAddress,
  p_redeem_reward:    redeemReward,            // boolean
  p_client_token:     clientToken,             // uuid string, one per checkout attempt
});
```

### Returns — `jsonb`, one object (see §4 for the exact shape)

### Behaviour worth knowing
- **Idempotent on `p_client_token`.** Same token, same user → the existing order is returned, no
  second order created. `api` should generate one `uuid` per checkout attempt (`crypto.randomUUID()`)
  and reuse it across retries of that attempt. Passing `null` disables idempotency — a double-click
  then creates two pending orders.
  Idempotency holds even for two *simultaneous* calls carrying the same token, including when they
  redeem a reward: the loser does not get `REWARD_UNAVAILABLE`, it gets the winner's order. One
  order, one redemption, both callers get the same correct answer.
  This is enforced by a `pg_advisory_xact_lock` on `(user_id, client_token)` taken at the top of
  `place_order` — the second call blocks on the **token** until the first commits, then reads its
  order and returns it. It is not enforced by the reward lock, which is `skip locked` and therefore
  does **not** block (see §6). **If `p_client_token` is `null` there is no advisory lock and no
  idempotency**: two simultaneous double-clicked calls both proceed, and if both redeem, one gets a
  genuine `REWARD_UNAVAILABLE`. Always send a token.
- **Discount:** `discount_cents = ceil(subtotal_cents / 2)`, i.e. `(subtotal_cents + 1) / 2` in
  integer arithmetic. On an odd number of cents the half-cent goes **to the customer**. `total_cents
  = subtotal_cents - discount_cents`.
- **Requesting a reward you don't have is an error, not a silent no-op.** `p_redeem_reward = true`
  with no available reward raises `REWARD_UNAVAILABLE`. The order is NOT placed. The server is right;
  the UI was wrong.
- **A product missing or inactive fails the whole order** (`PRODUCT_UNAVAILABLE`). No line is
  silently dropped. A partial order is worse than a rejected one.

---

## 3. RPC — `confirm_order` / `cancel_order`

```
public.confirm_order(p_order_id uuid) returns jsonb
public.cancel_order (p_order_id uuid) returns jsonb
```

```ts
await supabase.rpc('confirm_order', { p_order_id: orderId });
await supabase.rpc('cancel_order',  { p_order_id: orderId });
```

Both return the same `jsonb` shape as `place_order` (§4).

**`confirm_order`** — `pending` → `confirmed`. Increments `profiles.confirmed_orders_count` by
exactly 1 and, if the new count is a multiple of 5, inserts exactly one `loyalty_rewards` row with
`status = 'available'`.

**`cancel_order`** — `pending` or `confirmed` → `cancelled`. Decrements the counter **only** if the
order was `confirmed` (a pending order was never counted). Restores a reward this order *spent* back
to `'available'` and clears `orders.reward_id`. **May also revoke a reward, and may reprice a
*different* pending order** — see §8.1, which `api` must read before building checkout.

Neither takes a `user_id`. Both filter on `auth.uid()` **inside the function body**, not merely via
an RLS select policy. An order id belonging to another user returns `ORDER_NOT_FOUND` — deliberately
indistinguishable from a non-existent id, so existence is not leaked.

---

## 4. The returned shape — identical for all three RPCs

One `jsonb` object: every `orders` column, plus `items`.

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "status": "pending",
  "subtotal_cents": 6400,
  "discount_cents": 0,
  "total_cents": 6400,
  "reward_id": null,
  "customer_name": "Ahmad",
  "customer_phone": "0500000000",
  "customer_address": "...",
  "client_token": "uuid or null",
  "created_at": "2026-07-12T10:04:22.117Z",
  "confirmed_at": null,
  "updated_at": "2026-07-12T10:04:22.117Z",
  "items": [
    { "product_id": "uuid", "slug": "charcoal-smash", "qty": 2, "unit_price_cents": 3200 }
  ]
}
```

- `items` is **always present** and always an array (`[]` never happens in practice — an order
  cannot be created without lines — but the shape is guaranteed).
- `items[].slug` is joined in from `products` **so you do not need a second query** to render a line.
- `items` is ordered by `slug` ascending — deterministic, so the confirm screen and the receipt list
  the same lines in the same order.
- Timestamps are ISO-8601 strings with timezone (`timestamptz`).
- `rewardApplied` in `api`'s `OrderSummary` maps to **`reward_id !== null`**.
- Note the money keys are `subtotal_cents` / `discount_cents` / `total_cents` — `api` maps these to
  its camelCase `OrderSummary` at the boundary.

---

## 5. Errors — every exception these RPCs can raise

The exception **message** is a stable machine code. **Switch on the message.** The `hint` is
developer prose and may change without notice; never render it and never branch on it.

In `supabase-js`, `error.message` carries the code.

| message (the code) | SQLSTATE | raised by | means | what `api` should do |
|---|---|---|---|---|
| `UNAUTHENTICATED` | `42501` | all three | `auth.uid()` is null | → `UNAUTHENTICATED` |
| `EMPTY_CART` | `P0001` | `place_order` | `p_items` null / not an array / empty | → `VALIDATION_ERROR` (should be caught by Zod first) |
| `INVALID_ITEMS` | `P0001` | `place_order` | an element is not an object, or `product_id` / `qty` is missing or not castable | → `VALIDATION_ERROR` |
| `INVALID_QTY` | `P0001` | `place_order` | merged qty for a product is outside `1..20` | → `VALIDATION_ERROR` |
| `INVALID_CUSTOMER_DETAILS` | `P0001` | `place_order` | name / phone / address blank after trim | → `VALIDATION_ERROR` |
| `PRODUCT_UNAVAILABLE` | `P0001` | `place_order` | a product does not exist or `active = false`. **No order was created.** | → `PRODUCT_UNAVAILABLE` |
| `REWARD_UNAVAILABLE` | `P0001` | `place_order` | `p_redeem_reward = true` but no available reward — including the case where a concurrent order just took it. **No order was created.** | → `REWARD_UNAVAILABLE`. Refresh loyalty state; the UI is stale. |
| `ORDER_NOT_FOUND` | `P0001` | `confirm_order`, `cancel_order` | no order with that id **belongs to the caller** | → `NOT_FOUND` |
| `ORDER_NOT_PENDING` | `P0001` | `confirm_order` | order is `cancelled` (cannot be confirmed) | → `ORDER_NOT_PENDING` |

**Not errors — these succeed:**
- `confirm_order` on an **already-confirmed** order → returns the order, no error, **no second
  increment**. This is the idempotent replay path (a double-clicked Confirm button).
- `cancel_order` on an **already-cancelled** order → returns the order, no error, no second decrement.
- `place_order` with a **`p_client_token` already used** → returns the existing order, no error, no
  duplicate.

`api`'s `ErrorCode` union has `FORBIDDEN`, which no RPC raises: a cross-user order id returns
`ORDER_NOT_FOUND` on purpose. Nothing needs to map to `FORBIDDEN` from the database layer.

---

## 6. How the two guardrails `api` cannot fix from Node are enforced

`api` §8 depends on both of these and asked to see them rather than assume them.

**1. Two simultaneous orders must not redeem the same reward.**
`place_order` step 4:
```sql
select r.id into v_reward_id
from public.loyalty_rewards r
where r.user_id = v_user and r.status = 'available'
order by r.issued_at asc, r.id asc
for update skip locked      -- <-- the lock. SKIP LOCKED is not optional.
limit 1;
```

**Correction to an earlier version of this document.** This previously read `for update` (no
`skip locked`) and asserted the lock was a complete guarantee. **It was not**, and the claim was
wrong in one direction:

> `FOR UPDATE … LIMIT 1` is a documented Postgres trap. Under READ COMMITTED, T2 blocks on the row
> T1 holds; when T1 commits, T2 re-checks the row, finds it no longer matches `status = 'available'`,
> and discards it — **but `LIMIT 1` has already been applied, so the query does not fall through to
> the next candidate.** A user holding **two** available rewards, placing two concurrent orders,
> would be told `REWARD_UNAVAILABLE` while still holding an unspent reward.

`SKIP LOCKED` steps over the row the other transaction holds and takes the next available one:

- **Two concurrent orders, two rewards** → both succeed, each spending a different reward. Correct;
  this is what the user is entitled to and what the old code got wrong.
- **Two concurrent orders, one reward** → the loser skips the only candidate, finds nothing, and
  raises `REWARD_UNAVAILABLE`. Exactly one order gets the discount. **The reward is spent exactly
  once — the CLAUDE.md guardrail holds.**

It **fails closed, never open.** The worst case is a spurious `REWARD_UNAVAILABLE` when a reward is
momentarily locked by a transaction that then rolls back; a retry gets it. Nobody ever double-spends.
There is also a redundant guarded `UPDATE … WHERE status = 'available'` at step 6 that rolls the whole
order back if the invariant were somehow violated.

**`SKIP LOCKED` does not block — and that had a consequence, now fixed.** A double-clicked checkout
*with a reward* used to rely on click 2 blocking on the reward lock until click 1 committed. Under
`skip locked` it no longer blocks: it steps over the reward, finds none, and would raise a **false**
`REWARD_UNAVAILABLE` for a user who has a reward and whose order is about to exist. The double-click
is therefore serialized one level up, on the **token** (`pg_advisory_xact_lock`, §2) — which is where
it always belonged. Concurrency on the *reward* and concurrency on the *checkout* are two different
races and they now have two different locks.

**2. `confirm_order` must be genuinely idempotent.**
The gate is a **conditional** UPDATE:
```sql
update public.orders
set status = 'confirmed', confirmed_at = now()
where id = p_order_id and user_id = v_user and status = 'pending';
```
The counter is incremented **only** in the branch where this updated a row. A second concurrent
confirm blocks on the row lock, re-checks its `WHERE` after T1 commits, matches zero rows, and takes
the replay path — return the order, touch nothing. A bare `update ... set status = 'confirmed'` with
no status predicate would succeed twice, double-increment the counter, and mint a free reward on
every double-click. That is the bug this shape exists to prevent.

Both are backed by constraints, not just by function logic: `orders_reward_id_key` (UNIQUE) makes it
impossible for two orders to point at one reward, and `profiles.confirmed_orders_count >= 0` plus
`total_cents = subtotal_cents - discount_cents` are CHECKs the database enforces even if a function
is wrong.

---

## 7. Indexes (all of `api` §9.6, confirmed)

| index | table | covers |
|---|---|---|
| `products_pkey` | `products` | PK |
| `products_slug_key` | `products` | UNIQUE `slug` — `getProductBySlug` |
| `products_active_price_idx` | `products` | partial `(price_cents, slug) where active` — the menu query **and** its sort |
| `profiles_pkey` | `profiles` | PK — and the RLS predicate `id = auth.uid()` |
| `orders_user_id_created_at_idx` | `orders` | `(user_id, created_at desc)` — RLS predicate **and** order history sort |
| `orders_reward_id_key` | `orders` | partial UNIQUE `reward_id` — FK + "one reward per order" |
| `orders_user_client_token_key` | `orders` | partial UNIQUE `(user_id, client_token)` — checkout idempotency |
| `order_items_order_id_idx` | `order_items` | FK **and** the RLS policy's join back to `orders` |
| `order_items_product_id_idx` | `order_items` | FK — makes ON DELETE RESTRICT checks cheap |
| `loyalty_rewards_available_idx` | `loyalty_rewards` | partial `(user_id, issued_at) where status = 'available'` — the reward lookup in `place_order` |
| `loyalty_rewards_user_id_idx` | `loyalty_rewards` | RLS predicate + account page |
| `loyalty_rewards_order_id_idx` | `loyalty_rewards` | FK |
| `loyalty_rewards_source_order_id_key` | `loyalty_rewards` | partial UNIQUE `source_order_id` — FK + "one order mints at most one reward" |

Every foreign key is indexed. Every column in an RLS policy predicate is indexed
(`profiles.id`, `orders.user_id`, `order_items.order_id`, `loyalty_rewards.user_id`).

---

## 8.1 The reward lifecycle — the invariant, and the two things that will surprise you

### THE INVARIANT — total, no asterisk
> **For every user, at every moment:**
> **`count(loyalty_rewards where status <> 'expired') == floor(confirmed_orders_count / 5)`**
>
> `confirm_order` mints on an **up-crossing** of a multiple of 5.
> `cancel_order` revokes on a **down-crossing**. Exactly symmetric, with no exempt case.

A non-expired reward is either `'available'` or `'redeemed'` against a live (`pending` | `confirmed`)
order. It can never be `'redeemed'` against a `cancelled` one — cancelling always restores it first.
That exhaustiveness is what lets the revoke always find something to take, which is what makes the
invariant hold rather than nearly hold.

The revoke test is `old_count % 5 = 0` — evaluated on the count *before* the decrement, under a row
lock on `profiles`. **It does not depend on which order is being cancelled.** That asymmetry was a
real exploit in an earlier version of this schema (mint keyed on crossing a threshold, revoke keyed
on order identity → cancel a *different* confirmed order and keep the reward, forever, two RPC calls
per free reward). It is fixed. Do not "simplify" the revoke back to "expire the reward whose
`source_order_id` is this order" — that is the bug.

**Inside `cancel_order`, RESTORE runs before REVOKE. The order is load-bearing.** Restoring a spent
reward to `'available'` is what makes it *visible* to the revoke, which then decides whether it was
earned. Restore proposes; revoke disposes. With the blocks in the other order, a reward spent on the
order being cancelled is invisible to the revoke (that order is now `'cancelled'`, so it is neither
`available` nor spent-on-a-`pending`-order), the revoke expires nothing, and the restore then hands
the reward back — a second mint, closed only by the ordering. Do not reorder these blocks.

### Two consequences `api` must handle

**1. `cancel_order` can expire a reward the user is currently looking at.**
Cancelling a confirmed order may flip one `loyalty_rewards` row to `'expired'`. **Any cached loyalty
state is stale after a `cancel_order` call** — re-read `getLoyaltyProgress()` (revalidate the account
page and the cart drawer). A UI still showing a reward badge that the server has expired will produce
a `REWARD_UNAVAILABLE` on the next checkout, which looks like a bug and is not.

**2. `cancel_order` can reprice a *different* order — pending OR confirmed.**
This is the one genuinely surprising behaviour in the whole schema, and it is deliberate.

If the reward being revoked has already been *spent* on another order, `cancel_order`:
- sets that reward to `'expired'`, **and**
- rewrites that other order: `reward_id = null`, `discount_cents = 0`, `total_cents = subtotal_cents`.

**That other order may already be `'confirmed'`.** Its `total_cents` goes up, after the fact. This is
correct here and only here — the app takes no payment and cooks nothing, so a "confirmed" order is a
row, not a delivery (see above). Without this the mint loop survives by confirming the half-price
order before cancelling.

Consequences `api` must respect:
- **`total_cents` on ANY order the client is holding can change.** Never confirm, display a receipt,
  or reconcile against a total the client cached. Re-read the order, or use the row the RPC returns —
  that row is authoritative.
- **Order history is not immutable.** A confirmed order's `total_cents` / `discount_cents` may differ
  from what the user saw at confirmation time. If that ever needs to stop being true, the fix is a
  product decision (e.g. forbid cancelling confirmed orders), not a schema tweak — say so and I will
  make it.
- **Revalidate the account page and the cart drawer after every `cancel_order`.**

**The revoke reaches a reward spent on a `confirmed` order too, and reprices that order.** There is
no stopping point and no exemption — the invariant is total.

The instinct to spare a confirmed order ("the food was delivered, don't re-bill them") is imported
from a real store. **This one has no payment and no fulfilment** (CLAUDE.md §Payment: checkout is
simulated; nothing is charged, nothing is cooked). Repricing a confirmed order moves an integer in a
column — it refunds nothing and charges nothing. Sparing it left a real leak: confirm the half-price
order *before* cancelling and the reward became unreachable, so the down-crossing revoked nothing.
That is closed.

**Revocation order — least-committed order first.** The revoke spends the cheapest thing it can:
1. an `'available'` (unspent) reward — preferring the one this order *minted*;
2. else a reward spent on a **`'pending'`** order → expire it, reprice that order to full price;
3. else a reward spent on a **`'confirmed'`** order → expire it, reprice that order to full price.

A confirmed order is therefore only ever repriced when there is nothing cheaper to take. In practice
`api` will rarely see step 3.

### Status meanings, final
| `status` | means |
|---|---|
| `'available'` | spendable. Counts toward `availableRewards`. |
| `'redeemed'` | spent on `order_id`. Not spendable. |
| `'expired'` | **revoked** by `cancel_order` on a down-crossing. Dead. Not spendable, never counted. |

---

## 8. Loyalty progress — read it, never compute it

`api.getLoyaltyProgress()` should read:
- `profiles.confirmed_orders_count` → `confirmedOrdersCount`
- `progressInCycle = confirmedOrdersCount % 5` → the `3 / 5` dots. **Display only.**
- `select count(*) from loyalty_rewards where status = 'available'` (RLS scopes it to the user)
  → `availableRewards`

`availableRewards > 0` is the only thing that should enable the "use my reward" toggle in the UI —
and even then, the server re-checks under a lock and may still say `REWARD_UNAVAILABLE`. That is not
a bug; the UI is allowed to be stale, the server is never wrong.

---

## 9. What `design` needs

### 9.1 Product slugs — AUTHORITATIVE. Image files are named from these.

| slug | `image_path` (from the DB, use verbatim) | file `design` creates |
|---|---|---|
| `charcoal-smash` | `/products/charcoal-smash.jpg` | `public/products/charcoal-smash.jpg` |
| `double-flame` | `/products/double-flame.jpg` | `public/products/double-flame.jpg` |
| `firebird` | `/products/firebird.jpg` | `public/products/firebird.jpg` |
| `cinder-lamb` | `/products/cinder-lamb.jpg` | `public/products/cinder-lamb.jpg` |
| `inferno` | `/products/inferno.jpg` | `public/products/inferno.jpg` |
| `green-ember` | `/products/green-ember.jpg` | `public/products/green-ember.jpg` |

`image_path` comes out of the database ready for `next/image`: `<Image src={product.image_path} …/>`.
No prefixing, no template string, no `/public` in the path. A CHECK constraint guarantees the value
matches the slug, so this cannot drift.

### 9.2 `bun` / `patty` / `spice_level` are keys, not copy
Rendering them raw prints English into the Arabic UI. `design` maps them in `src/i18n/{ar,en}.ts`.

- **`bun`** — `potato` · `brioche` · `sesame` · `pretzel` · `sourdough`
- **`patty`** — `smash_beef` · `beef` · `double_beef` · `crispy_chicken` · `lamb` · `halloumi_mushroom`
- **`spice_level`** — `0` none · `1` mild · `2` medium · `3` hot (renders as 3 flame glyphs, `n` filled)

Every other display string on a product card (`name_en`/`name_ar`, `desc_en`/`desc_ar`) is already
bilingual **in the row** — pick the column by the active locale.

### 9.3 Money
`price_cents` / `subtotal_cents` / `discount_cents` / `total_cents` are **integers in minor units**.
`3200` renders as `32.00`. Divide by 100 at the render boundary only. Latin digits in both languages
(CLAUDE.md). Never do money math in floats.

---

## 10. Deviations from CLAUDE.md's original prose data model — recorded, not drift

1. **`orders.customer_name` / `customer_phone` / `customer_address`** — added by **lead ruling**.
   CLAUDE.md §Payment says checkout collects name + phone + address; the prose data model had nowhere
   to put them, so they would have been collected and thrown away. CLAUDE.md has since been updated
   to include them.
2. **`orders.client_token`** + UNIQUE `(user_id, client_token)` — added by **lead ruling**, requested
   by `api` §9.3. Without it a double-clicked checkout leaves a stray pending order.
3. **`cancel_order` RPC** — CLAUDE.md loyalty rule 1 requires that cancelling a confirmed order
   decrements the counter, but named no function to do it. `place_order` and `confirm_order` cannot;
   this is the path for it.
4. **`updated_at` + trigger** on `profiles`, `products`, `orders` — not in the prose model. Standard,
   and required for debugging.
5. **`bun` / `patty` typed as constrained key sets** rather than free text — because the site is
   bilingual and a free-text English bun would render as English inside the Arabic UI.
6. **`loyalty_rewards.source_order_id`** (+ partial UNIQUE) — not in the prose model. Required to
   make reward revocation auditable and to enforce "one order mints at most one reward" as a
   constraint rather than as a hope. Added when the mint loop (§8.1) was closed.

**Assumptions flagged (no invented behaviour beyond these):**
- **Currency is not stored.** `price_cents` is minor units of a single, unnamed currency. No
  multi-currency was specified and none was built. `design` picks the symbol.
- **Cancelling an order restores a reward that order *spent* to `available`.** CLAUDE.md does not
  specify this. The alternative — the user cancels, gets nothing, and *also* forfeits a reward they
  had legitimately earned — is worse.
- **Cancelling a confirmed order REVOKES a reward on a down-crossing of a multiple of 5**
  (`status = 'expired'`), and may reprice another still-pending order to full price to do it. See
  §8.1. ~~An earlier version of this contract said cancellation never revokes an issued reward,
  calling revocation "hostile".~~ **That was wrong, and it was an exploit, not generosity:** the
  multiple-of-5 threshold could be re-crossed indefinitely, minting an unlimited supply of 50%-off
  rewards for free. There is no payment in this app, so nothing else throttled the loop.
- **Rewards do not expire on a timer.** There is no TTL and no scheduled job. `'expired'` is written
  in exactly one place — revocation by `cancel_order` (§8.1). ~~An earlier version said nothing ever
  writes `'expired'`.~~ That is no longer true.

---

## 11. Execution status — read this before you trust anything above

**None of this SQL has been executed.** There is no Supabase project, no credentials, and no local
Postgres available in this environment (the shell itself is broken on this machine — see the final
report). The SQL was validated by review only.

Once the user provisions Supabase and applies the migrations, these are the smoke tests that must
pass before checkout can be called done (they are the ones listed in CLAUDE.md, plus the two RLS
tests). `supabase/README.md` has them as runnable SQL.

1. A `profiles` row appears on signup.
2. The subtotal is computed from `products`, not from anything the client sent.
3. Confirming the same order twice moves `confirmed_orders_count` by exactly 1.
4. Hitting 5 confirmed orders issues exactly one reward.
5. Two simultaneous redemptions of one reward — exactly one wins.
6. Confirming another user's order is refused.
7. **User A cannot `select` user B's order** (RLS).
8. **User A cannot `update` their own `confirmed_orders_count`** (column grant).
9. **The mint loop is closed** (§8.1). From `confirmed_orders_count = 4`: confirm an order (count 5,
   one reward appears), then cancel **a different, older confirmed order** (count 4). The reward must
   now be `'expired'`, NOT `'available'`. Repeat 3× — the user must still hold **zero** available
   rewards. If they accumulate one per cycle, the revocation is keyed on order identity instead of on
   the down-crossing, and the loyalty system is a free-money printer.
10. **Two concurrent orders with two available rewards both succeed**, each spending a different
    reward (this is what `skip locked` fixed; with a plain `for update … limit 1` the second call
    wrongly fails with `REWARD_UNAVAILABLE`).

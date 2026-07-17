# JAMR — Server Layer (`api`) — AS BUILT

Owner: `api` (backend-architect). This describes what is **actually in the repo**, not what was
planned. It supersedes the provisional plan written before `supabase/CONTRACT.md` landed.

**Verification status: NOTHING HAS BEEN RUN.** There is no Supabase project and no credentials, and
`node_modules` did not exist while this was written, so it has not even been typechecked. See §8 —
do not read anything below as "working".

Bound to `supabase/CONTRACT.md` (owner: `db`). Where this file and `CONTRACT.md` disagree,
**`CONTRACT.md` wins.**

---

## 1. Files

```
src/middleware.ts                  session refresh + protected-route redirect
.env.example                       env var names, no values
src/lib/schemas.ts                 Zod schemas + inferred input types   (CLIENT-SAFE)
src/lib/types/api.ts               ActionResult, ErrorCode, Product, OrderSummary, LoyaltyProgress
                                   (CLIENT-SAFE — this is what `design` imports)
src/lib/types/db.ts                DB row + RPC payload types, transcribed from CONTRACT.md
src/lib/types/server-only.d.ts     type decl for the `server-only` marker module
src/lib/supabase/env.ts            the two public env vars
src/lib/supabase/browser.ts        createBrowserClient — client components
src/lib/supabase/server.ts         createServerClient  — RSC / actions, per request   [server-only]
src/lib/supabase/public.ts         cookie-less anon client — public reads only        [server-only]
src/lib/server/errors.ts           ok/fail, RPC + Auth error mapping, logging          [server-only]
src/lib/server/products.ts         getProducts, getProductBySlug                       [server-only]
src/lib/server/loyalty.ts          getLoyaltyProgress                                  [server-only]
src/lib/server/orders.ts           toOrderSummary — the RPC payload mapper             [server-only]
src/lib/actions/auth.ts            'use server' — signUp, signIn, signOut, getSessionUser
src/lib/actions/orders.ts          'use server' — placeOrder, confirmOrder
```

**There is no service-role client, and no code reads `SUPABASE_SERVICE_ROLE_KEY`.** Nothing needs
it: the RPCs derive identity from `auth.uid()` inside Postgres, and `profiles` rows are created by
the `on_auth_user_created` trigger. The key that bypasses every RLS policy does not exist in this
codebase.

---

## 2. Three clients, three jobs

| Module | Key | Cookies | Use for |
|---|---|---|---|
| `supabase/browser.ts` | anon | browser jar | client components reading auth state |
| `supabase/server.ts` | anon | `next/headers` | RSC, server actions — runs as the signed-in user |
| `supabase/public.ts` | anon | **none** | `products` only — keeps `/menu` out of forced dynamic rendering |

Rules held, each for a specific failure:

- **`src/middleware.ts`, NOT `middleware.ts`.** This project has a `src/` directory, so Next resolves
  middleware at `src/middleware.ts` and **silently ignores one at the repo root** — the build stays
  green and `middleware-manifest.json` is empty. It was at the root; the build proved it dead (no
  `ƒ Middleware` line) and it was moved. If that line ever disappears from `npm run build` output
  again, session refresh and route protection are off. Check for it.
- **`getAll`/`setAll`** cookie interface, not the deprecated `get`/`set`/`remove` (which silently
  drops refreshed sessions).
- **`getUser()`, never `getSession()`**, for any authorization decision. `getSession()` decodes the
  cookie and trusts it; `getUser()` verifies the JWT. A decision made on `getSession()` is forgeable.
- `supabase/server.ts` is constructed **per request**, never a module singleton — it closes over one
  request's cookie jar.
- `middleware.ts` returns the **same** response object Supabase wrote cookies onto. Building a fresh
  `NextResponse` after the refresh discards the rotated tokens; the bug only appears an hour later
  when the first access token expires.
- `public.ts` must only read tables whose SELECT policy is `using (true)` — today, `products`.
  Reading `orders` through it returns zero rows, silently.

---

## 3. Auth

Supabase email + password.

`signUp` passes `options.data.full_name`. The key must be exactly `full_name`: the trigger does
`new.raw_user_meta_data ->> 'full_name'`, so a camelCase key produces a profile with a null name and
**no error anywhere**. `fullName` is optional because `profiles.full_name` is nullable by design.

`needsEmailConfirmation` is `data.session === null`. `design` needs a "check your inbox" state.

**User enumeration:** when email confirmation is ON, Supabase deliberately returns *success* for an
already-registered email rather than revealing it exists. We pass that through unchanged. We do
**not** use the common `user.identities.length === 0` trick to detect it, because that would turn
sign-up into an account-existence oracle. When confirmation is OFF, Supabase returns a real error →
`EMAIL_ALREADY_REGISTERED`.

**Protected routes** (middleware → `/auth?redirect=<path>`): `/account`, `/checkout`.
**Public, deliberately:** `/`, `/menu`, `/spices`, `/locations`, `/contact`, `/auth`, and all product
data. You can browse and build a cart signed out; you are stopped at checkout.

### Middleware is a redirect, not a security boundary

There is a live advisory against the pinned `next@15.1.6` in the Next middleware area (the
`x-middleware-subrequest` bypass class). **Assume middleware can be skipped**, and note that this is
why nothing security-critical depends on it:

- **Every server action independently re-derives identity** with `getUser()` and returns
  `UNAUTHENTICATED` on its own. `placeOrder` / `confirmOrder` do not care whether middleware ran.
- **Every data read is RLS-scoped in Postgres.** A bypassed middleware still gets zero rows.
- `getLoyaltyProgress()` returns `null` when signed out rather than throwing or leaking.

So a middleware bypass costs an empty page shell, not data. **But `design` should still gate the
`/account` and `/checkout` *pages* server-side** — `const user = await getCurrentUser(); if (!user)
redirect('/auth')` inside the page — rather than relying on the middleware redirect alone. That is
the recommended mitigation for this CVE class and it costs three lines. `package.json` is `design`'s
lane; upgrading `next` is `design`'s call, and it should happen.

---

## 4. Error shape

The site is bilingual and CLAUDE.md forbids user-facing strings in components, so **the server never
returns a renderable message.** It returns a stable machine `code`; `design` maps it in
`src/i18n/{ar,en}.ts`.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string;
                          fieldErrors?: Record<string, string[]> } };
```

`message` is English, developer-facing, for logs. **Never render it.**

Actions **return** errors; they never throw. A thrown error crosses the RSC boundary as an opaque
digest the UI cannot branch on.

Every `ErrorCode` has a real producer — there is no dead code in the union:

| code | produced by |
|---|---|
| `VALIDATION_ERROR` | Zod, plus the RPC's `EMPTY_CART` / `INVALID_ITEMS` / `INVALID_QTY` / `INVALID_CUSTOMER_DETAILS` |
| `UNAUTHENTICATED` | no session — checked in the action, and raised by the RPC |
| `INVALID_CREDENTIALS` · `EMAIL_ALREADY_REGISTERED` · `EMAIL_NOT_CONFIRMED` · `WEAK_PASSWORD` | Supabase Auth |
| `RATE_LIMITED` | Supabase Auth HTTP 429 (repeated sign-in / email sends) |
| `NOT_FOUND` | RPC `ORDER_NOT_FOUND` |
| `PRODUCT_UNAVAILABLE` · `REWARD_UNAVAILABLE` · `ORDER_NOT_PENDING` | the RPCs |
| `INTERNAL` | any unmapped Postgres error or unexpected throw |

There is deliberately **no `FORBIDDEN`**: per CONTRACT.md §3, another user's order id returns
`ORDER_NOT_FOUND`, indistinguishable from a nonexistent one, so the API cannot be used to discover
whether someone else's order exists.

Unmapped Postgres errors are logged in full (code, details, stack) and returned as bare `INTERNAL`.
No SQL, no stack trace, no raw database text crosses the wire. No empty `catch` anywhere.

---

## 5. The action contract (`design` codes against this)

```ts
// src/lib/actions/auth.ts   ('use server')
signUp({ email, password, fullName? }) : Promise<ActionResult<{ userId: string; needsEmailConfirmation: boolean }>>
signIn({ email, password })            : Promise<ActionResult<{ userId: string }>>
signOut()                              : Promise<ActionResult<null>>
getSessionUser()                       : Promise<ActionResult<{ userId: string; email: string | null } | null>>

// src/lib/actions/orders.ts ('use server')
placeOrder({
  items: { productId: string; qty: number }[],   // qty 1..20, max 20 lines, no duplicate productId
  redeemReward: boolean,
  customerName: string,                          // 1..80
  customerPhone: string,                         // 5..32, /^[0-9+()\-\s]+$/
  customerAddress: string,                       // 1..300
  clientToken: string,                           // uuid — REQUIRED, see below
}) : Promise<ActionResult<OrderSummary>>

confirmOrder({ orderId: string }) : Promise<ActionResult<OrderSummary>>

// src/lib/server/products.ts  — call from a Server Component
getProducts()          : Promise<Product[]>        // active only, price asc / slug asc
getProductBySlug(slug) : Promise<Product | null>   // null ⇒ notFound()

// src/lib/server/loyalty.ts   — call from a Server Component
getLoyaltyProgress() : Promise<{ confirmedOrdersCount: number;
                                 progressInCycle: number;    // 0..4 → filled dots
                                 availableRewards: number } | null>   // null ⇒ signed out
```

**`clientToken` is mandatory and the client must generate it.** One `crypto.randomUUID()` per
checkout attempt, **reused across every retry of that attempt** (store it when the checkout opens —
do NOT generate it inside the submit handler, or every retry gets a fresh token). It makes
`place_order` idempotent: same token + same user returns the existing order instead of creating a
second one. Without it a double-clicked Confirm leaves a stray pending order. It cannot be generated
server-side — a retry would get a new token and place a second order, which is the exact thing it
prevents.

**`placeOrder` accepts no price, no discount, no total, and no userId.** Those fields are not in the
Zod schema, so they cannot be parsed; and `place_order` has no parameter that would accept one. The
subtotal is recomputed in Postgres from `products` on every call. Identity comes from the session
cookie via `auth.uid()`.

`OrderSummary` is the authoritative order. The cart may show an optimistic subtotal while the user
shops; if the two disagree, render this one. All money is an integer in minor units (`3200` =
`32.00`) — divide by 100 at the render boundary only, never do money math in floats.

**An `OrderSummary` can go stale before it is confirmed.** `cancel_order` may reprice a *different*,
still-pending order back to full price (CONTRACT.md §8.1) — if the reward it revokes had already been
spent on a pending order, that order loses its discount, because nothing was confirmed and no burger
moved. Two rules for `design`, not optional:

1. **Render the result of `confirmOrder`, not the result of `placeOrder`.** `confirmOrder` returns
   the authoritative row. If the total changed, that is the number to show.
2. **Never send a total back.** You cannot — `confirmOrder` takes only `{ orderId }`, and there is no
   field that would accept a price. That is precisely why the repricing is safe rather than
   exploitable.

`OrderSummary` deliberately omits `user_id`, `reward_id` and `client_token` (the RPC's `to_jsonb(o)`
payload carries all of them). Fields are picked by hand in `toOrderSummary`, never spread — so a
column `db` adds to `orders` tomorrow is not automatically published to the browser.

Also importable from `@/lib/schemas` by `design`, for the cart's `+` button cap:
`MAX_QTY_PER_PRODUCT = 20`, `MAX_ORDER_LINES = 20`. **Do not retype the number** — if the UI caps at
a different value than the DB CHECK, the user gets a validation error on an action the interface told
them was allowed. `design` may also reuse the Zod schemas to validate the checkout form in the
browser; that is the same source of truth evaluated twice, not a second one.

---

## 6. Race conditions — the answer for each path

| Path | Two identical requests, same instant |
|---|---|
| `placeOrder` | Same `clientToken` → one order, returned to both callers. Even when both redeem a reward: the loser gets the winner's order, not an error. Guaranteed by the UNIQUE `(user_id, client_token)` index, not by application logic. |
| `placeOrder`, two *different* carts, both redeeming | The reward row is taken `FOR UPDATE`. The loser re-evaluates its `WHERE` after the winner commits, matches nothing, and gets `REWARD_UNAVAILABLE` — **and no order is created.** The reward is spent exactly once. Backed by `orders_reward_id_key` (UNIQUE), so two orders cannot point at one reward even if the function were wrong. |
| `confirmOrder` | Idempotent. The RPC gates on `update … where status = 'pending'` and increments the counter only in the branch that actually moved a row. Confirming twice returns the order and touches nothing — no double count, no free reward. |
| `confirmOrder` with another user's id | The RPC filters `auth.uid()` **inside the function body**, not merely via an RLS select policy. Returns `ORDER_NOT_FOUND`. |
| Product delisted mid-checkout | The whole order is rejected (`PRODUCT_UNAVAILABLE`). No line is silently dropped — a partial order is worse than a rejected one. |

I depend on the first three being enforced in Postgres and **cannot fix any of them from Node**: two
sequential `await`s in a server action are not a transaction. They were verified by reading
`supabase/migrations/0003_functions.sql` — but reading is not running (§8).

---

## 7. Data access

- Never `select('*')`. Explicit column lists.
- `products`' RLS SELECT policy is `using (true)`, **not** `using (active)` — deliberate, so a past
  order referencing a retired product doesn't render with a hole. **The consequence is ours: the
  menu query filters `.eq('active', true)` itself.** Nothing upstream does it.
- `getLoyaltyProgress` runs its two reads with `Promise.all`. Sequential awaits there would double
  the latency of every page showing the meter.
- Explicit `.eq('id', user.id)` even though RLS already scopes it — that is what lets Postgres use
  the PK index instead of scanning and filtering by policy.

---

## 8. What is NOT verified — read this before trusting any of the above

- **Nothing has been executed.** No Supabase project, no credentials. Every RPC call path is
  untested.
- **`npx tsc --noEmit` and `npm run build` have not been run**, because `node_modules` did not exist
  while this layer was written (`design` owns `package.json` and was mid-install). Nobody may claim
  compile-clean until it is actually run.
- Compile-clean would not mean working, even once it passes.

**Smoke tests that must pass once the user provisions Supabase**, before checkout is called done:

1. Sign up → a `profiles` row appears (if not, `on_auth_user_created` did not fire and every RPC
   will fail on the profiles FK).
2. Sign up with a `fullName` → `profiles.full_name` is populated. This proves the `full_name`
   metadata key matches what the trigger reads; a mismatch fails silently, with a null name.
3. The subtotal is computed from `products`, not from anything the client sent — post a price and
   confirm it is ignored.
4. Confirm the same order **twice** → `confirmed_orders_count` moves by exactly 1.
5. Reach 5 confirmed orders → exactly **one** reward is issued.
6. Two simultaneous `place_order` calls redeeming the same reward → exactly one wins; the loser gets
   `REWARD_UNAVAILABLE` and **no order exists** for it.
7. Two simultaneous `place_order` calls with the **same `clientToken`** → exactly one order exists,
   and both callers receive it.
8. `confirmOrder` with **another user's** order id → `NOT_FOUND`.
9. A delisted product in the cart → `PRODUCT_UNAVAILABLE`, and no order was created.
10. Sign out, then request `/checkout` → redirected to `/auth?redirect=/checkout`.
11. Let an access token expire, then navigate → still signed in (proves middleware refresh works).

---

## 9. Not built, on purpose

- **`cancelOrder`.** `cancel_order` exists in the database, but no wave-1 UI calls it. When
  `/account` gets a cancel button it needs an action wrapper — and whoever writes it must read
  CONTRACT.md §8.1 first, because the semantics are not the obvious ones:

  - The revoke keys on a **down-crossing of a multiple of 5** (`old_count % 5 = 0`, under a row lock
    on `profiles`), **not** on "expire the reward this order minted". Keying it on order identity is
    the exploit: cancel a *different* confirmed order, the count still down-crosses, and the reward
    survives — two RPC calls per free reward, forever.
  - `cancel_order` may **reprice a different, still-pending order** back to full price. So the
    wrapper must `revalidatePath('/', 'layout')` — any cached `OrderSummary` *or* `LoyaltyProgress`
    is stale after it returns, including for an order the user never touched.

  `getLoyaltyProgress` already counts only `available`, so it reports a revocation correctly with no
  change.
- **Order history** (`getOrders` / `getOrderById`) — needed by `/account` in a later wave.
- **Rate limiting, caching, background jobs** — not requested, not needed yet.
- **Any payment provider.** There is none and there will be none. Checkout is simulated by design
  (CLAUDE.md §Payment).

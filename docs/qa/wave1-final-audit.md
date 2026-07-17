# JAMR — Final Drift Audit, Wave 1 (build-order parts 1–6)

**Owner:** `qa`. **Audited against:** the real files, not the handoffs.
**Date:** 2026-07-13.

Method: every claim below was checked by reading the file it is about. Where a check requires a
running database, it is marked **UNVERIFIABLE** and no verdict is given. Nothing in this document
is inferred from a teammate's report.

---

## Verdict

**Parts 1, 3, 4, 6: PASS.** **Part 2: PASS (code review only — see §Unverifiable).**
**Part 5: NOT DONE** — it has no screenshots, and CLAUDE.md's definition of done requires them.

Four new findings, one HIGH. The four seams from `master-plan.md` are all clean. The specific
defects the lead asked me to hunt — RPC argument drift, `products.active`, the ledger invariant,
false verification claims, leaked ScrollTriggers — are **all clear**. The new findings are
elsewhere, and one of them has exactly the shape of every defect this project has produced.

---

## 1. Contract drift, character-for-character — **CLEAN**

The highest-value check, because nothing else in the stack catches it: `.rpc()` binds arguments by
name, so `redeemReward` for `p_redeem_reward` fails at runtime with a green build and a green
`tsc`.

I diffed the call sites against the `create function` signatures in
`supabase/migrations/0003_functions.sql` — **not** against `CONTRACT.md`, because the contract can
lie about the schema. Then I diffed `CONTRACT.md` against both.

| binding | SQL (`0003_functions.sql`) | call site | match |
|---|---|---|---|
| `place_order` arity/names | `:95–102` — `p_items`, `p_customer_name`, `p_customer_phone`, `p_customer_address`, `p_redeem_reward`, `p_client_token` | `src/lib/actions/orders.ts:76–83` via `PlaceOrderArgs` | ✅ all 6, all `p_`-prefixed |
| `p_items` element keys | `:178` reads `e ->> 'product_id'`, `e ->> 'qty'` | `orders.ts:77` emits `{ product_id, qty }` | ✅ snake_case inside the array too |
| `confirm_order` arg | `:404` — `p_order_id` | `orders.ts:137` — `{ p_order_id: orderId }` | ✅ |
| `orders.status` literals | `'pending'`/`'confirmed'`/`'cancelled'` | `src/lib/server/orders.ts:33` z.enum | ✅ |
| reward status literals | `'available'`/`'redeemed'`/`'expired'` | `src/lib/types/db.ts:38`; `server/loyalty.ts:43` filters `'available'` | ✅ |
| return payload keys | `order_payload` `:36–57` | `rpcOrderPayloadSchema` `server/orders.ts:30–46` | ✅ incl. `items[].slug` |

**Why it held**, and this is worth keeping: `PlaceOrderArgs` (`src/lib/types/db.ts:169–176`) turns
the by-name binding into a **compile-time** check. The args object is annotated with the interface
before it is passed to `.rpc()`, so a camelCase key is now a type error rather than a silent
runtime failure. That is the correct structural answer to this class of bug, and it should be
copied on every future RPC.

Second structural defence, also correct: `parseOrderPayload` (`server/orders.ts:54`) **parses**
the RPC response with Zod instead of asserting `as RpcOrderPayload`. A renamed column fails loudly
as `INTERNAL` instead of arriving `undefined` and rendering `NaN` beside a currency symbol.

---

## 2. `products.active` — **CLEAN**

The DB's SELECT policy is deliberately `using (true)`, not `using (active)`, so that order history
does not render with holes where a retired product used to be. The application must therefore do
the filtering itself. It does, on both storefront paths:

- `src/lib/server/products.ts:44` — `getProducts()` → `.eq('active', ACTIVE_ONLY)`
- `src/lib/server/products.ts:74` — `getProductBySlug()` → `.eq('active', ACTIVE_ONLY)`

`ACTIVE_ONLY = true` is a named constant (`:32`) sitting under a comment that states *why* the
policy will not do this for you. There is no third query against `products` anywhere in the
codebase, so there is no unfiltered path.

---

## 3. The loyalty ledger invariant — **PRESENT AND CORRECT (as SQL)**

`supabase/README.md` §4.7h is intact after all four rounds of revoke/restore fixes:

```sql
having count(r.id) filter (where r.status <> 'expired') <> p.confirmed_orders_count / 5;
-- EXPECT: ZERO ROWS.
```

Correct on both halves. `confirmed_orders_count / 5` is Postgres **integer** division, which is
floor for non-negative operands, and `confirmed_orders_count` has a `>= 0` CHECK — so it is
genuinely `floor(n/5)` and not a rounding accident. `filter (where status <> 'expired')` counts
`available` + `redeemed`, which is exactly the set §8.1 defines as live. It is an equality, not a
bound, so it fails on a mint *and* on an over-revoke.

The ordering fix from round four is in place: RESTORE (`0003_functions.sql:576–584`) runs **before**
REVOKE (`:600–701`), with a 20-line comment at `:554–575` explaining that the reverse order was the
JAMR-6 mint. The revoke keys on `v_old_count % 5 = 0` (`:620`) — the down-crossing — not on which
order is being cancelled, which was the JAMR-1 exploit.

**I did not run this.** See §Unverifiable.

---

## 4. Honesty audit — **CLEAN**

I went looking for a place where unexecuted SQL is stated as verified. There isn't one.

| file | what it says | verdict |
|---|---|---|
| `supabase/CONTRACT.md:4–5` | "written but **NOT EXECUTED** — there is no Supabase project and no credentials" | honest |
| `supabase/CONTRACT.md` §11 | "**None of this SQL has been executed.** … validated by review only." | honest |
| `supabase/README.md:6–7` | "**this SQL has never been executed.** … validated by review, not by running it" | honest |
| `docs/api-plan.md:6` | "**Verification status: NOTHING HAS BEEN RUN.**" | honest |
| `docs/api-plan.md:253` | "Nothing has been executed… Every RPC call path is untested." | honest |
| `docs/qa/master-plan.md:77` | part 2 marked "**Unverifiable this wave**" | honest |

`CONTRACT.md` also does something better than honesty: it **retracts its own earlier false claims
in writing** (§6 "Correction to an earlier version of this document"; §10 strikethroughs on the
"rewards never expire" and "revocation is hostile" assumptions). A contract that records where it
was wrong is worth more than one that was never wrong.

Two softenings, both minor, both worth naming:

- `README.md:165` — "**An untested policy is not a policy.**" Correct, and it is the right
  sentence — but it sits in a doc describing tests nobody has run. It reads as a warning; it is
  actually a description of the current state. Nothing to fix, but do not let it become reassuring.
- `master-plan.md:254` — the audit log records part 2 as "**PASS** with 1 HIGH + 1 MEDIUM". "PASS"
  is doing work it has not earned for a part that has never executed. Reworded in §7 below.

---

## 5. ScrollTriggers and reduced motion — **CLEAN**

CLAUDE.md calls leaked ScrollTriggers "the #1 bug in this kind of site". Every GSAP call site:

| file | context | cleanup |
|---|---|---|
| `components/sections/Hero.tsx:29` | `gsap.context` | `:69` `ctx.revert()` |
| `components/sections/Origin.tsx:17` | `gsap.context` | `:41` `ctx.revert()` |
| `components/sections/Experience.tsx:18` | `gsap.context` | `:76` `ctx.revert()` |
| `components/sections/IngredientShowcase.tsx:158, 289` | `gsap.matchMedia` **+** `gsap.context` | `:305–308` **both** reverted |
| `components/chrome/Nav.tsx:32` | `gsap.context` (wraps a `ScrollTrigger.create`) | `:64` `ctx.revert()` |
| `components/chrome/Loader.tsx:39` | `gsap.context` | `:73` `ctx.revert()` |
| `components/chrome/MobileMenu.tsx:33` | `gsap.context` | `:60` `ctx.revert()` |
| `components/ui/RouteStage.tsx:31` | `gsap.context` | `:43` `ctx.revert()` |
| `app/template.tsx:45` | `gsap.context` | `:66` `ctx.revert()` |

No `gsap.to({scrollTrigger})` or `ScrollTrigger.create` outside a context anywhere. Plugins are
registered once, client-only, behind `typeof window !== 'undefined'` (`src/lib/gsap.ts:32–40`).

`template.tsx` refreshes correctly: `ScrollTrigger.refresh()` fires in the timeline's `onComplete`
(`:61`), **after** the wipe finishes — not mid-transition, which would measure trigger positions
against a moving layout. The reduced-motion branch (`:39–43`) skips the overlay entirely and still
refreshes. `I18nProvider.tsx:61` refreshes after a language switch, as CLAUDE.md requires.

**The mobile-dead-showcase defect is genuinely fixed and I verified it visually.**
`IngredientShowcase.tsx:177` declares `isMobile: '(max-width: 1023px)'` — a condition that is never
read in the body and exists solely so that the matchMedia condition set *covers the space*. I read
`screenshots/06-stack-ar-mobile.png`: the stacked reveal runs, the layers are separated, the
Arabic ingredient list renders in the Arabic display face with Latin digits, RTL-aligned. It is
alive.

The reduced-motion path is structurally sound and it is worth stating why, because it is the
inverse of the bug that shipped: hidden rest states are gated behind `html.motion`
(`globals.css:433–473`), a class added by a blocking script **only** when JS runs *and* the user has
not asked for reduced motion (`app/layout.tsx:90`). So when the class is absent — no JS, a 404'd
chunk, reduced motion — **nothing is hidden** and the page is simply there. Content is never
stranded at `opacity: 0` waiting for an animation that will not arrive. That is the correct
polarity, and it is the fix for the invisible-headlines class of bug.

---

## 6. Findings

### JAMR-8 — **HIGH** — `placeOrder` spends a reward and never revalidates. Owner: `api`.

`src/lib/actions/orders.ts` — `confirmOrder` calls `revalidatePath('/', 'layout')` at **`:155`**.
`placeOrder` **calls nothing** (`:49–108`).

But `place_order` mutates loyalty state too. `0003_functions.sql:364–382` — step 6, "Burn the
reward" — flips `loyalty_rewards.status` from `'available'` to `'redeemed'`. `availableRewards`
in `getLoyaltyProgress()` (`server/loyalty.ts:39–43`) counts exactly `status = 'available'`, so
that number **drops** the moment an order redeems a reward.

Nothing tells Next. Every server-rendered loyalty surface — the cart drawer and the account page,
both of which CLAUDE.md requires to show the meter — keeps rendering the cached "1 reward
available" after the reward has been spent. The user sees a reward they no longer have, ticks "use
my reward" on the next checkout, and gets `REWARD_UNAVAILABLE` — which `CONTRACT.md:438–440` warns
"looks like a bug and is not". It will look like a bug because the UI told them the reward was
there.

**Mechanism — and this is the point.** Both functions are individually correct. `confirmOrder`
revalidates because confirming obviously changes the counter. `placeOrder` doesn't, because placing
an order doesn't *look* like a loyalty mutation. The defect is in the **asymmetry between two
correct-looking blocks**, which is the identical shape to the mint-vs-revoke bug and the
revoke-vs-restore bug. Same failure, third time.

**Fix (api):** add `revalidatePath('/', 'layout')` to `placeOrder` — unconditionally, not only when
`redeemReward` is true. The server is authoritative on whether a reward was actually spent
(`rewardApplied` comes back on the payload), and a conditional revalidate re-creates the same
asymmetry one level down.

**What would have caught it:** a rule that says *every action that calls an RPC which writes
`loyalty_rewards` or `profiles` must revalidate*, checked by listing the RPCs' write-sets and
diffing against the revalidate calls. `CONTRACT.md` already documents the write-sets; nobody diffed
them.

---

### JAMR-9 — **MEDIUM** — `cancel_order` is an orphaned RPC, and it is the dangerous one. Owner: `api`.

`CONTRACT.md` §3 defines `cancel_order(p_order_id uuid)`. `0003_functions.sql:506–713` implements
it and grants EXECUTE to `authenticated` (`:731`). **`src/lib/actions/orders.ts` has no
`cancelOrder`** — it exports `placeOrder` and `confirmOrder` only.

Out of scope for parts 1–6, so this is not a defect today. It is flagged because of *which* RPC it
is. `cancel_order` is the one function in the schema with genuinely surprising side effects, and
`CONTRACT.md` §8.1 hands `api` two non-negotiable obligations that come with it:

1. it can flip a reward the user is currently looking at to `'expired'` → **any cached loyalty
   state is stale after `cancel_order`**;
2. it can **reprice a different order — pending or confirmed** — changing a `total_cents` the
   client is holding.

Whoever writes `cancelOrder` in part 11 will be writing the action whose contract is hardest to
honour, and — per JAMR-8 — this codebase has already missed the revalidation obligation once on an
easier one. Write it with §8.1 open.

---

### JAMR-10 — **MEDIUM** — part 5 has no screenshots, so it is not done. Owner: `design`.

`screenshots/` contains `03-chrome-*`, `04-hero-*`, `06-stack-*` (+ `06-stack-reduced-*`, a nice
addition nobody asked for), and `09-menu-*`. There is **no `05-*` set**.

Part 5 is *Brand intro + Experience stats*. Both components exist and are composed into the home
page — `src/app/page.tsx:17–18` renders `<Origin />` and `<Experience />`. CLAUDE.md's definition of
done: *"Screenshots taken, at both viewports and both languages, and you looked at them."* Part 5
has none, at either viewport, in either language.

The `06-stack-*` shots are viewport-framed on the pinned showcase, so they do not incidentally
cover Origin or Experience either. This part cannot be called done under the project's own rule.
Four PNGs (`05-*`, EN/AR × desktop/mobile), read, and it can.

---

### JAMR-11 — **MEDIUM** — `middleware.ts` imports validated env, then bypasses it. Owner: `api`.

`src/middleware.ts:4`:
```ts
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env';
```
`src/middleware.ts:48–49`:
```ts
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
```

The import is **never used**. The non-null assertions bypass exactly the guard that
`src/lib/supabase/env.ts:15–24` exists to provide — a loud module-load throw with a fix-it message
(*"Copy .env.example to .env.local and fill it in"*). With the var missing, middleware instead
builds a Supabase client on `undefined` and fails opaquely, **on every matched route** (the matcher
at `:109` is nearly the whole site).

Fix: delete the `process.env` reads, use the two imported constants. One line each.

**Note the gate behaviour, because it is the theme of this project:** `npm run lint` passes over a
dead import (I re-ran it — *"✔ No ESLint warnings or errors"*), and `tsc` passes because
non-null-asserted `string | undefined` is `string`. Three green gates over a line that disables the
project's own env validation.

---

### JAMR-12 — **LOW** — `09-menu-*.png` are screenshots of a placeholder. Owner: `design`.

`src/app/menu/page.tsx` is four lines: `return <RouteIntro section="menu" />`. It is a
route-transition stub. Part 9 is *"`/menu` grid + product cards + cart drawer"* and is not built.

Four PNGs named `09-menu-*` in a directory whose naming convention is *build-part number* assert
that part 9 shipped. They are legitimate artefacts of part 3 (the transition shell) under the wrong
number. Renumber to `03-` or delete.

---

### JAMR-13 — **LOW** — the comment guarding `MASK_SHIFT` misstates the number it guards. Owner: `design`.

The **code is correct and consistent**: `globals.css:458` is `transform: translateY(125%)` and
`src/lib/gsap.ts:54` is `export const MASK_SHIFT = 125`. They agree.

The **comments do not**. `globals.css:446` — *"The 115% here is a PERCENTAGE"*. `src/lib/gsap.ts:63`
— *"globals.css parks `[data-mask]` at `translateY(115%)`"*. Both are stale; the value is 125.

This is a LOW that could become a HIGH. It sits in the one block whose entire stated purpose is
*"The 125 is duplicated there as MASK_SHIFT; the two must agree"* (`globals.css:456`) — and the
comment two lines above it says 115. A future reader reconciling code to comment sets the CSS to
115%, and `MASK_SHIFT`'s own docstring (`gsap.ts:47–53`) explains why that breaks: Arabic needs
116% to clear its descenders against the `.mask-line` padding, so at 115% **the Arabic headlines
peek below their masks at rest**. The comment is a loaded gun pointed at the bug it was written to
prevent. Change both `115` → `125`.

---

### JAMR-14 — **INFORMATIONAL** — the entire `api` layer is orphaned surface.

No `.tsx` file in the project calls `getProducts`, `getProductBySlug`, `getLoyaltyProgress`,
`placeOrder`, `confirmOrder`, `signIn`, `signUp`, or `signOut`. Zero call sites.

This is expected — the consumers are parts 9–12 — but it should be said out loud, because it means
**Seam B (`api` → `design`) is entirely unexercised.** Every prop-name, nullability and error-shape
drift between the server layer and the UI is still latent, and none of it will surface until part 9.
`OrderSummary.confirmedAt` and `rewardApplied` are nullable/boolean in ways a component will get
wrong on first contact.

---

## 7. Unverifiable — no live database. I did not run any of this.

There is no Supabase project and no credentials. Everything below is **unexecuted SQL, reviewed by
reading it.** Not one of these has been observed to behave as described:

- Every RLS policy on all five tables.
- `place_order` — subtotal recomputation, `FOR UPDATE SKIP LOCKED` reward claim, the
  `pg_advisory_xact_lock` idempotency path.
- `confirm_order` — the conditional-UPDATE idempotency gate and the multiple-of-5 mint.
- `cancel_order` — the down-crossing revoke, the restore-before-revoke ordering, the reprice
  fallback.
- **The ledger invariant §4.7h itself.** The query is correct as written. It has returned no rows
  because it has never been run.
- All 10 smoke tests in `README.md` §4.

The four rounds of loyalty fixes (JAMR-1, JAMR-2, JAMR-6, JAMR-7) were each verified by **reading
the SQL and tracing the sequence by hand**. That is not the same as running it, and a hand-traced
concurrency proof is precisely the kind of proof that has been wrong twice already on this project.
**Do not call parts 11–12 done until §4.7h has actually returned zero rows against a real
database.**

Corrected wording for `master-plan.md:254`: part 2's verdict is not "PASS" — it is
**"REVIEWED, UNEXECUTED"**.

---

## 8. The debrief — what actually went wrong on this project

Six serious defects. They look unrelated. They are the same defect.

### The instances, with mechanism

**1. The loyalty ledger — four rounds.**
Round 1: `confirm_order` minted a reward on an up-crossing of a multiple of 5; `cancel_order`
decremented the counter and revoked nothing. Both blocks read as correct in isolation. The *pair*
was asymmetric, and an asymmetric ledger is a mint: confirm → cancel → confirm → cancel, three RPC
calls per free 50%-off reward, forever. Round 4 (JAMR-6): mint and revoke were now symmetric, but
inside `cancel_order` the RESTORE block ran *after* the REVOKE block. Each block, again,
individually correct. The order between them was the bug — restore handed back the very reward
revoke had failed to find, because the order being cancelled had already been flipped to
`'cancelled'` and was therefore invisible to revoke's `'pending'` predicate.
**Mechanism: two correct blocks, wrong interaction.**

**2. Every headline on the site was invisible.**
`globals.css` parked `[data-mask]` at `translateY(125%)`. GSAP cannot read a percentage transform
back out of a computed style — it parses the matrix into **pixels**, records `y: <px>`, and leaves
`yPercent` at 0. So `.to({ yPercent: 0 })` tweened 0 → 0. A no-op. The lines never came back.
`build`, `tsc` and `lint` were **all green**, because the broken rest state was gated behind
`html.motion` — and the only path that failed was the *normal* one. Reduced motion worked. No-JS
worked. The gates tested everything except what users see.
**Mechanism: green gates over the one path nobody automated.**

**3. The entire Arabic type block was dead CSS.**
It lived in `@layer components`. Tailwind's utilities live in `@layer utilities`, which **outranks**
it. Every Arabic font-family, line-height and letter-spacing rule lost to a utility class. Arabic
was being set in Latin metrics with `letter-spacing: -0.035em` — negative tracking on a cursive
script, prising apart joins that must not come apart. It rendered. It just rendered wrong, in the
language fewer people on the team could read.
**Mechanism: a correct rule in the wrong cascade layer. Silent — CSS has no type system.**

**4. The signature section was dead on mobile.**
`gsap.matchMedia` invokes its callback only when **at least one named condition matches**. The
conditions declared were `isDesktop: (min-width: 1024px)` and `reduced: (prefers-reduced-motion)`.
A phone at normal motion matched **neither** — so GSAP never ran the function, and the whole mobile
branch inside it was dead code. The showcase rendered an un-exploded burger and an ingredient list
frozen at `opacity: 0`. The most-polished section on the site, invisible, on the most-used viewport.
Nobody found out because nobody had ever scrolled to it on a phone.
**Mechanism: a condition set that did not cover its own space.**

**5. A tooling defect nobody could see from inside.**
Two agents were granted `Bash` but not `PowerShell`. On this machine Bash fork-fails
(`0xC0000142`). They had **no working shell at all** — and wrote code they could never compile,
against a definition of done that required them to run it. The agent that hit it reported it
plainly instead of faking a test run, which is the only reason it is visible at all.
**Mechanism: the environment lied, and the contract assumed it wouldn't.**

**6. The product images were fake.**
Three byte-identical files. The generation script exited `0` and printed six ✓.
**Mechanism: a script that reported success without checking its own output.**

### The common thread

**Green gates proved nothing, and every defect lived in the seam between two correct parts.**

Not one of these six was a part that was *wrong*. Every individual block — the mint, the revoke, the
restore, the CSS rule, the media query, the tween, the script — was defensible on its own terms and
would have passed review on its own. The defects were in the **relationships**: mint↔revoke,
revoke↔restore, rule↔layer, condition↔condition-set, tween↔stylesheet, script↔its own output.

And every gate we had was a *per-part* gate. `tsc` type-checks a file. `lint` lints a file. `build`
compiles the tree. **None of them can see a relationship.** Three green gates sat on top of a site
with no headlines, no Arabic typography, and a dead signature section — and they were not
malfunctioning. They were answering the question they were asked. Nobody had asked the question that
mattered.

The two defects that *were* caught early were caught by the two checks that look at a relationship:
the `PlaceOrderArgs` interface, which makes the RPC's by-name binding a compile error; and
`parseOrderPayload`, which parses the response instead of asserting it. Both convert a seam into a
thing a machine can check. That is the whole lesson, and it generalises:

> **A seam that no gate can see is a seam that will fail. Either give it a gate, or look at it with
> your eyes — but do not let a green build stand in for either.**

The corollary, which is the one this team actually keeps violating: **when two blocks are each
correct and the system is still wrong, the bug is in the order or the symmetry between them.**
That sentence would have shortened the loyalty ledger from four rounds to one, and it caught JAMR-8
in this audit.

---

## 9. What I changed in the team's instructions

Four lessons met the threshold in the protocol (occurred twice, or caused a real defect the first
time) and are now in the `LESSONS` section of `C:\Users\ahmad\.claude\team-protocol.md`, where every
agent reads them before starting. Reported to the user in full. Nothing was deleted; no guardrail
was weakened.

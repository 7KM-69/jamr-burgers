# JAMR — QA Master Plan, Wave 1

**Owner:** `qa` (qa-orchestrator). **Scope:** CLAUDE.md build-order parts **1–6**.
**Authority:** every criterion below is derived from `CLAUDE.md` → *Definition of done for a part*
and *Guardrails*. Where I add a criterion CLAUDE.md does not state, it is marked **[QA]** and is
advisory, not blocking.

**Rules of engagement.** I do not build and I do not fix. I read the real files, not the handoff
summaries. A handoff that says "matches the contract" is precisely the claim this document exists
to disbelieve. Defects are reported to the lead with a file path, a line, and the owning teammate.

**Teammates & lanes:** `db` = `supabase/**` · `api` = `src/lib/supabase/**`, `middleware.ts`,
`src/lib/actions/**` · `design` = `src/app/**`, `src/components/**`, `src/i18n/**`, `scripts/shot.mjs`.

---

## 0. Global gates — every part, every teammate

A part is **not done** until all of these pass. Each has a command I can actually run; "looks
fine" is not a verification.

| # | Gate | How QA verifies | Fails when |
|---|---|---|---|
| G1 | Build clean | `npm run build` | any error; warnings triaged, not ignored |
| G2 | Types clean | `npx tsc --noEmit` | any error, including in `scripts/` |
| G3 | Lint clean | `npm run lint` | any error |
| G4 | Screenshots exist | `Get-ChildItem screenshots\` | fewer than 4 PNGs for the part (2 viewports × 2 langs) |
| G5 | Screenshots **viewed** | teammate must state, per image, what they judged. QA re-reads the PNGs independently | teammate claims done with no image read, or the image contradicts the claim |
| G6 | Viewports | image dimensions are 1440×900 and 390×844 | any other size; horizontal scrollbar at 390 |
| G7 | AR + EN, RTL | `<html lang dir>` flips; layout mirrors | Latin font rendering Arabic; physical props (`ml-`, `left-`, `pl-`) in layout |
| G8 | Reduced motion | grep `prefers-reduced-motion` / `gsap.matchMedia` in every animated component | any GSAP timeline with no reduced-motion branch |
| G9 | No leaked ScrollTriggers | every `gsap` call site is inside `gsap.context()` with `.revert()` in cleanup | a `ScrollTrigger.create` / `gsap.to` with `scrollTrigger` outside a context, or a `useEffect` with no cleanup |
| G10 | No hardcoded user-facing strings | grep JSX text nodes; every string traces to `src/i18n/{ar,en}.ts` | any literal copy in a component |
| G11 | No raw hex in components | `Select-String -Pattern '#[0-9a-fA-F]{3,8}' src\components src\app -Include *.tsx` | any hit outside `globals.css` / Tailwind config |
| G12 | Brand name single-sourced | `Select-String -Pattern 'JAMR\|جمر' src -Include *.tsx,*.ts` | any hit outside `src/lib/brand.ts` and `src/i18n/*` |
| G13 | No client-side price/loyalty math | grep `* 0.5`, `/ 2`, `.reduce(`, `price_cents` in `'use client'` files | any discount, subtotal, or eligibility computed in the browser |
| G14 | Service-role key contained | `Select-String -Pattern 'SERVICE_ROLE' -Path . -Recurse` | any `NEXT_PUBLIC_` prefix on it; any hit in a client component; missing `import 'server-only'` in the module that holds it; `.env*` not gitignored |
| G15 | No payment provider | grep `stripe\|moyasar\|paypal\|tap\|checkout.session\|payment_intent` | any hit, in code or in `package.json` |
| G16 | Nothing from cravburgers.shop | grep `cravburgers` across repo; check `next.config` `images.remotePatterns` | any URL, any asset, any remote pattern pointing there |
| G17 | `next/image` only | `Select-String -Pattern '<img' src -Include *.tsx` | any raw `<img>` |
| G18 | No unapproved deps | read `package.json` | any state-management lib, component lib, or animation lib other than GSAP/Lenis |

**On G5.** This is the gate teammates will skip. CLAUDE.md is explicit — *"Never claim a part is
finished without a screenshot you have actually viewed."* If a completion report contains no
evidence the PNG was read, I treat the part as **not done** regardless of what the code looks like.

**Screenshot naming — a standing ambiguity.** CLAUDE.md specifies
`screenshots/NN-slug-{lang}-{viewport}.png` but its own example (`03-hero-ar-desktop.png`) numbers
the hero `03` while the build order makes it part **4**. **QA ruling:** `NN` = the build-order part
number (hero = `04`). `design` owns `shot.mjs` and should apply this; flagged so two teammates do
not number the same directory two different ways.

---

## 1. Per-part acceptance — wave 1

### Part 1 — Scaffold, tokens, fonts, GSAP + Lenis, shot script · owner `design`
Deliverable: Next 15 App Router + TS + Tailwind; tokens as CSS vars; `next/font`; Lenis synced to
ScrollTrigger; `scripts/shot.mjs`.

Fails if:
- Any of `--ink --ember --flame --ash --bone` is missing from `globals.css`, or is not exposed
  through the Tailwind theme (components must never reach for a raw value).
- `src/lib/brand.ts` does not exist, or the brand string appears anywhere else (G12).
- Arabic is rendered by a Latin face, or AR display/body are not a distinct pairing from Latin.
- Lenis is not synced to ScrollTrigger — verify: a `lenis.on('scroll', ScrollTrigger.update)` and a
  `gsap.ticker.add` driving `lenis.raf`. Without both, scroll-triggered animation and smooth scroll
  drift apart and every downstream part inherits the bug.
- GSAP plugins registered more than once, or registered in a server component.
- `shot.mjs` does not wait for the loader to disappear (`networkidle` alone is not sufficient — the
  loader can still be on screen), or cannot shoot both languages, or hardcodes one viewport.
- **[QA]** `.gitignore` does not cover `.env*`.

### Part 2 — Supabase schema, RLS, RPCs, seed · owner `db`
Deliverable: SQL under `supabase/`, plus `supabase/CONTRACT.md`.

**Unverifiable this wave** — there is no live database (see §3, R1). Every criterion below is a
*code-review* criterion. Nothing here is a behavioral claim.

Fails if:
- Any of the 5 tables (`profiles`, `products`, `orders`, `order_items`, `loyalty_rewards`) lacks
  `enable row level security`.
- Any table has a blanket `for all` policy instead of per-operation policies.
- Any policy keys on a client-supplied value rather than `auth.uid()`.
- `products` is not world-readable-and-nobody-writable.
- Any column referenced in an RLS predicate is unindexed; any FK is unindexed.
- Money is not integer cents (`price_cents`, `subtotal_cents`, `discount_cents`, `total_cents`,
  `unit_price_cents`); any timestamp is `timestamp` rather than `timestamptz`.
- `place_order` trusts a price from its argument instead of re-reading `products.price_cents`.
- `place_order` does not take `SELECT … FOR UPDATE` on the reward row before redeeming it.
- `confirm_order` is not idempotent — confirming twice must not double-increment
  `confirmed_orders_count` nor issue two rewards. Look for a guarded `where status = 'pending'`
  and a row-count check, not a bare `update`.
- The reward is not issued exactly when the **new** count hits a multiple of 5.
- A discounted order does not itself count toward the next cycle (CLAUDE.md loyalty rule 4).
- Cancelling a confirmed order does not decrement the counter (rule 1).
- Status string literals differ by even one character from
  `'pending' | 'confirmed' | 'cancelled'` and `'available' | 'redeemed' | 'expired'` and
  `'half_off'`.
- Seed does not produce exactly **6** active products with all quick-detail fields populated
  (`bun`, `patty`, `spice_level`, `kcal`, `protein_g`, `prep_min`).
- `supabase/CONTRACT.md` is prose rather than literal copy-pasteable names, types, nullability, and
  RPC signatures.

### Part 3 — Nav + loader + page-transition shell · owner `design`
Fails if: loader flashes or shifts layout on handoff to hero; loader animates under reduced motion
(a fade is the only permitted motion); transition overlay lives outside `template.tsx`; incoming
page's triggers are killed *before* the transition completes, or `ScrollTrigger.refresh()` is not
called after it; nav is not keyboard-navigable with a visible focus ring; the cart-count and
auth/account buttons do not exist (they may be non-functional shells this wave — they must not be
invented data); the AR/EN toggle does not call `ScrollTrigger.refresh()` after switching.

### Part 4 — Hero · owner `design`
Fails if: headline is not a genuinely large `clamp()`; hero image is a raw `<img>`; CTA does not
route to `/menu`; entrance animation blocks clicking the CTA; anything animates `width`/`height`/
`top`/`left`/box-shadow; AR hero breaks the type scale or overflows at 390px.

### Part 5 — Brand intro + Experience stats · owner `design`
Fails if: origin copy is CRAV's story rather than ours; stat numbers are hardcoded in the component
rather than in i18n; digits are rendered as Arabic-Indic (CLAUDE.md: Latin digits in both
languages); the stat row collapses badly at 390px.

### Part 6 — Ingredient showcase · owner `design` — **the signature moment**
Held to a higher bar than any other part; CLAUDE.md calls it "the single most-polished section".

Fails if: pinning is not desktop-only; there is no stacked-reveal degradation on mobile; the pin
is not torn down on route change (G9 — this is the most likely place in the whole build to leak a
ScrollTrigger); layer labels are hardcoded rather than i18n; horizontal drift does not invert its
x-direction under RTL; the section scrubs below ~60fps because something other than `transform`/
`opacity` is animated; reduced motion does not land every layer in its final, readable state.

---

## 2. Contract registry — where this team will actually break

Four seams. For each: who owns it, what I expect to drift, and how I detect it.

### Seam A — `supabase/CONTRACT.md` → `api` (db → backend)
The spine. Everything downstream is built on it.

**Expected drift:**
1. **`snake_case` → `camelCase`.** Postgres returns `price_cents`, `confirmed_orders_count`,
   `spice_level`, `image_path`, `user_id`. TypeScript instinct is to write `priceCents`,
   `confirmedOrdersCount`, `userId`. If `api` maps them, the mapping must be *one* function in one
   file and the UI must never see both spellings. If `api` does not map them, the UI must use
   snake_case everywhere. **Either is fine. A mix is the defect.**
2. **RPC argument names.** `place_order(items, redeem_reward)` and `confirm_order(order_id)` —
   Supabase `.rpc()` passes args **by name**, so `redeemReward` or `orderId` silently fails at
   runtime with no type error. This is a wave-3 landmine being planted in wave 1.
3. **Invented columns.** `api` writing a select against a column `db` never created — most likely
   `orders.total_cents` vs a computed total, or a `profiles.email` that lives in `auth.users`.

**Detection:** extract the column list from the actual SQL DDL (not from CONTRACT.md — the contract
can lie about the schema), extract every identifier `api` selects/inserts, and diff the two sets.
Any name in `api` not in the DDL is a defect; any RPC arg not matching the SQL signature is a defect.

### Seam B — product & order types → `design` (api → UI)
**Expected drift:** `design` renders a field no endpoint returns. Highest-risk fields this wave:
`spice_level` (is it `int 1-3` or `text 'mild'|'hot'`? the UI will want to render pips), `prep_min`
(minutes as int — the UI will want "12 min", and the unit must not be re-guessed), and the
nullability of `orders.reward_id` / `loyalty_rewards.order_id`, both of which are nullable in the
data model and will crash a non-optional prop on the first empty row.

**Detection:** diff the props of every product/order-consuming component against the type `api`
exports. Any prop with no source is orphaned surface — either a missed requirement or dead weight.

### Seam C — seed slugs ↔ `public/products/<slug>.jpg` (db ↔ design)
**The classic.** `db` seeds `products.slug` and `products.image_path`; `design` puts files on disk.
Nobody owns both sides, so nobody checks. A slug of `smash-classic` and a file named
`classic-smash.jpg` produces six broken images and `next/image` will throw, not degrade.

**Second-order defect:** it is currently **undecided** whether the UI resolves the image from
`products.image_path` (the DB column, per CLAUDE.md's data model) or by convention from
`products.slug` (per the lead's `public/products/<slug>.jpg` framing). **These are two different
contracts and both teammates will assume the other one.** This needs a ruling before part 9 — I
recommend: **the DB's `image_path` is authoritative, and the seed sets it to `/products/<slug>.jpg`
so the convention and the column agree by construction.** Raised now, not at part 9.

**Detection:** parse the 6 slugs and 6 `image_path` values out of the seed SQL, list
`public/products/`, and set-diff. Exact string match, case-sensitive — Windows will hide a case
mismatch that Vercel will not.

### Seam D — the i18n key surface (`design`, internal, but it breaks silently)
`src/i18n/en.ts` and `src/i18n/ar.ts` must have **identical key sets**. A key present in `en` and
missing in `ar` renders `undefined` — and only in Arabic, which is the language nobody screenshots
last.

**Detection:** typed as `Record<keyof typeof en, string>` so `tsc` catches it (I will check that the
type is actually enforced, not just `as const` on both). Plus: recursively diff the two key sets and
grep the AR file for Latin-only values that were never translated.

---

## 3. Known risks — stated plainly

**R1 — Nothing is executable against a database this wave. This is the headline risk.**
There is no Supabase project and no credentials. The RPCs and RLS policies **cannot be run, and
therefore cannot be verified**. `place_order`'s `FOR UPDATE` lock, `confirm_order`'s idempotency,
and every RLS policy are, this wave, *unexecuted SQL*. When `db` reports part 2 done, that report
is a claim about **code review, not behavior** — and I will describe it as such in every status I
give. Note that `database-architect.md`'s own definition of done requires "those policies were
actually tested against another user's rows" and `explain analyze` on hot queries; **neither is
possible here**, so `db` will either falsely claim it did them or correctly report itself blocked.
Watch for the false claim. *Mitigation:* the loyalty logic must be re-verified against a real
database before parts 11–12 are called done. Until then it carries an explicit "unverified" label.

**R2 — `api` cannot exercise its endpoints either.** `backend-architect.md` rule 1 is "never claim
done without exercising the code" and demands a pasted real response. With no credentials it must
say **"I did not run this."** If its report instead implies verification, that is a protocol
violation and I will call it.

**R3 — Wave-1 parts 1, 3–6 are static; the data seams are being *written* now but only *exercised*
in wave 3.** Every drift planted this wave stays invisible until part 9. That is exactly why Seams
A–C get audited on landing, not when they first break.

**R4 — `design` has no real product images.** It will need to generate or place 6 images. If it
invents slugs to name them before `db`'s seed lands, Seam C is broken on arrival. Sequencing matters
more than it looks.

**R5 — Three agents, one `package.json` and one `tsconfig.json`.** `design` scaffolds; `api` will
want `@supabase/ssr`. Concurrent writes to shared config files are a real collision risk with three
agents running in parallel. **Ruling: `design` owns `package.json`; `api` requests dependencies
rather than adding them.** Flagging to the lead now, before the conflict rather than after.

**R6 — `--ash: #17151300` in CLAUDE.md is very likely a typo** — 8-digit hex with alpha `00` is
fully transparent, which is useless for "warm greys for cards/borders". `design` will either copy
the typo (invisible borders) or silently "fix" it (an unrecorded brand decision). **This is a
question for the user, not a thing to guess.** Recommendation: `#171513` opaque, with the alpha
variants derived as `color-mix()` steps.

**R7 — `/spices` is in the route list but has no content spec anywhere** in CLAUDE.md. Out of wave
1, but it will surface. Not inventing a spec for it; noting it.

**R8 — Screenshot quality is self-assessed.** G5 depends on a teammate honestly reading its own
PNG. I independently re-read the images rather than trusting the claim — but I can only do that for
parts that produce them, and my judgment of "Awwwards-grade" is not the user's. The polish bar is
the one criterion in this document I cannot make objective. It stays with the user.

---

## 4. Spec defects found in CLAUDE.md itself
Raised to the lead for a user ruling, not decided by me:
1. **R6** — `--ash` alpha-zero hex.
2. **Seam C** — `image_path` column vs `<slug>.jpg` convention: two contracts, no ruling.
3. **Screenshot `NN`** numbering contradicts its own example (§0).
4. **R7** — `/spices` has no content spec.

---

## 5. Audit log

| Part | Owner | Landed | Verdict | Findings |
|---|---|---|---|---|
| 2 | db | yes | **PASS with 1 HIGH + 1 MEDIUM** | JAMR-1, JAMR-2 below |
| 1 | design | — | — | — |
| 3–6 | design | — | — | — |
| (setup) | api | — | — | — |

---

### Audit — part 2 (`db`), audited against the SQL

Verified line-by-line against `supabase/migrations/0001_schema.sql`, `0002_rls.sql`,
`0003_functions.sql`, `seed.sql` — **not** against `CONTRACT.md` or the summary.

**Confirmed correct** (each was independently read in the SQL, not taken on trust):
RLS enabled on all 5 tables (`0002:29–33`) · no `authenticated` write path anywhere except
`grant update (full_name) on profiles` (`0002:40–58`) · `confirm_order` idempotency is a genuine
conditional `update … where status = 'pending'` with the counter increment reachable **only** in the
won branch (`0003:383–426`) · `select … for update` on the reward row is present (`0003:188–194`) ·
exactly one reward at a multiple of 5, computed from the `returning` value (`0003:419–426`) · a
discounted order still counts (nothing in `confirm_order` excludes it) · cancel decrements only when
the prior status was `confirmed` (`0003:494–498`) · the `count(…)` cast-validation wrapper is present
and correctly explained (`0003:157–167`) · `left(…, 80)` is present in `handle_new_user`
(`0001:74`) · no service-role key in any file · no payment provider, no cravburgers reference · no
price or loyalty math outside Postgres.

**Seam A — CLEAN.** RPC parameter names in `CONTRACT.md` §2/§3 match `create function` at
`0003:78–85`, `0003:362`, `0003:446` character for character. All `p_`-prefixed.

**Seam C — CLEAN, and structurally closed.** All 6 seed slugs produce `image_path` exactly
`/products/<slug>.jpg` (`seed.sql:38,47,56,65,74,83`), and `0001:117–118` carries
`check (image_path = '/products/' || slug || '.jpg')` — so DB-side drift is now *impossible*, not
merely absent. The remaining half is `design`'s filenames; audited when it lands.

---

#### JAMR-1 — **HIGH — unbounded reward minting.** `0003_functions.sql:415–426` + `494–498`. Owner: `db`.

`confirm_order` mints a reward when the counter hits a multiple of 5. `cancel_order` decrements the
counter but **does not revoke the reward that confirmation minted.** The threshold can therefore be
re-crossed indefinitely:

```
count=4 → place → confirm  → count=5 → mint R1 → cancel → count=4   (R1 kept)
count=4 → place → confirm  → count=5 → mint R2 → cancel → count=4   (R2 kept)
… unbounded. 3 RPC calls per 50%-off reward, at zero cost — there is no payment.
```

`db` **flagged the state** (`CONTRACT.md:436–437`) but framed it as a one-time generosity choice —
"revoking a reward a user has already been shown is hostile". It did not follow the state through to
the loop. **This is not a policy decision to accept; it is an exploit to fix.**

Note `'expired'` is a legal `loyalty_rewards.status` (`0001:249`) that **nothing in the schema ever
writes** — an orphaned enum value, and the natural home for the fix.

Recommended (db's call, not mine): add `loyalty_rewards.source_order_id uuid` = the order whose
confirmation minted it; in `cancel_order`, expire that reward when it is still `available`. If it was
already `redeemed`, leave it — that loss is bounded and is a fair product call. **Nothing has been
executed, so amend `0001`/`0003` in place rather than shipping an `0004` that repairs a bug no live
database ever had.**

#### JAMR-2 — **MEDIUM — `FOR UPDATE` + `LIMIT 1` returns zero rows when the user holds 2+ rewards.** `0003_functions.sql:188–194`. Owner: `db`.

```sql
where r.user_id = v_user and r.status = 'available'
order by r.issued_at asc, r.id asc
for update
limit 1;
```
Documented Postgres behaviour under READ COMMITTED: the locked row's `WHERE` is re-evaluated after
the blocking transaction commits, and if it no longer matches it is **excluded — but `LIMIT` has
already been applied, so the query does not fall through to the next candidate.** With two available
rewards and two concurrent redeeming checkouts, the loser gets `REWARD_UNAVAILABLE` **while still
holding an unspent reward.**

Fails closed (no double-spend), so the CLAUDE.md guardrail holds and this is not a money bug. But
`CONTRACT.md:307–321` asserts the lock is a complete guarantee, and for the multi-reward case it is
not. Fix is one clause: `for update skip locked`. It also makes the single-reward case non-blocking.

**JAMR-1 and JAMR-2 compound:** the minting loop is precisely what makes holding 2+ available rewards
easy, which is the precondition for JAMR-2.

#### JAMR-3 — LOW — qty cap drift, `api` ↔ `db`. Owner: `api`.
`docs/api-plan.md:139` caps `qty` at `z.number().int().min(1).max(10)`; the database CHECK and
`CONTRACT.md:110` both say **1..20**. Zod is the stricter of the two so it fails closed, but the
cart drawer `design` builds will take its max from one of these two numbers and the server enforces
the other. `api-plan.md` is provisional and states `CONTRACT.md` wins — flagged so that it actually
does, and so `design` is given one number.

#### JAMR-4 — LOW — orphaned error codes. Owner: `api`.
`api-plan.md:100–109` declares `FORBIDDEN` and `RATE_LIMITED`. `CONTRACT.md:298–299` states no RPC
raises `FORBIDDEN` (a cross-user id deliberately returns `ORDER_NOT_FOUND`, so existence is not
leaked), and `api-plan.md:25` puts rate limiting out of scope. Two codes with no producer. Either
delete them or note them as reserved — `design` must not be asked to write i18n strings for errors
that cannot occur.

#### JAMR-5 — LOW — the RPC payload carries PII and the idempotency token. Owner: `api`.
`order_payload` (`0003:36`) does `to_jsonb(o)` — the **whole** orders row: `user_id`,
`customer_phone`, `customer_address`, `client_token`. It is the caller's own data, so this is not a
leak, but `api`'s `OrderSummary` (`api-plan.md:183–191`) must **strip** these at the boundary rather
than spreading the raw jsonb through to a client component. Watch for it at implementation.

---

### Re-audit — `db`'s fix for JAMR-1 / JAMR-2

**JAMR-2: FIXED.** `for update skip locked` at `0003:210`. Both directions hold: two rewards + two
concurrent orders → each takes a different row, both succeed; one reward + two orders → the loser
steps over the locked row, finds nothing, exactly one wins. `coalesce(r.source_order_id =
p_order_id, false) desc` at `0003:576` is a real fix — `DESC` is `NULLS FIRST` in Postgres and a NULL
source would have sorted ahead of the true match. README §4.7 (`README.md:217–219`) now explicitly
retracts the old "EXPECT: this BLOCKS", and §4.7b / §4.7c are added. The three `comment on` strings
(`0001:274–279`, `0003:364`, `0003:654`) all describe the new semantics. New DDL — `source_order_id`
(`0001:262`), partial UNIQUE (`0001:294–296`), `loyalty_rewards_spend_is_not_source` (`0001:270–271`)
— matches `CONTRACT.md:132` and §7 character for character. §8.1's two claims (cancel can reprice a
different pending order; loyalty state is stale after cancel) are both things the SQL actually does
(`0003:612–618`).

**JAMR-1: NOT FIXED. The invariant is still breakable — and the leak is not where `db` looked.**

#### JAMR-6 — **HIGH — restore beats revoke; free reward at count=4.** `0003:563–647`. Owner: `db`.

The revoke block (`:563–629`) and the restore block (`:639–647`) can target **the same reward**, and
the restore runs **last** and wins. The order being cancelled was already flipped to `'cancelled'` at
`:524–527`, *before* the revoke's fallback query runs — so that fallback, which looks for the reward
on a **`'pending'`** order (`:602`), cannot see it. It is neither `pending` nor `confirmed`. It is the
order we are cancelling right now.

Verified trace, from `count=4`, zero rewards:
```
1. confirm A            -> count=5, mint R1 (available, source=A)
2. place B, redeem      -> B pending @ half price; R1 redeemed, R1.order_id=B
3. confirm B            -> count=6                      (B confirmed @ half price)
4. cancel  A            -> old=6, 6%5=1, no down-cross -> count=5, nothing revoked
5. cancel  B            -> :524 sets B='cancelled'
                           :563 old=5, 5%5=0 -> DOWN-CROSS, revoke:
                             :568 available?  none — R1 is 'redeemed'
                             :597 fallback: R1.order_id=B, B is now 'cancelled', not
                                  'pending' -> NO MATCH. Revokes nothing.
                           :639 restore: B spent R1 -> R1 back to 'available'
                        -> count=4, R1 AVAILABLE
```
`rewards outstanding = 1`, `floor(4/5) = 0`. **Invariant violated.** Net: a free 50%-off reward, from
five RPC calls, at zero cost. Re-runnable each time the attacker returns to zero available rewards,
so it yields repeatable free half-price orders.

So the answer to the lead's question is: **the stopping point at `confirmed` is safe** — `db`'s
reasoning there is sound, and that branch is genuinely not the hole. The hole is one row above it, in
the `'pending'` predicate at `:602`, which silently excludes the order being cancelled.

**Fix — reorder, do not add logic.** Move the RESTORE block (`:639–647`) to run **before** the revoke
block. Then cancelling B restores R1 to `'available'` first, and the revoke's *primary* query
(`:568`, "select an available reward") finds it and expires it. Checked against every branch:

| case | after reorder | invariant |
|---|---|---|
| cancel confirmed B (spent R1, down-cross) | restore R1 → revoke expires R1 | `count=4`, 0 rewards ✓ |
| cancel **pending** B (spent R1) | no decrement, no revoke; R1 → available | `count=5`, 1 ✓ |
| cancel confirmed A (minted R1, spent nothing) | restore no-op; revoke expires R1 | ✓ |
| cancel confirmed B (spent R1 **and** minted R2) | restore R1; revoke prefers `source=B` → expires R2 | ✓ fair |
| cancel confirmed B (spent R1, **no** down-cross) | restore R1; no revoke | `count=5`, 1 ✓ |

#### JAMR-7 — **MEDIUM — `skip locked` regressed the double-click idempotency path.** `0003:210` vs `0003:214–229`. Owner: `db`.

The comment at `:214–229` still describes the **plain `FOR UPDATE`** behaviour: click 2 *blocks* on
the reward lock, click 1 commits, click 2 re-checks its `client_token` and returns click 1's order.
**`SKIP LOCKED` does not block.** Click 2 steps over the locked row, gets `v_reward_id = null`, and
runs the idempotency re-check at `:220–229` **while click 1 is still uncommitted** — so it finds
nothing and raises `REWARD_UNAVAILABLE`.

A genuine double-click on "Place order" with *use my reward* checked now returns a false
`REWARD_UNAVAILABLE` to the second click. It fails closed (no double order, no double spend), but
`CONTRACT.md:199–200` still asserts the opposite in as many words — *"the loser does not get
`REWARD_UNAVAILABLE`, it gets the winner's order"* — and now directly contradicts its own
`CONTRACT.md:340`. Fixing JAMR-2 broke this and the contract was not re-checked against it.

Suggested (db's call): serialize same-token calls at the top of `place_order` —
`perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_client_token::text, 0))` when
`p_client_token is not null`, before step 1. Click 2 then blocks on the *token*, not the reward, and
its step-1 `SELECT` sees the committed order. Different tokens are unaffected, so `SKIP LOCKED` still
handles the real two-order race.

---

### Registry — accepted decisions (not drift)
1. Cancelling an order restores its **redeemed** reward to `available` (`0003:503–511`). Accepted by lead.
2. Rewards never expire (`CONTRACT.md:438`). Accepted by lead — **but see JAMR-1**: `'expired'` is
   the mechanism the fix needs, so "nothing ever writes it" cannot survive that fix.
3. `orders.customer_name/_phone/_address`, `orders.client_token`, `cancel_order`, `updated_at`
   triggers, `bun`/`patty` as constrained i18n key sets — all lead-ruled or requested, recorded in
   `CONTRACT.md:415–427`.
4. Discount rounds **up** on an odd cent — the half-cent goes to the customer (`0003:258–264`).
5. Currency is not stored; `price_cents` is minor units of a single unnamed currency. `design` picks
   the symbol.

### Tooling defect (for the lessons log)
`database-architect.md:4` grants `Bash` but **not** `PowerShell`. On this machine `Bash` fork-fails
(`0xC0000142`). The agent therefore had **no working shell at all** — no psql, no Docker, no
`explain analyze` — while its own §2.1/§2.4/§5 *require* it to test policies against another user's
rows and to `explain analyze` hot queries. It reported this plainly instead of faking it, which is
the correct behaviour and is the only reason the gap is visible. The tool grant is what is broken,
not the agent.

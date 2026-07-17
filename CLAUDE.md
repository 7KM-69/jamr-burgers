# JAMR — Burger Ordering Site (personal exercise)

> This file is written in English on purpose: it is a rules file for the model, and
> instruction-following is more reliable in English. Talk to the user in Arabic.

## What this is

A from-scratch clone-in-spirit of **https://www.cravburgers.shop/** (Awwwards SOTD, Next.js +
GSAP). It is a **personal learning exercise** by the user, and it is not a commercial product.

**The source is published** as a portfolio piece at `github.com/7KM-69/jamr-burgers` (decided
2026-07-17). That is a deliberate change from this file's original "not for publication" rule,
and it is narrow: the *code* is public so it can be read by employers. The site must still never
be **deployed as a live storefront**, must never take a real payment, and must never present
itself under a brand that impersonates CRAV. JAMR is the user's own brand and impersonates
nobody, which is what makes publishing the source legitimate.

Consequences that are now permanent, not preferences:
- Nothing secret may enter the repo. `.env.local` stays git-ignored; the service-role key is
  unused and must stay that way. Verify before every push, not after.
- The "demo — no real payment" note in checkout is now load-bearing: a stranger may clone and
  run this. It must never be removed.

We copy from the reference:
- the **page structure and section order**
- the **motion design** (loader, page transitions, scroll choreography, footer animation)
- the **level of polish** — this is the actual bar. "Works" is not done. Awwwards-grade is done.

We do **not** copy: the name `CRAV`, its logo, its copy, its images, its "Est. 1997 Navarra"
story. Those are ours. Never scrape or hotlink assets from cravburgers.shop.

We **add** three things the reference does not have — they must feel native to the design system,
not bolted on:
1. **Auth** (sign up / sign in) in our brand identity.
2. **Loyalty**: after 5 confirmed orders → 50% off the next order.
3. **Ordering with no real payment** (simulated checkout).

---

## Brand

The brand name lives in exactly one place: `src/lib/brand.ts`. Renaming the brand must be a
one-line change. Never hardcode the name in components.

- **Name**: JAMR (EN) / جمر (AR) — "embers".
- **Palette** (define as CSS vars in `globals.css`, expose via Tailwind theme — never raw hex in
  components):
  - `--ink: #0B0A09` (near-black charcoal, the dominant surface)
  - `--ember: #FF4D1C` (primary accent — CTAs, highlights, glow)
  - `--flame: #FFB020` (secondary accent, gradient partner to ember)
  - `--ash: #171513` → base for the warm-grey ramp used by cards/borders (build `--ash-100/200/300`
    from it). *Was written `#17151300` — an 8-digit hex with alpha `00`, i.e. fully transparent,
    which gave invisible borders. Corrected.*
  - `--bone: #F2EBE3` (warm off-white text on dark)
- **Type**: one heavy display face for headlines (uppercase, tight tracking, huge — hero headline
  should be a `clamp()` that goes genuinely large), one clean sans for body. AR needs its own
  display + body pairing (e.g. a heavy Arabic display for headlines); Latin fonts must never be
  used to render Arabic. Load via `next/font`.
- **Voice**: short, punchy, imperative. Never marketing filler.

---

## Stack

- **Next.js 15, App Router**, TypeScript, React Server Components by default.
- **Tailwind CSS** for layout/spacing; CSS vars for the design tokens.
- **GSAP** (+ `ScrollTrigger`) for all scroll and timeline motion. **Lenis** for smooth scroll,
  synced to ScrollTrigger.
- **Supabase** — Auth (email + password), Postgres, RLS. This is the source of truth for users,
  orders and loyalty.
- **Playwright** — screenshots only (see Screenshot protocol).
- `next/image` for every image. No raw `<img>`.

Do not add a state-management library, a component library, or an animation library other than
GSAP without asking.

---

## Structure to build (mirrors the reference)

Routes: `/` · `/menu` · `/spices` · `/locations` · `/contact` · `/account` · `/auth` · custom `404`.

Home page section order — build in this order:
1. **Loader** — brand animation on first load, hands off to the hero (no flash, no layout shift).
2. **Nav** — logo, links, cart button with count, auth/account button, AR/EN toggle.
3. **Hero** — oversized headline, burger hero image, primary CTA → `/menu`.
4. **Brand intro** — short origin paragraph (ours, not CRAV's).
5. **Experience** — nutrition/quality stat row (calories, protein, sourcing).
6. **Ingredient showcase** — the signature moment. Burger layers (bun, patty, cheese, tomato,
   lettuce) separate and drift apart on scroll, each labeled. This is the single most-polished
   section on the site; treat it as the hero of the scroll.
7. **Locations** — city list/map.
8. **Supply story** — farm → hand narrative.
9. **CTA** — full-bleed closing call to action.
10. **Footer** — animated (large type, hover reactions, marquee or reveal).

`/menu`: product grid, cards with "quick details" (prep time, bun, patty, spice level, kcal,
protein, price) + **cart drawer** + checkout. 6 products.

---

## Motion rules (this is where the polish is)

- Every GSAP setup lives inside `gsap.context()` in a `useEffect` and is **reverted on cleanup**.
  Leaking ScrollTriggers across route changes is the #1 bug in this kind of site.
- **`prefers-reduced-motion`**: honor it. Under reduced motion, elements appear in final state —
  no scroll-jacking, no pinning, no loader animation beyond a fade.
- **Pinning** (the ingredient showcase) is desktop-only. On mobile, degrade to a stacked reveal.
- Page transitions: use a route-aware overlay in `template.tsx`. Kill the incoming page's
  triggers only after the transition completes, then `ScrollTrigger.refresh()`.
- Register plugins once, client-side only (`'use client'` + `gsap.registerPlugin`).
- Motion never blocks interaction: buttons stay clickable during entrance animations.

Target: 60fps on a mid laptop. Animate `transform` and `opacity` only. No animating `width`,
`height`, `top`, `left`, or box-shadow on scroll.

---

## Bilingual AR / EN

- Language toggle in the nav. `<html lang dir>` flips between `ltr` and `rtl`.
- Copy lives in `src/i18n/{ar,en}.ts` — **no hardcoded user-facing strings in components, ever.**
- Layout must be logical-property based (`ms-*` / `me-*` / `start` / `end`, not `ml-*` / `left`)
  so RTL is a direction flip, not a rewrite.
- **After a language switch, call `ScrollTrigger.refresh()`** — text reflow changes every trigger
  position, and forgetting this silently breaks the scroll choreography in one language only.
- Any horizontal GSAP motion (marquees, slide-ins) must invert its x-direction in RTL.
- Numbers/prices: keep Latin digits in both languages.

---

## Data model (Supabase)

```
profiles          id (= auth.users.id), full_name, confirmed_orders_count int default 0
products          id, slug, name_en, name_ar, desc_en, desc_ar, price_cents,
                  bun, patty, spice_level, kcal, protein_g, prep_min, image_path, active
orders            id, user_id, status ('pending'|'confirmed'|'cancelled'),
                  subtotal_cents, discount_cents, total_cents,
                  customer_name, customer_phone, customer_address,   -- checkout collects these
                  client_token uuid nullable,                        -- idempotency
                  reward_id nullable, created_at, confirmed_at
order_items       id, order_id, product_id, qty, unit_price_cents  -- price snapshot
loyalty_rewards   id, user_id, kind ('half_off'), status ('available'|'redeemed'|'expired'),
                  issued_at, redeemed_at, order_id nullable
```

**RLS is mandatory on every table.** Users read/write only their own rows. `products` is
world-readable, nobody-writable. The `service_role` key never leaves the server and never appears
in a `NEXT_PUBLIC_*` var.

Three rules that make the seams line up — they are contract, not preference:

- **`profiles` rows are created by a Postgres trigger on `auth.users`.** Never by the app. The
  alternative would require the service-role key in application code; we don't want it there.
- **`products.image_path` is exactly `/products/<slug>.jpg`** — a root-relative URL that goes
  straight into `next/image` with no string surgery in the UI. Image files therefore live at
  `public/products/<slug>.jpg`, and **the slugs in `supabase/seed.sql` are authoritative**: the
  UI never invents one.
- **`orders.client_token`** + a unique index on `(user_id, client_token)` makes `place_order`
  idempotent. Without it a double-clicked checkout leaves a stray pending order.

**`supabase/CONTRACT.md` is the handoff artifact** and the only schema source the server layer may
build against. It states every column, every RPC parameter name **character-for-character**, the
exact JSON shape of the `items` argument, the exact returned row shape, and every status string
literal. Reason: `supabase-js` `.rpc()` passes arguments **by name** — writing `redeemReward`
instead of `redeem_reward` fails silently at runtime with no TypeScript error. Never reconstruct a
column name from memory or from the prose above; copy it from `CONTRACT.md`.

---

## Loyalty rules — implement exactly this

The rule "after 5 confirmed orders → 50% off the next order" is ambiguous. This is the spec:

1. An order counts **only when its status becomes `confirmed`**. Pending and cancelled orders
   never count. Deleting/cancelling a confirmed order decrements the counter.
2. On confirmation, increment `profiles.confirmed_orders_count`. If the new count is a **multiple
   of 5** (5, 10, 15…), issue **one** `loyalty_rewards` row with status `available`.
3. On the next order, the user may redeem **one** available reward → **50% off the order
   subtotal**. Rewards do not stack; one reward per order maximum.
4. A discounted order **still counts** toward the next 5. (So orders 1–5 earn a reward, order 6 is
   half price and is itself order #6 of the next cycle.)
5. **All of this happens server-side, inside a Postgres function (RPC), in one transaction.**
   - `place_order(items, redeem_reward boolean, customer_name, customer_phone, customer_address,
     client_token)` — recomputes the subtotal from the `products` table (**never trusts a price
     sent by the client**), locks and redeems the reward row if requested and available, writes
     the order + items, and returns **the order together with its items** in one round trip.
     The client sends only product ids and quantities: no price, no discount, no total, no user id.
   - `confirm_order(order_id)` — flips status, increments the counter, issues the reward if the
     count hit a multiple of 5. Must be idempotent: confirming twice must not double-count.
   - Concurrency matters: two simultaneous orders must not redeem the same reward. Use
     `SELECT ... FOR UPDATE` on the reward row.
6. The client **displays** progress (`3 / 5`) but never computes eligibility or the discount. If
   the UI and the server disagree, the server is right.

Show loyalty progress in the account page and in the cart drawer (a small 5-dot / ring meter,
styled in-brand — this is a chance for a nice micro-animation when a dot fills).

---

## Payment

There is **no payment**. Do not integrate Stripe, Tap, Moyasar, PayPal, or anything else, even if
it seems natural. Checkout collects name + phone + address, calls `place_order`, shows a confirm
step, then `confirm_order`. Add a visible "demo — no real payment" note in the checkout UI so the
build can never be mistaken for a real store.

---

## Screenshot protocol (the user asked for this — do not skip it)

After **every** completed part, take screenshots and show them to the user before moving on.

- Script: `scripts/shot.mjs` (Playwright, headless Chromium).
- Output: `screenshots/NN-slug-{lang}-{viewport}.png` (e.g. `03-hero-ar-desktop.png`).
- Capture **both** viewports: desktop `1440×900` and mobile `390×844`.
- Capture **both** languages for any part with visible copy.
- Wait for fonts + the loader to settle before shooting (`page.waitForLoadState('networkidle')`
  plus an explicit wait for the loader to be gone), otherwise you'll screenshot a blank stage.
- Then **actually look at the image** (Read the PNG) and judge it against the polish bar before
  claiming the part is done. Screenshots are for you to catch your own mistakes, not just for the
  user to admire.

---

## Build order (one part = one screenshot checkpoint)

1. Scaffold + design tokens + fonts + Lenis/GSAP wiring + Playwright shot script
2. Supabase schema + RLS + RPCs + seed 6 products
3. Nav + loader + page transition shell
4. Hero
5. Brand intro + Experience stats
6. **Ingredient showcase** (the signature scroll moment)
7. Locations + Supply story + CTA
8. Animated footer + 404
9. `/menu` grid + product cards + cart drawer
10. Auth (`/auth`) in brand identity
11. Checkout + `place_order` / `confirm_order`
12. Loyalty UI (progress meter, reward badge, 50% applied state)
13. AR/EN toggle pass over everything + RTL fixes + `ScrollTrigger.refresh()`
14. Polish pass: reduced-motion, mobile, Lighthouse, focus states

---

## Commands

```bash
npm run dev            # localhost:3000
npm run build          # must pass before any part is called done
npm run lint
npx tsc --noEmit       # zero errors, always
node scripts/shot.mjs <slug>   # screenshots for the current part
```

Environment (`.env.local`, never committed):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only. never NEXT_PUBLIC_.
```

---

## How the team works

Four agents build this: **`db`** (database-architect), **`api`** (backend-architect), **`design`**
(ui-ux-architect), **`qa`** (qa-orchestrator). Two agents editing one file overwrite each other, so
ownership is exclusive — **write only inside your own territory:**

| owner    | files |
|----------|-------|
| `design` | `package.json`, all configs, `src/app/**` (except `src/app/api/**`), `src/components/**`, `src/styles/**`, `src/i18n/**`, `src/lib/brand.ts`, `public/**`, `scripts/**`, `screenshots/**` |
| `db`     | `supabase/**` — migrations, RLS, RPCs, `seed.sql`, `CONTRACT.md` |
| `api`    | `src/lib/supabase/**`, `src/lib/actions/**`, `src/lib/server/**`, `src/lib/types/**`, `middleware.ts`, `src/app/api/**`, `.env.example` |
| `qa`     | `docs/qa/**` — audits and reports only; never source, schema, or config |

`design` alone runs `npm install`; others request dependencies from it. Sequence: schema and design
direction settle first and in parallel, then the server layer binds to `supabase/CONTRACT.md`, then
the UI binds to the real API contract.

**No live Supabase.** There is no project and no credentials — the user applies the SQL himself.
So the schema, RLS and RPCs are **unexecuted SQL**, and the server layer is **unverified against a
real database**. That is expected; what is not acceptable is claiming otherwise. Say "I did not run
this" plainly. Once Supabase is provisioned, these must be smoke-tested before checkout is called
done: a `profiles` row appears on signup · the subtotal is computed from `products`, not from
anything the client sent · confirming the same order twice moves the counter by exactly 1 · hitting
5 confirmed orders issues exactly one reward · two simultaneous redemptions of one reward — exactly
one wins · confirming another user's order is refused.

---

## Definition of done for a part

A part is done when **all** of these are true. Do not report a part as done otherwise — say what
is still failing instead.

- `npm run build` and `npx tsc --noEmit` pass.
- Screenshots taken, at both viewports and both languages, and **you looked at them**.
- Works in AR and EN, RTL included.
- Reduced-motion path works.
- No console errors, no leaked ScrollTriggers on route change.
- No hardcoded strings, no raw hex, no client-side price or loyalty math.

## Guardrails

- Never trust the client for price, discount, or order count.
- Never expose the service-role key.
- Never fetch assets from cravburgers.shop at runtime or build time.
- Never add a real payment provider.
- Never claim a part is finished without a screenshot you have actually viewed.
- If a decision is genuinely ambiguous (brand copy, a product name, a motion choice with two good
  options), ask — one question, with a recommendation.

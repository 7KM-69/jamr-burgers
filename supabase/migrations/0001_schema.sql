-- ============================================================================
-- JAMR — 0001_schema.sql
-- Tables, types, constraints, indexes, triggers.
-- Forward-only. Never edit this file after it has been applied; add a new one.
--
-- Apply order: 0001_schema.sql -> 0002_rls.sql -> 0003_functions.sql -> seed.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Shared trigger function: keeps updated_at honest.
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with now(). Not SECURITY DEFINER — runs as the caller.';


-- ============================================================================
-- profiles — 1:1 with auth.users. Created by the handle_new_user trigger.
-- ============================================================================
create table public.profiles (
  id                     uuid        primary key
                                     references auth.users (id) on delete cascade,
  -- Nullable by design: email+password signup may carry no name in user metadata.
  -- The user fills it in later from /account. This is the only justified null here.
  full_name              text        null
                                     check (full_name is null or char_length(btrim(full_name)) between 1 and 80),
  -- Authoritative loyalty counter. Maintained ONLY by confirm_order / cancel_order.
  -- The authenticated role has no UPDATE grant on this column (see 0002_rls.sql).
  confirmed_orders_count integer     not null default 0
                                     check (confirmed_orders_count >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. confirmed_orders_count is server-owned: only the loyalty RPCs may change it.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- handle_new_user — creates the profile row when auth.users gets an insert.
-- SECURITY DEFINER because the trigger fires as supabase_auth_admin, which has
-- no rights on public.profiles.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- left(..., 80) is load-bearing, not cosmetic. full_name carries a CHECK of 1..80
  -- chars, and raw_user_meta_data is whatever the client sent at signup. An 81-char
  -- name would violate the CHECK, raise inside this trigger, and roll back the
  -- INSERT on auth.users — i.e. break signup itself with an opaque 500. A trigger on
  -- the auth path must never be able to reject the user. Truncate, never reject.
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT ON auth.users: creates the matching public.profiles row. Idempotent via ON CONFLICT DO NOTHING. Truncates full_name to 80 chars rather than rejecting the signup.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- products — the menu. World-readable, nobody-writable.
-- ============================================================================
create table public.products (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        not null unique
                           check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en      text        not null check (char_length(btrim(name_en)) between 1 and 60),
  name_ar      text        not null check (char_length(btrim(name_ar)) between 1 and 60),
  desc_en      text        not null check (char_length(btrim(desc_en)) between 1 and 240),
  desc_ar      text        not null check (char_length(btrim(desc_ar)) between 1 and 240),
  -- Minor currency units (e.g. 3200 = 32.00). Integer, never float: binary floating
  -- point cannot represent 0.10 and money must not lose cents.
  price_cents  integer     not null check (price_cents > 0),
  -- bun / patty are i18n KEYS, not display copy. The UI maps them through src/i18n
  -- so a burger renders in Arabic in Arabic. Never render these raw.
  bun          text        not null
                           check (bun in ('potato', 'brioche', 'sesame', 'pretzel', 'sourdough')),
  patty        text        not null
                           check (patty in ('smash_beef', 'beef', 'double_beef', 'crispy_chicken', 'lamb', 'halloumi_mushroom')),
  -- 0 = none, 1 = mild, 2 = medium, 3 = hot. Rendered as 3 flame glyphs.
  spice_level  smallint    not null check (spice_level between 0 and 3),
  kcal         integer     not null check (kcal > 0),
  protein_g    integer     not null check (protein_g >= 0),
  prep_min     integer     not null check (prep_min > 0),
  -- Root-relative URL, ready to pass straight into next/image with no string surgery.
  -- Convention (lead ruling): '/products/<slug>.jpg' -> file lives at /public/products/<slug>.jpg.
  image_path   text        not null
                           check (image_path = '/products/' || slug || '.jpg'),
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.products is
  'The menu. Source of truth for price — place_order recomputes every subtotal from this table and never trusts a client-sent price.';
comment on column public.products.bun is
  'i18n key, not display text. One of: potato | brioche | sesame | pretzel | sourdough.';
comment on column public.products.patty is
  'i18n key, not display text. One of: smash_beef | beef | double_beef | crispy_chicken | lamb | halloumi_mushroom.';
comment on column public.products.active is
  'Soft delete. Inactive products stay readable so past orders still resolve their product row.';

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Menu query: `where active order by price_cents, slug`. Partial index covers
-- the filter AND the sort, so the grid never sequential-scans as the menu grows.
create index products_active_price_idx
  on public.products (price_cents, slug)
  where active;


-- ============================================================================
-- orders
-- reward_id's FK is added at the bottom of this file: orders and loyalty_rewards
-- reference each other, so one of the two constraints must come after both tables.
-- ============================================================================
create table public.orders (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles (id) on delete cascade,
  status            text        not null default 'pending'
                                check (status in ('pending', 'confirmed', 'cancelled')),
  subtotal_cents    integer     not null check (subtotal_cents >= 0),
  discount_cents    integer     not null default 0 check (discount_cents >= 0),
  total_cents       integer     not null check (total_cents >= 0),
  -- The redeemed reward, if any. Nulled on cancellation so the reward can be
  -- re-redeemed on a future order (the unique index below would otherwise block it).
  reward_id         uuid        null,
  -- Delivery details collected at checkout (CLAUDE.md §Payment). Recorded extension
  -- of the prose data model, by lead ruling — see CONTRACT.md §Deviations.
  customer_name     text        not null check (char_length(btrim(customer_name)) between 1 and 80),
  customer_phone    text        not null check (char_length(btrim(customer_phone)) between 5 and 32),
  customer_address  text        not null check (char_length(btrim(customer_address)) between 1 and 300),
  -- Idempotency key for checkout. The client generates one uuid per checkout attempt
  -- and resends it on retry; place_order returns the existing order instead of
  -- creating a second one. A double-clicked "Place order" must not leave a stray order.
  client_token      uuid        null,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz null,
  updated_at        timestamptz not null default now(),

  -- The money invariant. The last line that never forgets: even if an RPC is wrong,
  -- the database refuses an order whose total does not equal subtotal - discount.
  constraint orders_total_is_subtotal_minus_discount
    check (total_cents = subtotal_cents - discount_cents),
  constraint orders_discount_within_subtotal
    check (discount_cents <= subtotal_cents),
  -- A confirmed order always knows when it was confirmed.
  constraint orders_confirmed_has_timestamp
    check (status <> 'confirmed' or confirmed_at is not null)
);

comment on table public.orders is
  'Money columns are written exclusively by place_order. There is no client INSERT/UPDATE/DELETE grant on this table.';
comment on column public.orders.reward_id is
  'FK to the loyalty_rewards row redeemed on this order. At most one per order (unique index). Nulled by cancel_order so the reward returns to the pool.';

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- RLS predicate is `user_id = auth.uid()`; account history sorts by created_at desc.
-- Equality column first, sort column second — this one index serves the policy AND the query.
create index orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);

-- One reward may be attached to at most one order. This is the constraint half of
-- "rewards do not stack; one reward per order maximum" — the RPC is the other half.
create unique index orders_reward_id_key
  on public.orders (reward_id)
  where reward_id is not null;

-- Checkout idempotency. The unique index is the enforcement, not the SELECT inside
-- place_order: two concurrent double-clicked checkouts race past any read, and exactly
-- one of them survives this index. The loser is caught and returns the winner's order.
create unique index orders_user_client_token_key
  on public.orders (user_id, client_token)
  where client_token is not null;


-- ============================================================================
-- order_items — line items with a price snapshot.
-- ============================================================================
create table public.order_items (
  id               uuid        primary key default gen_random_uuid(),
  order_id         uuid        not null references public.orders (id)   on delete cascade,
  -- restrict, not cascade: an ordered product must not be deletable, or historical
  -- orders silently lose their lines. Retire products with active = false instead.
  product_id       uuid        not null references public.products (id) on delete restrict,
  qty              integer     not null check (qty between 1 and 20),
  -- Snapshot of products.price_cents at the moment the order was placed.
  -- Menu prices change; a placed order must not.
  unit_price_cents integer     not null check (unit_price_cents > 0),
  created_at       timestamptz not null default now(),

  -- One line per product per order. place_order aggregates duplicate cart entries
  -- before insert; this constraint guarantees it even if that logic ever regresses.
  constraint order_items_one_line_per_product unique (order_id, product_id)
);

comment on column public.order_items.unit_price_cents is
  'Price snapshot taken from products.price_cents inside place_order. Never sent by the client.';

-- FK index + RLS predicate index (the policy joins back to orders on order_id).
create index order_items_order_id_idx   on public.order_items (order_id);
-- FK index: without it, the ON DELETE RESTRICT check on products scans this table.
create index order_items_product_id_idx on public.order_items (product_id);


-- ============================================================================
-- loyalty_rewards — one row = one 50%-off entitlement.
-- ============================================================================
create table public.loyalty_rewards (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  kind        text        not null default 'half_off' check (kind = 'half_off'),
  status      text        not null default 'available'
                          check (status in ('available', 'redeemed', 'expired')),
  issued_at   timestamptz not null default now(),
  redeemed_at timestamptz null,

  -- TWO different order edges. Conflating them is what let rewards be minted for free.
  --
  --   order_id        — the order this reward was SPENT ON.  Set by place_order.
  --   source_order_id — the order whose confirmation MINTED it. Set by confirm_order.
  --
  -- An order can do both: spend reward A and, by being the 5th confirmed order, mint
  -- reward B. Cancelling it must restore A and revoke B, which is impossible to express
  -- without both edges.
  order_id        uuid null references public.orders (id) on delete set null,
  source_order_id uuid null references public.orders (id) on delete set null,

  constraint loyalty_rewards_redeemed_has_timestamp
    check (status <> 'redeemed' or redeemed_at is not null),
  constraint loyalty_rewards_available_is_unspent
    check (status <> 'available' or (redeemed_at is null and order_id is null)),
  -- A reward is never spent on the very order that minted it: it is minted at
  -- confirmation, and redemption happens at placement, which is strictly earlier.
  constraint loyalty_rewards_spend_is_not_source
    check (order_id is null or source_order_id is null or order_id <> source_order_id)
);

comment on table public.loyalty_rewards is
  'INVARIANT: rewards granted == floor(confirmed_orders_count / 5). Minted by confirm_order on an UP-crossing of a multiple of 5; revoked (expired) by cancel_order on a DOWN-crossing. Redeemed by place_order under SELECT ... FOR UPDATE SKIP LOCKED.';
comment on column public.loyalty_rewards.order_id is
  'The order this reward was SPENT on. Nulled by cancel_order when the reward is returned to the pool.';
comment on column public.loyalty_rewards.source_order_id is
  'The order whose confirmation MINTED this reward. Audit trail + the UNIQUE index that caps one order at one mint. NOTE: revocation is keyed on the DOWN-CROSSING of a multiple of 5, NOT on this column — cancelling a different confirmed order still revokes a reward. Keying revocation on order identity is exactly the bug that let confirm/cancel/confirm/cancel mint rewards for free.';

-- The hot path: "does this user have a reward to spend?" — and the RLS predicate column.
-- Partial index: the available set stays tiny forever, however many rewards are burned.
create index loyalty_rewards_available_idx
  on public.loyalty_rewards (user_id, issued_at)
  where status = 'available';

-- Full-set index for the account page ("your rewards") and the RLS predicate on
-- rows that are no longer available.
create index loyalty_rewards_user_id_idx on public.loyalty_rewards (user_id);

-- One order mints AT MOST ONE reward — enforced, not merely intended. confirm_order's
-- conditional-update gate already makes double-minting unreachable; this index is the
-- last line that never forgets, and it holds even if that gate is ever broken.
create unique index loyalty_rewards_source_order_id_key
  on public.loyalty_rewards (source_order_id)
  where source_order_id is not null;

-- FK index.
create index loyalty_rewards_order_id_idx
  on public.loyalty_rewards (order_id)
  where order_id is not null;


-- ============================================================================
-- The deferred half of the circular reference.
-- ============================================================================
alter table public.orders
  add constraint orders_reward_id_fkey
  foreign key (reward_id) references public.loyalty_rewards (id) on delete set null;

-- FK index for orders.reward_id is the partial unique index orders_reward_id_key above.

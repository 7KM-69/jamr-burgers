-- ============================================================================
-- JAMR — 0002_rls.sql
-- Row Level Security + table/column privileges.
--
-- The posture, stated once:
--
--   THERE IS NO CLIENT WRITE PATH. Not to orders, not to order_items, not to
--   loyalty_rewards, not to products, and not to profiles.confirmed_orders_count.
--   Every mutation goes through a SECURITY DEFINER RPC in 0003_functions.sql.
--
-- Two independent mechanisms enforce that, and both are required:
--
--   1. RLS policies. SELECT policies exist and are keyed on auth.uid().
--      No INSERT / UPDATE / DELETE policy is written for the client roles, and
--      RLS-on-with-no-policy denies. Deny by default is the correct starting point.
--
--   2. GRANTs. RLS cannot restrict a *column* — an UPDATE policy on profiles would
--      let any user set their own confirmed_orders_count = 500 and mint themselves
--      100 rewards. Column-level grants are the only thing that stops that, so the
--      authenticated role holds UPDATE on profiles(full_name) and nothing else.
--
-- Supabase's default privileges GRANT ALL on new public tables to anon and
-- authenticated. Every REVOKE below is load-bearing. Do not remove one.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS on every table. No exceptions.
-- ----------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.products        enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.loyalty_rewards enable row level security;


-- ============================================================================
-- Privileges. Strip Supabase's defaults, then grant back exactly what is needed.
-- service_role is intentionally untouched (server-side only; it bypasses RLS).
-- ============================================================================
revoke all on public.profiles        from anon, authenticated;
revoke all on public.products        from anon, authenticated;
revoke all on public.orders          from anon, authenticated;
revoke all on public.order_items     from anon, authenticated;
revoke all on public.loyalty_rewards from anon, authenticated;

-- profiles: read your own row; write your own name and NOTHING else.
grant select (id, full_name, confirmed_orders_count, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name)
  on public.profiles to authenticated;

-- products: world-readable (signed out included), nobody-writable.
grant select on public.products to anon, authenticated;

-- orders / order_items / loyalty_rewards: read-only to the owner. Writes are RPC-only.
grant select on public.orders          to authenticated;
grant select on public.order_items     to authenticated;
grant select on public.loyalty_rewards to authenticated;


-- ============================================================================
-- POLICIES
--
-- auth.uid() is wrapped as (select auth.uid()) throughout. This is not style:
-- it lets Postgres evaluate it once per statement as an InitPlan instead of once
-- per row. On a bare auth.uid() the function is re-invoked for every row scanned,
-- which is the difference between an index lookup and a per-row function call.
-- ============================================================================

-- ---------------------------------------------------------------- profiles ---
-- SELECT: your row only.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- UPDATE: your row only. The column grant above restricts this to full_name;
-- the WITH CHECK stops a user from re-pointing the row's id at someone else.
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- INSERT: none. The row is created by the handle_new_user trigger on auth.users.
-- DELETE: none. Profiles die with their auth.users row (ON DELETE CASCADE).
-- Both are therefore denied to every client role.


-- ---------------------------------------------------------------- products ---
-- SELECT: everyone, signed in or not. The menu is public.
--
-- Deliberately `using (true)` and NOT `using (active)`: a past order may reference
-- a retired product, and if the policy hid inactive rows, that user's own order
-- history would render with a missing product and no error to explain it.
-- Filtering to active products is the menu query's job, not the policy's.
create policy "products_select_all"
  on public.products for select
  to anon, authenticated
  using (true);

-- INSERT / UPDATE / DELETE: no policy and no grant. Nobody-writable, as specified.
-- The menu changes by migration, not by API call.


-- ------------------------------------------------------------------ orders ---
-- SELECT: your orders only.
create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using (user_id = (select auth.uid()));

-- INSERT / UPDATE / DELETE: none.
--   INSERT -> place_order()   : the client must never set subtotal/discount/total.
--   UPDATE -> confirm_order() : the client must never flip its own status to
--                               'confirmed' — that is what mints loyalty rewards.
--   DELETE -> cancel_order()  : deleting a confirmed order would strand the loyalty
--                               counter. Cancellation is a state transition, not a
--                               row deletion, and history is kept.


-- ------------------------------------------------------------- order_items ---
-- SELECT: items of your orders only. The predicate joins back to orders — which is
-- why order_items.order_id is indexed (0001) and orders.user_id leads its index.
create policy "order_items_select_own"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

-- INSERT / UPDATE / DELETE: none. Written only by place_order(), with the
-- unit_price_cents snapshot read from products — never from the client.


-- --------------------------------------------------------- loyalty_rewards ---
-- SELECT: your rewards only. Powers the "3 / 5" meter and the reward badge.
create policy "loyalty_rewards_select_own"
  on public.loyalty_rewards for select
  to authenticated
  using (user_id = (select auth.uid()));

-- INSERT / UPDATE / DELETE: none. A client that could INSERT here would grant
-- itself unlimited 50%-off rewards; a client that could UPDATE could flip a
-- redeemed reward back to 'available' and spend it twice. Issuance belongs to
-- confirm_order(), redemption to place_order(), restoration to cancel_order().

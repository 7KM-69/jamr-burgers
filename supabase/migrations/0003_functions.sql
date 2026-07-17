-- ============================================================================
-- JAMR — 0003_functions.sql
-- The only write path in the system: place_order, confirm_order, cancel_order.
--
-- Every function here is:
--   * SECURITY DEFINER  — it must write tables the client has no grant on.
--   * `set search_path = ''` — a SECURITY DEFINER function without a pinned
--     search_path is a privilege-escalation hole: a caller can create their own
--     `public.products` earlier in the path and have this function read it. Every
--     identifier below is therefore schema-qualified. Do not remove this.
--   * Identity from auth.uid() ONLY. No function takes a user_id parameter, so a
--     client cannot act as another user even if it forges every argument it sends.
--   * One statement or one transaction. PostgREST wraps each RPC call in a single
--     transaction, so any RAISE below rolls the whole thing back — there is no
--     partial order, no half-redeemed reward.
--
-- Errors: the exception MESSAGE is a stable machine code (e.g. 'REWARD_UNAVAILABLE').
-- `api` switches on the message, never on the hint. The hint is developer prose and
-- may change. Codes are listed in CONTRACT.md.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- order_payload — the single, canonical JSON shape every RPC returns.
-- Order row + its items with the product slug joined in, in ONE round trip
-- (`api` needs the slug to render a line without a second query).
-- Internal: no client role holds EXECUTE on it.
-- ----------------------------------------------------------------------------
create or replace function public.order_payload(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(o) || jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'product_id',       oi.product_id,
                   'slug',             p.slug,
                   'qty',              oi.qty,
                   'unit_price_cents', oi.unit_price_cents
                 )
                 order by p.slug
               )
        from public.order_items oi
        join public.products p on p.id = oi.product_id
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  )
  from public.orders o
  where o.id = p_order_id;
$$;

comment on function public.order_payload(uuid) is
  'Internal. Canonical RPC return shape: the orders row plus items[] with product slug. Not client-callable.';


-- ============================================================================
-- place_order
--
-- Recomputes the subtotal from public.products. The client sends WHAT and HOW MANY
-- and asks MAY I USE MY REWARD. It never sends a price, a discount, or a total —
-- and there is no parameter here that would let it.
--
-- Concurrency, the case that matters: two simultaneous orders must not redeem the
-- same reward. The SELECT ... FOR UPDATE SKIP LOCKED below claims a reward row.
--
-- SKIP LOCKED, not a plain FOR UPDATE, and the difference is not cosmetic:
--
--   `FOR UPDATE ... LIMIT 1` is a documented Postgres trap. Under READ COMMITTED the
--   blocked transaction re-checks the locked row after the winner commits, finds it no
--   longer matches `status = 'available'`, and drops it — but LIMIT has ALREADY been
--   applied, so the query does not fall through to the next candidate. A user holding
--   TWO available rewards, placing two concurrent orders, would be told
--   REWARD_UNAVAILABLE while still holding an unspent reward.
--
--   SKIP LOCKED steps over the row the other transaction is holding and takes the next
--   available one instead. Two concurrent orders with two rewards: both succeed, each
--   spending a different reward — which is what the user is entitled to.
--
-- With ONE reward and two concurrent orders, the loser skips the only candidate, finds
-- nothing, and raises REWARD_UNAVAILABLE. Exactly one order gets the discount. The
-- reward is spent exactly once. That is the CLAUDE.md guardrail, and it holds.
--
-- SKIP LOCKED fails closed, never open: the worst case is a caller told
-- REWARD_UNAVAILABLE while a reward it could have had is momentarily locked by a
-- transaction that then rolls back. A retry gets it. Nobody ever double-spends.
-- ============================================================================
create or replace function public.place_order(
  p_items            jsonb,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_address text,
  p_redeem_reward    boolean default false,
  p_client_token     uuid    default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user        uuid := auth.uid();
  v_order_id    uuid;
  v_existing_id uuid;
  v_reward_id   uuid;
  v_probe       integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED'
      using errcode = '42501',
            hint    = 'auth.uid() is null. Call this RPC with a signed-in user session.';
  end if;

  -- -- 1. Idempotent replay ---------------------------------------------------
  -- A double-clicked checkout resends the same client_token. Return the order we
  -- already made instead of making a second one.
  --
  -- The advisory lock serializes concurrent calls carrying the SAME token, and it is
  -- required — a bare read below is not enough:
  --
  --   Click 2 arrives while click 1 is still UNCOMMITTED. Click 1's order is invisible,
  --   so click 2's read finds nothing and proceeds. It then reaches the reward claim,
  --   which is `for update SKIP LOCKED` — so it does NOT block, it steps over the reward
  --   click 1 is holding, finds none, and raises a FALSE 'REWARD_UNAVAILABLE' for a user
  --   who has a reward and whose order is about to exist. A real double-click on
  --   "Place order" with "use my reward" ticked would show an error and an order.
  --
  -- Blocking on the TOKEN fixes it at the right level: click 2 waits here, click 1
  -- commits, click 2 wakes, re-reads, finds the order, and returns it. Idempotency is
  -- restored without reintroducing the FOR UPDATE ... LIMIT 1 trap on the reward.
  --
  -- xact-scoped: released automatically at commit/rollback. Nothing to leak.
  if p_client_token is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user::text || ':' || p_client_token::text, 0)
    );

    select o.id into v_existing_id
    from public.orders o
    where o.user_id = v_user
      and o.client_token = p_client_token;

    if found then
      return public.order_payload(v_existing_id);
    end if;
  end if;

  -- -- 2. Validate the delivery details --------------------------------------
  if coalesce(btrim(p_customer_name), '')    = ''
     or coalesce(btrim(p_customer_phone), '')   = ''
     or coalesce(btrim(p_customer_address), '') = '' then
    raise exception 'INVALID_CUSTOMER_DETAILS'
      using errcode = 'P0001',
            hint    = 'p_customer_name, p_customer_phone and p_customer_address are all required.';
  end if;

  -- -- 3. Validate the cart shape --------------------------------------------
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART'
      using errcode = 'P0001',
            hint    = 'p_items must be a non-empty JSON array of {"product_id": <uuid>, "qty": <int>}.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object'
       or nullif(btrim(coalesce(e ->> 'product_id', '')), '') is null
       or nullif(btrim(coalesce(e ->> 'qty', '')), '')        is null
  ) then
    raise exception 'INVALID_ITEMS'
      using errcode = 'P0001',
            hint    = 'Every element of p_items must be an object with non-null product_id and qty.';
  end if;

  -- Casting garbage ('abc' as a uuid) raises 22P02 from deep inside a query, which
  -- would reach the caller as an opaque Postgres error. Convert it to our code.
  --
  -- The casts are wrapped in count() ON PURPOSE. The obvious form — `select 1 from
  -- (select (e->>'product_id')::uuid from ...) t` — does NOT work: the outer query
  -- never references the cast, so the planner flattens the subquery, prunes the
  -- expression, never evaluates it, and this validation silently passes on garbage.
  -- count(expr) forces evaluation of expr for every row. Do not "simplify" this.
  begin
    select count((e ->> 'product_id')::uuid)
         + count((e ->> 'qty')::integer)
      into v_probe
    from jsonb_array_elements(p_items) e;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_ITEMS'
        using errcode = 'P0001',
              hint    = 'product_id must be a uuid and qty must be an integer.';
  end;

  -- Aggregate qty per product first, THEN range-check: a client sending the same
  -- product on 30 lines of 1 must not slip past a per-line check.
  if exists (
    select 1
    from (
      select (e ->> 'product_id')::uuid   as product_id,
             sum((e ->> 'qty')::integer)  as qty
      from jsonb_array_elements(p_items) e
      group by 1
    ) a
    where a.qty < 1 or a.qty > 20
  ) then
    raise exception 'INVALID_QTY'
      using errcode = 'P0001',
            hint    = 'Quantity per product, after merging duplicate cart lines, must be between 1 and 20.';
  end if;

  -- -- 4. Lock and claim the reward -------------------------------------------
  if coalesce(p_redeem_reward, false) then
    select r.id into v_reward_id
    from public.loyalty_rewards r
    where r.user_id = v_user
      and r.status  = 'available'
    order by r.issued_at asc, r.id asc
    for update skip locked     -- <- the concurrency guarantee. See the header.
    limit 1;

    if v_reward_id is null then
      -- Belt-and-braces re-check of idempotency.
      --
      -- With the advisory lock at step 1 this is now unreachable for a same-token race:
      -- click 2 can no longer BE here while click 1 is in flight, because it is still
      -- waiting on the token lock. (It was reachable, and load-bearing, when the reward
      -- claim was a blocking `for update` — the block happened HERE rather than at the
      -- token. `skip locked` moved the failure, which is why the lock moved too.)
      --
      -- Kept anyway: it costs one indexed lookup on a path that is already failing, and
      -- it is the difference between a false error and a correct answer if the advisory
      -- lock is ever removed by someone who does not read this comment.
      if p_client_token is not null then
        select o.id into v_existing_id
        from public.orders o
        where o.user_id = v_user
          and o.client_token = p_client_token;

        if found then
          return public.order_payload(v_existing_id);
        end if;
      end if;

      -- No order under our token: this is a genuinely different order competing for
      -- the same reward, and it lost. That is the case that must fail.
      raise exception 'REWARD_UNAVAILABLE'
        using errcode = 'P0001',
              hint    = 'Redemption was requested but the user has no available reward (or it was just claimed by a concurrent order).';
    end if;
  end if;

  -- -- 5. Price, insert order, insert items — ONE statement --------------------
  -- One statement means one snapshot: the price used for the subtotal is provably
  -- the same price snapshotted onto each line. Splitting this in two would let a
  -- concurrently committed price change make subtotal_cents disagree with the sum
  -- of the lines.
  --
  -- `where t.cart_lines = t.priced_lines` is the fail-closed guard: if any product
  -- is missing or inactive, `priced` has fewer rows than `cart`, ZERO orders are
  -- inserted, and we raise below. An order is never silently placed with a dropped
  -- line — a partial order is worse than a rejected one.
  begin
    with cart as (
      select (e ->> 'product_id')::uuid          as product_id,
             sum((e ->> 'qty')::integer)::integer as qty
      from jsonb_array_elements(p_items) e
      group by 1
    ),
    priced as (
      select c.product_id,
             c.qty,
             p.price_cents
      from cart c
      join public.products p
        on p.id = c.product_id
       and p.active
    ),
    totals as (
      select coalesce(sum(pr.price_cents * pr.qty), 0)::integer as subtotal_cents,
             count(pr.product_id)::integer                      as priced_lines,
             (select count(*) from cart)::integer               as cart_lines
      from priced pr
    ),
    computed as (
      select t.subtotal_cents,
             t.priced_lines,
             t.cart_lines,
             -- 50% off the subtotal. Integer division on (subtotal + 1) rounds the
             -- discount UP on an odd number of cents — the half-cent goes to the
             -- customer, never to us. Deliberate, and stated in CONTRACT.md.
             case
               when v_reward_id is null then 0
               else (t.subtotal_cents + 1) / 2
             end as discount_cents
      from totals t
    ),
    new_order as (
      insert into public.orders (
        user_id, status, subtotal_cents, discount_cents, total_cents,
        reward_id, customer_name, customer_phone, customer_address, client_token
      )
      select v_user,
             'pending',
             c.subtotal_cents,
             c.discount_cents,
             c.subtotal_cents - c.discount_cents,
             v_reward_id,
             btrim(p_customer_name),
             btrim(p_customer_phone),
             btrim(p_customer_address),
             p_client_token
      from computed c
      where c.cart_lines = c.priced_lines
        and c.priced_lines > 0
      returning id
    ),
    ins_items as (
      insert into public.order_items (order_id, product_id, qty, unit_price_cents)
      select n.id,
             pr.product_id,
             pr.qty,
             pr.price_cents        -- the snapshot. Never from the client.
      from new_order n
      cross join priced pr
      returning 1
    )
    select n.id into v_order_id
    from new_order n;
  exception
    when unique_violation then
      -- Two identical checkouts raced past step 1 and collided on
      -- orders_user_client_token_key. Exactly one order exists; return it.
      if p_client_token is not null then
        select o.id into v_existing_id
        from public.orders o
        where o.user_id = v_user
          and o.client_token = p_client_token;

        if found then
          return public.order_payload(v_existing_id);
        end if;
      end if;
      raise;   -- any other unique violation is a real bug. Do not swallow it.
  end;

  if v_order_id is null then
    raise exception 'PRODUCT_UNAVAILABLE'
      using errcode = 'P0001',
            hint    = 'One or more products in the cart do not exist or are not active. No order was created.';
  end if;

  -- -- 6. Burn the reward ------------------------------------------------------
  if v_reward_id is not null then
    update public.loyalty_rewards
    set status      = 'redeemed',
        redeemed_at = now(),
        order_id    = v_order_id
    where id      = v_reward_id
      and user_id = v_user
      and status  = 'available';

    if not found then
      -- Unreachable while we hold the FOR UPDATE lock. Kept because an invariant
      -- worth relying on is worth asserting: if it ever fires, the whole order
      -- rolls back rather than shipping a free 50% off.
      raise exception 'REWARD_UNAVAILABLE'
        using errcode = 'P0001',
              hint    = 'Reward was claimed between lock and redeem. Order rolled back.';
    end if;
  end if;

  return public.order_payload(v_order_id);
end;
$$;

comment on function public.place_order(jsonb, text, text, text, boolean, uuid) is
  'Places a pending order. Recomputes subtotal from products (never trusts a client price), redeems one available reward under SELECT ... FOR UPDATE SKIP LOCKED. Idempotent on p_client_token. Returns the order + items as jsonb.';


-- ============================================================================
-- confirm_order
--
-- Idempotency, precisely: the conditional UPDATE ... WHERE status = 'pending' IS
-- the gate. Only one transaction can ever move a row out of 'pending' — a second
-- concurrent confirm blocks on the row lock, then re-checks its WHERE against the
-- committed row, finds status = 'confirmed', and updates ZERO rows. A bare
-- `update ... set status='confirmed'` (no status predicate) would succeed twice and
-- double-increment the loyalty counter, minting a free reward per double-click.
--
-- The counter is therefore incremented on the transition, not on the call.
-- ============================================================================
create or replace function public.confirm_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_status text;
  v_count  integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED'
      using errcode = '42501',
            hint    = 'auth.uid() is null. Call this RPC with a signed-in user session.';
  end if;

  -- The atomic gate. Note `user_id = v_user`: ownership is enforced HERE, inside the
  -- function, on auth.uid() — not merely by an RLS select policy. A client passing
  -- someone else's order id changes nothing.
  update public.orders
  set status       = 'confirmed',
      confirmed_at = now()
  where id      = p_order_id
    and user_id = v_user
    and status  = 'pending';

  if not found then
    select o.status into v_status
    from public.orders o
    where o.id      = p_order_id
      and o.user_id = v_user;

    if not found then
      -- Also the answer for "someone else's order". Deliberately indistinguishable
      -- from a non-existent one: do not leak the existence of other users' rows.
      raise exception 'ORDER_NOT_FOUND'
        using errcode = 'P0001',
              hint    = 'No order with that id belongs to the current user.';
    end if;

    if v_status = 'confirmed' then
      -- Idempotent replay. No second increment, no second reward. This is the
      -- double-clicked "Confirm" button, and it is a no-op by design.
      return public.order_payload(p_order_id);
    end if;

    raise exception 'ORDER_NOT_PENDING'
      using errcode = 'P0001',
            hint    = 'Order status is ' || v_status || '; only a pending order can be confirmed.';
  end if;

  -- We won the transition, exactly once. Count it exactly once.
  update public.profiles
  set confirmed_orders_count = confirmed_orders_count + 1
  where id = v_user
  returning confirmed_orders_count into v_count;

  -- Every 5th confirmed order mints exactly one reward. A discounted order still
  -- counts toward the next 5 (CLAUDE.md loyalty rule 4) — nothing here excludes it.
  --
  -- source_order_id records WHICH order minted it. That link is what lets cancel_order
  -- take the reward back. Without it, confirm -> cancel -> confirm -> cancel re-crosses
  -- the multiple-of-5 threshold forever and mints a free 50%-off reward every three RPC
  -- calls. There is no payment in this app, so nothing else throttles that loop.
  if v_count % 5 = 0 then
    insert into public.loyalty_rewards (user_id, kind, status, source_order_id)
    values (v_user, 'half_off', 'available', p_order_id)
    on conflict (source_order_id) where source_order_id is not null do nothing;
  end if;

  return public.order_payload(p_order_id);
end;
$$;

comment on function public.confirm_order(uuid) is
  'Confirms a pending order. Idempotent: the conditional UPDATE on status=pending gates the counter increment. Issues one half_off reward when confirmed_orders_count hits a multiple of 5. Returns the order + items as jsonb.';


-- ============================================================================
-- cancel_order
--
-- Cancelling a CONFIRMED order decrements the counter (CLAUDE.md loyalty rule 1).
-- Cancelling a pending one does not (it was never counted).
--
-- Cancellation moves rewards in TWO opposite directions, and they are not the same
-- reward:
--
--   REVOKE (-> 'expired'), if and only if the decrement DOWN-CROSSES a multiple of 5.
--       Keyed on the crossing, NOT on which order is cancelled — see the long comment
--       at the revoke block below for why identity-keying is trivially evaded.
--   RESTORE (-> 'available'), the reward THIS order SPENT (reward_id). The user
--       cancelled and got nothing; they keep a reward they had legitimately earned.
--
-- An order can trigger both — it can spend reward A and, as the 5th confirmed order,
-- mint reward B. Cancelling it restores A and revokes one reward (preferring B).
--
-- Cancellation is a state transition, never a row delete: deleting the row would
-- strand the loyalty arithmetic and destroy the order history. There is no DELETE
-- policy or grant on orders anywhere in this schema.
-- ============================================================================
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user           uuid := auth.uid();
  v_status         text;
  v_reward_id      uuid;
  v_old_count      integer;
  v_revoked_id     uuid;
  v_reprice_order  uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED'
      using errcode = '42501',
            hint    = 'auth.uid() is null. Call this RPC with a signed-in user session.';
  end if;

  -- Hold the order row for the whole transition, so a concurrent confirm_order
  -- cannot slip between our read of the status and our write of it.
  select o.status, o.reward_id
    into v_status, v_reward_id
  from public.orders o
  where o.id      = p_order_id
    and o.user_id = v_user
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND'
      using errcode = 'P0001',
            hint    = 'No order with that id belongs to the current user.';
  end if;

  if v_status = 'cancelled' then
    return public.order_payload(p_order_id);   -- idempotent replay: no double decrement
  end if;

  -- reward_id is cleared so the returned reward can be attached to a future order:
  -- orders_reward_id_key is a UNIQUE index, and a stale pointer from this cancelled
  -- order would block the next redemption of the same reward.
  update public.orders
  set status    = 'cancelled',
      reward_id = null
  where id = p_order_id;

  -- ==========================================================================
  -- RESTORE the reward THIS order SPENT — and it MUST run BEFORE the revoke below.
  --
  -- ORDER OF THESE TWO BLOCKS IS LOAD-BEARING. Do not move this after the revoke.
  --
  -- The revoke block hunts for a reward to expire. Its primary query looks for an
  -- 'available' one; its fallback looks for one spent on a still-'pending' order. The
  -- order being cancelled is, by the UPDATE directly above, no longer 'pending' — it is
  -- 'cancelled'. So if the reward is still sitting in 'redeemed' state pointing at THIS
  -- order, the revoke can see it through NEITHER query, finds nothing, expires nothing…
  -- and then this restore block hands that very reward back as 'available'. Revoke and
  -- restore fight over one row and restore wins. That was a live mint:
  --
  --   count=4: confirm A -> count=5, mint R1 | place B redeeming R1 | confirm B -> 6
  --            cancel A  -> 6 no down-cross  | cancel B -> DOWN-CROSS, but R1 is
  --            'redeemed' on B which is now 'cancelled' -> revoke finds nothing ->
  --            restore hands R1 back -> count=4 with R1 AVAILABLE. floor(4/5) = 0.
  --
  -- Restoring FIRST puts the reward back into 'available', where the revoke's primary
  -- query can see it, evaluate it against the down-crossing, and expire it if it is not
  -- earned. Restore proposes; revoke disposes. That is the correct sequence.
  -- ==========================================================================
  if v_reward_id is not null then
    update public.loyalty_rewards
    set status      = 'available',
        redeemed_at = null,
        order_id    = null
    where id      = v_reward_id
      and user_id  = v_user
      and status  = 'redeemed';
  end if;

  -- Only a CONFIRMED order was ever counted, so only a confirmed order decrements.
  if v_status = 'confirmed' then
    -- Read the count under a row lock so the down-crossing test below is computed
    -- against a value nobody can change underneath us.
    select p.confirmed_orders_count into v_old_count
    from public.profiles p
    where p.id = v_user
    for update;

    -- greatest(…, 0) is belt to the check constraint's braces.
    update public.profiles
    set confirmed_orders_count = greatest(v_old_count - 1, 0)
    where id = v_user;

    -- ======================================================================
    -- REVOKE ON DOWN-CROSSING — this is the anti-mint rule.
    --
    -- THE INVARIANT: rewards granted == floor(confirmed_orders_count / 5).
    --   confirm_order mints on an UP-crossing of a multiple of 5.
    --   cancel_order revokes on a DOWN-crossing. Exactly symmetric.
    --
    -- The test is `v_old_count % 5 = 0` — i.e. floor(old/5) > floor(new/5). Note what
    -- it does NOT depend on: WHICH order is being cancelled. Keying revocation on the
    -- minting order instead (expire only the reward whose source_order_id is this
    -- order) looks right and is trivially evaded — cancel a DIFFERENT confirmed order:
    --
    --   count=4 -> confirm A  -> count=5, mint R1 (source = A)
    --             cancel 3    -> count=4, R1's source is A, not 3 -> kept
    --             confirm A2  -> count=5, mint R2
    --             cancel 2    -> count=4, R2 kept ...           forever, 2 calls/reward
    --
    -- The mint is keyed on crossing a threshold, so the revoke must be too. Anything
    -- keyed on order identity is asymmetric, and an asymmetric ledger is a mint.
    -- ======================================================================
    if v_old_count > 0 and v_old_count % 5 = 0 then

      -- Revoke exactly ONE reward. Prefer an unspent one, and among those prefer the
      -- one this very order minted (keeps the audit trail intuitive in the common
      -- case where the cancelled order IS the minter).
      select r.id into v_revoked_id
      from public.loyalty_rewards r
      where r.user_id = v_user
        and r.status  = 'available'
      -- coalesce(..., false), not a bare comparison: `DESC` defaults to NULLS FIRST in
      -- Postgres, so a reward with a NULL source_order_id would sort AHEAD of the true
      -- match and steal the preference. confirm_order always sets source_order_id, so
      -- this cannot bite today — it is here so it cannot bite tomorrow either.
      order by coalesce(r.source_order_id = p_order_id, false) desc,  -- this order's own mint first
               r.issued_at desc                                       -- else the newest
      limit 1
      for update;

      if v_revoked_id is not null then
        update public.loyalty_rewards
        set status = 'expired'
        where id = v_revoked_id;

      else
        -- No unspent reward left: the reward has already been SPENT on some other order.
        -- Reclaim it from that order and put the order back to full price.
        --
        -- The order may be 'pending' OR 'confirmed'. Both. This is deliberate and it is
        -- what makes the invariant TOTAL rather than merely usually-true.
        --
        -- The instinct to spare a confirmed order — "the food was delivered, don't
        -- re-bill them" — is imported from a real store and does not apply here. THIS APP
        -- HAS NO PAYMENT AND NO FULFILMENT (CLAUDE.md §Payment: checkout is simulated,
        -- nothing is ever charged and nothing is ever cooked). Repricing a confirmed order
        -- moves an integer in a column. It refunds nothing and charges nothing.
        --
        -- Sparing it left a real leak: confirm the half-price order BEFORE cancelling and
        -- the reward became unreachable, so the down-crossing revoked nothing:
        --   confirm X -> count=5, mint R | place D redeeming R | confirm D -> count=6
        --   cancel 3 -> 5 (no cross) | cancel 2 -> 4 DOWN-CROSS -> R is spent on D, and D
        --   is 'confirmed' -> revoke finds nothing -> D stays half price at count=4.
        -- Bounded, but a leak. A ledger invariant with an asterisk is not an invariant.
        --
        -- 'cancelled' is excluded on purpose, not by oversight: the RESTORE block above
        -- guarantees no reward is ever left 'redeemed' against a cancelled order, so such
        -- a row cannot exist. Listing the statuses explicitly keeps that assumption honest.
        select r.id, r.order_id into v_revoked_id, v_reprice_order
        from public.loyalty_rewards r
        join public.orders o on o.id = r.order_id
        where r.user_id = v_user
          and r.status  = 'redeemed'
          and o.status in ('pending', 'confirmed')
        -- Prefer to disturb the LEAST-committed order: take the discount back off a
        -- pending order before touching a confirmed one. o.status is NOT NULL, so this
        -- boolean sort has no NULLS-FIRST trap (unlike the source_order_id sort above).
        order by (o.status = 'pending') desc,
                 r.issued_at desc
        limit 1
        for update of r;

        if v_revoked_id is not null then
          update public.loyalty_rewards
          set status = 'expired'
          where id = v_revoked_id;

          update public.orders
          set reward_id      = null,
              discount_cents = 0,
              total_cents    = subtotal_cents
          where id      = v_reprice_order
            and user_id = v_user
            and status in ('pending', 'confirmed');
        end if;

        -- Reaching here having found NEITHER an available reward nor a spent one is now
        -- unreachable while the invariant holds: a down-crossing means floor(count/5) just
        -- fell from k to k-1 with k >= 1, so k non-expired rewards existed, and every
        -- non-expired reward is either 'available' or 'redeemed' against a live
        -- (pending|confirmed) order. Both queries above cover that space exhaustively.
        -- If this branch ever executes, the ledger was ALREADY corrupt before this call.
      end if;
    end if;
  end if;

  -- (The RESTORE block used to live here, AFTER the revoke. That ordering was the
  -- JAMR-6 mint: see the long comment on the restore block above. It now runs before
  -- the revoke, and it must stay there.)

  return public.order_payload(p_order_id);
end;
$$;

comment on function public.cancel_order(uuid) is
  'Cancels a pending or confirmed order. Idempotent. If the order was confirmed: decrements confirmed_orders_count and, on a DOWN-CROSSING of a multiple of 5, revokes one reward (expired) — falling back to reclaiming a reward already spent on a still-pending order, repricing that order to full price. Always restores a reward this order itself spent. Invariant: rewards granted == floor(confirmed_orders_count / 5). Returns the order + items as jsonb.';


-- ============================================================================
-- EXECUTE privileges.
--
-- PUBLIC holds EXECUTE on new functions by default — which would expose every RPC
-- to the anon role. Revoke first, then grant to authenticated only. An anonymous
-- caller has no auth.uid() and would be rejected anyway, but an unauthenticated
-- caller should not be able to reach the function body at all.
-- ============================================================================
revoke execute on function public.order_payload(uuid)                                from public, anon, authenticated;
revoke execute on function public.place_order(jsonb, text, text, text, boolean, uuid) from public, anon;
revoke execute on function public.confirm_order(uuid)                                 from public, anon;
revoke execute on function public.cancel_order(uuid)                                  from public, anon;

grant execute on function public.place_order(jsonb, text, text, text, boolean, uuid) to authenticated;
grant execute on function public.confirm_order(uuid)                                  to authenticated;
grant execute on function public.cancel_order(uuid)                                   to authenticated;

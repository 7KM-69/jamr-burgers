# JAMR — Database

Everything in this folder is owned by `db`. **`CONTRACT.md` is the handoff artifact** — `api` builds
against it. This README is how you *apply* and *verify* what `CONTRACT.md` describes.

> **Status: this SQL has never been executed.** There is no Supabase project and no credentials.
> It was validated by review, not by running it. §4 is the checklist that turns that around.

---

## 1. Apply, in this order

The order matters: `0002` grants on tables `0001` creates; `0003` calls them; `seed.sql` needs the
CHECK constraints from `0001` to catch a bad `image_path`.

```
supabase/migrations/0001_schema.sql     tables, constraints, indexes, triggers
supabase/migrations/0002_rls.sql        RLS + policies + column grants
supabase/migrations/0003_functions.sql  place_order / confirm_order / cancel_order
supabase/seed.sql                       the 6 products
```

### Option A — Supabase SQL Editor (no CLI needed; this is the fast path)
Open the SQL Editor in the dashboard, paste each file **in full**, run them **one at a time, in the
order above**. Each file is idempotent-safe to the extent noted; `0001` is not — it will fail on a
second run because the tables already exist. That is correct behaviour for a migration.

### Option B — Supabase CLI
```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies migrations/ in filename order
psql "$DIRECT_URL" -f supabase/seed.sql
```

### A reset, if you need one during development
```sql
-- Destructive. Drops all app data. Never run this against anything real.
drop table if exists public.order_items     cascade;
drop table if exists public.loyalty_rewards cascade;
drop table if exists public.orders          cascade;
drop table if exists public.products        cascade;
drop table if exists public.profiles        cascade;
drop function if exists public.place_order(jsonb, text, text, text, boolean, uuid);
drop function if exists public.confirm_order(uuid);
drop function if exists public.cancel_order(uuid);
drop function if exists public.order_payload(uuid);
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at()  cascade;
```
Then re-apply from `0001`. Note `auth.users` rows survive this — the `on_auth_user_created` trigger
is dropped with `handle_new_user`, so existing users will have **no profile row** after a reset.
Delete the test users too, or re-insert their profiles by hand.

---

## 2. Migrations are forward-only

**Never edit a migration that has been applied.** Every change is a new file: `0004_*.sql`,
`0005_*.sql`. Editing `0001` after it has run means the database and the repo disagree, and the next
person to run a fresh setup gets a different schema than production. That is the whole reason the
files are numbered.

---

## 3. Connection strings — get these the right way round

Supabase gives you more than one, and swapping them is a bug that looks fine locally and fails in
production under load.

| use | connection | why |
|---|---|---|
| **Application queries** (Next.js, serverless) | **Pooler, transaction mode** (port `6543`) | Serverless spawns many short-lived instances. Each one opening a direct connection exhausts the database's connection limit at exactly the traffic you wanted. |
| **Migrations, `psql`, seeding** | **Direct connection** (port `5432`) | Session-level things (advisory locks, `set` statements, DDL in some tools) need a session, which transaction pooling does not give you. |

**In transaction-pooling mode, prepared statements do not survive across connections.** If a Postgres
driver is ever added to this project (`postgres-js`, `pg`, Drizzle, Prisma), it must be configured
with prepared statements **off** (`prepare: false`, or `?pgbouncer=true` on the URL). Skipping this
produces intermittent `prepared statement "s1" already exists` errors under load, which are horrible
to diagnose because they never reproduce on one request.

**This does not currently apply to JAMR.** `api` talks to Supabase over PostgREST (`@supabase/ssr`
→ HTTPS), not over the Postgres wire protocol, so there is no pool to exhaust and no prepared
statement to break. This section exists so that the day someone adds a direct driver, they do not
learn it the expensive way.

---

## 4. Verification — do this the day Supabase is provisioned

Nothing below has been run. Everything below **must** pass before checkout is called done.
Run each block in the SQL Editor.

### 4.1 Every table has RLS on
```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
order by relname;
-- EXPECT: relrowsecurity = true for all 5 tables. A single `false` is a hole.
```

### 4.2 The policy set is what CONTRACT.md says it is
```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
-- EXPECT exactly 6 policies, all SELECT except profiles_update_own:
--   loyalty_rewards_select_own  SELECT  {authenticated}
--   order_items_select_own      SELECT  {authenticated}
--   orders_select_own           SELECT  {authenticated}
--   products_select_all         SELECT  {anon,authenticated}
--   profiles_select_own         SELECT  {authenticated}
--   profiles_update_own         UPDATE  {authenticated}
-- No INSERT/DELETE policy anywhere is CORRECT: writes are RPC-only.
```

### 4.3 The client really cannot write
```sql
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
order by table_name, privilege_type;
-- EXPECT: SELECT only — plus exactly one UPDATE, on profiles.
-- If you see INSERT or DELETE on orders / order_items / loyalty_rewards,
-- Supabase's default grants were not revoked and the loyalty system is forgeable.

select column_name, privilege_type
from information_schema.column_privileges
where grantee = 'authenticated' and table_name = 'profiles' and privilege_type = 'UPDATE';
-- EXPECT: exactly one row -> full_name.
-- If confirmed_orders_count appears here, any user can grant themselves rewards.
```

### 4.4 RLS actually holds against another user's rows
Create two users in the dashboard (Authentication → Users), then:
```sql
-- Impersonate user A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';

select count(*) from public.orders;          -- EXPECT: only A's orders
select count(*) from public.loyalty_rewards; -- EXPECT: only A's rewards

-- Now try to read B's row explicitly. THIS MUST RETURN 0 ROWS, not an error and not a row.
select * from public.orders where user_id = '<USER_B_UUID>';   -- EXPECT: 0 rows

-- Try to cheat the loyalty counter. THIS MUST FAIL.
update public.profiles set confirmed_orders_count = 500 where id = '<USER_A_UUID>';
-- EXPECT: ERROR: permission denied for column confirmed_orders_count

-- Try to mint a reward. THIS MUST FAIL.
insert into public.loyalty_rewards (user_id) values ('<USER_A_UUID>');
-- EXPECT: ERROR: permission denied for table loyalty_rewards

-- Try to write an order directly with a price of your choosing. THIS MUST FAIL.
insert into public.orders (user_id, subtotal_cents, discount_cents, total_cents,
                           customer_name, customer_phone, customer_address)
values ('<USER_A_UUID>', 1, 0, 1, 'x', '12345', 'y');
-- EXPECT: ERROR: permission denied for table orders

reset role;
```
**An untested policy is not a policy.** If any of the four "MUST FAIL" statements succeeds, stop and
fix it before writing a line of checkout code.

### 4.5 Confirming another user's order is refused
```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';
select public.confirm_order('<AN_ORDER_ID_BELONGING_TO_USER_B>');
-- EXPECT: ERROR: ORDER_NOT_FOUND   (not "permission denied", not success — we do not
--         leak the existence of B's order)
reset role;
```

### 4.6 Idempotency: confirming twice moves the counter by exactly 1
```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';

select confirmed_orders_count from public.profiles where id = '<USER_A_UUID>';  -- note it
select public.confirm_order('<A_PENDING_ORDER_OF_A>');
select public.confirm_order('<THE_SAME_ORDER_ID>');   -- EXPECT: returns the order, no error
select confirmed_orders_count from public.profiles where id = '<USER_A_UUID>';
-- EXPECT: exactly +1 from the noted value. +2 means the idempotency gate is broken.
reset role;
```

### 4.7 The concurrency case: two orders, one reward — exactly one wins
This needs **two real sessions**. Open two SQL Editor tabs (or two `psql` connections).

```sql
-- Setup: give user A exactly one available reward and confirm it is there.
select count(*) from public.loyalty_rewards
where user_id = '<USER_A_UUID>' and status = 'available';   -- EXPECT: 1

-- ---- SESSION 1 ----
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';
select public.place_order(
  '[{"product_id":"<PRODUCT_UUID>","qty":1}]'::jsonb,
  'A', '0500000000', 'Addr', true, null);
-- Do NOT commit yet. Session 1 now holds the FOR UPDATE lock on the reward row.

-- ---- SESSION 2 (while session 1 is still open) ----
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';
select public.place_order(
  '[{"product_id":"<PRODUCT_UUID>","qty":1}]'::jsonb,
  'A', '0500000000', 'Addr', true, null);
-- EXPECT: ERROR: REWARD_UNAVAILABLE, returned IMMEDIATELY — it does not block.
--
-- The lock is `for update SKIP LOCKED`. Session 2 steps over the row session 1 is
-- holding, finds no other available reward, and fails closed at once. (An earlier
-- version of this file said "EXPECT: this BLOCKS" — that was the plain `for update`
-- behaviour, which had the LIMIT-1 fall-through bug. It does not block any more.)

-- ---- back in SESSION 1 ----
commit;
rollback;  -- in session 2

-- Final state:
select status, order_id from public.loyalty_rewards where user_id = '<USER_A_UUID>';
-- EXPECT: exactly one row, status = 'redeemed', pointing at session 1's order.
select count(*) from public.orders where user_id = '<USER_A_UUID>' and discount_cents > 0;
-- EXPECT: 1. If this is 2, the reward was spent twice and the lock is not working.
```

### 4.7b Two rewards, two concurrent orders — BOTH must succeed
This is the case `skip locked` exists for. Give user A **two** available rewards, then run the two
sessions from 4.7 again, both with `p_redeem_reward = true`.

```sql
-- EXPECT: both place_order calls SUCCEED, each with discount_cents > 0, each having
-- redeemed a DIFFERENT reward.
select id, status, order_id from public.loyalty_rewards where user_id = '<USER_A_UUID>';
-- EXPECT: two rows, both 'redeemed', pointing at two different orders.
--
-- If session 2 fails with REWARD_UNAVAILABLE while a reward is still 'available', the
-- lock has regressed to a plain `for update ... limit 1`: the blocked row is discarded
-- after re-check, but LIMIT was already applied, so it never falls through to the
-- second reward. That is the trap `skip locked` removes.
```

### 4.7c The mint loop is closed — the one that matters most
An earlier version of this schema let a user mint unlimited 50%-off rewards with two RPC calls
each. There is no payment in this app, so nothing else throttles the loop. **Run this.**

```sql
-- Setup: user A has confirmed_orders_count = 4 and several confirmed orders.
-- Cycle: confirm one MORE order (count -> 5, mints a reward), then cancel a
--        DIFFERENT, OLDER confirmed order (count -> 4).
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_A_UUID>","role":"authenticated"}';

select public.confirm_order('<A_PENDING_ORDER>');        -- count 4 -> 5, mints a reward
select public.cancel_order ('<AN_OLDER_CONFIRMED_ORDER>'); -- count 5 -> 4  <-- NOT the minter

select status, count(*) from public.loyalty_rewards
where user_id = '<USER_A_UUID>' group by status;
-- EXPECT: the minted reward is 'expired'. ZERO rows with status 'available'.
--
-- Repeat the cycle 3x. The user must STILL hold zero available rewards.
-- If they accumulate one reward per cycle, revocation is keyed on order identity
-- instead of on the DOWN-CROSSING of a multiple of 5, and the loyalty system is a
-- free-money printer. Note the cancelled order is deliberately NOT the one that
-- minted the reward — that is precisely the evasion this test exists to catch.
reset role;
```

### 4.7d The mint loop, variant 2 — spend the reward, then cancel BOTH orders
The reorder-sensitive one. RESTORE must run before REVOKE inside `cancel_order`; if the blocks are
ever swapped back this test fails and 4.7c still passes, which is why both exist.

```sql
-- From count = 4, zero rewards:
select public.confirm_order('<ORDER_A>');   -- count 5, mints R1
-- place an order B redeeming the reward (half price), then:
select public.confirm_order('<ORDER_B>');   -- count 6
select public.cancel_order ('<ORDER_A>');   -- count 5, no down-cross, nothing revoked
select public.cancel_order ('<ORDER_B>');   -- count 4, DOWN-CROSS

select status from public.loyalty_rewards where user_id = '<USER_A_UUID>';
-- EXPECT: 'expired'.
-- IF IT SAYS 'available': REVOKE ran before RESTORE. The revoke could not see the reward
-- (it was 'redeemed' against order B, which had already been flipped to 'cancelled' — so
-- neither 'available' nor spent-on-a-'pending'-order), expired nothing, and then RESTORE
-- handed it back. count=4 with a live reward. floor(4/5)=0. That is a mint.
```

### 4.7e The mint loop, variant 3 — CONFIRM the half-price order, then cancel
The last hole that was open. If the revoke's fallback is ever narrowed back to `o.status = 'pending'`,
4.7c and 4.7d both still pass and only this test fails. That is why it exists.

```sql
-- From count = 4, zero rewards:
select public.confirm_order('<ORDER_X>');   -- count 5, mints R
-- place order D redeeming R (half price), then CONFIRM it:
select public.confirm_order('<ORDER_D>');   -- count 6. R is now spent on a CONFIRMED order.
select public.cancel_order ('<ORDER_3>');   -- count 5. 6 % 5 != 0, no down-cross, nothing revoked.
select public.cancel_order ('<ORDER_2>');   -- count 4. DOWN-CROSS.

select status from public.loyalty_rewards where user_id = '<USER_A_UUID>';
-- EXPECT: 'expired'.

select discount_cents, total_cents, subtotal_cents, reward_id
from public.orders where id = '<ORDER_D>';
-- EXPECT: discount_cents = 0, total_cents = subtotal_cents, reward_id IS NULL.
--         ORDER D HAS BEEN REPRICED TO FULL PRICE EVEN THOUGH IT IS CONFIRMED.
--         That is intentional: no payment, no fulfilment, so this refunds nothing and
--         charges nothing. It is what makes the invariant total.
--
-- IF D IS STILL HALF PRICE: the revoke's fallback cannot reach a confirmed order, and a
-- user can keep a free half-price order by confirming it before cancelling.
```

### 4.7f Revocation takes the CHEAPEST thing — a confirmed order is a last resort
```sql
-- Setup: user has ONE available reward AND one confirmed order that was bought with a
-- previously-redeemed reward. Then force a down-crossing by cancelling an unrelated order.
-- EXPECT: the AVAILABLE reward is expired. The confirmed order is NOT touched —
--         its discount_cents and total_cents are unchanged.
-- If the confirmed order got repriced while an unspent reward was sitting there, the
-- revoke is reaching for the expensive option first.
```

### 4.7g Double-click WITH a reward must not throw a false error
```sql
-- Two sessions, SAME p_client_token, both p_redeem_reward = true, user has 1 reward.
-- EXPECT: session 2 BLOCKS on the advisory lock, then returns session 1's order.
--         Exactly one order exists. NO 'REWARD_UNAVAILABLE'.
--
-- If session 2 errors with REWARD_UNAVAILABLE, the pg_advisory_xact_lock at the top of
-- place_order is missing: `skip locked` does not block, so session 2 raced past the
-- idempotency read while session 1 was still uncommitted.
select count(*) from public.orders
where user_id = '<USER_A_UUID>' and client_token = '<THE_SHARED_TOKEN>';
-- EXPECT: 1
```

### 4.7h THE INVARIANT — exact equality, every user, at any moment
This is the single query that catches every mint bug found on this schema. It is an **equality**, not
a bound: there is no exempt case and no asterisk. Run it after any sequence of the tests above.

```sql
select p.id,
       p.confirmed_orders_count,
       p.confirmed_orders_count / 5                    as rewards_earned,   -- floor division
       count(r.id) filter (where r.status <> 'expired') as rewards_held
from public.profiles p
left join public.loyalty_rewards r on r.user_id = p.id
group by p.id, p.confirmed_orders_count
having count(r.id) filter (where r.status <> 'expired') <> p.confirmed_orders_count / 5;

-- EXPECT: ZERO ROWS. Every row returned is a user whose reward ledger does not balance.
-- rewards_held > rewards_earned  => rewards are being minted from nothing (a mint loop).
-- rewards_held < rewards_earned  => the user has been robbed of a reward they earned.
```

And the structural assumption the revoke depends on — no non-expired reward may sit against a
cancelled order, or the revoke could fail to find anything to take:
```sql
select r.id, r.status, o.status as order_status
from public.loyalty_rewards r
join public.orders o on o.id = r.order_id
where r.status = 'redeemed' and o.status = 'cancelled';
-- EXPECT: ZERO ROWS. cancel_order always restores a spent reward before revoking.
```

### 4.8 The subtotal comes from `products`, not from the client
```sql
-- There is no parameter through which to send a price, so the test is that the
-- computed total matches the menu:
select o.subtotal_cents,
       (select sum(p.price_cents * oi.qty)
        from public.order_items oi
        join public.products p on p.id = oi.product_id
        where oi.order_id = o.id) as recomputed_from_menu
from public.orders o
where o.id = '<AN_ORDER_ID>';
-- EXPECT: the two columns are equal.
```

### 4.9 No sequential scan survives on a table that will grow
```sql
explain analyze
select id, status, subtotal_cents, total_cents, created_at
from public.orders
where user_id = '<USER_A_UUID>'
order by created_at desc
limit 20;
-- EXPECT: Index Scan using orders_user_id_created_at_idx. A Seq Scan here means the
-- index is missing and every RLS check is scanning the whole table.

explain analyze
select id from public.loyalty_rewards
where user_id = '<USER_A_UUID>' and status = 'available'
order by issued_at asc limit 1;
-- EXPECT: Index Scan using loyalty_rewards_available_idx.

explain analyze
select id, slug, name_en, price_cents from public.products
where active order by price_cents, slug;
-- EXPECT: Index Scan using products_active_price_idx.
-- (On 6 rows Postgres will legitimately prefer a Seq Scan — the planner is right at
--  this size. Re-check this one when the menu is large, or force it with
--  `set enable_seqscan = off` to confirm the index is at least usable.)
```

### 4.10 Signup creates a profile
Create a user in the dashboard, then:
```sql
select id, full_name, confirmed_orders_count from public.profiles
order by created_at desc limit 1;
-- EXPECT: the new user, count = 0. If the row is missing, the on_auth_user_created
-- trigger did not fire and every RPC will fail on the profiles FK.
```

---

## 5. If you change the schema

1. New file: `supabase/migrations/000N_<what>.sql`. Never edit an applied one.
2. Update `CONTRACT.md` **in the same change** — it is what `api` and `design` build against, and a
   contract that lags the schema by one commit is worse than no contract.
3. Tell `api` what changed. A column rename that nobody announces costs someone an afternoon.

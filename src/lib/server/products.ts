import 'server-only';

import { cache } from 'react';

import { publicClient } from '@/lib/supabase/public';
import type { Product } from '@/lib/types/api';

import { logServerError } from './errors';

/**
 * The menu. Read from a Server Component; never fetched from the browser.
 *
 * ---------------------------------------------------------------------------
 * WHAT `cache()` IS HERE, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * React's `cache()` memoizes a call **within one request's render pass**, keyed on
 * the arguments. It is NOT a cross-request cache, it has no TTL, and it stores
 * nothing between requests — the memo lives in a per-request store and dies with
 * the request. So it cannot serve a stale menu to the next visitor, and it needs
 * no invalidation: `callOrderRpc`'s `revalidatePath` and the Next.js Full Route
 * Cache are the layers that decide how long a *rendered page* lives. This layer
 * only stops the same render from asking the same question twice.
 *
 * Why it is needed: `/menu` calls `getProducts()` twice per request — once in the
 * ROOT LAYOUT (to hand the cart drawer its catalogue) and once in the PAGE (for the
 * grid). Two identical six-row index scans, two HTTP round trips to PostgREST, on
 * every render. `cache()` collapses them to one. The two call sites are in two
 * different files owned by two different agents and neither is wrong; the fix
 * belongs here, at the function, not at either caller.
 *
 * A consequence worth knowing: `cache()` memoizes a THROW as well as a value. If
 * the database read fails, the layout's call catches it (`catalogOk: false`) and
 * the page's call re-throws the *same* error immediately, with no second doomed
 * round trip. That is the behaviour we want — one render now has one coherent view
 * of whether the kitchen is reachable, instead of a drawer and a grid that can
 * disagree because their queries landed either side of a blip.
 *
 * Deliberately NOT used here: `unstable_cache` / `"use cache"`. Those persist
 * across requests, and nothing about this data justifies the extra invalidation
 * surface — the menu is already served from the Full Route Cache.
 */

/**
 * Explicit column list — never `select('*')`.
 *
 * `active`, `created_at` and `updated_at` are deliberately not selected: the UI has
 * no use for them, and every row this module returns is active by construction.
 */
const PRODUCT_COLUMNS =
  'id, slug, name_en, name_ar, desc_en, desc_ar, price_cents, bun, patty, spice_level, kcal, protein_g, prep_min, image_path';

/**
 * `products`' RLS SELECT policy is `using (true)` — NOT `using (active)`.
 *
 * That is deliberate on `db`'s side: a past order may reference a retired product,
 * and if the policy hid inactive rows, the user's own order history would render
 * with a hole in it.
 *
 * The consequence is ours: **nothing upstream filters the menu for us.** Drop the
 * `.eq('active', true)` below and delisted burgers appear on the menu, orderable
 * right up until `place_order` rejects the whole cart with `PRODUCT_UNAVAILABLE`.
 */
const ACTIVE_ONLY = true;

/**
 * All active products, in the stable menu order defined by CONTRACT.md §1:
 * `price_cents asc, slug asc`. Covered by the partial index
 * `products_active_price_idx`, so this is an index scan, not a sort of the table.
 *
 * Deduped per request (see the note at the top of this file): call it from as many
 * Server Components as you like — the root layout and the page both do — and it
 * queries once.
 */
export const getProducts = cache(async (): Promise<Product[]> => {
  const { data, error } = await publicClient
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('active', ACTIVE_ONLY)
    .order('price_cents', { ascending: true })
    .order('slug', { ascending: true })
    .returns<Product[]>();

  if (error) {
    logServerError('products.getProducts', error, { pgCode: error.code ?? null });
    // Throw rather than return `[]`. An empty array renders an empty menu, which
    // looks like "we sell nothing" instead of "something is broken" — and nobody
    // investigates a page that renders. The error boundary is the honest outcome.
    throw new Error('Failed to load products.');
  }

  return data ?? [];
});

/**
 * One active product by slug, or `null` if there is no such product (or it has been
 * delisted). `null` is the caller's cue to render a 404 — `notFound()`.
 *
 * `slug` arrives from a route param, so it is hostile. It is shape-checked here
 * before it reaches a query.
 *
 * Also deduped per request, and keyed on `slug` — React's `cache()` compares
 * arguments, so two different slugs in one render are two different queries, as they
 * must be. Nothing currently calls this (there is no product detail route yet), but
 * the moment one exists it inherits App Router's canonical double-call: Next.js
 * invokes `generateMetadata()` and the page component in the same pass, and both want
 * the same row. That is the same defect `getProducts()` just had, and it is now
 * pre-empted rather than discovered.
 */
export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  // The DB constrains slug to `^[a-z0-9]+(-[a-z0-9]+)*$`. Anything else cannot
  // match a row, so reject it without a round trip.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;

  const { data, error } = await publicClient
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('slug', slug)
    .eq('active', ACTIVE_ONLY)
    // `.returns<Product[]>()` goes BEFORE the terminal call, not after it:
    // `.returns()` is defined on PostgrestTransformBuilder, but `.maybeSingle()`
    // hands back a PostgrestBuilder, which does not have it. Placed here, it
    // narrows correctly to `Product | null`.
    .returns<Product[]>()
    // `maybeSingle`, not `single`: `single` treats "no rows" as an error, and a
    // missing product is a 404, not a fault.
    .maybeSingle();

  if (error) {
    logServerError('products.getProductBySlug', error, {
      slug,
      pgCode: error.code ?? null,
    });
    throw new Error('Failed to load product.');
  }

  return data ?? null;
});

import { MenuGrid } from '@/components/menu/MenuGrid';
import { RouteIntro } from '@/components/ui/RouteIntro';
import { routeMetadata } from '@/i18n/server';
import { getProducts } from '@/lib/server/products';

export const generateMetadata = () => routeMetadata('menu');

/**
 * /menu — the first page in this project that reads from the database.
 *
 * A Server Component, so the six rows are fetched on the server and stream into the
 * HTML: no loading spinner on first paint, no client-side fetch waterfall, and no
 * Supabase call from the browser.
 *
 * `getProducts()` (owner: `api`) already filters `active` and already sorts by
 * `price_cents asc, slug asc` — CONTRACT.md §1. This page adds no ordering of its
 * own; the rank stamped on each card IS that order, and re-sorting here would make
 * the numbers lie.
 *
 * It THROWS on a database error rather than returning an empty array, which is why
 * `error.tsx` exists next to this file. That is the right trade: an empty grid looks
 * like a menu, and a page that renders is a page nobody investigates.
 */
export default async function MenuPage() {
  const products = await getProducts();

  return (
    <>
      <RouteIntro section="menu" />
      <MenuGrid products={products} />
    </>
  );
}

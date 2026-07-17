import { redirect } from 'next/navigation';

import { CheckoutView } from '@/components/checkout/CheckoutView';
import type { CartProduct } from '@/components/cart/CartProvider';
import { routeMetadata } from '@/i18n/server';
import { getLoyaltyProgress } from '@/lib/server/loyalty';
import { getProducts } from '@/lib/server/products';
import { getCurrentUser } from '@/lib/supabase/server';

export const generateMetadata = () => routeMetadata('checkout');

/**
 * The order lives entirely in the session and the client cart, so there is
 * nothing to cache or prerender here. Being explicit also stops a refactor from
 * quietly making an authenticated page static.
 */
export const dynamic = 'force-dynamic';

/**
 * /checkout is gated HERE, in the page, not only in middleware.
 *
 * Middleware is not a security boundary in next@15.1.6 — CVE-2025-66478 lets a
 * crafted request skip it, and a route whose only protection was a middleware
 * redirect is then served to an anonymous visitor. The guard has to live where
 * the order would be built. Same pattern as /account.
 *
 * `getCurrentUser()` VERIFIES the JWT with Supabase (`auth.getUser()`), rather
 * than reading and trusting the cookie (`getSession()`), so an unauthenticated
 * caller cannot forge their way onto this page.
 */
export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth?redirect=/checkout');

  // Prefill the name from the same user metadata /account reads. Nullable:
  // email+password sign-up may carry no name.
  const metadata = user.user_metadata as { full_name?: unknown } | null;
  const name = typeof metadata?.full_name === 'string' ? metadata.full_name : null;

  // Server truth for the reward affordance. The client only DISPLAYS whether one
  // exists; `place_order` re-checks under a row lock and may still refuse it. A
  // read failure defaults to "no reward" rather than crashing the page — the
  // server remains the decider, so the worst case is a soft loss, never a wrong
  // total.
  let rewardAvailable = false;
  try {
    const progress = await getLoyaltyProgress();
    rewardAvailable = (progress?.availableRewards ?? 0) > 0;
  } catch {
    rewardAvailable = false;
  }

  // The live catalogue, projected to the columns a receipt line needs — so the
  // review and confirmed screens can join `place_order`'s items (which carry a
  // slug, a qty and a price snapshot) back to a name and a photo without a second
  // query in the browser. Caught like the layout's copy: a menu read failure must
  // not take the whole page down; the review lines degrade to the slug.
  let catalog: CartProduct[] = [];
  try {
    const rows = await getProducts();
    catalog = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name_en: row.name_en,
      name_ar: row.name_ar,
      price_cents: row.price_cents,
      image_path: row.image_path,
    }));
  } catch {
    catalog = [];
  }

  return (
    <CheckoutView initialName={name} rewardAvailable={rewardAvailable} catalog={catalog} />
  );
}

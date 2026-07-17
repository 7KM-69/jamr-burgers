import { redirect } from 'next/navigation';

import { AccountView } from '@/components/auth/AccountView';
import { LoyaltyPanel } from '@/components/loyalty/LoyaltyPanel';
import { routeMetadata } from '@/i18n/server';
import { getCurrentUser } from '@/lib/supabase/server';

export const generateMetadata = () => routeMetadata('account');

/**
 * The session is the whole content of this page, so there is nothing here to
 * cache or prerender. Being explicit also stops a future refactor from quietly
 * making an authenticated page static.
 */
export const dynamic = 'force-dynamic';

/**
 * /account is gated HERE, in the page, and not only in middleware.
 *
 * Middleware is not a security boundary in next@15.1.6 — CVE-2025-66478 lets a
 * crafted request skip middleware entirely, and any route whose only protection
 * was a middleware redirect is then served to an anonymous visitor. The guard has
 * to live where the data is read.
 *
 * `getCurrentUser()` calls `supabase.auth.getUser()`, which VERIFIES the JWT with
 * Supabase, rather than `getSession()`, which merely reads and trusts the cookie.
 * An authorization decision made on `getSession()` is forgeable by anyone who can
 * set a cookie.
 *
 * Middleware still earns its keep: it refreshes the session cookie on every
 * request. The two are complementary — it is only as a *boundary* that it is
 * insufficient.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  // `full_name` is written to user metadata at sign-up (the same value the
  // `on_auth_user_created` trigger copies into `profiles.full_name`), so the name
  // is read straight off the verified user without a second query. It is nullable:
  // email+password sign-up may carry no name.
  const metadata = user.user_metadata as { full_name?: unknown } | null;
  const name = typeof metadata?.full_name === 'string' ? metadata.full_name : null;

  // The loyalty meter is a self-fetching server component, passed as a slot into
  // the client AccountView (which owns the language-reactive copy). It reads the
  // three numbers on the server via `getLoyaltyProgress()` — deduped by `cache()`
  // with the drawer's own read on this same request.
  return (
    <AccountView
      name={name}
      email={user.email ?? null}
      createdAt={user.created_at}
      loyalty={<LoyaltyPanel variant="account" />}
    />
  );
}

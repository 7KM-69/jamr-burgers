import { redirect } from 'next/navigation';

import { AuthView } from '@/components/auth/AuthView';
import { routeMetadata } from '@/i18n/server';
import { getCurrentUser } from '@/lib/supabase/server';

export const generateMetadata = () => routeMetadata('auth');

/** The session decides the whole page (already-signed-in bounces out), and there
 *  is nothing to prerender. Being explicit also stops a refactor from quietly
 *  making an auth page static. */
export const dynamic = 'force-dynamic';

/**
 * Where to send the user after they authenticate.
 *
 * `middleware.ts` bounces a signed-out visitor to `/auth?redirect=<path>` with a
 * relative path. We still re-validate it here rather than trusting it: only a
 * same-origin absolute PATH is allowed (leading `/`, not `//` which is a
 * protocol-relative URL to another host), and `/auth*` is refused so a crafted
 * `?redirect=/auth` cannot loop the already-signed-in redirect below forever.
 */
function safeRedirect(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/auth')
  ) {
    return value;
  }
  return '/account';
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = safeRedirect(redirectParam);

  // Already signed in? There is nothing to do here — go where they were headed.
  const user = await getCurrentUser();
  if (user) redirect(redirectTo);

  return <AuthView redirectTo={redirectTo} />;
}

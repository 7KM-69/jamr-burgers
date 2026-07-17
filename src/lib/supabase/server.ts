import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * `@supabase/ssr` types its `cookies` option as a UNION of the current
 * (`getAll`/`setAll`) and deprecated (`get`/`set`/`remove`) interfaces. TypeScript
 * cannot contextually type a parameter through a union, so `setAll`'s argument
 * silently falls back to implicit `any` — which `strict` then rejects (TS7006).
 *
 * Annotating it explicitly is the fix. It is not ceremony: without it, this is an
 * untyped `any` sitting directly on the session-cookie path.
 */
type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

/**
 * The request-scoped Supabase client. Anon key + this request's cookies, so every
 * query runs as the signed-in user and RLS applies.
 *
 * Create it PER REQUEST. Never hoist it to a module-level singleton: it closes
 * over one request's cookie jar, and a shared instance would serve one user's
 * session to another.
 *
 * Uses the `getAll` / `setAll` cookie interface. The older `get`/`set`/`remove`
 * triple is deprecated in @supabase/ssr and silently drops refreshed sessions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies — Next throws here by design.
          //
          // Ignoring it is safe ONLY because `middleware.ts` refreshes the session
          // on every request and writes the rotated cookies there. If the
          // middleware matcher is ever narrowed to exclude a route, that route
          // loses session refresh and users get logged out when the access token
          // expires. The two are load-bearing together.
          //
          // Server Actions and Route Handlers CAN set cookies, so this branch is
          // not taken on the sign-in / sign-out paths that actually need to write.
        }
      },
    },
  });
}

/**
 * The verified current user, or `null`.
 *
 * Always this — never `getSession()` — on the server. `getSession()` reads the
 * cookie and trusts its contents; `getUser()` verifies the JWT with Supabase.
 * An authorization decision made on `getSession()` is forgeable by anyone who can
 * write a cookie.
 *
 * DELIBERATELY NOT wrapped in React `cache()`, unlike `getProducts()` and
 * `getLoyaltyProgress()`. This is a decision, not an oversight:
 *
 *  - There is nothing left to dedupe. Its only repeat caller was
 *    `getLoyaltyProgress()`, and that function is now itself memoized per request,
 *    so it calls this exactly once. The order actions call it once each.
 *  - It sits on the auth-MUTATION path, where a memo is a genuine hazard: a Server
 *    Action and the re-render its `revalidatePath('/', 'layout')` triggers run in one
 *    request, so a cached identity read could outlive the sign-in or sign-out that
 *    invalidated it and report the wrong user to the render that follows.
 *
 * If a Server Component ever needs both the user and the loyalty meter and the double
 * `auth.getUser()` round trip starts to show, memoize it THEN — and check first that
 * no action reads it before mutating the session.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  // A missing/expired session is not an exceptional condition — it is a signed-out
  // visitor. Report it as `null`, and do not log it as an error.
  if (error || !data.user) return null;

  return data.user;
}

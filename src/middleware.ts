import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env';

/**
 * See `src/lib/supabase/server.ts`: `@supabase/ssr` types `cookies` as a union of
 * the current and deprecated interfaces, so TypeScript cannot contextually type
 * `setAll`'s parameter and it degrades to implicit `any`. Annotate it.
 */
type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

/**
 * Session refresh + route protection.
 *
 * Supabase access tokens are short-lived. Something must exchange the refresh
 * token for a new access token and write the rotated cookies back, on every
 * request. That something is this file — Server Components cannot write cookies,
 * so without this middleware users are silently logged out the moment their
 * access token expires.
 */

/**
 * Routes that require a signed-in user. Everything else is PUBLIC — including the
 * whole menu and all product data, deliberately: you can browse and build a cart
 * signed out, and are only stopped at checkout.
 *
 * Matched as prefixes, on segment boundaries: `/account` protects `/account` and
 * `/account/orders`, but would not accidentally match `/accounts-payable`.
 */
const PROTECTED_PREFIXES = ['/account', '/checkout'] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  // This response object is the one Supabase writes refreshed cookies onto.
  // It must be the object we ultimately return. Constructing a *fresh*
  // NextResponse after the refresh throws the rotated tokens away, and the bug
  // only shows up an hour later when the first access token expires — which is
  // why it is such a common and such an expensive mistake.
  let supabaseResponse = NextResponse.next({ request });

  // The VALIDATED constants, not `process.env.NEXT_PUBLIC_…!`.
  //
  // A non-null assertion here would defeat `src/lib/supabase/env.ts` on every
  // matched request — which is nearly every route. With the var unset, the `!`
  // hands `undefined` to `createServerClient`, and the failure surfaces as an
  // inscrutable fetch error at runtime instead of a loud module-load throw that
  // says which variable is missing. `tsc` cannot see it (`string | undefined` with
  // a `!` is `string`) and `lint` cannot see it. Do not reintroduce it.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not remove this call, and do not replace it with `getSession()`.
  // `getUser()` revalidates the token with Supabase; `getSession()` merely decodes
  // the cookie and trusts it. This call is also what triggers the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/auth';
    redirectUrl.search = '';
    // Send them back where they were going once they sign in. A relative path
    // only — never an absolute URL from user input, which would make this an
    // open redirect.
    redirectUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);

    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Carry the refreshed auth cookies onto the redirect, or the very next request
    // arrives with a stale session and bounces again.
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Every path except:
     *  - _next/static, _next/image  (build output)
     *  - favicon.ico, robots, sitemap
     *  - image and font files
     *
     * Narrowing this further is tempting and dangerous: any route excluded here
     * gets no session refresh (see `src/lib/supabase/server.ts`).
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf)$).*)',
  ],
};

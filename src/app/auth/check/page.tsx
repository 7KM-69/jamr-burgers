import { AuthCheck } from '@/components/auth/AuthCheck';
import { routeMetadata } from '@/i18n/server';

export const generateMetadata = () => routeMetadata('auth');

/**
 * /auth/check — "confirm your email".
 *
 * A real destination, not a flash message: sign-up with confirmation on returns no
 * session, so this survives a reload because it has a URL. `email` shows the reader
 * the exact address a link was sent to; `from=signin` marks the case where an
 * unconfirmed account tried to sign in (different reason, same instruction).
 *
 * The email is echoed, never trusted — it is only ever rendered as text.
 */
export default async function AuthCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[]; from?: string | string[] }>;
}) {
  const { email: emailParam, from: fromParam } = await searchParams;

  const email = typeof emailParam === 'string' && emailParam.length > 0 ? emailParam : null;
  const from = (Array.isArray(fromParam) ? fromParam[0] : fromParam) === 'signin' ? 'signin' : 'signup';

  return <AuthCheck email={email} from={from} />;
}

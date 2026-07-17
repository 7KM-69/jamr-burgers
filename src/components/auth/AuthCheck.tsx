'use client';

import { format } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import { EmberButton } from '@/components/ui/EmberButton';
import { AuthStage } from './AuthStage';

/**
 * "Check your inbox" — a ROUTE, not a toast.
 *
 * With email confirmation on, sign-up hands back no session: the account exists
 * and cannot be used until a link is clicked. That is a place the user has
 * arrived at, so it has a URL and survives a reload. Reached two ways:
 *
 *   · from sign-up — `?email=<address>`. "We sent a link to you@example.com."
 *   · from sign-in — `&from=signin`. The account exists but was never confirmed;
 *     saying "wrong password" there would be a lie, so the copy states the real
 *     reason.
 *
 * The link only CONFIRMS the address — there is no callback route to exchange the
 * code for a session, so clicking it lands the reader signed-out on the home page.
 * The copy says exactly that rather than promising a sign-in that never happens.
 */
export function AuthCheck({
  email,
  from,
}: {
  email: string | null;
  from: 'signin' | 'signup';
}) {
  const { t } = useI18n();
  const c = t.auth.check;

  return (
    <AuthStage section="auth-check">
      <div className="mx-auto max-w-2xl text-center">
        <span
          data-animate
          aria-hidden
          className="mx-auto grid h-16 w-16 place-items-center border border-ash-400 bg-ash-200 text-ember"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="7" width="24" height="18" rx="1.5" />
            <path d="M4.5 8.5 16 17l11.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <p data-animate className="eyebrow mt-8">
          {c.eyebrow}
        </p>

        <h1 className="display mt-5 text-h1 text-bone">
          {c.headline.map((line, index) => (
            <span key={index} className="mask-line">
              <span data-mask className="block will-change-transform">
                {line}
              </span>
            </span>
          ))}
        </h1>

        {/* The primary line needs the address; without one (a direct visit) fall
            back to the reason so the screen is never blank of meaning. */}
        <p data-animate className="mx-auto mt-7 max-w-md text-lead text-ash-700">
          {email ? format(c.body, { email }) : from === 'signin' ? c.fromSignin : c.spam}
        </p>

        {from === 'signin' && email ? (
          <p data-animate className="mx-auto mt-4 max-w-md text-sm text-ash-700">
            {c.fromSignin}
          </p>
        ) : null}

        <div
          data-animate
          className="mx-auto mt-10 max-w-md border border-ash-400 bg-ash-200/60 px-6 py-5 text-start"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          <p className="text-sm leading-relaxed text-bone">{c.then}</p>
          <p className="mt-3 text-sm leading-relaxed text-ash-700">{c.spam}</p>
        </div>

        <div data-animate className="mt-10">
          <EmberButton href="/auth">{c.back}</EmberButton>
        </div>
      </div>
    </AuthStage>
  );
}

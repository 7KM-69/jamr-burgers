'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useI18n } from '@/components/providers/I18nProvider';
import { EmberButton } from '@/components/ui/EmberButton';
import { signOut } from '@/lib/actions/auth';
import type { Dictionary } from '@/i18n';
import { AuthStage } from './AuthStage';

/**
 * The signed-in shell: who we hold on you, and your orders.
 *
 * The user object is read and verified on the server (`getCurrentUser()` →
 * `auth.getUser()`); this component receives only three serialisable strings, so
 * no token, session or Supabase client ever crosses to the client.
 *
 * ## The loyalty seam (part 12)
 *
 * The 5-order → half-off meter arrives here as `loyalty`, a server component
 * (`LoyaltyPanel`) the page renders and passes in. It self-fetches the three
 * numbers via `getLoyaltyProgress()` (per-request memoised, deduped with the cart
 * drawer's read), so this client shell never holds a session or a Supabase client.
 * The meter sits between the profile and the orders, carries its own `data-animate`
 * so it joins the stage's entrance, and owns its own coal ignite.
 */
export function AccountView({
  name,
  email,
  createdAt,
  loyalty,
}: {
  name: string | null;
  email: string | null;
  createdAt: string;
  /** The loyalty meter, rendered on the server and slotted in here. */
  loyalty: React.ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  async function handleSignOut() {
    setSignOutError(false);
    setSigningOut(true);
    const result = await signOut();
    if (!result.ok) {
      setSigningOut(false);
      setSignOutError(true);
      return;
    }
    // signOut revalidated the layout; land home and refresh so the nav flips to
    // "Sign in" and this now-forbidden page is left behind.
    router.push('/');
    router.refresh();
  }

  return (
    <AuthStage section="account">
      <div className="mx-auto w-full max-w-3xl">
        <p data-animate className="eyebrow">
          {t.account.eyebrow}
        </p>

        <h1 className="display mt-5 text-h1 text-bone">
          {t.account.headline.map((line, index) => (
            <span key={index} className="mask-line">
              <span data-mask className="block will-change-transform">
                {line}
              </span>
            </span>
          ))}
        </h1>

        <p data-animate className="measure mt-6 text-lead text-ash-700">
          {t.account.lede}
        </p>

        {/* Profile ---------------------------------------------------------- */}
        <section
          data-animate
          aria-labelledby="account-profile"
          className="mt-14 border border-ash-400 bg-ash-200/70 p-6 sm:p-8"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h2 id="account-profile" className="text-h3 text-bone">
              {t.account.profile.title}
            </h2>

            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="h-10 border border-ash-500 px-4 text-sm font-semibold text-bone transition-colors duration-200 hover:border-ember hover:text-ember disabled:cursor-not-allowed disabled:text-ash-600 disabled:hover:border-ash-500"
                style={{ borderRadius: 'var(--radius-sharp)' }}
              >
                {signingOut ? t.account.signOut.working : t.account.signOut.label}
              </button>
              {signOutError ? (
                <p role="alert" className="text-xs text-ember">
                  {t.account.signOut.failed}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="mt-6 grid gap-px overflow-hidden border border-ash-400 bg-ash-400 sm:grid-cols-3" style={{ borderRadius: 'var(--radius-sharp)' }}>
            <Row label={t.account.profile.name} value={name ?? t.account.profile.noName} muted={!name} />
            <Row label={t.account.profile.email} value={email ?? '—'} />
            <Row label={t.account.profile.since} value={<FormattedDate iso={createdAt} months={t.account.months} />} />
          </dl>
        </section>

        {/* Loyalty ---------------------------------------------------------- */}
        {loyalty}

        {/* Orders ----------------------------------------------------------- */}
        <section
          data-animate
          aria-labelledby="account-orders"
          className="mt-8"
        >
          <h2 id="account-orders" className="text-h3 text-bone">
            {t.account.orders.title}
          </h2>

          {/* No `place_order` caller exists until part 11, so every account is
              genuinely empty. This is that honest state — and it stays correct for
              a brand-new account once checkout ships. */}
          <div
            className="mt-5 flex flex-col items-center gap-5 border border-dashed border-ash-500 bg-ash-100/40 px-6 py-14 text-center"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full border border-ash-500 text-ash-600">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="8.5" />
              </svg>
            </span>
            <div>
              <p className="text-h3 text-bone">{t.account.orders.empty.title}</p>
              <p className="measure mx-auto mt-2 text-ash-700">{t.account.orders.empty.body}</p>
            </div>
            <EmberButton href="/menu">{t.account.orders.empty.cta}</EmberButton>
          </div>
        </section>
      </div>
    </AuthStage>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="bg-ash-200 px-5 py-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ash-700">{label}</dt>
      <dd className={`mt-1.5 break-words text-sm ${muted ? 'text-ash-600' : 'text-bone'}`}>{value}</dd>
    </div>
  );
}

/**
 * The member-since date, assembled by hand.
 *
 * `Intl.DateTimeFormat('ar', …)` renders Arabic-Indic digits (١٤), and CLAUDE.md
 * keeps numerals Latin in both languages. So the day and year are Latin `.num`
 * spans and only the month name comes from the dictionary — the same trap the
 * price formatter documents, avoided the same way.
 */
function FormattedDate({ iso, months }: { iso: string; months: Dictionary['account']['months'] }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span>—</span>;

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return (
    <span>
      <span className="num">{day}</span> {month} <span className="num">{year}</span>
    </span>
  );
}

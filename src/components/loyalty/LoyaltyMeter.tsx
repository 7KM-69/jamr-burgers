'use client';

import { Fragment, useEffect, useRef } from 'react';
import Link from 'next/link';

import { useI18n } from '@/components/providers/I18nProvider';
import { EmberButton } from '@/components/ui/EmberButton';
import { EASE, gsap } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { format } from '@/i18n';
import type { LoyaltyProgress } from '@/lib/types/api';

/**
 * The loyalty meter — part 12. Five coals, one per confirmed order in the current
 * cycle: lit for the orders that landed, unlit rings for the ones still to come.
 *
 * ## This component DISPLAYS. It never decides.
 *
 * It renders the three numbers `getLoyaltyProgress()` handed it and does no
 * arithmetic that could be mistaken for a policy: `filled` is `progressInCycle`
 * clamped to the meter's own bounds, and `remaining` is a phrasing of that same
 * number for the caption. Whether a reward EXISTS is a separate server fact
 * (`availableRewards`) with its own line — a reward can be held while a brand-new
 * cycle is already filling, so the badge is never derived from a full meter. If the
 * server and this meter ever disagree, the server is right (CLAUDE.md).
 *
 * ## Two registers, one meter
 *
 * `account` is a brand surface: large coals that IGNITE in sequence on mount — the
 * signature micro-moment CLAUDE.md asks for. `drawer` is a tool surface, quiet by
 * the same rule the cart drawer sets for itself: the coals are simply lit, no
 * orchestration, because the diner is mid-task.
 *
 * ## RTL, without a transform-origin trap
 *
 * The coals sit in a logical flex row, so their DOM order IS the reading order —
 * reading-start on the right in Arabic — and the fill naturally begins from the
 * reading-start edge with no `[dir]` handling at all. The ignite is a per-coal
 * `scale` (origin: centre, symmetric), never a `scaleX` across the whole strip, so
 * there is no origin to flip and none of the loader-bar bug this project shipped
 * once. The stagger follows DOM order, so live it reads start → end in both
 * directions for free.
 */

type Variant = 'account' | 'drawer';

export function LoyaltyMeter({
  progress,
  variant,
  cycleLength,
}: {
  /** Server truth. `null` is the signed-out state, not an error. */
  progress: LoyaltyProgress | null;
  variant: Variant;
  cycleLength: number;
}) {
  if (!progress) {
    return variant === 'account' ? (
      <SignedOutAccount total={cycleLength} />
    ) : (
      <SignedOutDrawer total={cycleLength} />
    );
  }

  // Display only. Clamp defends the render against a number outside the meter's
  // range; it is not a policy decision (the server owns those).
  const filled = Math.max(0, Math.min(progress.progressInCycle, cycleLength));
  const remaining = cycleLength - filled;
  const rewards = Math.max(0, progress.availableRewards);

  return variant === 'account' ? (
    <AccountMeter filled={filled} total={cycleLength} remaining={remaining} rewards={rewards} />
  ) : (
    <DrawerMeter filled={filled} total={cycleLength} rewards={rewards} />
  );
}

/* -------------------------------------------------------------------------- *
 * The coals.
 * -------------------------------------------------------------------------- */

function Coals({
  filled,
  total,
  variant,
  className = '',
}: {
  filled: number;
  total: number;
  variant: Variant;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div
      role="img"
      aria-label={format(t.loyalty.meterLabel, { filled, total })}
      className={`flex items-center ${variant === 'account' ? 'gap-2.5 sm:gap-3' : 'gap-2'} ${className}`}
    >
      {Array.from({ length: total }).map((_, index) => (
        <Fragment key={index}>
          {index > 0 ? <Connector lit={index < filled} variant={variant} /> : null}
          <Coal lit={index < filled} variant={variant} animate={variant === 'account'} />
        </Fragment>
      ))}
    </div>
  );
}

/** The line between two coals — a fuse, lit only where both ends are lit. Colour
 *  only; no transform, so it needs no RTL handling. */
function Connector({ lit, variant }: { lit: boolean; variant: Variant }) {
  return (
    <span
      aria-hidden
      className={`h-px ${variant === 'account' ? 'flex-1' : 'w-3'} ${
        lit ? 'bg-ember/50' : 'bg-ash-400'
      }`}
    />
  );
}

function Coal({ lit, variant, animate }: { lit: boolean; variant: Variant; animate: boolean }) {
  const dim = variant === 'account' ? 'size-9 sm:size-11' : 'size-3.5';

  return (
    <span className={`relative grid shrink-0 place-items-center ${dim}`}>
      {/* The ring: an unlit coal is a hollow ash ring, the same "no fire" mark the
          empty cart and the unopened branch use. A lit one glows ember. */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full border ${
          lit ? 'border-ember/70' : 'border-ash-500'
        }`}
      />

      {lit ? (
        <>
          {variant === 'account' ? (
            <span aria-hidden className="ember-glow absolute inset-[-35%] opacity-30" />
          ) : null}
          {/* The fill. In the account variant it carries `data-coal-ignite`, whose
              gated rest state (globals.css) is scale(0.2)/opacity(0) — so it starts
              caught mid-ignite behind html.motion and the effect below brings it up.
              Without the gate (no JS / reduced motion) it is simply lit. */}
          <span
            aria-hidden
            {...(animate ? { 'data-coal-ignite': '' } : {})}
            className={`relative rounded-full bg-gradient-to-br from-flame to-ember ${
              variant === 'account' ? 'size-[68%]' : 'size-[64%]'
            }`}
          />
        </>
      ) : variant === 'account' ? (
        <span aria-hidden className="relative size-1.5 rounded-full border border-ash-600 bg-ink" />
      ) : null}
    </span>
  );
}

/**
 * The ignite. Scoped to the meter root, so its selector can never reach another
 * section's coals. Reduced motion / no JS: skipped, and the gated CSS never fired,
 * so the coals are already lit and legible.
 *
 * `filled` is in the deps on purpose: after an order confirms elsewhere and the
 * page re-reads, new coals appear pre-hidden by the CSS gate, and re-running is
 * what lights them. The delay lets the section's own entrance land first, so the
 * ignite is seen rather than finishing under a still-fading card.
 */
function useIgnite(filled: number) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-coal-ignite]',
        { scale: 0.2, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: EASE.out, stagger: 0.12, delay: 0.9 },
      );
    }, el);

    return () => ctx.revert();
  }, [filled]);

  return root;
}

/* -------------------------------------------------------------------------- *
 * Account — the brand surface.
 * -------------------------------------------------------------------------- */

function AccountMeter({
  filled,
  total,
  remaining,
  rewards,
}: {
  filled: number;
  total: number;
  remaining: number;
  rewards: number;
}) {
  const { t } = useI18n();
  const root = useIgnite(filled);
  const hasReward = rewards > 0;

  return (
    <section
      ref={root}
      data-animate
      aria-labelledby="loyalty-title"
      className="mt-8 border border-ash-400 bg-ash-200/70 p-6 sm:p-8"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-ember">{t.loyalty.eyebrow}</p>
          <h2 id="loyalty-title" className="mt-2 text-h3 text-bone">
            {t.loyalty.title}
          </h2>
        </div>

        <span className="flex items-baseline gap-1.5" aria-hidden>
          <span className="num text-h2 font-semibold leading-none text-bone">{filled}</span>
          <span className="num text-lg text-ash-700">/ {total}</span>
        </span>
      </div>

      <Coals filled={filled} total={total} variant="account" className="mt-7" />

      {hasReward ? (
        <RewardBadge count={rewards} />
      ) : (
        <p className="mt-6 text-lead text-bone">
          {remaining === 1
            ? t.loyalty.remaining.one
            : format(t.loyalty.remaining.many, { count: remaining })}
        </p>
      )}

      <p className="measure mt-3 text-sm leading-relaxed text-ash-700">{t.loyalty.rule}</p>
    </section>
  );
}

/** The reward strip. Same ember treatment as the checkout redeem toggle, so the
 *  two read as one system. */
function RewardBadge({ count }: { count: number }) {
  const { t } = useI18n();

  return (
    <div
      className="mt-6 flex flex-col gap-4 border border-ember/30 bg-ember/5 p-5 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      <div className="flex items-start gap-4">
        <span aria-hidden className="relative mt-0.5 grid size-8 shrink-0 place-items-center">
          <span className="ember-glow absolute inset-[-40%] opacity-40" />
          <span className="relative size-4 rounded-full bg-gradient-to-br from-flame to-ember" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-bone">
            {count === 1 ? t.loyalty.reward.one : format(t.loyalty.reward.many, { count })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ash-700">{t.loyalty.reward.note}</p>
        </div>
      </div>

      <EmberButton href="/menu" className="shrink-0 self-start sm:self-auto">
        {t.loyalty.reward.cta}
      </EmberButton>
    </div>
  );
}

function SignedOutAccount({ total }: { total: number }) {
  const { t } = useI18n();

  return (
    <section
      data-animate
      aria-labelledby="loyalty-title"
      className="mt-8 border border-ash-400 bg-ash-200/70 p-6 sm:p-8"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      <p className="eyebrow text-ember">{t.loyalty.eyebrow}</p>
      <h2 id="loyalty-title" className="mt-2 text-h3 text-bone">
        {t.loyalty.signedOut.title}
      </h2>

      <Coals filled={0} total={total} variant="account" className="mt-7" />

      <p className="measure mt-6 text-sm leading-relaxed text-ash-700">{t.loyalty.signedOut.body}</p>

      <EmberButton href="/auth" className="mt-6">
        {t.loyalty.signedOut.cta}
      </EmberButton>
    </section>
  );
}

/* -------------------------------------------------------------------------- *
 * Drawer — the tool surface. Quiet, one line, no orchestration.
 * -------------------------------------------------------------------------- */

function DrawerMeter({
  filled,
  total,
  rewards,
}: {
  filled: number;
  total: number;
  rewards: number;
}) {
  const { t } = useI18n();
  const hasReward = rewards > 0;

  return (
    <div className="border-b border-ash-400 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-ash-700">{t.loyalty.eyebrow}</span>
        <span className="flex items-baseline gap-1" aria-hidden>
          <span className="num text-sm font-semibold text-bone">{filled}</span>
          <span className="num text-xs text-ash-700">/ {total}</span>
        </span>
      </div>

      <Coals filled={filled} total={total} variant="drawer" className="mt-3" />

      {hasReward ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-ember">
          <span aria-hidden className="block size-1.5 rounded-full bg-gradient-to-br from-flame to-ember" />
          {rewards === 1 ? t.loyalty.reward.one : format(t.loyalty.reward.many, { count: rewards })}
        </p>
      ) : null}
    </div>
  );
}

function SignedOutDrawer({ total }: { total: number }) {
  const { t } = useI18n();

  return (
    <div className="border-b border-ash-400 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-ash-700">{t.loyalty.eyebrow}</span>
      </div>

      <Coals filled={0} total={total} variant="drawer" className="mt-3" />

      <Link
        href="/auth"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-bone transition-colors duration-200 hover:text-ember"
      >
        {t.loyalty.signedOut.title}
        <span aria-hidden className="rtl:-scale-x-100">
          →
        </span>
      </Link>
    </div>
  );
}

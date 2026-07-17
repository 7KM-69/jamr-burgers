'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { brand } from '@/lib/brand';
import { format } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import { getLenis } from '@/components/providers/SmoothScrollProvider';
import { Wordmark } from './Wordmark';
import { navLinks } from './navLinks';

/**
 * Evaluated once, at module load. `new Date()` inside the render body would be a
 * hydration hazard for no benefit — the year does not change while you read a
 * footer.
 */
const YEAR = new Date().getFullYear();

/**
 * How many times the band's phrase repeats inside ONE copy of the track.
 *
 * The track is two identical copies and the loop is a 50% translation, so a copy
 * must be at least as wide as the widest viewport or a gap opens at the seam. At
 * the display sizes used here one repeat is roughly a full 1080px, so three is
 * comfortably past 1920 in both scripts.
 */
const BAND_REPEATS = [0, 1, 2];

/**
 * A footer link with a hover reaction: the label rides up out of its own mask and
 * an ember-coloured copy of it rides in from below.
 *
 * ## Why 125% and not 100%
 *
 * `.mask-line` pads itself (0.08em Latin, 0.18em Arabic) so that overflow:hidden
 * clips AROUND the ascenders and descenders instead of shaving them off. That
 * padding is inside the clip — so a copy parked at exactly 100% still peeks into
 * the padding by that much, and you would see the top 1–2px of an ember ghost
 * under every link at rest. 125% is the same number MASK_SHIFT uses in
 * src/lib/gsap.ts, and for exactly the same reason.
 *
 * This is a CSS hover, not a GSAP reveal, so it does NOT carry `data-mask` and it
 * does NOT go through revealMask(). Both spans are at their natural position at
 * rest; nothing here can strand a label off-screen waiting for a timeline.
 */
function FooterLink({ href, label }: { href: string; label: string }) {
  const swap =
    'col-start-1 row-start-1 transition-transform duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]';

  return (
    <Link href={href} className="group inline-block text-sm font-medium">
      <span className="mask-line">
        {/* A grid, not absolute positioning: both copies occupy one cell, so they
            stay aligned whatever the mask's padding is — which differs by script. */}
        <span className="grid">
          <span
            className={`${swap} text-ash-700 group-hover:-translate-y-[125%] group-focus-visible:-translate-y-[125%]`}
          >
            {label}
          </span>
          <span
            aria-hidden
            className={`${swap} translate-y-[125%] text-ember group-hover:translate-y-0 group-focus-visible:translate-y-0`}
          >
            {label}
          </span>
        </span>
      </span>
    </Link>
  );
}

function ColumnHead({ children }: { children: React.ReactNode }) {
  return <h2 className="eyebrow mb-6 text-bone">{children}</h2>;
}

export function Footer() {
  const root = useRef<HTMLElement>(null);
  const { t, lang } = useI18n();
  const links = navLinks(t);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });

      tl.fromTo(
        '[data-animate]',
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.05, ease: EASE.out },
        0,
      );

      // The wordmark comes up last and slowest — it is the full stop.
      revealMask(tl, '[data-mask]', { duration: 1.4 }, 0.3);

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
    // No `dir` dependency: every animation here is vertical, and the one piece of
    // horizontal motion in this footer — the marquee — is CSS, which flips itself
    // off [dir] and needs no rebuild. See globals.css.
  }, []);

  const toTop = () => {
    const lenis = getLenis();
    // Under reduced motion, "back to the top" is a jump, not a ride.
    if (lenis) lenis.scrollTo(0, { immediate: prefersReducedMotion() });
    else window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <footer
      ref={root}
      data-section="footer"
      data-motion="pending"
      className="relative overflow-hidden border-t border-ash-400 bg-ink"
    >
      {/* ---- The band ----------------------------------------------------- *
          Decorative, and entirely aria-hidden: it says the brand name and the
          hero's line, both of which are already on the page as real content. A
          screen reader does not need to hear "JAMR" six more times.

          Two identical copies; the CSS loop translates by exactly one of them.  */}
      <div
        aria-hidden
        className="relative overflow-hidden border-b border-ash-400 py-7 sm:py-9"
      >
        <div className="marquee-track flex w-max items-center">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {BAND_REPEATS.map((i) => (
                <Fragment key={i}>
                  <Wordmark className="text-[clamp(2rem,5vw,4rem)] text-bone" />
                  <span className="mx-5 block size-2 shrink-0 rounded-full bg-ember sm:mx-8" />
                  <span className="display whitespace-nowrap text-[clamp(2rem,5vw,4rem)] leading-none text-ash-500">
                    {t.footer.marquee}
                  </span>
                  <span className="mx-5 block size-2 shrink-0 rounded-full bg-ember sm:mx-8" />
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ---- The columns --------------------------------------------------- */}
      <div className="px-gutter pb-16 pt-20">
        <div className="mx-auto grid w-full max-w-[80rem] gap-12 sm:grid-cols-2 lg:grid-cols-12">
          <nav data-animate aria-label={t.footer.explore} className="lg:col-span-4">
            <ColumnHead>{t.footer.explore}</ColumnHead>
            <ul className="flex flex-col gap-4">
              {links.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href} label={link.label} />
                </li>
              ))}
            </ul>
          </nav>

          <nav data-animate aria-label={t.footer.yours} className="lg:col-span-4">
            <ColumnHead>{t.footer.yours}</ColumnHead>
            <ul className="flex flex-col gap-4">
              <li>
                <FooterLink href="/account" label={t.nav.account} />
              </li>
              <li>
                <FooterLink href="/auth" label={t.footer.signIn} />
              </li>
            </ul>
          </nav>

          <div data-animate className="lg:col-span-4">
            <ColumnHead>{t.footer.reach}</ColumnHead>
            <address className="flex flex-col gap-3 text-sm not-italic text-ash-700">
              <span>{t.footer.address}</span>
              <span>{t.footer.hours}</span>
            </address>
          </div>
        </div>
      </div>

      {/* ---- The wordmark -------------------------------------------------- */}
      <div className="px-gutter">
        <div className="mx-auto w-full max-w-[80rem]">
          <span className="mask-line">
            <span data-mask className="block will-change-transform">
              <Wordmark className="block text-center text-[clamp(5rem,22vw,20rem)] text-ash-400" />
            </span>
          </span>
        </div>
      </div>

      {/* ---- The bottom bar ------------------------------------------------ */}
      <div className="px-gutter pb-10 pt-8">
        <div className="mx-auto flex w-full max-w-[80rem] flex-col items-center justify-between gap-5 border-t border-ash-400 pt-8 sm:flex-row">
          <p data-animate className="eyebrow text-ash-700">
            {format(t.footer.rights, {
              year: YEAR,
              brand: lang === 'ar' ? brand.nameAr : brand.name,
            })}
          </p>

          <button
            data-animate
            type="button"
            onClick={toTop}
            className="group inline-flex items-center gap-3 text-sm font-medium text-ash-700 transition-colors duration-300 hover:text-ember"
          >
            {t.footer.backToTop}
            {/* Vertical, so it needs no RTL inversion — which is exactly why the
                arrow points up rather than back. */}
            <span
              aria-hidden
              className="block transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1"
            >
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden>
                <path
                  d="M5 12V1M5 1L1 5M5 1l4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}

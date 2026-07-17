'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { EmberButton } from '@/components/ui/EmberButton';

/**
 * 404 — a dead coal.
 *
 * The three digits are set as display type and revealed one at a time, and the
 * middle one is the only thing on the page still burning: a `heat-text` zero in a
 * pair of ash-grey fours. That is the whole idea, and it is the reason the number
 * is split into characters rather than printed as a string.
 *
 * ## Two details that are not decoration
 *
 * The digit row carries `.num`, which sets `direction: ltr` — so the characters
 * lay out left-to-right even inside an RTL document. "404" happens to be a
 * palindrome and would have survived the flip by luck; the next person to change
 * this copy would not have been so lucky.
 *
 * There is no scroll here, so the entrance is a plain timeline. It still publishes
 * a motion gate, because a page with no gate is a page shot.mjs will not
 * photograph — and "I cannot verify this" is a result, not a nuisance.
 */
export default function NotFound() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const copy = t.routes.notFound;

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.2 });

      // 0.4 is the `opacity-40` utility on the element — the brightness a
      // reduced-motion reader already sees. The tween must land there, not on 1.
      tl.fromTo(
        '[data-404-glow]',
        { opacity: 0, scale: 0.6 },
        { opacity: 0.4, scale: 1, duration: 1.8, ease: EASE.out },
        0,
      );

      // The digits drop in one at a time, and the ember lands last. A 404 that
      // arrives all at once is a status code; one that arrives in pieces is a
      // page that burned down.
      revealMask(tl, '[data-mask]', { duration: 1.1, stagger: 0.12 }, 0.15);

      tl.fromTo(
        '[data-404-rule]',
        { scaleX: 0 },
        { scaleX: 1, duration: 1, ease: EASE.inOut },
        0.7,
      ).fromTo(
        '[data-animate]',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.85, stagger: 0.09, ease: EASE.out },
        0.85,
      );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="notfound"
      data-motion="pending"
      className="relative flex min-h-[85svh] flex-col items-center justify-center overflow-hidden px-gutter py-32 text-center"
    >
      <div
        aria-hidden
        data-404-glow
        className="ember-glow pointer-events-none absolute start-1/2 top-1/2 h-[42vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 opacity-40 will-change-transform rtl:translate-x-1/2"
      />

      <div className="relative flex flex-col items-center">
        <p data-animate className="eyebrow mb-10">
          {copy.eyebrow}
        </p>

        {/* `.num` on the row keeps the digits in Latin order in Arabic too. Each
            character is its own masked line so they can be revealed in sequence. */}
        <p className="num display flex text-display leading-none">
          {[...copy.title].map((char, i) => (
            <span key={`${char}-${i}`} className="mask-line">
              <span
                data-mask
                className={`block will-change-transform ${
                  i === 1 ? 'heat-text' : 'text-ash-400'
                }`}
              >
                {char}
              </span>
            </span>
          ))}
        </p>

        {/* The last hairline of a fire that has gone out. scaleX from the centre,
            which is the one origin that needs no RTL flip. */}
        <span
          aria-hidden
          data-404-rule
          className="mt-12 block h-px w-40 origin-center bg-gradient-to-r from-transparent via-ember to-transparent will-change-transform"
        />

        <p data-animate className="measure mt-12 text-lead text-ash-700">
          {copy.lede}
        </p>

        <div data-animate className="mt-12">
          <EmberButton href="/">{copy.cta}</EmberButton>
        </div>
      </div>
    </section>
  );
}

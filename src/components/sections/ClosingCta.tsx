'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { EmberButton } from '@/components/ui/EmberButton';

/**
 * The closing call to action — home section 9.
 *
 * Full-bleed, and the only section on the page with a surface of its own: it sits
 * on ink-deep, one step below the page, so the page appears to open into it. That
 * darkening is what makes the coal behind the headline read as the only light
 * left, which is the whole argument of the section.
 *
 * The action reuses the hero's verb on purpose. A brand has one call to action,
 * not a thesaurus of them; hearing "Order hot" again at the bottom is a close, and
 * inventing a fresh synonym here would only prove we had run out of conviction.
 */
export function ClosingCta() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();

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
        scrollTrigger: { trigger: el, start: 'top 75%', once: true },
      });

      // The coal comes up first and alone, so the headline rises out of a light
      // that is already burning rather than arriving with it.
      // Ends on 0.5 — the same value as the `opacity-50` utility on the element,
      // which is what a reduced-motion or no-JS reader sees at rest. An animation
      // that ends anywhere else would make the coal a different temperature
      // depending on whether it got to move.
      tl.fromTo(
        '[data-cta-glow]',
        { opacity: 0, scale: 0.7 },
        { opacity: 0.5, scale: 1, duration: 1.6, ease: EASE.out },
        0,
      );

      revealMask(tl, '[data-mask]', { duration: 1.2, stagger: 0.1 }, 0.25).fromTo(
        '[data-animate]',
        { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.9, stagger: 0.09, ease: EASE.out },
        0.75,
      );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="closing"
      data-motion="pending"
      className="relative overflow-hidden border-y border-ash-400 bg-ink-deep px-gutter py-section"
    >
      {/* The coal. Sits low and centred, so the headline sits IN the light rather
          than in front of it. -translate-x-1/2 against a logical start-1/2 needs
          its RTL undo — the pattern used everywhere else on this site. */}
      <div
        aria-hidden
        data-cta-glow
        className="ember-glow pointer-events-none absolute start-1/2 top-[58%] h-[55vmin] w-[110vmin] -translate-x-1/2 -translate-y-1/2 opacity-50 will-change-transform rtl:translate-x-1/2"
      />

      <div className="relative mx-auto flex w-full max-w-[80rem] flex-col items-center text-center">
        <h2 className="display text-h1 text-bone">
          {t.closing.headline.map((line, i) => (
            <span key={line} className="mask-line">
              <span
                data-mask
                className={`block will-change-transform ${i === 1 ? 'heat-text' : ''}`}
              >
                {line}
              </span>
            </span>
          ))}
        </h2>

        <p data-animate className="measure mt-8 text-lead text-ash-700">
          {t.closing.lede}
        </p>

        <div data-animate className="mt-12">
          <EmberButton href="/menu">{t.closing.action}</EmberButton>
        </div>

        <p data-animate className="eyebrow mt-8 text-ash-700">
          {t.closing.note}
        </p>
      </div>
    </section>
  );
}

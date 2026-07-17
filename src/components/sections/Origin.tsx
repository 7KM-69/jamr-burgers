'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';

export function Origin() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // Publish this section's motion state on its own root. Under reduced motion
    // there is no timeline to wait for, so it is finished the moment it exists.
    const gate = motionGate(el);
    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top 72%',
          once: true,
        },
      });

      revealMask(tl, '[data-mask]', { duration: 1.2, stagger: 0.1 })
        .fromTo(
          '[data-animate]',
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: EASE.out },
          '-=0.85',
        )
        // scaleY, and its opacity is 1 from the first frame to the last. Nothing
        // watching `opacity` can tell whether this rule has drawn itself; the gate
        // watches the timeline, so it does not have to care which property moved.
        .fromTo(
          '[data-origin-rule]',
          { scaleY: 0 },
          { scaleY: 1, duration: 1.1, ease: EASE.inOut, transformOrigin: 'top center' },
          '-=1',
        );

      // After the timeline is populated: an empty one has zero duration and would
      // report itself already complete.
      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="origin"
      data-motion="pending"
      className="relative px-gutter py-section"
    >
      <div className="mx-auto grid w-full max-w-[80rem] gap-14 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <p data-animate className="eyebrow mb-8">
            {t.origin.eyebrow}
          </p>

          <h2 className="display text-h2 text-bone">
            {t.origin.headline.map((line, i) => (
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
        </div>

        <div className="relative flex gap-8 lg:col-span-5 lg:col-start-8">
          {/* A machined rule that draws itself down the column. scaleY, not height. */}
          <span
            aria-hidden
            data-origin-rule
            className="hidden w-px shrink-0 bg-gradient-to-b from-ember via-ash-500 to-transparent lg:block"
          />

          <div className="flex flex-col gap-6">
            {t.origin.body.map((paragraph) => (
              <p key={paragraph} data-animate className="measure text-lead text-ash-700">
                {paragraph}
              </p>
            ))}
            <p data-animate className="eyebrow pt-2 text-ember">
              {t.origin.signature}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

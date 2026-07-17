'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';

/**
 * The grind — the quiet close of /spices.
 *
 * The wheel above it is the loudest thing on the page, so this is deliberately the
 * softest: centred, narrow, no diagram, no accent but one. A page that shouts twice
 * has not decided what it is about.
 *
 * It sits on `bg-ink-deep`, one step below the page, which is the same device the
 * closing CTA uses — a section the page appears to open INTO rather than one that
 * sits on top of it.
 */
export function Grind() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const copy = t.spices.grind;

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

      revealMask(tl, '[data-mask]', { duration: 1.15, stagger: 0.1 }, 0).fromTo(
        '[data-animate]',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.85, stagger: 0.08, ease: EASE.out },
        0.4,
      );

      // scaleX from the centre — the one origin that is identical in both reading
      // directions, and therefore the one that needs no [dir] rule.
      tl.fromTo(
        '[data-grind-rule]',
        { scaleX: 0 },
        { scaleX: 1, duration: 1.1, ease: EASE.inOut },
        0.6,
      );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="grind"
      data-motion="pending"
      className="relative border-t border-ash-400 bg-ink-deep px-gutter py-section"
    >
      <div className="mx-auto flex w-full max-w-[52rem] flex-col items-center text-center">
        <p data-animate className="eyebrow mb-8">
          {copy.eyebrow}
        </p>

        <h2 className="display text-h2 text-bone">
          {copy.headline.map((line, i) => (
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

        <span
          aria-hidden
          data-grind-rule
          className="mt-12 block h-px w-40 origin-center bg-gradient-to-r from-transparent via-ember to-transparent will-change-transform"
        />

        <div className="mt-12 flex flex-col gap-6">
          {copy.body.map((paragraph) => (
            <p key={paragraph} data-animate className="measure text-lead text-ash-700">
              {paragraph}
            </p>
          ))}
        </div>

        <p data-animate className="eyebrow mt-12 text-ember">
          {copy.signature}
        </p>
      </div>
    </section>
  );
}

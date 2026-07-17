'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';

export function Experience() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const reduced = prefersReducedMotion();
    const gate = motionGate(el);

    const ctx = gsap.context(() => {
      // Under reduced motion the numbers are simply printed. A number that
      // spins up from zero is decoration, and decoration is the first thing to
      // go when someone tells us motion makes them ill.
      if (reduced) {
        gsap.utils.toArray<HTMLElement>('[data-count]').forEach((node) => {
          node.textContent = `${node.dataset.value ?? ''}${node.dataset.suffix ?? ''}`;
        });
        gate.settle();
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 70%', once: true },
      });

      revealMask(tl, '[data-mask]', { duration: 1.1 })
        .fromTo(
          '[data-animate]',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.07, ease: EASE.out },
          '-=0.8',
        )
        .fromTo(
          '[data-stat-rule]',
          { scaleY: 0 },
          {
            scaleY: 1,
            duration: 0.9,
            stagger: 0.07,
            ease: EASE.inOut,
            transformOrigin: 'top center',
          },
          '-=0.9',
        );

      // The count-ups live ON the section timeline, not beside it. That is what
      // makes "the timeline is finished" also mean "every number has arrived" —
      // and it is why a screenshot taken on the gate can never catch a counter
      // mid-flight reading 241 on its way to 380.
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((node, i) => {
        const target = Number(node.dataset.value ?? 0);
        const suffix = node.dataset.suffix ?? '';
        const counter = { value: 0 };

        tl.to(
          counter,
          {
            value: target,
            duration: 1.6,
            ease: 'power2.out',
            // textContent, not width — and the cell is pre-sized by an invisible
            // copy of the final number, so a three-digit value landing in a
            // one-digit box cannot shift the row by a single pixel.
            onUpdate: () => {
              node.textContent = `${Math.round(counter.value)}${suffix}`;
            },
            // Rounding a 0.9995-progress ease still reads the target, but the
            // DOM is the thing anyone will screenshot, so land it exactly.
            onComplete: () => {
              node.textContent = `${target}${suffix}`;
            },
          },
          0.35 + i * 0.09,
        );
      });

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="experience"
      data-motion="pending"
      className="relative px-gutter pb-section"
    >
      <div className="mx-auto w-full max-w-[80rem]">
        <div className="flex flex-col gap-4 border-b border-ash-400 pb-10 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="display text-h2 text-bone">
            <span className="mask-line">
              <span data-mask className="block will-change-transform">
                {t.experience.headline}
              </span>
            </span>
          </h2>
          <p data-animate className="eyebrow pb-2">
            {t.experience.eyebrow}
          </p>
        </div>

        {/* Gutters, not padding: the first cell of every row then aligns flush with
            the container edge, and each rule can sit dead-centre in the gap. */}
        <dl className="grid grid-cols-2 gap-x-8 lg:grid-cols-4 lg:gap-x-12">
          {t.experience.stats.map((stat, i) => (
            <div key={stat.label} className="relative flex flex-col gap-3 py-10 sm:py-14">
              {/* A rule belongs between columns, never on the outer edge of a row —
                  and "last in row" is a different cell at two columns than at four,
                  so each layout states its own. */}
              {i % 2 === 1 && (
                <span
                  aria-hidden
                  data-stat-rule
                  className="absolute inset-y-8 -start-4 block w-px bg-ash-400 lg:hidden"
                />
              )}
              {i > 0 && (
                <span
                  aria-hidden
                  data-stat-rule
                  className="absolute inset-y-8 hidden w-px bg-ash-400 lg:-start-6 lg:block"
                />
              )}

              {/* dt before dd is what the spec asks for; the eye wants the number
                  first. `order` reconciles them without lying to a screen reader. */}
              <dt data-animate className="eyebrow order-2 text-bone">
                {stat.label}
              </dt>

              <dd
                data-animate
                className="display order-1 text-[clamp(2.75rem,5.5vw,4.5rem)] leading-none text-bone"
              >
                {/* The invisible copy holds the box open at its final width. The
                    animated copy sits on top of it in the same grid cell, so a
                    three-digit value landing in a one-digit box shifts nothing. */}
                <span className="inline-grid">
                  <span aria-hidden className="num invisible col-start-1 row-start-1">
                    {stat.value}
                    {stat.suffix}
                  </span>
                  <span
                    data-count
                    data-value={stat.value}
                    data-suffix={stat.suffix}
                    className="num col-start-1 row-start-1 justify-self-start"
                  >
                    {stat.value}
                    {stat.suffix}
                  </span>
                </span>
              </dd>

              <dd data-animate className="measure-tight order-3 text-sm text-ash-700">
                {stat.note}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

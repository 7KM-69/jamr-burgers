'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';

/**
 * Supply story — home section 8. Farm → hand, as a chain of custody you can watch
 * being drawn.
 *
 * The four steps sit ACROSS the page on desktop, in the reading direction, joined
 * by an ember line that fills as you scroll; on a phone they stack and the line
 * runs down. Same four beats, same line, one code path — the two spines are two
 * elements rather than two `gsap.matchMedia` branches, because a condition set
 * that fails to cover its space is how the ingredient showcase was dead on mobile
 * for the whole project without anyone noticing.
 *
 * The line deliberately runs on past the last dot, out to the edge of the page.
 * That is the fourth step's copy — "then it is out of our hands" — drawn.
 */
export function Supply() {
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
      const headerTl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 72%', once: true },
      });

      revealMask(headerTl, '[data-mask]', { duration: 1.15, stagger: 0.1 }).fromTo(
        // Scoped to the header. Unscoped, this would also catch the four step
        // bodies below and fire all of them at once, at the top of the section —
        // and the chain would arrive fully formed before the reader reached it.
        '[data-header] [data-animate]',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.85, stagger: 0.07, ease: EASE.out },
        '-=0.85',
      );

      /**
       * The gate watches the HEADER only, and that is a deliberate, load-bearing
       * choice rather than an oversight.
       *
       * A scrubbed timeline is a pure function of scroll position, so "finished"
       * for the spine means "scrolled to the end of the chain". On a phone the
       * section is twice the height of the viewport, so that scroll position is
       * one at which the section is half off the top of the screen — and
       * shot.mjs, having waited for the gate, would then scroll BACK to frame the
       * section, rewinding the scrub and un-finishing the very thing it just
       * waited for. It would fail with "framing broke the end state", correctly,
       * forever.
       *
       * So the gate declares what it can honestly declare: the section's ENTRANCE
       * is complete. That a half-drawn spine is half-drawn is not a defect — it is
       * the design, and the harness's second witness (nothing has moved for three
       * samples) is what proves the picture is not of something mid-flight.
       */
      gate.watch(headerTl);

      const chain = el.querySelector('[data-chain]');

      // Both spines, both ends stated. `end: 'bottom bottom'` means the chain
      // completes exactly when the whole chain is on screen — which is the only
      // definition that is true at every viewport height.
      const scrollTrigger = {
        trigger: chain,
        start: 'top 75%',
        end: 'bottom bottom',
        scrub: 0.6,
      } as const;

      gsap.fromTo('[data-spine-h]', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger });
      gsap.fromTo('[data-spine-v]', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger });

      // One trigger per step, and a delay by index.
      //
      // On desktop the four steps share a y, so all four triggers fire together
      // and the delay is what re-creates the stagger. On a phone they fire one at
      // a time as you arrive at each, and the delay is a rounding error. One code
      // path, correct at both — instead of a breakpoint branch that has to be
      // right twice.
      gsap.utils.toArray<HTMLElement>('[data-step]').forEach((step, i) => {
        const scrollTrigger = { trigger: step, start: 'top 85%', once: true } as const;
        const delay = i * 0.08;

        gsap.fromTo(
          step.querySelectorAll('[data-step-dot]'),
          { opacity: 0, scale: 0.4 },
          { opacity: 1, scale: 1, duration: 0.5, delay, ease: 'back.out(2.2)', scrollTrigger },
        );

        gsap.fromTo(
          step.querySelectorAll('[data-animate]'),
          { opacity: 0, y: 18 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            delay,
            stagger: 0.05,
            ease: EASE.out,
            scrollTrigger,
          },
        );
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="supply"
      data-motion="pending"
      className="relative px-gutter pb-section"
    >
      <div className="mx-auto w-full max-w-[80rem]">
        <div data-header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p data-animate className="eyebrow mb-8">
              {t.supply.eyebrow}
            </p>
            <h2 className="display text-h2 text-bone">
              {t.supply.headline.map((line, i) => (
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

          <p data-animate className="measure text-lead text-ash-700 lg:max-w-[34ch] lg:pb-2">
            {t.supply.lede}
          </p>
        </div>

        {/* ---- The chain ---------------------------------------------------- */}
        <ol data-chain className="relative mt-20 lg:mt-28 lg:grid lg:grid-cols-4 lg:gap-x-10">
          {/* Track and fill, twice: across on desktop, down on a phone. The one
              that is not in play is display:none and costs nothing.
              Logical insets — this is chrome, and chrome mirrors. */}
          <span aria-hidden className="absolute inset-y-0 start-1 block w-px bg-ash-400 lg:hidden" />
          <span
            aria-hidden
            data-spine-v
            className="absolute inset-y-0 start-1 block w-px bg-gradient-to-b from-ember to-flame will-change-transform lg:hidden"
          />

          <span
            aria-hidden
            className="absolute inset-x-0 top-1 hidden h-px bg-ash-400 lg:block"
          />
          <span
            aria-hidden
            data-spine-h
            className="absolute inset-x-0 top-1 hidden h-px bg-gradient-to-r from-ember to-flame will-change-transform rtl:bg-gradient-to-l lg:block"
          />

          {t.supply.steps.map((step, i) => (
            <li key={step.title} data-step className="relative ps-9 pb-14 last:pb-0 lg:ps-0 lg:pb-0 lg:pt-9">
              {/* 9px dot, flush with the start of its own cell, so its centre lands
                  on the spine's centre (4.5px) in BOTH layouts without a nudge. */}
              <span
                aria-hidden
                data-step-dot
                className="absolute start-0 top-0 block size-[9px] rounded-full bg-ember will-change-transform"
                style={{ boxShadow: '0 0 12px var(--color-ember)' }}
              />

              {/* `inline-block`, NOT `block`, and that is a bug fix rather than a
                  preference.

                  `.num` sets `direction: ltr` so a value like "01" or "38g" is not
                  reordered by the bidi algorithm inside an Arabic sentence. On a
                  BLOCK-level element that also decides where the text sits: the
                  block fills the cell, and its inner text aligns to the start of its
                  OWN direction — the left — while the dot, the heading and the spine
                  all align to the RTL start, the right. In Arabic every step number
                  was stranded at the far left of its column, sitting under the
                  NEIGHBOURING step's dot. Shrink the box to its content and the line
                  box positions it by the PARENT's direction, which is the one that
                  should decide. Photographed in 07b-supply-ar-{desktop,mobile}.png —
                  it is exactly the kind of thing only a screenshot finds. */}
              <span data-animate className="num inline-block text-xs text-ember">
                {String(i + 1).padStart(2, '0')}
              </span>

              <h3 data-animate className="display mt-4 text-h3 leading-none text-bone">
                {step.title}
              </h3>

              <p data-animate className="measure mt-4 text-sm leading-relaxed text-ash-700">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

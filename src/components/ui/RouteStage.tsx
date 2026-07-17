'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * The opening stage of a secondary route: eyebrow-free, one large title, one
 * line of real copy, and the ember under it.
 *
 * Every route in the site exists from day one so the nav never points at a 404
 * and the page transition can actually be exercised. The build parts that own
 * these routes fill the space below this stage.
 *
 * ## The motion gate is not decoration here
 *
 * This component had no `motionGate()` and no `data-section`, and the consequence
 * was not cosmetic: scripts/shot.mjs REFUSES to photograph a section that does not
 * publish `data-motion` ("I cannot verify this" is a result). So every route built
 * on this stage — /spices, /contact, /locations — was unphotographable, and that is
 * a large part of why not one of them had ever been looked at. A component that
 * cannot be verified will not be verified.
 */
export function RouteStage({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children?: React.ReactNode;
}) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    // Nothing to wait for: the title and the lede are already at rest, legible and
    // complete. `html.motion` is absent, so no CSS parked them anywhere.
    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.35 });

      revealMask(tl, '[data-mask]', { duration: 1.2 }).fromTo(
        '[data-animate]',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.85, stagger: 0.08, ease: EASE.out },
        '-=0.9',
      );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    /* 95svh, not 70. A route stage is a CHAPTER OPENER: it should hold the screen
       on its own, and the section under it should have to be scrolled to.

       At 70svh the next section's headline was already 30% up the first screen —
       "SPICES" and "NINE GRINDERS. ONE RUB." both legible at rest, which gives away
       the page and reads as cramped rather than composed. scripts/shot.mjs is what
       said so out loud: its tripwire refused to photograph the blend because the
       section was 70% on screen before it had scrolled a pixel, so the run "would
       prove nothing". It was right, and the fix is the layout, not the flag. */
    <section
      ref={root}
      data-section="stage"
      data-motion="pending"
      className="relative flex min-h-[95svh] flex-col justify-end px-gutter pb-16 pt-40"
    >
      <div
        aria-hidden
        className="ember-glow pointer-events-none absolute start-1/2 top-1/3 h-[40vmin] w-[70vmin] -translate-x-1/2 opacity-25 rtl:translate-x-1/2"
      />

      <div className="relative mx-auto w-full max-w-[80rem]">
        <h1 className="display text-h1 text-bone">
          <span className="mask-line">
            <span data-mask className="block will-change-transform">
              {title}
            </span>
          </span>
        </h1>

        <p data-animate className="measure mt-8 text-lead text-ash-700">
          {lede}
        </p>

        {children}
      </div>
    </section>
  );
}

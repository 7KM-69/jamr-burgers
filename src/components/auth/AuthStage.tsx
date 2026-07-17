'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * The animated shell every /auth and /account screen sits inside.
 *
 * It is the sibling of `RouteStage`: a full-height chapter opener with the ember
 * glow behind it and one entrance timeline — masked headline lines rise, then the
 * rest fades up. It differs in that its body is arbitrary (a form, a profile, a
 * confirmation), so the layout of the content is the caller's, and this owns only
 * the section, the glow, the motion and the gate.
 *
 * ## Why the gate is not optional
 *
 * scripts/shot.mjs refuses to photograph a section that publishes no `data-motion`
 * ("I cannot verify this" is a result). Every screen built on this stage is meant
 * to be screenshotted — the empty form, the error, the check-your-inbox — so the
 * gate is what makes those shots provable rather than hopeful.
 *
 * Contract for callers:
 *   · headline lines are wrapped in `.mask-line > [data-mask]` (see the views).
 *   · everything else that should fade in carries `data-animate`.
 * Both are gated behind `html.motion` in globals.css, so a reduced-motion or
 * no-JS reader gets the finished, legible screen with nothing stranded.
 */
export function AuthStage({
  section,
  children,
  className = '',
}: {
  /** `data-section` value — the handle scripts/shot.mjs frames on. */
  section: string;
  children: React.ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    // Reduced motion / no JS: globals.css never hid anything, so there is nothing
    // to reveal. Declare the section settled so the harness can photograph it.
    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.25 });

      revealMask(tl, '[data-mask]', { duration: 1.1, stagger: 0.08 }).fromTo(
        '[data-animate]',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.07, ease: EASE.out },
        '-=0.8',
      );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section={section}
      data-motion="pending"
      className={`relative flex min-h-[100svh] flex-col justify-center px-gutter pb-24 pt-36 ${className}`}
    >
      <div
        aria-hidden
        className="ember-glow pointer-events-none absolute start-1/2 top-[38%] h-[46vmin] w-[80vmin] -translate-x-1/2 opacity-20 rtl:translate-x-1/2"
      />

      <div className="relative mx-auto w-full max-w-[82rem]">{children}</div>
    </section>
  );
}

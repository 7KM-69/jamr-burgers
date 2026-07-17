'use client';

import { useEffect, useRef } from 'react';
import { EASE, ScrollTrigger, gsap } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { getLenis } from '@/components/providers/SmoothScrollProvider';

/**
 * The page-transition shell.
 *
 * `template.tsx` (not `layout.tsx`) remounts on every navigation — that remount
 * IS the transition hook. The overlay's resting state is *covering*: it paints
 * over the incoming route on the first frame, then wipes away to reveal it. That
 * ordering is why there is no flash of an unstyled, un-animated new page.
 *
 * On the first load the loader owns the screen, so the overlay stands down
 * rather than stacking a second curtain behind the first.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const overlay = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);

  useEffect(() => {
    const el = overlay.current;
    if (!el) return;

    if (isFirstMount.current) {
      isFirstMount.current = false;
      gsap.set(el, { display: 'none' });
      return;
    }

    // A new route always starts at the top. `immediate` because a smooth-scrolled
    // slide to the top *while* the overlay wipes is two motions fighting.
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);

    if (prefersReducedMotion()) {
      gsap.set(el, { display: 'none' });
      ScrollTrigger.refresh();
      return;
    }

    const ctx = gsap.context(() => {
      gsap.timeline()
        .set(el, { display: 'block', yPercent: 0 })
        .to('[data-transition-mark]', { opacity: 0, duration: 0.25, ease: 'power2.in' })
        .to(el, {
          yPercent: -100,
          duration: 0.85,
          ease: EASE.inOut,
          onComplete: () => {
            gsap.set(el, { display: 'none' });

            // Only now. Refreshing mid-wipe measures trigger positions against a
            // layout that is still moving, and every pin on the new page lands a
            // few hundred pixels off. The outgoing route's triggers are already
            // gone — each section reverts its own gsap.context on unmount — and
            // this sweep re-measures what is left.
            ScrollTrigger.refresh();
          },
        });
    }, overlay);

    return () => ctx.revert();
  }, []);

  return (
    <>
      <div
        ref={overlay}
        aria-hidden
        className="fixed inset-0 grid place-items-center bg-ink-deep will-change-transform"
        style={{ zIndex: 'var(--z-transition)' }}
      >
        <span data-transition-mark className="h-px w-24 bg-ember" />
      </div>

      <main id="main">{children}</main>
    </>
  );
}

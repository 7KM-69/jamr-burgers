'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Module-level handle so the loader can freeze the page while it is up, and the
 * page transition can jump to the top without a smooth-scrolled slide. The
 * provider lives in the root layout, which never remounts, so exactly one Lenis
 * instance exists for the life of the tab.
 */
let instance: Lenis | null = null;

export function getLenis(): Lenis | null {
  return instance;
}

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Reduced motion means native scrolling. Lenis is an easing layer on the
    // scroll position itself — there is no "gentler" version of it to offer.
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      duration: 1.05,
      // Expo-out. Matches EASE.out so a scroll and a tween decelerate alike.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    });
    instance = lenis;

    // Lenis moves the page; ScrollTrigger must be told on every one of those
    // frames or the two disagree and every pinned section drifts.
    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);

    // Drive Lenis from GSAP's ticker rather than its own rAF, so there is one
    // clock. Two independent rAF loops produce a half-frame of jitter on pins.
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    // GSAP's lag smoothing pauses tweens after a long frame; with a scrubbed
    // timeline that reads as the scroll "sticking". Off.
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.off('scroll', onScroll);
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      instance = null;
    };
  }, []);

  return <>{children}</>;
}

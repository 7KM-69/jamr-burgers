import type { Dir } from '@/i18n';

/** Below this width the ingredient showcase must not pin. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function isDesktop(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * Multiply every horizontal GSAP value by this.
 *
 * A marquee that travels x: -200 in English must travel x: +200 in Arabic, or
 * it slides *into* the text instead of away from it. Every `x` in this codebase
 * goes through here.
 */
export function dirSign(dir: Dir): 1 | -1 {
  return dir === 'rtl' ? -1 : 1;
}

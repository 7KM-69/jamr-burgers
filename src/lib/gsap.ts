'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * One easing vocabulary for the whole site. Mirrors the CSS custom properties
 * in globals.css so a GSAP tween and a CSS transition on the same element
 * cannot disagree about how the brand moves.
 */
export const EASE = {
  /** Entrances. Fast out of the gate, long settle. */
  out: 'expo.out',
  /** Anything that leaves and comes back — overlays, transitions. */
  inOut: 'power4.inOut',
  /** Scrubbed scroll timelines: gentle, no overshoot (overshoot fights the scrollbar). */
  scrub: 'none',
} as const;

export const DUR = {
  fast: 0.18,
  base: 0.42,
  slow: 0.9,
  loader: 1.15,
} as const;

/**
 * Plugins are registered exactly once, on the client only. This module is
 * imported by every animated component; ES module semantics guarantee the body
 * below runs a single time per page load.
 */
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);

  gsap.defaults({ ease: EASE.out, duration: DUR.slow });

  // On mobile, the URL bar collapsing fires a resize and would re-run every
  // trigger's start/end calculation mid-scroll, causing a visible jump.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/**
 * How far below its own clipping mask a line rests before it rises. Percent, so
 * it scales with the line's own height — the same number works on 200px display
 * type and on a 24px menu item. Mirrored in globals.css; the two must agree.
 *
 * It must satisfy `shift >= 1 + padding / lineHeight` for EVERY masked line, or
 * the "hidden" line still peeks below its mask at rest. `.mask-line` pads itself
 * to keep ascenders and descenders from being clipped, and Arabic pads harder
 * (0.18em against a 1.15 line-height) because its descenders are deeper — which
 * needs 116%. 125% clears that, and clears the tightest Latin case (0.08em
 * against the 0.84 display leading, 110%), with room to spare.
 */
export const MASK_SHIFT = 125;

/**
 * The masked-line reveal. **Every** masked reveal on this site goes through
 * here — there is deliberately no second way to write one.
 *
 * ## Why this is a function and not four lines you inline
 *
 * globals.css parks `[data-mask]` at `translateY(125%)` behind `html.motion`, so
 * the first painted frame is already the "before" of the timeline (no flash of
 * finished type that then jumps) and so a no-JS or reduced-motion reader — for
 * whom `html.motion` is never added — gets the finished, legible page instead of
 * content stranded mid-animation. That rest state is worth keeping.
 *
 * But **GSAP cannot read a percentage transform back out of a computed style.**
 * It parses the computed matrix into PIXELS: it records `y: <px>` and leaves its
 * own `yPercent` sitting at 0. So the obvious `.to({ yPercent: 0 })` tweens
 * 0 → 0 — a no-op. The pixel offset is never unwound and the line stays parked
 * below its mask forever. This shipped: the site had no headlines, anywhere, and
 * `build`, `tsc` and `lint` all stayed green over it, because the rest state is
 * gated on `html.motion` and the only path that breaks is the *normal* one.
 *
 * The cure is to never let GSAP read the rest state at all. `fromTo` states both
 * transform components explicitly, which overwrites whatever pixel value GSAP
 * parsed. Zeroing `y` is not cosmetic: GSAP composes
 * `translate(x, y) translate(xPercent, yPercent)`, so a `fromTo` that set only
 * `yPercent: 115` would start the line at 115% *plus* the pixels GSAP had already
 * read — roughly twice as far down, and just as invisible.
 */
export function revealMask(
  tl: gsap.core.Timeline,
  target: gsap.TweenTarget,
  vars: gsap.TweenVars = {},
  position: number | string = 0,
): gsap.core.Timeline {
  return tl.fromTo(
    target,
    { yPercent: MASK_SHIFT, y: 0 },
    { yPercent: 0, y: 0, duration: 1.2, ease: EASE.out, ...vars },
    position,
  );
}

/* ------------------------------------------------------------------------- *
 * The motion gate: a section tells the outside world when it has FINISHED.
 * ------------------------------------------------------------------------- */

/**
 * A scrubbed timeline never lands on exactly 1 — it is chasing the scroll
 * position through a smoothing tween, so it converges. 0.995 of a 170%-of-
 * viewport pin is the last ~8px of scroll: visually the end, and reachable.
 */
const PROGRESS_DONE = 0.995;

export interface MotionGate {
  /** Register an animation whose completion is part of "this section is done". */
  watch<T extends gsap.core.Animation>(animation: T): T;
  /** Declare the section finished with no animation to wait for (reduced motion). */
  settle(): void;
}

/**
 * Publishes `data-motion="pending" | "ready"` on a section root, driven by the
 * progress of the section's own GSAP animations.
 *
 * ## Why this exists
 *
 * A screenshot is only evidence if the thing it photographs has finished moving.
 * The screenshot harness used to decide that by reading `opacity` off a node it
 * had guessed at, and it was wrong three separate ways:
 *
 *   - The stat rules reveal with `scaleY`. Their opacity is 1 from the first
 *     frame to the last, so "opacity >= 0.9" was true before the animation had
 *     started. **Not every reveal touches opacity.**
 *   - `getComputedStyle(span).opacity` on a counter returns 1 even when the
 *     span's parent sits at `opacity: 0`. Opacity is not inherited as a computed
 *     value; it composites. **A node's own style does not tell you whether it is
 *     on the screen.**
 *   - `[data-animate]` exists in every section, so the check resolved against
 *     whatever was already on screen — the hero — and certified it. **A property
 *     probe has no idea which section it is looking at.**
 *
 * No selector fixes that, because the fault is not the selector. The only thing
 * that reliably knows a reveal is over is the thing running it. So GSAP says so,
 * on the section root, in the DOM, where a screenshot script (or a human, or a
 * test) can read it — for a fade, a `scaleY`, a masked line, a count-up and a
 * pinned scrub alike, and without knowing which of those it was.
 *
 * It is deliberately *one* of two witnesses. The harness pairs this declaration
 * with rendered truth it computes itself (composited visibility up the ancestor
 * chain, counters equal to their target, nothing changed for N frames). This one
 * proves the timeline ran to its end; that one proves the screen agrees. Either
 * alone can be fooled — a section below the fold that has not been triggered yet
 * is perfectly stable, and a timeline can report done while the page is still
 * easing under it.
 *
 * `watch()` AFTER populating the timeline. An empty GSAP timeline has zero
 * duration and would report itself complete.
 */
export function motionGate(el: HTMLElement): MotionGate {
  const watched = new Set<gsap.core.Animation>();
  let settled = false;

  const publish = () => {
    const done =
      settled ||
      (watched.size > 0 &&
        [...watched].every((a) => a.totalDuration() > 0 && a.progress() >= PROGRESS_DONE));
    el.dataset.motion = done ? 'ready' : 'pending';
  };

  publish();

  return {
    watch(animation) {
      watched.add(animation);

      // onUpdate, not onComplete: a scrubbed timeline's playhead is moved by
      // ScrollTrigger rather than by the ticker, and onUpdate is the callback
      // that fires on every render however the playhead got there. Chained, so
      // registering the gate can never eat a callback the section already set.
      for (const type of ['onUpdate', 'onComplete'] as const) {
        const previous = animation.eventCallback(type);
        animation.eventCallback(type, function (this: gsap.core.Animation, ...args: unknown[]) {
          if (typeof previous === 'function') previous.apply(this, args);
          publish();
        });
      }

      publish();
      return animation;
    },

    settle() {
      settled = true;
      publish();
    },
  };
}

export { gsap, ScrollTrigger };

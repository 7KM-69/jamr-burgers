'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { BLEND, MAX_SHARE, polar } from '@/components/spices/blend';

/**
 * The blend — the signature moment of /spices.
 *
 * ## The idea, and why it belongs to THIS site
 *
 * The home page's showcase pulls a burger APART: five layers drifting away from
 * each other, each one named. This is that argument run backwards — nine things
 * ground INTO one. Same grammar (a diagram, with every word in it also present as
 * text), opposite direction. That inversion is the reason the page reads as part
 * of the site instead of as a second, unrelated take on it, and it is why /spices
 * is a wheel rather than a list of nine cards, which is what it would have been.
 *
 * ## Two layouts, no `gsap.matchMedia`
 *
 * The wheel needs room, so below `lg` the same nine become a weighed index with a
 * bar each. Both trees are in the DOM; the one not in play is `display:none` and
 * costs nothing. ONE timeline drives both — tweening a hidden element is a no-op,
 * and that is a far better trade than a `matchMedia` condition set, which is the
 * construct that silently killed the entire mobile branch of the ingredient
 * showcase for the whole project (team-protocol L7). There is no condition here to
 * fail to cover.
 *
 * ## Who owns which transform
 *
 * A spoke has to be ROTATED to its angle and then DRAWN outward from the hub. Both
 * are transforms, and GSAP writes the `transform` property whole — so an element
 * carrying an inline `rotate()` would have it erased the instant the tween touched
 * it, and all nine spokes would collapse onto the 3 o'clock line. So: the outer
 * element owns the rotation (static, inline, never animated) and the inner element
 * owns the scaleX (GSAP, never rotated). One element, one owner — the same rule the
 * Locations pins follow.
 */

/** Spoke length and dot distance, as a percentage of the square stage. */
const RADIUS = 34;
/** Hub diameter, same units. Its radius (17%) is half the spoke, so it covers the
 *  inner half of every spoke and the lines appear to leave the coal, not the point. */
const HUB = 34;

export function Blend() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const copy = t.spices;

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    // Reduced motion: the wheel is already drawn, every spoke is at full length,
    // every bar is at its full share, the coal is lit. Only the arrival is lost.
    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 72%', once: true },
      });

      revealMask(tl, '[data-mask]', { duration: 1.15, stagger: 0.1 }, 0)
        .fromTo(
          '[data-animate]',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.85, stagger: 0.07, ease: EASE.out },
          0.35,
        )
        // The coal first and alone — the rub is named by a light that is already
        // burning. Lands on 0.55, which is the `opacity-55` utility on the element:
        // the brightness a reduced-motion reader already sees at rest. An animation
        // that ended anywhere else would make the coal a different temperature
        // depending on whether it got to move.
        .fromTo(
          '[data-hub-glow]',
          { opacity: 0, scale: 0.6 },
          { opacity: 0.55, scale: 1, duration: 1.5, ease: EASE.out },
          0.2,
        )
        .fromTo(
          '[data-hub]',
          { opacity: 0, scale: 0.86 },
          { opacity: 1, scale: 1, duration: 0.9, ease: EASE.out },
          0.5,
        )
        // Then the nine leave the hub, one after another, and the names land on the
        // ends of them. Clockwise from twelve, in the order the rub is weighed out.
        .fromTo(
          '[data-spoke]',
          { scaleX: 0 },
          { scaleX: 1, duration: 0.75, stagger: 0.06, ease: EASE.inOut },
          0.75,
        )
        .fromTo(
          '[data-spice]',
          { opacity: 0, scale: 0.5 },
          { opacity: 1, scale: 1, duration: 0.5, stagger: 0.06, ease: 'back.out(2.2)' },
          1.05,
        )
        // The mobile index, same timeline. On desktop this tweens nothing anyone can
        // see, which is precisely the point: no branch, so no branch to get wrong.
        .fromTo(
          '[data-share-bar]',
          { scaleX: 0 },
          { scaleX: 1, duration: 0.9, stagger: 0.06, ease: EASE.inOut },
          0.75,
        );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="blend"
      data-motion="pending"
      /* Full section spacing top AND bottom: unlike the Locations route — where the
         stage carries the only headline and the section is its continuation — this
         section has a headline of its own, so it is a new chapter and gets the air a
         new chapter gets. */
      className="relative px-gutter py-section"
    >
      <div className="mx-auto w-full max-w-[80rem]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
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
          </div>

          <p data-animate className="measure-tight text-lead text-ash-700 lg:pb-2 lg:text-end">
            {copy.lede}
          </p>
        </div>

        {/* ---- The wheel. Desktop only: nine labels on a ring need room. ------ */}
        <div className="mt-24 hidden lg:block">
          <div className="relative mx-auto aspect-square w-full max-w-[40rem]">
            {/* The ring the dots sit on. Decorative — every district of this
                diagram is in the index below as text. */}
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ash-400"
              style={{ width: `${RADIUS * 2}%`, height: `${RADIUS * 2}%` }}
            />

            {/* ---- The spokes. Outer = rotation (static). Inner = draw (GSAP). -- */}
            {BLEND.map((spice) => (
              <div
                key={`spoke-${spice.key}`}
                aria-hidden
                className="absolute left-1/2 top-1/2 h-px"
                style={{
                  width: `${RADIUS}%`,
                  // Physical, and deliberately so: the wheel is a circle, and a
                  // circle has no reading direction to respect. Rotating it in RTL
                  // would reflect the diagram for no gain — the labels are text and
                  // read correctly either way on their own.
                  transformOrigin: 'left center',
                  transform: `rotate(${spice.angle - 90}deg)`,
                }}
              >
                <span
                  data-spoke
                  className="block h-px w-full bg-gradient-to-r from-ember/70 to-ash-500 will-change-transform"
                />
              </div>
            ))}

            {/* ---- The nine. --------------------------------------------------- */}
            {BLEND.map((spice) => {
              const { x, y, side } = polar(spice.angle, RADIUS);
              const meta = copy.spices[spice.key];
              const labelRight = side === 'right';

              return (
                /* PHYSICAL left/top and a PHYSICAL -translate to centre the dot on
                   its coordinate — the same reasoning as the Riyadh plan: the
                   Tailwind -translate-x-1/2 needs no `rtl:` undo because the offset
                   it is undoing is physical too. */
                <div
                  key={spice.key}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div data-spice className="relative will-change-transform">
                    <span
                      aria-hidden
                      className="block size-2 rounded-full bg-ember shadow-[0_0_10px_var(--color-ember)]"
                    />

                    {/* The label hangs OUTWARD, away from the hub — so it is on the
                        physical right for the right half of the wheel and the
                        physical left for the left half, in both languages. The
                        text-align matches, which keeps the name and its share flush
                        on the edge nearest the dot; `text-left` / `text-right` are
                        physical properties, so they are inherited correctly into the
                        `.num` share below regardless of its `direction: ltr`. */}
                    <span
                      className={`absolute top-1/2 block -translate-y-1/2 whitespace-nowrap ${
                        labelRight ? 'left-full pl-4 text-left' : 'right-full pr-4 text-right'
                      }`}
                    >
                      {/* `whitespace-nowrap` AGAIN, on this element, and it is not a
                          duplicate of the one on the parent.

                          `.display` sets `text-wrap: balance` — and `text-wrap` is a
                          shorthand whose `text-wrap-mode` longhand resets to `wrap`.
                          So the inherited `white-space: nowrap` from the wrapper was
                          being overridden right here, on the only element that
                          mattered. The label is absolutely positioned against an 8px
                          dot, so its available width is ~0 and shrink-to-fit
                          collapses it to min-content: "BLACK PEPPER" broke into two
                          stacked lines and sat on top of its own spoke. Setting the
                          utility on this element wins (utilities outrank components)
                          and pins text-wrap-mode back to nowrap. */}
                      <span className="display block whitespace-nowrap text-sm leading-none text-bone">
                        {meta.name}
                      </span>
                      <span className="num mt-1.5 block whitespace-nowrap text-[0.6875rem] font-semibold text-ember">
                        {spice.share}%
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}

            {/* ---- The hub. The coal, and the name of the rub. ------------------ */}
            <div
              aria-hidden
              data-hub-glow
              className="ember-glow pointer-events-none absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 opacity-55 will-change-transform"
            />

            {/* TWO elements, and they are not interchangeable.

                The OUTER one is centred with `-translate-x/y-1/2` and is never
                animated. The INNER one carries `data-hub` and is the only thing
                GSAP scales.

                Collapsing them into one would break the hub, quietly: globals.css
                parks `[data-hub]` at `transform: scale(0.86)`, and `transform` is a
                single property — that declaration would OVERWRITE the centring
                translate rather than compose with it. GSAP would then read a
                computed transform with no translate in it, record x=0/y=0, and tween
                to `translate(0,0) scale(1)` — leaving the coal permanently half a
                hub down and to the right of the wheel it is supposed to be the
                centre of. Same failure as the masked lines (src/lib/gsap.ts): never
                let one owner's transform be read by another. */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: `${HUB}%`, height: `${HUB}%` }}
            >
              <div
                data-hub
                className="flex size-full flex-col items-center justify-center rounded-full border border-ash-500 bg-ink text-center will-change-transform"
              >
                <p className="display heat-text text-h3 leading-none">{copy.hubName}</p>
                <p className="eyebrow mt-3">{copy.hubNote}</p>
              </div>
            </div>
          </div>

          <p data-animate className="eyebrow mt-14 text-center text-ash-700">
            {copy.plan}
          </p>
        </div>

        {/* ---- The weighed index. Below `lg`, and the only thing there. ------- *
            Not a fallback: it is the same nine, the same shares, the same order,
            with the ring straightened out. Every bar is measured against the
            heaviest spice rather than against 100, so the lightest is still a line
            you can see rather than a rounding error.                             */}
        <ol className="mt-16 lg:hidden">
          <li className="eyebrow pb-5 text-ash-700">{copy.shareLabel}</li>

          {BLEND.map((spice) => {
            const meta = copy.spices[spice.key];

            return (
              <li key={spice.key} className="border-t border-ash-400 py-7 last:border-b">
                <div className="flex items-baseline gap-4">
                  <h3 className="display text-h3 leading-none text-bone">{meta.name}</h3>
                  <span className="num ms-auto text-sm font-semibold text-ember">
                    {spice.share}%
                  </span>
                </div>

                {/* Track and fill. The fill's WIDTH is the share; the scaleX that
                    draws it is animation only, so the bar can never end up telling
                    a different number than the one printed beside it. */}
                <div aria-hidden className="relative mt-5 h-px w-full bg-ash-400">
                  <span
                    data-share-bar
                    className="absolute inset-y-0 start-0 block bg-gradient-to-r from-ember to-flame will-change-transform rtl:bg-gradient-to-l"
                    style={{ width: `${(spice.share / MAX_SHARE) * 100}%` }}
                  />
                </div>

                <p className="measure mt-5 text-sm leading-relaxed text-ash-700">{meta.note}</p>
              </li>
            );
          })}
        </ol>

        <p data-animate className="eyebrow mt-8 text-ash-700 lg:hidden">
          {copy.plan}
        </p>
      </div>
    </section>
  );
}

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { dirSign, prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { BurgerStack } from '@/components/burger/BurgerStack';
import { BURGER_LAYERS, LABELLED_LAYERS } from '@/components/burger/layers';
import type { Dir } from '@/i18n';

/**
 * The signature moment.
 *
 * On desktop the section pins and the burger comes apart under the scrubbed
 * scroll — six layers drifting to the positions declared in `layers.ts`, five
 * labels arriving with their connectors drawing out to the layer they name.
 *
 * The whole separation is `yPercent` / `xPercent` / `rotate` on six elements that
 * are each the full stage canvas. That means it is transform-only, it never
 * touches layout, and it scales from 390px to 1920px without a single media query
 * or a recalculation on resize.
 *
 * On mobile it does not pin — pinning a scroll on a phone is scroll-jacking. It
 * degrades to a stacked reveal: the burger is shown already apart, and the five
 * ingredients are read as a list beneath it.
 */
export function IngredientShowcase() {
  const root = useRef<HTMLElement>(null);
  const { t, dir } = useI18n();
  const sign = dirSign(dir);

  /**
   * -------------------------------------------------------------------------
   * Where the leader lines have to reach.
   * -------------------------------------------------------------------------
   *
   * In an exploded diagram the line IS the information — it is the only thing
   * binding the word "TOMATO" to the red disc rather than to the yellow one above
   * it. So it has to ARRIVE. The first version gave every connector a fixed
   * `w-12 xl:w-20` and left ~150px of empty charcoal between the end of the rule
   * and the layer it named: the eye followed it, landed on nothing, and had to
   * hop the gap and guess. That reads as unfinished, not as an editorial rule.
   *
   * A constant cannot arrive, because the distance is not a constant:
   *
   *     length = (the layer's silhouette edge) − (the label box's inner edge)
   *
   * and it changes with viewport width (the stage is a max-width, the burger a
   * clamp, the label box a percentage — three different curves), with the reading
   * direction, and with how far the layer drifted.
   *
   * So: measure. Two of the three terms come from the DOM. The third cannot —
   * every layer element is the FULL transparent 1000x800 canvas, so a
   * getBoundingClientRect() reports the canvas, never the burger. That one comes
   * from geometry.ts, which reads the SVG's alpha channel offline.
   *
   * Everything is computed in LOGICAL coordinates — `u` grows from the reading-start
   * edge of the stage — so RTL is the same arithmetic, not a second code path.
   */
  const measure = useCallback((el: HTMLElement, direction: Dir) => {
    const stage = el.querySelector<HTMLElement>('[data-stage]');
    const burger = el.querySelector<HTMLElement>('[data-burger-stack]');
    if (!stage || !burger) return;

    const ltr = direction === 'ltr';
    const s = stage.getBoundingClientRect();
    const b = burger.getBoundingClientRect();
    if (s.width === 0 || b.width === 0) return;

    const W = b.width; // the art canvas, rendered
    const H = b.height; // === W * 0.8; the canvas is 1000x800
    const cx = W / 2;
    const cy = H / 2;

    // The burger is centred in the stage, but measure it rather than assume it.
    const uBurger = ltr ? b.left - s.left : s.right - b.right;

    for (const layer of LABELLED_LAYERS) {
      const wrap = el.querySelector<HTMLElement>(`[data-label-for='${layer.key}']`);
      // display:none below lg — no box, nothing to measure, nothing to draw.
      if (!wrap || !wrap.getClientRects().length) continue;

      // Physical side this label sits on, and therefore which edge of the
      // silhouette its line has to touch. In RTL the labels mirror but the ART
      // DOES NOT — a right-hand label in Arabic still points at the right-hand
      // edge of the same unmirrored drawing.
      const onStartSide = layer.side === 'start';
      const pointsAtLeftEdge = onStartSide === ltr;
      const edge = pointsAtLeftEdge ? layer.edgeStart : layer.edgeEnd;

      // The contact point, in the burger's own pixels, before the layer moves.
      const px = edge * W;
      const py = layer.centreY * H;

      // Then rotate it with the layer (about the element's centre, which is what
      // GSAP does) and translate it. The rotations are ~1°, but at 200px from the
      // centre that is still several pixels of vertical error, and a hairline that
      // misses the silhouette by five pixels is a hairline that missed.
      const theta = (layer.rotate * sign * Math.PI) / 180;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const rx = cx + (px - cx) * cos - (py - cy) * sin;
      const ry = cy + (px - cx) * sin + (py - cy) * cos;

      const tx = (layer.xPercent / 100) * W * sign;
      const ty = (layer.yPercent / 100) * H;

      const hitX = rx + tx;
      const hitY = ry + ty;

      // Into logical stage space. `u` runs from the stage's reading-start edge.
      const uHit = uBurger + (ltr ? hitX : W - hitX);

      // The label box's inner edge, measured — it is a min(20rem, 26%) box, so it
      // is a percentage at one width and a cap at another.
      const w = wrap.getBoundingClientRect();
      const uInner = onStartSide
        ? ltr
          ? w.right - s.left
          : s.right - w.left
        : ltr
          ? s.right - w.left
          : w.right - s.left;

      // On the end side the label is measured from the far edge, so the gap it has
      // to cross is what is left of the stage after both.
      const span = onStartSide ? uHit - uInner : s.width - uInner - uHit;

      // A line shorter than this is not a leader line, it is a dash. Should never
      // trigger between 1024 and 1920 — it is a floor, not a fudge.
      wrap.style.setProperty('--connector', `${Math.max(16, Math.round(span))}px`);
      wrap.style.setProperty('--anchor', `${(hitY / s.height) * 100}%`);
    }
  }, [sign]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    measure(el, dir);

    // The three terms all move with the viewport. Re-measure whenever the stage
    // resizes — which covers the window, the zoom, and the font swap.
    const stage = el.querySelector<HTMLElement>('[data-stage]');
    const ro = new ResizeObserver(() => measure(el, dir));
    if (stage) ro.observe(stage);

    return () => ro.disconnect();
  }, [dir, measure]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // Three completely different timelines reveal this section depending on the
    // branch below — a pinned scrub, a pair of staggered scroll tweens, or a set
    // of instant `gsap.set`s. The gate is the one place that reconciles them into
    // a single answer to "is it finished", which is why the harness does not need
    // to know which branch it is photographing.
    const gate = motionGate(el);

    // matchMedia is a gsap.Context per condition — it reverts exactly like
    // gsap.context() does, and it additionally re-runs when the breakpoint or
    // the motion preference changes, which a bare context cannot do.
    const mm = gsap.matchMedia(el);

    mm.add(
      {
        isDesktop: '(min-width: 1024px)',
        /**
         * `isMobile` is not used in the body. It is here because it is LOAD-BEARING.
         *
         * gsap.matchMedia() only invokes the callback when AT LEAST ONE named
         * condition matches. With only `isDesktop` and `reduced` declared, a phone
         * with normal motion matched neither — so GSAP never ran this function at
         * all, and the entire mobile branch below was dead code. The result: on
         * mobile the signature section rendered an un-exploded burger and an
         * ingredient list frozen at the opacity:0 rest state globals.css gives it.
         * The whole thing was invisible, on the most-used viewport, and it shipped.
         *
         * The conditions must therefore COVER THE SPACE. Do not delete this line
         * because a linter calls it unused; the linter cannot see the media query.
         */
        isMobile: '(max-width: 1023px)',
        reduced: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const { isDesktop, reduced } = context.conditions as {
          isDesktop: boolean;
          isMobile: boolean;
          reduced: boolean;
        };

        /** The separated pose. Every horizontal value is mirrored in RTL. */
        const pose = (spread = 1) =>
          BURGER_LAYERS.map((layer) => ({
            target: `[data-layer='${layer.key}']`,
            vars: {
              yPercent: layer.yPercent * spread,
              xPercent: layer.xPercent * spread * sign,
              rotate: layer.rotate * sign,
            },
          }));

        // ---- Reduced motion: the finished state, printed. -------------------
        // No pin, no scrub, no scroll-jack. The burger is already apart, every
        // label is already there. Nothing is lost except the motion itself.
        if (reduced) {
          pose().forEach(({ target, vars }) => gsap.set(target, vars));
          gsap.set('[data-label], [data-mobile-item]', { opacity: 1 });
          gsap.set('[data-connector]', { scaleX: 1 });
          gsap.set('[data-pin]', { opacity: 1, scale: 1 });
          gsap.set('[data-hint]', { opacity: 0 });
          gate.settle();
          return;
        }

        // ---- Desktop: pinned, scrubbed. -------------------------------------
        if (isDesktop) {
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: el,
              start: 'top top',
              end: '+=170%',
              pin: true,
              anticipatePin: 1,
              // A little scrub lag: the layers keep drifting for a beat after the
              // wheel stops, which is what gives the separation weight instead of
              // making it feel bolted to the scrollbar.
              scrub: 0.8,
            },
          });

          pose().forEach(({ target, vars }) => {
            tl.to(target, { ...vars, ease: 'none' }, 0);
          });

          tl.to('[data-hint]', { opacity: 0, duration: 0.12, ease: 'none' }, 0)
            .to('[data-showcase-glow]', { opacity: 1, scale: 1.2, ease: 'none' }, 0)
            // The ghost word drifts against the layers — it is the only thing on
            // screen moving the other way, which is what makes the layers read as
            // moving at all. (Arabic has no ghost word; an empty target is a no-op.)
            .to('[data-ghost]', { yPercent: -16, ease: 'none' }, 0)
            .to('[data-label]', { opacity: 1, duration: 0.22, stagger: 0.07, ease: 'none' }, 0.3)
            // The line draws out of the label…
            .to(
              '[data-connector]',
              { scaleX: 1, duration: 0.28, stagger: 0.07, ease: 'none' },
              0.36,
            )
            // …and lands on the layer. The pin arrives last and only once the line
            // has got there, which is what makes the contact read as contact.
            // fromTo, not to: the rest state is CSS (opacity 0), and a `.to()` that
            // has to read its own start value out of a stylesheet is how the masked
            // headlines went invisible. Declare both ends. Always.
            .fromTo(
              '[data-pin]',
              { opacity: 0, scale: 0 },
              { opacity: 1, scale: 1, duration: 0.16, stagger: 0.07, ease: 'none' },
              0.6,
            );

          // The pins land at 0.6–0.9 of this timeline, so "the pins are visible"
          // is NOT the end of it — the layers are still drifting apart after that.
          // Waiting on `[data-pin]` photographed a burger that had not finished
          // coming apart. The gate waits on the timeline, so the end is the end.
          gate.watch(tl);
          return;
        }

        // ---- Mobile: stacked reveal. ----------------------------------------
        // A touch wider spread, because on a narrow stage the layers need more air
        // between them to read as separate objects.
        pose(1.08).forEach(({ target, vars }) => gsap.set(target, vars));

        gate.watch(
          gsap.fromTo(
            '[data-burger-stack] [data-layer]',
            { opacity: 0, y: 28 },
            {
              opacity: 1,
              y: 0,
              duration: 0.9,
              stagger: 0.09,
              ease: EASE.out,
              scrollTrigger: { trigger: '[data-stage]', start: 'top 78%', once: true },
            },
          ),
        );

        gate.watch(
          gsap.to('[data-mobile-item]', {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.08,
            ease: EASE.out,
            scrollTrigger: { trigger: '[data-mobile-list]', start: 'top 85%', once: true },
          }),
        );
      },
    );

    // The header reads the same at every breakpoint, so it sits outside the
    // matchMedia and in a plain context.
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) return;

      const headerTl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 75%', once: true },
      });

      revealMask(headerTl, '[data-mask]', { duration: 1.1, stagger: 0.1 })
        .fromTo(
          '[data-animate]',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: EASE.out },
          '-=0.85',
        );

      gate.watch(headerTl);
    }, root);

    return () => {
      mm.revert();
      ctx.revert();
    };
    // `dir` is a dependency because every xPercent and every rotation is mirrored
    // by `sign`. Rebuilding the timeline on a language switch is the only way the
    // fan drifts the correct way in Arabic.
  }, [dir, sign]);

  return (
    <section
      ref={root}
      data-section="stack"
      data-motion="pending"
      className="relative px-gutter py-section lg:flex lg:h-[100svh] lg:flex-col lg:justify-center lg:py-0"
    >
      <div className="mx-auto flex w-full max-w-[80rem] flex-col">
        {/* --- Header --- */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p data-animate className="eyebrow mb-6">
              {t.stack.eyebrow}
            </p>
            <h2 className="display text-h2 text-bone">
              {t.stack.headline.map((line, i) => (
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

          <p data-hint className="eyebrow hidden pb-2 text-ash-700 lg:block">
            {t.stack.hint}
          </p>
        </div>

        {/* --- Stage --- */}
        <div data-stage className="relative mx-auto mt-14 w-full lg:mt-10">
          <div
            aria-hidden
            data-showcase-glow
            className="ember-glow pointer-events-none absolute start-1/2 top-1/2 h-[60%] w-[80%] -translate-x-1/2 -translate-y-1/2 opacity-40 will-change-transform rtl:translate-x-1/2"
          />

          {/* The word behind the thing. Big enough to be architecture, quiet enough
              that it never competes with the burger — and absent in Arabic, where a
              cursive word cut in half by the burger reads as damage. See en.ts. */}
          {t.stack.ghost ? (
            <span
              aria-hidden
              data-ghost
              className="display pointer-events-none absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[18vw] leading-none text-ash-300 will-change-transform rtl:translate-x-1/2"
            >
              {t.stack.ghost}
            </span>
          ) : null}

          <div className="relative mx-auto" style={{ width: 'clamp(16rem, 34vw, 30rem)' }}>
            <BurgerStack label={t.meta.title} sizes="(max-width: 1024px) 70vw, 34vw" />
          </div>

          {/* --- Desktop labels: bound to the layer they name --- */}
          <div className="pointer-events-none absolute inset-0 hidden lg:block">
            {LABELLED_LAYERS.map((layer) => {
              const meta = t.stack.layers[layer.label];
              const isStart = layer.side === 'start';

              return (
                <div
                  key={layer.key}
                  data-label-for={layer.key}
                  className="absolute"
                  style={{
                    /* `--anchor` and `--connector` are written by measure() from the
                       real geometry. The fallbacks are what SSR and a
                       JS-less/first-paint render get: the layer's drifted centre,
                       computed from the same art measurements, and no line at all —
                       because a line of the WRONG length is worse than none. */
                    top: 'var(--anchor)',
                    transform: 'translateY(-50%)',
                    width: 'min(20rem, 26%)',
                    ...(isStart ? { insetInlineStart: 0 } : { insetInlineEnd: 0 }),
                    ['--anchor' as string]: `${layer.anchor * 100}%`,
                    ['--connector' as string]: '0px',
                  }}
                >
                  <div data-label className="will-change-transform">
                    <p
                      className={`display text-h3 leading-none text-bone ${
                        isStart ? 'text-end' : 'text-start'
                      }`}
                    >
                      {meta.name}
                    </p>
                    <p
                      className={`mt-2 text-xs leading-relaxed text-ash-700 ${
                        isStart ? 'text-end' : 'text-start'
                      }`}
                    >
                      {meta.spec}
                    </p>
                  </div>

                  {/* The leader line leaves the label box's inner edge and stops on
                      the layer's silhouette. It is positioned OUTSIDE the box, so
                      its length is free to be whatever the geometry says without
                      squeezing the type. Logical insets, so RTL mirrors the whole
                      assembly with no second code path; transform-origin is set in
                      globals.css from [data-from]. */}
                  <span
                    aria-hidden
                    data-connector
                    data-from={layer.side}
                    className="absolute top-1/2 block h-px bg-ember will-change-transform"
                    style={{
                      width: 'var(--connector)',
                      marginTop: '-0.5px',
                      ...(isStart
                        ? { insetInlineStart: '100%' }
                        : { insetInlineEnd: '100%' }),
                    }}
                  />
                  {/* And lands. The pin is the full stop on the sentence: it sits on
                      the silhouette, so the line demonstrably touches the thing. */}
                  <span
                    aria-hidden
                    data-pin
                    className="absolute top-1/2 block size-[7px] rounded-full bg-ember will-change-transform"
                    style={{
                      marginTop: '-3.5px',
                      ...(isStart
                        ? { insetInlineStart: 'calc(100% + var(--connector) - 3.5px)' }
                        : { insetInlineEnd: 'calc(100% + var(--connector) - 3.5px)' }),
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* --- Mobile: the same five, read as a list --- */}
        <ol data-mobile-list className="mt-16 flex flex-col lg:hidden">
          {LABELLED_LAYERS.map((layer, i) => {
            const meta = t.stack.layers[layer.label];
            return (
              <li
                key={layer.key}
                data-mobile-item
                className="flex gap-5 border-t border-ash-400 py-5 will-change-transform"
              >
                <span className="num pt-1 text-xs text-ember">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="display text-h3 leading-none text-bone">{meta.name}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ash-700">{meta.spec}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

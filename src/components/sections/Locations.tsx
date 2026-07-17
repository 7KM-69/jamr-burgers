'use client';

import { useEffect, useRef, useState } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { BRANCHES, type BranchKey } from '@/components/locations/branches';

/**
 * Locations — home section 7, and the body of the /locations route.
 *
 * ONE component, two densities. The route is not a second design of the same
 * idea; it is the same design with the headline lifted out (RouteStage carries it
 * there) and the plan given more room. Two components would drift apart within a
 * week, and a visitor who clicks "Locations" in the nav after reading the home
 * section would arrive somewhere that felt like a different site.
 *
 * ## The plan is a diagram, and it does not mirror
 *
 * The map is `aria-hidden`. Everything it shows — every district name — is in the
 * index beside it, in reading order, as text. So it is a *redundant visual
 * affordance*: it adds pleasure and orientation for a sighted reader and takes
 * nothing from anyone else. That is also why the hover highlight needs no keyboard
 * equivalent — there is no information behind it to reach.
 *
 * And its coordinates are PHYSICAL (`left` / `top`), not logical. See branches.ts:
 * mirroring the layout in Arabic is correct, mirroring the CITY is not.
 */
export function Locations({ variant = 'home' }: { variant?: 'home' | 'route' }) {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const [active, setActive] = useState<BranchKey | null>(null);

  const isHome = variant === 'home';

  /**
   * Only a device that can actually HOVER gets the hover reaction.
   *
   * `onMouseEnter` is not a mouse-only event. A touch browser synthesises it on
   * tap — and then never sends the matching `mouseleave`, because a finger does
   * not leave, it lifts. So on a phone the first branch you happened to touch lit
   * its rule and its map pin and STAYED lit, permanently, with no gesture able to
   * clear it. Every subsequent tap moved the highlight; nothing ever removed it.
   *
   * The highlight is a pointer affordance and nothing else — the map is
   * aria-hidden and every district it shows is already in the index as text — so
   * on a touch device the correct amount of it is none.
   */
  const canHover = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover)').matches;

  const enter = (key: BranchKey) => {
    if (canHover()) setActive(key);
  };

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    // Reduced motion: the plan is already drawn, every pin is already lit, every
    // row is already there. Only the arrival is lost.
    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 72%', once: true },
      });

      // The route variant has no headline of its own, so it has no [data-mask].
      // Guard rather than let GSAP warn about a target that is not there — and
      // then position everything else absolutely, so the choreography does not
      // silently shift by 1.2s depending on which variant is mounted.
      const hasHeadline = Boolean(el.querySelector('[data-mask]'));
      if (hasHeadline) {
        revealMask(tl, '[data-mask]', { duration: 1.15, stagger: 0.1 });
      }
      const t0 = hasHeadline ? 0.35 : 0;

      tl.fromTo(
        '[data-animate]',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.85, stagger: 0.07, ease: EASE.out },
        t0,
      )
        .fromTo(
          '[data-branch]',
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: EASE.out },
          t0 + 0.15,
        )
        // The pins land last and land hard — they are the payoff of the section,
        // and a coal catching should have a little snap in it.
        .fromTo(
          '[data-map-pin]',
          { opacity: 0, scale: 0.4 },
          { opacity: 1, scale: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(2.2)' },
          t0 + 0.3,
        );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="locations"
      data-motion="pending"
      className={`relative px-gutter ${isHome ? 'py-section' : 'pb-section pt-4'}`}
    >
      <div className="mx-auto w-full max-w-[80rem]">
        {isHome && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p data-animate className="eyebrow mb-8">
                {t.locations.eyebrow}
              </p>
              <h2 className="display text-h2 text-bone">
                {t.locations.headline.map((line, i) => (
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
              {t.locations.lede}
            </p>
          </div>
        )}

        <div
          className={`grid gap-12 lg:grid-cols-12 lg:gap-16 ${isHome ? 'mt-20' : 'mt-4'}`}
        >
          {/* ---- The index. Content first, in the DOM and in the reading order. -- */}
          <ol className="lg:col-span-6">
            {BRANCHES.map((branch, i) => {
              const meta = t.locations.branches[branch.key];
              const isActive = active === branch.key;

              return (
                <li
                  key={branch.key}
                  data-branch
                  onMouseEnter={() => enter(branch.key)}
                  onMouseLeave={() => setActive(null)}
                  className="relative border-t border-ash-400 py-7 last:border-b"
                >
                  {/* The row's own rule catches fire under the cursor. scaleX from
                      the reading-start edge — this one IS logical, because it is
                      chrome, not geography. */}
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 top-0 block h-px origin-[left_center] bg-ember transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] rtl:origin-[right_center] ${
                      isActive ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />

                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
                    <span className="num text-xs text-ember">
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    <h3 className="display text-h3 leading-none text-bone">{meta.district}</h3>

                    {branch.soon && (
                      <span
                        className="border border-ember px-2 py-1 text-[0.625rem] font-bold uppercase leading-none tracking-[0.16em] text-ember"
                        style={{ borderRadius: 'var(--radius-sharp)' }}
                      >
                        {t.locations.soon}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 ps-8 text-sm text-ash-700">{meta.street}</p>

                  <p className="eyebrow mt-3 ps-8 text-ash-700">
                    {!branch.soon && (
                      <>
                        <span>{t.locations.open}</span>
                        <span aria-hidden className="mx-2">
                          —
                        </span>
                      </>
                    )}
                    <span>{meta.hours}</span>
                  </p>
                </li>
              );
            })}
          </ol>

          {/* ---- The plan. --------------------------------------------------- */}
          <div className="lg:col-span-6">
            <div
              aria-hidden
              className="relative aspect-[4/3] w-full border border-ash-400"
              style={{ borderRadius: 'var(--radius-card)' }}
            >
              <div className="plan-grid absolute inset-0" />

              {BRANCHES.map((branch) => {
                const meta = t.locations.branches[branch.key];
                const isActive = active === branch.key;
                const labelRight = branch.labelSide === 'right';

                return (
                  /* PHYSICAL left/top, and a PHYSICAL -translate to centre the pin
                     on its coordinate. Everywhere else in this codebase that would
                     be a bug; here, flipping it would reflect Riyadh. The Tailwind
                     -translate-x-1/2 needs no `rtl:` undo precisely because the
                     offset it is undoing is physical too. */
                  <div
                    key={branch.key}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${branch.x}%`, top: `${branch.y}%` }}
                  >
                    {/* GSAP owns THIS element's transform (the entrance). */}
                    <div data-map-pin className="relative will-change-transform">
                      {/* The halo. A separate node, so the hover transition and the
                          GSAP entrance never write to the same transform. */}
                      <span
                        className={`absolute left-1/2 top-1/2 block size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ember transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          isActive ? 'scale-100 opacity-60' : 'scale-50 opacity-0'
                        }`}
                      />

                      {/* Lit, or not yet lit. The unlit branch is a hollow ring —
                          the one designed state that says "this is real, and it is
                          not burning yet" without needing a word. */}
                      <span
                        className={`relative block size-2.5 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          branch.soon
                            ? 'border border-ash-600 bg-ink'
                            : 'bg-ember shadow-[0_0_12px_var(--color-ember)]'
                        } ${isActive ? 'scale-150' : 'scale-100'}`}
                      />

                      {/* Physical side, physical margin, physical text-align — all
                          for the same reason the coordinates are. */}
                      <span
                        className={`absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition-colors duration-300 sm:block ${
                          labelRight ? 'left-full ml-3 text-left' : 'right-full mr-3 text-right'
                        } ${isActive ? 'text-bone' : 'text-ash-700'}`}
                      >
                        {meta.district}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p data-animate className="eyebrow mt-5 text-ash-700">
              {t.locations.plan}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

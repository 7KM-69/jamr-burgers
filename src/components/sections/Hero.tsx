'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { useLoader } from '@/components/providers/LoaderProvider';
import { BurgerStack } from '@/components/burger/BurgerStack';
import { EmberButton } from '@/components/ui/EmberButton';

/**
 * The headline buns the burger: line one above it, line two below. The burger is
 * not an illustration sitting next to some type — it is inside the sentence.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const { ready } = useLoader();

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);
    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    // Wait for the loader to hand over. `ready` flips as the curtain *starts*
    // rising, so this entrance is already running when the hero is revealed.
    // Until then the gate stays `pending` — which is the truth, and which is why
    // a screenshot taken before the curtain lifts now fails instead of shipping.
    if (!ready) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      revealMask(tl, '[data-mask]', { duration: 1.25, stagger: 0.12 }, 0)
        .fromTo(
          '[data-hero-burger]',
          { opacity: 0, yPercent: 8, scale: 0.94 },
          { opacity: 1, yPercent: 0, scale: 1, duration: 1.5, ease: EASE.out },
          0.18,
        )
        .fromTo(
          '[data-hero-glow]',
          { opacity: 0, scale: 0.6 },
          { opacity: 1, scale: 1, duration: 1.8, ease: EASE.out },
          0.1,
        )
        .fromTo(
          '[data-animate]',
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: EASE.out },
          0.55,
        );

      // The entrance is what "the hero is finished" means. The parallax below is
      // not watched: it is a scrubbed response to the reader leaving, and it is
      // by definition never complete while the hero is the thing on screen.
      gate.watch(tl);

      // Parallax. The burger sinks slower than the type, so the composition
      // opens up as you leave rather than sliding away as one flat picture.
      gsap
        .timeline({
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6,
          },
        })
        .to('[data-hero-burger]', { yPercent: 14, scale: 1.04, ease: 'none' }, 0)
        .to('[data-hero-glow]', { opacity: 0.35, ease: 'none' }, 0)
        .to('[data-hero-line-a]', { yPercent: -34, ease: 'none' }, 0)
        .to('[data-hero-line-b]', { yPercent: 34, ease: 'none' }, 0);
    }, root);

    return () => ctx.revert();
  }, [ready]);

  const [lineA, lineB] = t.hero.headline;

  return (
    <section
      ref={root}
      data-section="hero"
      data-motion="pending"
      className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-gutter pb-16 pt-28 lg:pb-24 lg:pt-32"
    >
      {/* The coal under the whole composition. */}
      <div
        aria-hidden
        data-hero-glow
        className="ember-glow pointer-events-none absolute start-1/2 top-1/2 h-[70vmin] w-[110vmin] -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
      />

      <h1 className="sr-only">{t.hero.headline.join(' ')}</h1>

      <div className="relative mx-auto flex w-full max-w-[80rem] flex-col items-center">
        <p data-animate className="eyebrow mb-6 text-center text-ember lg:mb-10">
          {t.hero.eyebrow}
        </p>

        <span aria-hidden data-hero-line-a className="mask-line w-full will-change-transform">
          <span
            data-mask
            className="display block text-center text-display text-bone will-change-transform"
          >
            {lineA}
          </span>
        </span>

        {/* Tucked into the sentence with negative margin — the type and the
            burger occupy the same band of the page. */}
        <div
          data-hero-burger
          className="relative z-10 will-change-transform"
          style={{
            width: 'clamp(15rem, 36vw, 30rem)',
            marginBlock: 'calc(-1 * clamp(0.5rem, 3.5vw, 4rem))',
          }}
        >
          <BurgerStack
            label={t.meta.title}
            sizes="(max-width: 1024px) 70vw, 36vw"
            priority
          />
        </div>

        <span aria-hidden data-hero-line-b className="mask-line w-full will-change-transform">
          <span
            data-mask
            className="display block text-center text-display text-bone will-change-transform"
          >
            {lineB}
          </span>
        </span>

        {/* Beside the burger on desktop — the composition leaves that space empty
            and it would otherwise be dead air. Below it on mobile. */}
        <div
          className="mt-12 flex max-w-md flex-col items-center gap-7 text-center lg:absolute lg:inset-y-0 lg:mt-0 lg:w-[19rem] lg:items-start lg:justify-center lg:text-start"
          style={{ insetInlineStart: 0 }}
        >
          <p data-animate className="measure text-lead text-ash-700">
            {t.hero.lede}
          </p>
          <div data-animate>
            <EmberButton href="/menu">{t.hero.cta}</EmberButton>
          </div>
        </div>
      </div>

      <div
        data-animate
        className="absolute bottom-8 hidden items-center gap-3 lg:flex"
        style={{ insetInlineEnd: 'var(--spacing-gutter)' }}
      >
        <span className="eyebrow text-ash-700">{t.hero.scroll}</span>
        <span aria-hidden className="ember-tick block h-8 w-px bg-ash-500" />
      </div>
    </section>
  );
}

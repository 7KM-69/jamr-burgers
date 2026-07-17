'use client';

import { useEffect, useRef } from 'react';
import { brand } from '@/lib/brand';
import { DUR, EASE, ScrollTrigger, gsap, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { useLoader } from '@/components/providers/LoaderProvider';
import { getLenis } from '@/components/providers/SmoothScrollProvider';

export function Loader() {
  const root = useRef<HTMLDivElement>(null);
  const { t, lang } = useI18n();
  const { markReady } = useLoader();

  /**
   * Latin splits into letters so they can rise one by one. Arabic does not, and
   * must not: its letters join, and wrapping each one in its own span forces the
   * isolated glyph form — جمر would render as ج م ر, three disconnected letters.
   * The Arabic wordmark rises as a single word.
   */
  const name = lang === 'ar' ? brand.nameAr : brand.name;
  const units = lang === 'ar' ? [name] : name.split('');

  useEffect(() => {
    const panel = root.current;
    if (!panel) return;

    if (prefersReducedMotion()) {
      // CSS has already display:none'd the panel (no `html.motion` class), so
      // there is nothing to fade. Just release the hero.
      markReady();
      return;
    }

    // Freeze the page under the curtain. Nobody scrolls a loading screen.
    getLenis()?.stop();

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      revealMask(tl, '[data-loader-char]', { duration: DUR.loader, stagger: 0.055 })
        .to('[data-loader-line]', { opacity: 1, duration: 0.5 }, '-=0.75')
        // The ember line filling is the "progress". Its transform-origin flips in
        // RTL via CSS, so it always fills from the reading-start edge.
        .to('[data-loader-bar]', { scaleX: 1, duration: 1.1, ease: 'power2.inOut' }, 0.2)
        .to(
          '[data-loader-content]',
          { yPercent: -14, opacity: 0, duration: 0.45, ease: 'power3.in' },
          '>-0.1',
        )
        .to(panel, {
          yPercent: -100,
          duration: 1,
          ease: EASE.inOut,
          onStart: () => {
            // The hero's entrance starts NOW, while the curtain is still rising.
            // It is fully underway by the time the curtain clears, so the hand-off
            // has no seam and no flash of an unanimated hero.
            markReady();
            getLenis()?.start();
          },
          onComplete: () => {
            gsap.set(panel, { display: 'none' });
            // Trigger positions were measured behind a curtain and with the page
            // frozen. Re-measure now that the real layout is on screen.
            ScrollTrigger.refresh();
          },
        }, '<0.12');
    }, root);

    return () => {
      ctx.revert();
      getLenis()?.start();
    };
  }, [markReady]);

  return (
    <div
      ref={root}
      data-loader
      role="status"
      aria-label={t.a11y.loading}
      className="fixed inset-0 flex items-center justify-center bg-ink-deep will-change-transform"
      style={{ zIndex: 'var(--z-loader)' }}
    >
      {/* The ember never fully leaves: a low glow under the wordmark. */}
      <div
        aria-hidden
        className="ember-glow pointer-events-none absolute start-1/2 top-[62%] h-64 w-[min(70vw,40rem)] -translate-x-1/2 opacity-30 rtl:translate-x-1/2"
      />

      <div data-loader-content className="relative flex flex-col items-center gap-7 px-gutter">
        <span className="sr-only">{`${brand.name} — ${t.loader.line}`}</span>

        {/* `.mask-line` — the same masking primitive the headlines use, so the
            wordmark gets the deeper Arabic padding automatically instead of a
            hardcoded Latin one that would shear the tail off جمر. `flex` (a
            utility) overrides its display:block; the overflow and padding stay. */}
        <span aria-hidden className="mask-line flex">
          {units.map((unit, i) => (
            <span
              key={`${unit}-${i}`}
              data-loader-char
              className="display block text-[clamp(3.5rem,11vw,8rem)] leading-[0.85] text-bone will-change-transform"
            >
              {unit}
            </span>
          ))}
        </span>

        <div className="flex w-[min(78vw,26rem)] flex-col items-center gap-4">
          {/* The progress line. scaleX only — never width. */}
          <div className="h-px w-full bg-ash-400">
            <div data-loader-bar className="h-px w-full bg-ember will-change-transform" />
          </div>
          <span data-loader-line className="eyebrow text-ash-700">
            {t.loader.line}
          </span>
        </div>
      </div>
    </div>
  );
}

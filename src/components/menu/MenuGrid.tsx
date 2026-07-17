'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import type { Product } from '@/lib/types/api';
import { ProductCard } from './ProductCard';

/**
 * The menu grid.
 *
 * `products` is passed down from the Server Component — the REAL six rows, read
 * from Postgres by `getProducts()` in the stable order CONTRACT.md §1 defines
 * (`price_cents asc, slug asc`). This component invents nothing and re-sorts
 * nothing: the ladder the cards are numbered against is the server's ladder.
 *
 * ## The empty case is a state, not an accident
 *
 * `getProducts()` THROWS on a database error rather than returning `[]` — that is
 * deliberate on `api`'s side, and it means `products.length === 0` here can only be
 * one thing: every burger has been delisted. Rare, real, and it must not render as
 * a beautifully-spaced nothing. A grid with no cards and no explanation is the exact
 * failure mode this project has already shipped once: a green build over a page that
 * renders nothing, and nobody investigates a page that renders.
 */
export function MenuGrid({ products }: { products: Product[] }) {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    // Reduced motion: every card is already there, at rest, complete. The only
    // thing lost is the arrival.
    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 78%', once: true },
      });

      // fromTo, both ends stated. Never a bare `.to()` that reads its start value
      // out of a stylesheet — src/lib/gsap.ts documents what that costs.
      tl.fromTo(
        '[data-animate]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.7, ease: EASE.out },
      ).fromTo(
        '[data-product-card]',
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.07, ease: EASE.out },
        0.1,
      );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="menu-grid"
      data-motion="pending"
      className="relative px-gutter pb-section"
    >
      <div className="mx-auto w-full max-w-[80rem]">
        {products.length === 0 ? (
          <div
            data-animate
            className="flex flex-col items-center gap-5 border border-ash-400 py-24 text-center"
            style={{ borderRadius: 'var(--radius-card)' }}
          >
            {/* An unlit coal. The same hollow ring the locations plan gives a branch
                that has not opened yet — this site has one way of saying "no fire". */}
            <span aria-hidden className="block size-4 rounded-full border border-ash-600" />
            <h2 className="display text-h3 text-bone">{t.menu.emptyTitle}</h2>
            <p className="measure-tight text-sm text-ash-700">{t.menu.emptyBody}</p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
              {products.map((product, i) => (
                <li key={product.id} className="flex">
                  <ProductCard product={product} index={i} priority={i < 3} />
                </li>
              ))}
            </ul>

            {/* The annotation. The grid IS a price ladder — the server sorted it that
                way — so the rank stamped on each card is information, and this is the
                line that makes it readable. Same device as the note under the
                locations plan and the spice wheel. */}
            <p data-animate className="eyebrow mt-10 text-ash-700">
              {t.menu.ladder}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

'use client';

import { format } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import { useCart } from '@/components/cart/CartProvider';
import { QtyStepper } from '@/components/cart/QtyStepper';
import { EmberAction } from '@/components/ui/EmberAction';
import { useToast } from '@/components/ui/EmberToast';
import type { Product } from '@/lib/types/api';
import { HeatGauge } from './HeatGauge';
import { ProductImage } from './ProductImage';
import { formatMinor } from './money';

/**
 * A burger, as a SPEC PLATE.
 *
 * The default for this component is a marketing card: photo, name, one warm
 * sentence, a price, a button. Six of those in a grid is the single most
 * template-looking thing this project could ship, and it would also be off-brand —
 * the site's own argument is "Nothing to hide": it already publishes its calories,
 * its ninety seconds on the coal, and its nine spices as a labelled diagram.
 *
 * So the card is an instrument panel. The photograph is the field; the rank is
 * stamped on it; the heat is a three-notch gauge; and bun, patty, kcal and protein
 * are a `<dl>` of hairline-separated readings, not a nested card of "features".
 * Everything on it is a real column from the database. Nothing on it is adjectives.
 *
 * ## The rank is earned, not scaffolding
 *
 * `01…06` would be decoration on an unordered grid. This grid is ordered
 * `price_cents asc` BY THE SERVER (CONTRACT.md §1), so the number is the burger's
 * position on a price ladder — real information, and the grid says so underneath.
 *
 * ## What is bilingual where
 *
 *   name / desc  → already bilingual IN THE ROW. Pick the column by locale.
 *   bun / patty / spice_level → KEYS. Mapped through `t.menu.*` (CONTRACT.md §9.2).
 *   price        → Latin digits in both languages, formatted from minor units.
 */
export function ProductCard({
  product,
  index,
  priority,
}: {
  product: Product;
  /** Zero-based position in the price ladder. */
  index: number;
  /** Only the first row is LCP-critical. */
  priority: boolean;
}) {
  const { t, lang } = useI18n();
  const { add, qtyOf } = useCart();
  const { push } = useToast();

  const name = lang === 'ar' ? product.name_ar : product.name_en;
  const desc = lang === 'ar' ? product.desc_ar : product.desc_en;

  const qty = qtyOf(product.id);
  const inCart = qty > 0;
  const rank = String(index + 1).padStart(2, '0');

  const specs: { label: string; value: string }[] = [
    { label: t.menu.spec.bun, value: t.menu.bun[product.bun] },
    { label: t.menu.spec.patty, value: t.menu.patty[product.patty] },
    { label: t.menu.spec.kcal, value: String(product.kcal) },
    { label: t.menu.spec.protein, value: `${product.protein_g}${t.menu.unit.gram}` },
  ];

  return (
    <article
      data-product-card
      /**
       * `w-full` is load-bearing, and it is here because of a bug that was invisible
       * in English.
       *
       * The card is a flex item (its <li> is `display:flex`) with no basis, so it
       * sizes to its CONTENT, not to its grid column. English descriptions are long
       * enough to fill the column, so all six cards measured exactly 405px and the
       * grid looked perfect. The Arabic copy is shorter — and the six cards came out
       * 321, 350, 371, 372, 388 and 405px wide, each with a differently-sized
       * photograph, in a grid whose columns were all along equal.
       *
       * A ragged grid in one language only. Nothing warns about this: not tsc, not
       * the build, not the English screenshots.
       */
      className="group relative flex w-full flex-col border border-ash-400 bg-ash-100 transition-colors duration-300 hover:border-ash-500 will-change-transform"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      {/* The rule catches fire under the cursor — the same gesture a Locations row
          makes. scaleX from the reading-start edge, so it flips in RTL. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-10 block h-px origin-[left_center] scale-x-0 bg-ember transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100 rtl:origin-[right_center]"
      />

      <div className="relative aspect-[4/3] overflow-hidden">
        {/* The coal under the burger. Brightens as you approach it — opacity only. */}
        <div
          aria-hidden
          className="ember-glow pointer-events-none absolute inset-x-6 bottom-[-30%] h-2/3 opacity-0 transition-opacity duration-700 group-hover:opacity-45"
        />

        <ProductImage src={product.image_path} alt={name} index={rank} priority={priority} />

        {/* Stamped on the plate. The ladder's rank, and it is aria-hidden because
            the DOM order already carries it for anyone not looking at it. */}
        <span
          aria-hidden
          className="num absolute start-4 top-3 text-xs font-semibold text-bone/70 mix-blend-difference"
        >
          {rank}
        </span>

        {inCart && (
          <span
            aria-hidden
            className="num absolute end-3 top-3 grid h-7 min-w-7 place-items-center bg-ember px-1.5 text-xs font-bold text-ink"
            style={{ borderRadius: 'var(--radius-sharp)' }}
          >
            {qty}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6">
        <header className="flex items-baseline justify-between gap-4">
          <h3 className="display text-h3 leading-none text-bone">{name}</h3>
          <p className="flex shrink-0 items-baseline gap-1.5">
            <span className="num text-xl font-semibold text-bone">
              {formatMinor(product.price_cents)}
            </span>
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ash-700">
              {t.menu.currency}
            </span>
          </p>
        </header>

        {/* `flex-1`: the description absorbs the slack, so everything BELOW it — the
            heat gauge, the spec plate, the button — is bottom-anchored and lines up
            across every card in the row.

            Without it the data block floats at whatever height the copy happens to
            end. In English every description ran to two lines and the grid looked
            deliberate by luck; in Arabic they run to one line or two, and the gauges
            sat at three different heights across one row. Aligning a row of
            instruments is the entire point of drawing them as instruments. */}
        <p className="flex-1 text-sm leading-relaxed text-ash-700">{desc}</p>

        {/* Heat and prep: the two readings that change how you ORDER, so they sit
            above the fold of the card, apart from the reference data below. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-ash-400 py-3">
          <HeatGauge level={product.spice_level} name={name} />
          <span className="flex items-baseline gap-1.5 text-xs text-ash-700">
            <span className="font-semibold uppercase tracking-[0.12em]">{t.menu.spec.prep}</span>
            <span className="num font-semibold text-bone">{product.prep_min}</span>
            <span>{t.menu.unit.min}</span>
          </span>
        </div>

        {/* Reference data. A <dl> because it IS a description list — and hairlines
            rather than a bordered box, because a card inside a card is always wrong.

            The label sits ABOVE its value rather than beside it, and that is not a
            style preference. Side-by-side, the value gets only the half of the cell
            the label does not want, and "Halloumi & mushroom" — a real value, from a
            real row — rendered as "Halloumi & mushro…". The fix for a clipped value
            is never a narrower ellipsis; it is giving the value the whole cell. So
            there is no `truncate` here any more: a spec that needs two lines takes
            two lines. */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          {specs.map((spec) => (
            <div key={spec.label} className="border-b border-ash-400/60 pb-2">
              <dt className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ash-700">
                {spec.label}
              </dt>
              <dd className="num mt-1 text-xs font-semibold leading-snug text-bone">
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* The control swaps in place. A fixed min-height so the card does not jolt
            a neighbour when one burger goes into the order and its sibling does not. */}
        <div className="mt-auto flex min-h-11 items-center pt-1">
          {inCart ? (
            <QtyStepper id={product.id} name={name} slug={product.slug} />
          ) : (
            <EmberAction
              data-add={product.slug}
              onClick={() => {
                add(product.id);
                // The button is swapped for the stepper the instant qty leaves 0, so
                // the confirmation is also what tells the user WHY the control they
                // just pressed vanished.
                push({
                  kind: 'order',
                  title: t.menu.toast.added(name),
                  note: t.menu.toast.addedNote,
                });
              }}
              aria-label={format(t.menu.a11y.add, { name })}
              className="w-full !py-3.5"
            >
              {t.menu.add}
            </EmberAction>
          )}
        </div>
      </div>
    </article>
  );
}

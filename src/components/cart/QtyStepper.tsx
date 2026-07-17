'use client';

import { format } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import { MAX_QTY, useCart } from './CartProvider';

/**
 * − qty + , with a designed floor and a designed ceiling.
 *
 * ONE stepper, used by the product card and by every line of the drawer. Two
 * steppers would mean two definitions of what the minus button does at qty 1, and
 * they would disagree within a week.
 *
 * ## The two bounds are the whole component
 *
 * **Floor.** At qty 1 the minus button REMOVES the line — it does not sit disabled
 * at 1, and it does not step to 0 and leave a ghost line at zero. "Fewer than one"
 * has exactly one meaning and the control performs it.
 *
 * **Ceiling.** `order_items.qty` has a DB CHECK capping it at 20. If the UI let a
 * user reach 21, the failure would surface as a rejected RPC at checkout — three
 * screens later, with a message they cannot act on, about a burger they have
 * forgotten adding. So the plus button disables at 20 and the card says why. The
 * server remains the authority; the UI simply refuses to walk the user into a wall
 * it can already see.
 *
 * `aria-live` on the value, because a screen-reader user who presses + must hear
 * what it became, not just that they pressed a button called "One more".
 */
export function QtyStepper({
  id,
  name,
  slug,
  size = 'md',
}: {
  id: string;
  name: string;
  /**
   * The product's slug, stamped on the two buttons as `data-qty-plus` /
   * `data-qty-minus`.
   *
   * Not decoration and not a test-only wart: it is the only STABLE selector for
   * these controls. Their accessible names are translated (they change with the
   * language) and their DOM position is not addressable. `scripts/shot.mjs` needs
   * to reach a qty-of-3 line to photograph it, and an id that changes per database
   * row is not something a screenshot command can hardcode. The slug is
   * authoritative, human-readable, and identical in both languages.
   */
  slug: string;
  size?: 'sm' | 'md';
}) {
  const { t } = useI18n();
  const { qtyOf, setQty, remove } = useCart();

  const qty = qtyOf(id);
  const atMax = qty >= MAX_QTY;

  const box =
    size === 'sm'
      ? 'h-8 w-8 text-base'
      : 'h-11 w-11 text-lg';

  const control =
    'grid place-items-center border border-ash-500 text-bone transition-colors duration-200 hover:border-ember hover:text-ember focus-visible:border-ember disabled:cursor-not-allowed disabled:border-ash-400 disabled:text-ash-600 disabled:hover:border-ash-400 disabled:hover:text-ash-600';

  return (
    <div className="inline-flex items-stretch gap-px">
      <button
        type="button"
        data-qty-minus={slug}
        onClick={() => (qty <= 1 ? remove(id) : setQty(id, qty - 1))}
        aria-label={format(qty <= 1 ? t.menu.a11y.remove : t.menu.a11y.decrease, { name })}
        className={`${control} ${box}`}
        style={{ borderRadius: 'var(--radius-sharp)' }}
      >
        <span aria-hidden>−</span>
      </button>

      <span
        aria-live="polite"
        aria-atomic="true"
        aria-label={t.menu.a11y.quantity}
        className={`num grid place-items-center border border-ash-400 bg-ash-100 font-semibold text-bone ${
          size === 'sm' ? 'h-8 w-9 text-sm' : 'h-11 w-12 text-base'
        }`}
        style={{ borderRadius: 'var(--radius-sharp)' }}
      >
        {qty}
      </span>

      <button
        type="button"
        data-qty-plus={slug}
        onClick={() => setQty(id, qty + 1)}
        disabled={atMax}
        aria-label={format(t.menu.a11y.increase, { name })}
        className={`${control} ${box}`}
        style={{ borderRadius: 'var(--radius-sharp)' }}
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}

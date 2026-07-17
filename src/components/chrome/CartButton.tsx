'use client';

import { format } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import { useCart } from '@/components/cart/CartProvider';

/**
 * The cart, with its count.
 *
 * It used to be a `<Link>` to /menu with a hardcoded `count={0}` — honest at the
 * time (there was no cart) and now wrong on both halves. It opens the drawer, and
 * the count is the real one.
 *
 * ## The count is held back for exactly one frame, on purpose
 *
 * The cart lives in `localStorage`, which the server cannot see. So the server
 * renders `0` and the client — after hydration — knows it is `3`. Rendering the
 * number immediately means either a hydration error (if read during render) or a
 * visible `0 → 3` flicker on every page load for every returning user.
 *
 * `hydrated` is the third option: render no digit until the cart has actually been
 * read, in a slot whose width is already reserved. No mismatch, no flicker, no
 * layout shift — the number simply arrives.
 */
export function CartButton() {
  const { t } = useI18n();
  const { count, hydrated, open } = useCart();

  const label =
    count === 0
      ? t.nav.cart
      : count === 1
        ? t.a11y.cartWithOne
        : format(t.a11y.cartWithCount, { count });

  return (
    <button
      type="button"
      data-cart-open
      onClick={open}
      aria-label={label}
      aria-haspopup="dialog"
      className="group relative grid h-10 min-w-10 place-items-center border border-ash-500 px-3 text-sm font-semibold text-bone transition-colors duration-200 hover:border-ember hover:text-ember"
      style={{ borderRadius: 'var(--radius-sharp)' }}
    >
      <span aria-hidden className="flex items-center gap-2">
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path
            d="M3 5h2l1.6 8.2a1 1 0 0 0 1 .8h6.9a1 1 0 0 0 1-.8L17 7H6"
            strokeLinecap="square"
          />
          <circle cx="8" cy="17" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="17" r="1.1" fill="currentColor" stroke="none" />
        </svg>

        {/* The slot is always here; only the digit waits. `min-w` reserves the
            space so the nav does not reflow when the number lands. */}
        <span
          className={`num inline-block min-w-[1ch] text-center tabular-nums transition-colors duration-200 ${
            count > 0 ? 'text-ember' : ''
          }`}
        >
          {hydrated ? count : ''}
        </span>
      </span>
    </button>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate } from '@/lib/gsap';
import { dirSign, prefersReducedMotion } from '@/lib/motion';
import { format } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import { getLenis } from '@/components/providers/SmoothScrollProvider';
import { EmberAction } from '@/components/ui/EmberAction';
import { EmberButton } from '@/components/ui/EmberButton';
import { formatMinor, lineTotal } from '@/components/menu/money';
import { MAX_QTY, useCart, useReturnFocus, type ResolvedLine } from './CartProvider';
import { QtyStepper } from './QtyStepper';

/**
 * The order drawer.
 *
 * ## Register: this is a TOOL, and it is allowed to be quiet
 *
 * The grid is a brand surface — the burger is the sell, so it gets the display face,
 * the scroll reveal and the ember that catches. The drawer is a product surface: the
 * user is in a task, and every millisecond of choreography is a millisecond between
 * them and their order. So the vocabulary is the same and the SPEED is not: 200ms
 * transitions, no display face on any control, no orchestration, no reveal. That
 * split is deliberate, not an inconsistency.
 *
 * ## Four states, and none of them is "empty cart"
 *
 *  1. **Catalogue unreachable** (`!catalogOk`). The database did not answer, so we
 *     cannot price anything. NOT the same as "your burgers were delisted" — see
 *     CartProvider. Saying the wrong one of these two is a lie about the user's order.
 *  2. **Nothing in the order.** An unlit coal, and the sentence that goes with it.
 *  3. **Lines.** Some of which may be `product: null` — added, then delisted. That
 *     line is drawn as a problem with a remove button, and it BLOCKS checkout,
 *     because `place_order` would reject the whole cart with `PRODUCT_UNAVAILABLE`
 *     and the user would have no idea which burger did it.
 *  4. **Full line** (qty 20). The stepper's plus disables and the drawer says why.
 *
 * ## The subtotal here is PROVISIONAL and the UI says so out loud
 *
 * It is computed in the browser from `price_cents`, which CLAUDE.md permits for
 * display and forbids as truth. `place_order` recomputes the subtotal from the
 * `products` table and never sees a number this component produced — the RPC has no
 * parameter that would accept one. The label under the total is not an apology; it
 * is the design telling the truth about which number is real.
 *
 * ## RTL
 *
 * The panel enters from the reading-END edge — right in English, LEFT in Arabic. It
 * is positioned with `end-0` (logical), so the off-screen offset is `+100%` in LTR
 * and `-100%` in RTL. That sign comes from `dirSign()`; hardcoding `xPercent: 100`
 * would make the Arabic drawer slide in from off-screen right, across the whole
 * viewport, and land on the left. The timeline is therefore rebuilt when `dir`
 * changes — a language toggle with the drawer open is a real thing a user can do.
 */
export function CartDrawer({ loyaltyMeter }: { loyaltyMeter?: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  const { t, dir } = useI18n();
  const {
    resolved,
    count,
    provisionalSubtotalCents,
    hasUnavailable,
    catalogOk,
    isOpen,
    close,
  } = useCart();

  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  useReturnFocus(isOpen);

  /* --- the slide ---------------------------------------------------------- */

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const reduced = prefersReducedMotion();
    // +1 in LTR (off-screen to the right), -1 in RTL (off-screen to the left).
    const offscreen = 100 * dirSign(dir);

    const gate = motionGate(el);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        paused: true,
        onReverseComplete: () => gsap.set(el, { display: 'none' }),
      });

      tl.set(el, { display: 'block' })
        .fromTo(
          '[data-cart-scrim]',
          { opacity: 0 },
          { opacity: 1, duration: reduced ? 0 : 0.32, ease: 'power2.out' },
          0,
        )
        // Both ends stated explicitly. GSAP must never read a start value out of a
        // stylesheet — see the warning on revealMask() in src/lib/gsap.ts.
        .fromTo(
          '[data-cart-panel]',
          { xPercent: offscreen, x: 0 },
          { xPercent: 0, x: 0, duration: reduced ? 0 : 0.5, ease: EASE.inOut },
          0,
        );

      gsap.set(el, { display: 'none' });

      /**
       * Under reduced motion every tween above is `duration: 0`, so the timeline's
       * `totalDuration()` is 0 — and `motionGate` requires `totalDuration() > 0`
       * before it will ever publish "ready" (an empty timeline reports itself
       * complete, so the gate refuses to trust one). Watching it would leave
       * `data-motion="pending"` forever, and the drawer would be unphotographable
       * for exactly the users whose experience is least often checked. That is what
       * `settle()` is for: "finished, with no animation to wait for".
       *
       * This does mean the gate says "ready" for a reduced-motion drawer even while
       * it is CLOSED. It cannot be photographed anyway: a closed drawer is
       * `display: none`, and the harness's second, independent witness — composited
       * opacity walked up the ancestor chain — reads 0 and refuses the shot. Two
       * witnesses, and only one of them had to be relaxed.
       */
      if (reduced) gate.settle();
      else gate.watch(tl);

      timeline.current = tl;

      // The drawer can be open while this effect re-runs (a language toggle flips
      // `dir`, which rebuilds the timeline). Without this the panel would be left
      // parked at display:none with the state still saying "open" — a cart button
      // that does nothing until you press it twice.
      if (openRef.current) tl.play();
    }, root);

    return () => {
      ctx.revert();
      timeline.current = null;
    };
  }, [dir]);

  useEffect(() => {
    const tl = timeline.current;
    if (!tl) return;

    if (isOpen) {
      tl.play();
      // Lenis keeps momentum-scrolling the page behind an overlay otherwise. Under
      // reduced motion there IS no Lenis (it is an easing layer on the scroll
      // position, and there is no gentler version of it), so the native scroll has
      // to be locked directly. Doing only one of these leaves the page scrolling
      // behind the drawer for exactly the users least able to tolerate it.
      getLenis()?.stop();
      document.body.style.overflow = 'hidden';
      closeButton.current?.focus();
    } else {
      tl.reverse();
      getLenis()?.start();
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  /* --- escape, and the focus trap ----------------------------------------- */

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const el = root.current;
      if (!el) return;

      // The page behind is still in the DOM. Without the trap the focus ring walks
      // off into a menu the user cannot see and cannot get back from.
      const focusables = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  /* --- render -------------------------------------------------------------- */

  const isEmpty = resolved.length === 0;
  const showLines = catalogOk && !isEmpty;
  const blocked = hasUnavailable;

  return (
    <div
      ref={root}
      data-section="cart"
      data-motion="pending"
      role="dialog"
      aria-modal="true"
      aria-label={t.menu.cart.title}
      className="fixed inset-0 hidden"
      style={{ zIndex: 'var(--z-menu)' }}
    >
      <button
        data-cart-scrim
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={close}
        className="absolute inset-0 w-full cursor-default bg-ink-deep/70 backdrop-blur-sm"
      />

      <div
        ref={panel}
        data-cart-panel
        className="absolute inset-y-0 end-0 flex w-full max-w-[27rem] flex-col border-s border-ash-400 bg-ink will-change-transform"
      >
        {/* --- header ------------------------------------------------------- */}
        <header className="flex items-center justify-between gap-4 border-b border-ash-400 px-6 py-5">
          <h2 className="display text-h3 leading-none text-bone">{t.menu.cart.title}</h2>

          <div className="flex items-center gap-3">
            {count > 0 && (
              <span
                className="num grid h-6 min-w-6 place-items-center bg-ember px-1.5 text-xs font-bold text-ink"
                style={{ borderRadius: 'var(--radius-sharp)' }}
              >
                {count}
              </span>
            )}
            <button
              ref={closeButton}
              type="button"
              onClick={close}
              aria-label={t.menu.cart.close}
              className="grid h-9 w-9 place-items-center border border-ash-500 text-bone transition-colors duration-200 hover:border-ember hover:text-ember"
              style={{ borderRadius: 'var(--radius-sharp)' }}
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M2 2 14 14M14 2 2 14" strokeLinecap="square" />
              </svg>
            </button>
          </div>
        </header>

        {/* --- loyalty ------------------------------------------------------- *
            A quiet band under the header: the coal meter, its numbers read on the
            server. It sits OUTSIDE the scroll area so it stays put over a long
            order, and it is shown in every cart state (loyalty is a fact about the
            diner, not about the cart) — including signed out, where it degrades to
            a "sign in to start the count" prompt rather than a broken meter. */}
        {loyaltyMeter}

        {/* --- body ---------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!catalogOk ? (
            <Notice title={t.menu.cart.offline.title} body={t.menu.cart.offline.body} />
          ) : isEmpty ? (
            <EmptyOrder />
          ) : (
            <ul>
              {resolved.map((line) => (
                <CartLineRow key={line.id} line={line} />
              ))}
            </ul>
          )}
        </div>

        {/* --- footer -------------------------------------------------------- */}
        {showLines && (
          <footer className="border-t border-ash-400 px-6 py-5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="eyebrow text-ash-700">{t.menu.cart.subtotal}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="num text-2xl font-semibold text-bone">
                  {formatMinor(provisionalSubtotalCents)}
                </span>
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ash-700">
                  {t.menu.currency}
                </span>
              </span>
            </div>

            {/* The client computed the number above. This says which number is real. */}
            <p className="mt-3 text-xs leading-relaxed text-ash-700">
              {t.menu.cart.provisional}
            </p>

            {/* Blocked by a delisted line: `place_order` would reject the whole
                order with PRODUCT_UNAVAILABLE, so the button stays spent and says
                why. Otherwise it goes to /checkout — a protected route that bounces
                a signed-out visitor to /auth?redirect=/checkout and back. */}
            {blocked ? (
              <EmberAction disabled className="mt-5 w-full">
                {t.menu.cart.checkout}
              </EmberAction>
            ) : (
              <EmberButton href="/checkout" onClick={close} className="mt-5 w-full">
                {t.menu.cart.checkout}
              </EmberButton>
            )}

            <p className="mt-3 text-center text-xs text-ash-700">
              {blocked ? t.menu.cart.goneBlocks : t.menu.cart.demo}
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The unlit coal. "Your cart is empty" states a fact about a database. */
function EmptyOrder() {
  const { t } = useI18n();
  const { close } = useCart();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <span className="relative grid place-items-center">
        {/* Cold: a hollow ring, exactly the mark the locations plan uses for the
            branch that has not lit yet. One brand, one way of saying "no fire". */}
        <span aria-hidden className="block size-16 rounded-full border border-ash-500" />
        <span
          aria-hidden
          className="absolute block size-2.5 rounded-full border border-ash-600 bg-ink"
        />
      </span>

      <div>
        <h3 className="display text-h3 text-bone">{t.menu.cart.empty.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-ash-700">{t.menu.cart.empty.body}</p>
      </div>

      <Link
        href="/menu"
        onClick={close}
        className="border border-ash-500 px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-bone transition-colors duration-200 hover:border-ember hover:text-ember"
        style={{ borderRadius: 'var(--radius-sharp)' }}
      >
        {t.menu.cart.empty.cta}
      </Link>
    </div>
  );
}

/** The database did not answer. Not the same thing as an empty cart. */
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <span aria-hidden className="block size-2.5 rounded-full border border-ember" />
      <h3 className="display text-h3 text-bone">{title}</h3>
      <p className="measure-tight text-sm leading-relaxed text-ash-700">{body}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CartLineRow({ line }: { line: ResolvedLine }) {
  const { t, lang } = useI18n();
  const { remove } = useCart();
  const { product } = line;

  /* --- the product is gone: added, then delisted --------------------------- */
  if (!product) {
    return (
      <li className="flex items-center gap-4 border-b border-ash-400 px-6 py-5">
        <span
          aria-hidden
          className="grid size-16 shrink-0 place-items-center border border-ash-500 bg-ash-100"
          style={{ borderRadius: 'var(--radius-sharp)' }}
        >
          <span className="block size-2 rounded-full border border-ash-600" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-[0.1em] text-ember">
            {t.menu.cart.gone}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ash-700">{t.menu.cart.goneBody}</p>
        </div>

        <RemoveButton onClick={() => remove(line.id)} label={t.menu.cart.gone} />
      </li>
    );
  }

  const name = lang === 'ar' ? product.name_ar : product.name_en;
  // MAX_QTY, never a literal 20 — the cap is the DB's CHECK constraint, and two
  // places writing it by hand is how they end up disagreeing.
  const maxed = line.qty >= MAX_QTY;

  return (
    <li className="border-b border-ash-400 px-6 py-5">
      <div className="flex items-start gap-4">
        <span
          className="relative block size-16 shrink-0 overflow-hidden border border-ash-400"
          style={{ borderRadius: 'var(--radius-sharp)' }}
        >
          <Image src={product.image_path} alt="" fill sizes="64px" className="object-cover" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="display truncate text-lg leading-tight text-bone">{name}</h3>
            <RemoveButton onClick={() => remove(line.id)} label={name} />
          </div>

          <p className="mt-1 flex items-baseline gap-1.5 text-xs text-ash-700">
            <span className="num">{formatMinor(product.price_cents)}</span>
            <span>{t.menu.currency}</span>
            <span>{t.menu.cart.each}</span>
          </p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <QtyStepper id={product.id} name={name} slug={product.slug} size="sm" />

            <span className="flex items-baseline gap-1.5">
              <span className="num text-base font-semibold text-bone">
                {formatMinor(lineTotal(product.price_cents, line.qty))}
              </span>
              <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ash-700">
                {t.menu.currency}
              </span>
            </span>
          </div>

          {maxed && <p className="mt-2 text-xs text-ember">{t.menu.cart.maxed}</p>}
        </div>
      </div>
    </li>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={format(t.menu.a11y.remove, { name: label })}
      /* ash-700, not ash-600. globals.css labels ash-600 "DECORATIVE ONLY — 3.2:1,
         fails AA for text" — and while an icon is a non-text control (3:1 floor), a
         destructive action that a user has to hunt for is not a control at the floor.
         ash-700 is 6.3:1 on ink. It is also a token that already exists; the palette
         had the right answer written on it. */
      className="grid size-7 shrink-0 place-items-center text-ash-700 transition-colors duration-200 hover:text-ember"
    >
      <svg
        aria-hidden
        viewBox="0 0 14 14"
        className="h-3 w-3"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M2 2 12 12M12 2 2 12" strokeLinecap="square" />
      </svg>
    </button>
  );
}

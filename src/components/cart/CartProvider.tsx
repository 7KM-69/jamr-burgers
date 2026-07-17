'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Product } from '@/lib/types/api';

/**
 * The cart.
 *
 * ## What it holds, and what it must never hold
 *
 * `{ id, qty }`. That is the entire state. No price, no line total, no subtotal,
 * no discount, no user id — CLAUDE.md, and the `place_order` signature agrees with
 * it: the RPC has no parameter that would *accept* a price (CONTRACT.md §2). The
 * server recomputes every number from the `products` table.
 *
 * A cached price in here would not be a shortcut, it would be a bug with a delay
 * on it: the day a price changes, the cart shows one number and the kitchen
 * charges another, and the cart is the one that is wrong. The drawer may show a
 * PROVISIONAL total derived live from the catalogue — that is a different thing,
 * and it is labelled as such in the UI.
 *
 * No state library, per CLAUDE.md. Context + `useState` is genuinely enough for a
 * map of six ids.
 *
 * ## The catalogue is a separate axis from the cart
 *
 * The cart persists in `localStorage`; the catalogue comes from the database on
 * every render. They can disagree, and the two ways they disagree are NOT the same
 * state:
 *
 *   · `catalogOk === true`, id not in catalogue  → that burger was delisted.
 *   · `catalogOk === false`                      → we could not reach the database.
 *
 * Telling a user their burger is off the menu when the truth is that Supabase did
 * not answer is a lie the interface has no business telling, so the drawer renders
 * these two as different states. This is why `catalogOk` is a prop and not
 * `products.length > 0`.
 */

/** The DB CHECK on `order_items.qty` caps a line at 20. Enforced here so the user
 *  meets a disabled button and a sentence, never a server error they cannot read. */
export const MAX_QTY = 20;

const STORAGE_KEY = 'jamr_cart_v1';

/** Ids and quantities. Deliberately the whole shape. */
export interface CartLine {
  id: string;
  qty: number;
}

/**
 * What the DRAWER needs to draw a line — and not one column more.
 *
 * The catalogue is provided by the ROOT LAYOUT, so whatever shape it has is
 * serialized into the RSC payload of **every route on the site**: the home page, the
 * spice wheel, the 404. Handing it the full `Product` shipped `desc_en` AND `desc_ar`
 * (the two longest strings in the row), plus `kcal`, `prep_min`, `bun`, `patty` and
 * `spice_level` — none of which the drawer renders — to every visitor who never opens
 * the cart. It was invisible in the build output and it is exactly the kind of thing
 * that is never found later.
 *
 * `Pick` rather than a hand-written interface, so it stays welded to the contract: if
 * `api` renames `image_path`, this stops compiling.
 *
 * The MENU GRID still receives the full `Product` — it renders the spec plate, and it
 * gets its own copy from its own page. That duplication is a few hundred bytes on one
 * route, against this saving on all of them.
 */
export type CartProduct = Pick<
  Product,
  'id' | 'slug' | 'name_en' | 'name_ar' | 'price_cents' | 'image_path'
>;

/** A cart line joined to the live catalogue at render time. Never stored. */
export interface ResolvedLine extends CartLine {
  /** `null` when the product is no longer in the catalogue — see `catalogOk`. */
  product: CartProduct | null;
}

interface CartValue {
  lines: CartLine[];
  /** Cart lines joined to the catalogue. The drawer renders these. */
  resolved: ResolvedLine[];
  /** Total units across every line, including unavailable ones — they are in the cart. */
  count: number;
  /** Provisional. Available lines only. The server's subtotal is the real one. */
  provisionalSubtotalCents: number;
  /** True when at least one line's product has vanished from the catalogue. */
  hasUnavailable: boolean;
  /** False when the catalogue could not be loaded at all. Not the same as "empty". */
  catalogOk: boolean;

  /** localStorage has been read. Before this, `lines` is empty on purpose — see below. */
  hydrated: boolean;

  qtyOf: (id: string) => number;
  add: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;

  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartValue | null>(null);

/** Anything can be in localStorage — a user, another tab, a previous version of
 *  this app. Parse it; never trust its shape. */
function readStored(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const lines: CartLine[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { id, qty } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (typeof qty !== 'number' || !Number.isInteger(qty)) continue;
      if (qty < 1 || qty > MAX_QTY) continue;
      if (lines.some((line) => line.id === id)) continue; // no duplicate lines
      lines.push({ id, qty });
    }
    return lines;
  } catch {
    // Private mode, a quota error, corrupt JSON. An unusable cart is not a reason
    // to take the site down.
    return [];
  }
}

export function CartProvider({
  products,
  catalogOk,
  children,
}: {
  /** Slim by design — see CartProduct. This is in every route's RSC payload. */
  products: CartProduct[];
  catalogOk: boolean;
  children: ReactNode;
}) {
  /**
   * Starts EMPTY on both server and client, and is filled from localStorage in an
   * effect. That is not laziness — reading localStorage during render would make
   * the first client render disagree with the server's HTML and React would blow
   * the whole tree away with a hydration error. `hydrated` is what lets the nav
   * hold the count back for one frame rather than flashing `0 → 3`.
   */
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setLines(readStored());
    setHydrated(true);
  }, []);

  // Persist — but only after hydration, or the mount would immediately overwrite
  // the stored cart with the empty initial state. That ordering bug silently
  // wipes the cart of every returning user, and it is invisible in a fresh tab.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Full or blocked. The cart still works for this session.
    }
  }, [lines, hydrated]);

  const catalog = useMemo(() => {
    const map = new Map<string, CartProduct>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const qtyOf = useCallback(
    (id: string) => lines.find((line) => line.id === id)?.qty ?? 0,
    [lines],
  );

  const add = useCallback((id: string) => {
    setLines((current) => {
      const existing = current.find((line) => line.id === id);
      if (!existing) return [...current, { id, qty: 1 }];
      if (existing.qty >= MAX_QTY) return current;
      return current.map((line) => (line.id === id ? { ...line, qty: line.qty + 1 } : line));
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    const next = Math.trunc(qty);
    setLines((current) => {
      if (next < 1) return current.filter((line) => line.id !== id);
      const clamped = Math.min(next, MAX_QTY);
      return current.map((line) => (line.id === id ? { ...line, qty: clamped } : line));
    });
  }, []);

  const remove = useCallback((id: string) => {
    setLines((current) => current.filter((line) => line.id !== id));
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const resolved = useMemo<ResolvedLine[]>(
    () => lines.map((line) => ({ ...line, product: catalog.get(line.id) ?? null })),
    [lines, catalog],
  );

  const count = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);

  const provisionalSubtotalCents = useMemo(
    () =>
      resolved.reduce(
        (sum, line) => (line.product ? sum + line.product.price_cents * line.qty : sum),
        0,
      ),
    [resolved],
  );

  // Only meaningful when the catalogue actually loaded. With `catalogOk === false`
  // every line is unresolvable, and that is a connection problem, not six
  // delistings.
  const hasUnavailable = catalogOk && resolved.some((line) => line.product === null);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      resolved,
      count,
      provisionalSubtotalCents,
      hasUnavailable,
      catalogOk,
      hydrated,
      qtyOf,
      add,
      setQty,
      remove,
      isOpen,
      open,
      close,
    }),
    [
      lines,
      resolved,
      count,
      provisionalSubtotalCents,
      hasUnavailable,
      catalogOk,
      hydrated,
      qtyOf,
      add,
      setQty,
      remove,
      isOpen,
      open,
      close,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside <CartProvider>.');
  return value;
}

/**
 * Remembers what the user was focused on when the drawer opened, so closing it
 * puts them back. Kept here rather than in the drawer because the drawer can be
 * opened from the nav on any route, and `document.activeElement` at open time is
 * the only thing that reliably knows where "back" is.
 */
export function useReturnFocus(isOpen: boolean) {
  const origin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    origin.current?.focus();
  }, [isOpen]);
}

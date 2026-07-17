/**
 * Money at the render boundary — and nowhere else.
 *
 * Every price in this system is an INTEGER in minor units (CONTRACT.md §9.3):
 * `3200` is 32.00. That integer is the only price that exists. It is computed in
 * Postgres, it is never sent by the client, and nothing in this file may be used
 * to produce a number the user is told is final.
 *
 * ## Why this is not `Intl.NumberFormat`
 *
 * Because the obvious line —
 *
 *     new Intl.NumberFormat(lang, { minimumFractionDigits: 2 }).format(cents / 100)
 *
 * — is wrong twice, and both failures are invisible in English:
 *
 *  1. **`lang === 'ar'` renders Arabic-Indic digits.** `٣٢٫٠٠`, with an Arabic
 *     decimal separator. CLAUDE.md is explicit: numerals stay Latin in BOTH
 *     languages. Nothing would have thrown; the English screenshots would have
 *     looked perfect; only the Arabic price would have quietly changed script.
 *  2. **`cents / 100` is a float.** 3200/100 is exact, but the habit is not, and a
 *     discount is `ceil(subtotal / 2)` — integer math in Postgres. The moment money
 *     arithmetic happens in a float the client and the server can disagree by a
 *     cent, and the client is the one that is wrong.
 *
 * So: integer division, string padding, Latin digits by construction. There is no
 * locale in the signature because there is no locale in the answer.
 */

/** `3200` → `'32.00'`. Latin digits, always. */
export function formatMinor(cents: number): string {
  const value = Math.trunc(cents);
  const negative = value < 0;
  const abs = Math.abs(value);

  const major = Math.trunc(abs / 100);
  const minor = abs % 100;

  return `${negative ? '-' : ''}${major}.${String(minor).padStart(2, '0')}`;
}

/**
 * A provisional line total. Integer multiplication only.
 *
 * "Provisional" is not a hedge, it is the architecture: the authoritative subtotal
 * is recomputed by `place_order` from the `products` table. This exists so the
 * drawer is not useless while the user shops, and the drawer says so in words
 * (`t.menu.cart.provisional`).
 */
export function lineTotal(priceCents: number, qty: number): number {
  return Math.trunc(priceCents) * Math.trunc(qty);
}

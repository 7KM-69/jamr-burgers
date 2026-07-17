'use client';

/**
 * The ember chrome — ONE primary-action surface for the whole site.
 *
 * It used to live inside `EmberButton` (a `<Link>`). The menu needs the identical
 * affordance as a `<button>` (add to order, checkout), and the product register is
 * unambiguous about what happens if you re-type it by hand: "if the save button
 * looks different in two places, one is wrong". So the surface is extracted here
 * and both call sites consume it. There is no second way to draw a primary action.
 *
 * The fill is a `scaleX` on a layer, never a `background-color` transition — it
 * stays on the compositor, and it grows from the reading-start edge, so it flips
 * in RTL like every other horizontal motion in this codebase.
 */

export const EMBER_CHROME =
  'group relative isolate inline-flex items-center justify-center overflow-hidden bg-ember px-8 py-4 text-sm font-bold uppercase tracking-[0.18em] text-ink transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 disabled:pointer-events-none disabled:bg-ash-300 disabled:text-ash-700';

/** The flame that fills the block on hover. Sits behind the label (`-z-10`). */
export function EmberFill() {
  return (
    <span
      aria-hidden
      className="absolute inset-0 -z-10 origin-[left_center] scale-x-0 bg-flame transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100 group-disabled:hidden rtl:origin-[right_center]"
    />
  );
}

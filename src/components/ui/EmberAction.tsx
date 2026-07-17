'use client';

import { EMBER_CHROME, EmberFill } from './ember';

/**
 * The primary call to action, as a real `<button>` — for things that DO something
 * rather than go somewhere (add to order, check out).
 *
 * Identical surface to `EmberButton`; both read it from `./ember`. The disabled
 * state is designed rather than inherited: ash, no flame, no lift, and
 * `pointer-events: none` so the hover fill cannot fire on a control that will not
 * respond. A primary action that looks primary while doing nothing is worse than
 * one that looks spent.
 */
export function EmberAction({
  children,
  className = '',
  type = 'button',
  ...rest
}: React.ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type={type}
      className={`${EMBER_CHROME} ${className}`}
      style={{ borderRadius: 'var(--radius-sharp)' }}
      {...rest}
    >
      <EmberFill />
      <span className="relative">{children}</span>
    </button>
  );
}

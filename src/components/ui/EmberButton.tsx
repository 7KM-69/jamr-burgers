'use client';

import Link from 'next/link';
import { EMBER_CHROME, EmberFill } from './ember';

/**
 * The primary call to action, as a link.
 *
 * A pill would read as a food-delivery app. This is a hard-edged block that fills
 * with flame on hover. The surface itself lives in `./ember` and is shared with
 * `EmberAction` (the same affordance as a `<button>`), so a link and a button
 * cannot drift into two slightly different primary actions.
 */
export function EmberButton({
  href,
  children,
  className = '',
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link
      href={href}
      className={`${EMBER_CHROME} ${className}`}
      style={{ borderRadius: 'var(--radius-sharp)' }}
      {...rest}
    >
      <EmberFill />
      <span className="relative">{children}</span>
    </Link>
  );
}

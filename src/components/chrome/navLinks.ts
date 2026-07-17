import type { Dictionary } from '@/i18n';

export type NavLink = { href: string; label: string };

/** One source of truth for the primary navigation, shared by the desktop bar
 *  and the mobile overlay so they can never drift apart. */
export function navLinks(t: Dictionary): NavLink[] {
  return [
    { href: '/', label: t.nav.home },
    { href: '/menu', label: t.nav.menu },
    { href: '/spices', label: t.nav.spices },
    { href: '/locations', label: t.nav.locations },
    { href: '/contact', label: t.nav.contact },
  ];
}

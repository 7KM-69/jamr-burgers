'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EASE, ScrollTrigger, gsap } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { CartButton } from './CartButton';
import { LangToggle } from './LangToggle';
import { MobileMenu } from './MobileMenu';
import { Wordmark } from './Wordmark';
import { navLinks } from './navLinks';

export function Nav({ authed }: { authed: boolean }) {
  const root = useRef<HTMLElement>(null);
  const burger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const pathname = usePathname();
  const { t } = useI18n();
  const links = navLinks(t);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      // Created inside the context, so ctx.revert() kills it. A ScrollTrigger
      // that outlives its component is the leak that breaks every route change.
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => {
          const y = self.scroll();

          // Over the hero the bar is invisible chrome; once the page moves under
          // it, it earns a surface. Opacity only — animating backdrop-filter or a
          // background colour would repaint the whole bar every frame.
          gsap.to('[data-nav-surface]', {
            opacity: y > 24 ? 1 : 0,
            duration: reduced ? 0 : 0.35,
            overwrite: 'auto',
          });

          // Get out of the way on the way down, come back the instant they turn
          // around. Never while the menu is open — the bar holds the close button.
          if (reduced) return;
          const hide = self.direction === 1 && y > 260 && !openRef.current;
          gsap.to(el, {
            yPercent: hide ? -100 : 0,
            duration: 0.5,
            ease: EASE.inOut,
            overwrite: 'auto',
          });
        },
      });
    }, root);

    return () => ctx.revert();
  }, []);

  // A route change with the menu open would leave it hanging over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        ref={root}
        data-nav
        className="fixed inset-x-0 top-0 will-change-transform"
        style={{ zIndex: 'var(--z-nav)' }}
      >
        <div
          data-nav-surface
          aria-hidden
          className="absolute inset-0 border-b border-ash-400 bg-ink/80 opacity-0 backdrop-blur-lg"
        />

        <div className="relative mx-auto flex items-center justify-between gap-6 px-gutter py-5">
          <Link
            href="/"
            className="shrink-0 text-2xl text-bone transition-colors duration-200 hover:text-ember"
            aria-label={t.nav.home}
          >
            <Wordmark />
          </Link>

          <nav aria-label={t.a11y.primaryNav} className="hidden lg:block">
            <ul className="flex items-center gap-9">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={`group relative text-sm font-medium transition-colors duration-200 ${
                        active ? 'text-bone' : 'text-ash-700 hover:text-bone'
                      }`}
                    >
                      {link.label}
                      {/* Underline grows from the reading-start edge; scaleX, not width. */}
                      <span
                        aria-hidden
                        className={`absolute -bottom-1.5 block h-px w-full origin-[left_center] bg-ember transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] rtl:origin-[right_center] ${
                          active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                        }`}
                        style={{ insetInlineStart: 0 }}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <LangToggle />

            <Link
              href={authed ? '/account' : '/auth'}
              className="hidden h-10 place-items-center border border-ash-500 px-4 text-sm font-semibold text-bone transition-colors duration-200 hover:border-ember hover:text-ember sm:grid"
              style={{ borderRadius: 'var(--radius-sharp)' }}
            >
              {authed ? t.nav.account : t.nav.signIn}
            </Link>

            <CartButton />

            <button
              ref={burger}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? t.a11y.closeMenu : t.a11y.openMenu}
              className="grid h-10 w-10 place-items-center border border-ash-500 text-bone transition-colors duration-200 hover:border-ember hover:text-ember lg:hidden"
              style={{ borderRadius: 'var(--radius-sharp)' }}
            >
              <span aria-hidden className="flex w-4 flex-col gap-[3px]">
                <span
                  className={`block h-px w-full bg-current transition-transform duration-300 ${
                    open ? 'translate-y-[4px] rotate-45' : ''
                  }`}
                />
                <span
                  className={`block h-px w-full bg-current transition-opacity duration-200 ${
                    open ? 'opacity-0' : 'opacity-100'
                  }`}
                />
                <span
                  className={`block h-px w-full bg-current transition-transform duration-300 ${
                    open ? '-translate-y-[4px] -rotate-45' : ''
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={open} onClose={() => setOpen(false)} returnFocusTo={burger} authed={authed} />
    </>
  );
}

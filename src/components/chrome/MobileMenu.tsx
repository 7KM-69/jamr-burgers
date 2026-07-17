'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { EASE, gsap, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { useI18n } from '@/components/providers/I18nProvider';
import { getLenis } from '@/components/providers/SmoothScrollProvider';
import { navLinks } from './navLinks';

export function MobileMenu({
  open,
  onClose,
  returnFocusTo,
  authed,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
  authed: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const { t } = useI18n();
  const links = navLinks(t);

  // Build the timeline once, paused. Playing and reversing one timeline is what
  // makes the close feel like the open run backwards rather than a second,
  // subtly different animation.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        paused: true,
        onReverseComplete: () => gsap.set(el, { display: 'none' }),
      });

      tl.set(el, { display: 'flex' }).fromTo(
        el,
        { yPercent: -100 },
        { yPercent: 0, duration: reduced ? 0 : 0.66, ease: EASE.inOut },
      );

      // Routed through the same helper as every other masked line on the site.
      // These items carry no CSS rest transform, so this one already worked — but
      // "the one that happened to work" is not a pattern, it is a coincidence.
      revealMask(
        tl,
        '[data-menu-item]',
        { duration: reduced ? 0 : 0.7, stagger: reduced ? 0 : 0.055 },
        reduced ? 0 : '-=0.3',
      );

      gsap.set(el, { display: 'none' });
      timeline.current = tl;
    }, root);

    return () => {
      ctx.revert();
      timeline.current = null;
    };
  }, []);

  useEffect(() => {
    const tl = timeline.current;
    const el = root.current;
    if (!tl || !el) return;

    if (open) {
      tl.play();
      // Lenis keeps momentum-scrolling the page behind an overlay otherwise.
      getLenis()?.stop();
      el.querySelector<HTMLAnchorElement>('a')?.focus();
    } else {
      tl.reverse();
      getLenis()?.start();
    }
  }, [open]);

  // Escape closes; Tab is trapped inside the panel. The page behind is still in
  // the DOM, so without the trap the focus ring walks off into content the user
  // cannot see.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        returnFocusTo.current?.focus();
        return;
      }

      if (event.key !== 'Tab') return;

      const el = root.current;
      if (!el) return;

      const focusables = el.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
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
  }, [open, onClose, returnFocusTo]);

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={t.a11y.primaryNav}
      className="fixed inset-0 hidden flex-col justify-between bg-ink-deep px-gutter pb-16 pt-28 will-change-transform lg:!hidden"
      style={{ zIndex: 'var(--z-menu)' }}
    >
      <div
        aria-hidden
        className="ember-glow pointer-events-none absolute inset-x-0 bottom-[-12%] mx-auto h-72 w-[80%] opacity-40"
      />

      <nav className="relative">
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.href} className="mask-line">
              <Link
                data-menu-item
                href={link.href}
                onClick={() => {
                  onClose();
                }}
                className="display block py-1 text-h1 text-bone transition-colors duration-200 hover:text-ember will-change-transform"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="relative flex items-center justify-between border-t border-ash-400 pt-6">
        <Link
          href={authed ? '/account' : '/auth'}
          onClick={onClose}
          className="eyebrow text-ash-700 transition-colors duration-200 hover:text-bone"
        >
          {authed ? t.nav.account : t.nav.signIn}
        </Link>
        <button
          type="button"
          onClick={() => {
            onClose();
            returnFocusTo.current?.focus();
          }}
          className="eyebrow text-ember"
        >
          {t.a11y.closeMenu}
        </button>
      </div>
    </div>
  );
}

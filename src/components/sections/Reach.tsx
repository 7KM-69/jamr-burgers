'use client';

import { useEffect, useRef } from 'react';
import { EASE, gsap, motionGate, revealMask } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { brand, email, whatsappUrl } from '@/lib/brand';
import { useI18n } from '@/components/providers/I18nProvider';
import type { Dictionary } from '@/i18n';

/**
 * /contact — three ways in, and no form.
 *
 * ## Why there is no form
 *
 * There is no endpoint to post one to. A contact form with no server behind it is
 * a text box that eats what you type and thanks you for it, and shipping one to
 * look complete would be the single most dishonest thing on this site. The `api`
 * lane owns server actions; if a form is wanted later it needs one, and that is a
 * request in the handoff, not something to fake here.
 *
 * So the absence is made into the argument instead — `contact.noForm` says it in
 * the brand's own voice — and the page ships three channels that ACTUALLY WORK:
 * a real `tel:`, a real `wa.me` link, a real `mailto:`. They are not decoration.
 *
 * ## The rows
 *
 * The hover reaction is the Locations row rule, reused deliberately: a hairline
 * that catches from the reading-start edge. It scales from `origin-left` and flips
 * to `origin-right` in RTL — this is chrome, and chrome mirrors. Unlike the
 * Locations rows, these are <a>s, so the reaction is on `:focus-visible` too and
 * the keyboard gets the same affordance the mouse does. A row that only lights for
 * a cursor is a row half the users cannot see.
 */

type ChannelKey = keyof Dictionary['contact']['channels'];

interface Channel {
  key: ChannelKey;
  href: string;
  /** What is actually dialled/written. Latin digits in both languages (CLAUDE.md). */
  value: string;
  /** Leaves the site, so it gets a new tab and the a11y note that says so. */
  external?: boolean;
}

const CHANNELS: readonly Channel[] = [
  { key: 'call', href: `tel:${brand.contact.phone}`, value: brand.contact.phoneDisplay },
  { key: 'whatsapp', href: whatsappUrl, value: brand.contact.whatsappDisplay, external: true },
  { key: 'email', href: `mailto:${email}`, value: email },
];

export function Reach() {
  const root = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const copy = t.contact;

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const gate = motionGate(el);

    if (prefersReducedMotion()) {
      gate.settle();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 75%', once: true },
      });

      revealMask(tl, '[data-mask]', { duration: 1.15, stagger: 0.1 }, 0)
        .fromTo(
          '[data-animate]',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.85, stagger: 0.07, ease: EASE.out },
          0.35,
        )
        .fromTo(
          '[data-channel]',
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.09, ease: EASE.out },
          0.5,
        );

      gate.watch(tl);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      data-section="reach"
      data-motion="pending"
      className="relative px-gutter py-section"
    >
      <div className="mx-auto w-full max-w-[80rem]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p data-animate className="eyebrow mb-8">
              {copy.eyebrow}
            </p>
            <h2 className="display text-h2 text-bone">
              {copy.headline.map((line, i) => (
                <span key={line} className="mask-line">
                  <span
                    data-mask
                    className={`block will-change-transform ${i === 1 ? 'heat-text' : ''}`}
                  >
                    {line}
                  </span>
                </span>
              ))}
            </h2>
          </div>

          <p data-animate className="measure-tight text-lead text-ash-700 lg:pb-2 lg:text-end">
            {copy.lede}
          </p>
        </div>

        <div className="mt-20 grid gap-16 lg:grid-cols-12 lg:gap-12">
          {/* ---- The three channels. ---------------------------------------- */}
          <ul className="lg:col-span-8">
            {CHANNELS.map((channel) => {
              const meta = copy.channels[channel.key];

              return (
                <li key={channel.key} data-channel className="will-change-transform">
                  <a
                    href={channel.href}
                    {...(channel.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className="group relative block border-t border-ash-400 py-8 [&:last-child]:border-b"
                  >
                    {/* The rule catches from the reading-start edge. Chrome, so it
                        mirrors — origin-left in LTR, origin-right in RTL. Lights for
                        the keyboard as well as the cursor. */}
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 block h-px origin-[left_center] scale-x-0 bg-ember transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100 group-focus-visible:scale-x-100 rtl:origin-[right_center]"
                    />

                    <div className="flex flex-col gap-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                      <div>
                        <h3 className="display text-h3 leading-none text-bone transition-colors duration-300 group-hover:text-ember group-focus-visible:text-ember">
                          {meta.label}
                        </h3>
                        <p className="mt-3 text-sm text-ash-700">{meta.note}</p>
                      </div>

                      <p className="num shrink-0 text-lead font-semibold text-ash-700 transition-colors duration-300 group-hover:text-bone group-focus-visible:text-bone">
                        {channel.value}
                      </p>
                    </div>

                    {channel.external && <span className="sr-only">{copy.opensWhatsApp}</span>}
                  </a>
                </li>
              );
            })}
          </ul>

          {/* ---- The aside: where we are, when, and why there is no form. ---- */}
          <div className="flex flex-col gap-12 lg:col-span-4">
            <div data-animate>
              <h3 className="eyebrow mb-5 text-bone">{copy.addressTitle}</h3>
              <address className="text-lead not-italic text-ash-700">{t.footer.address}</address>
            </div>

            <div data-animate>
              <h3 className="eyebrow mb-5 text-bone">{copy.hoursTitle}</h3>
              <p className="text-lead text-ash-700">{t.footer.hours}</p>
            </div>

            {/* The absence of a form, stated. It is the most opinionated thing on
                the page, so it gets the ember border and the card. */}
            <div
              data-animate
              className="border-s-2 border-ember bg-ash-100 p-7"
              style={{ borderRadius: 'var(--radius-card)' }}
            >
              <h3 className="display text-h3 leading-none text-bone">{copy.noForm.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-ash-700">{copy.noForm.body}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

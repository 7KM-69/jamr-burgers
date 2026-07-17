'use client';

import { format } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import type { SpiceLevel } from '@/lib/types/api';

const NOTCHES = [1, 2, 3] as const;

/**
 * `products.spice_level` — 0 none, 1 mild, 2 medium, 3 hot (CONTRACT.md §9.2) —
 * drawn as three flames, `n` of them lit.
 *
 * ## Level 0 still draws three flames
 *
 * The obvious move is to render nothing at zero. It is wrong: an absent gauge is
 * indistinguishable from a gauge that failed to load, and the Green Ember (the one
 * burger at level 0) would be the only card on the menu missing a row. Three cold
 * flames and the word "None" is a *reading* — the instrument is present and it says
 * zero. That is the brand's whole argument: nothing to hide.
 *
 * The glyphs are `aria-hidden`; the level goes to a screen reader as a sentence
 * ("Heat: Medium, 2 of 3"), because three SVGs are not a value.
 *
 * The number in that sentence is a Latin digit in Arabic too (CLAUDE.md) — it comes
 * from the `{level}` interpolation, never from a locale-aware formatter.
 */
export function HeatGauge({ level, name }: { level: SpiceLevel; name: string }) {
  const { t } = useI18n();
  const label = t.menu.heat[level];

  return (
    <span
      className="inline-flex items-center gap-2"
      role="img"
      aria-label={`${name} — ${format(t.menu.a11y.heat, { label, level })}`}
    >
      <span aria-hidden className="flex items-center gap-1">
        {NOTCHES.map((notch) => {
          const lit = notch <= level;
          return (
            <svg
              key={notch}
              viewBox="0 0 12 15"
              className={`h-3.5 w-3 transition-colors duration-200 ${
                lit ? 'text-ember' : 'text-ash-500'
              }`}
              fill={lit ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={lit ? 0 : 1.1}
            >
              {/* A coal flame: broad base, one lick off the shoulder. Drawn, not
                  an icon-font glyph — the site has no icon font and is not getting one. */}
              <path d="M6 .8c.4 3.4-2.1 4-3.2 6.2a4.6 4.6 0 0 0 3.3 6.9 4.5 4.5 0 0 0 5-4.4c0-2.3-1.4-3.1-2.2-4.6-.5 1.6-1.4 1.8-1.7 1-.4-1.1.2-2.6-1.2-5.1Z" />
            </svg>
          );
        })}
      </span>
      <span aria-hidden className="text-xs font-semibold text-ash-700">
        {label}
      </span>
    </span>
  );
}

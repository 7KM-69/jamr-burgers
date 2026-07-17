'use client';

import { useI18n } from '@/components/providers/I18nProvider';

/**
 * AR ⇄ EN. Flips <html lang dir>, swaps the typeface pairing, and refreshes
 * every ScrollTrigger once the new text has reflowed — see I18nProvider.
 *
 * The label always shows the language you would switch *to*.
 */
export function LangToggle() {
  const { t, toggle, next } = useI18n();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t.a11y.switchToArabic}
      lang={next}
      className="grid h-10 min-w-10 place-items-center border border-ash-500 px-2 text-sm font-semibold text-bone transition-colors duration-200 hover:border-ember hover:text-ember"
      style={{ borderRadius: 'var(--radius-sharp)' }}
    >
      {t.nav.langToggle}
    </button>
  );
}

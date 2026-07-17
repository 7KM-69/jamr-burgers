'use client';

import { useI18n } from '@/components/providers/I18nProvider';

export function SkipLink() {
  const { t } = useI18n();

  return (
    <a
      href="#main"
      className="sr-only-focusable absolute start-4 top-4 bg-ember px-4 py-2 text-sm font-semibold text-ink"
      style={{ zIndex: 'var(--z-loader)' }}
    >
      {t.a11y.skipToContent}
    </a>
  );
}

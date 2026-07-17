'use client';

import { brand } from '@/lib/brand';
import { useI18n } from '@/components/providers/I18nProvider';

/**
 * The brand name, rendered in the right face for the current language.
 *
 * The word itself comes from src/lib/brand.ts and nowhere else — renaming the
 * brand is a one-line change there.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  const { lang } = useI18n();
  const name = lang === 'ar' ? brand.nameAr : brand.name;

  return (
    <span className={`display leading-none ${className}`} translate="no">
      {name}
    </span>
  );
}

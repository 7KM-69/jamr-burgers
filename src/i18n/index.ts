import { en, type Dictionary } from './en';
import { ar } from './ar';

export type Lang = 'en' | 'ar';
export type Dir = 'ltr' | 'rtl';

export const LANGS: readonly Lang[] = ['en', 'ar'];
export const DEFAULT_LANG: Lang = 'en';

/** The cookie the server reads in layout.tsx to render <html lang dir> correctly
 *  on the very first byte — so an Arabic user never sees an LTR flash. */
export const LANG_COOKIE = 'jamr_lang';
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const dictionaries: Record<Lang, Dictionary> = { en, ar };

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'ar';
}

export function dirFor(lang: Lang): Dir {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function otherLang(lang: Lang): Lang {
  return lang === 'ar' ? 'en' : 'ar';
}

/** `format(t.a11y.cartWithCount, { count: 3 })` → 'Cart, 3 items' */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export type { Dictionary };

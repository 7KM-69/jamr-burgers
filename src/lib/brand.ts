/**
 * The brand lives here and nowhere else.
 *
 * Renaming JAMR must be a one-line change: edit `name` (and `nameAr`). No
 * component may hardcode the brand name — import from here, always.
 */
export const brand = {
  /** Latin wordmark. Rendered uppercase by the display face. */
  name: 'JAMR',
  /** Arabic wordmark. Never rendered in a Latin face. */
  nameAr: 'جمر',
  /** What the name means. Used in the origin story and the <title>. */
  meaning: {
    en: 'embers',
    ar: 'الجمر',
  },
  /** Fallback <title> suffix and OG site name. */
  domain: 'jamr.local',

  /**
   * How to reach us. These live HERE and not in the dictionary, because a phone
   * number is not copy — it does not translate, and holding one string in two
   * files is how the two drift apart. /contact renders these; the dictionary
   * supplies only the labels around them.
   *
   * `.local` is not an oversight. This is an unpublished learning exercise
   * (CLAUDE.md) and it must never be mistakable for a real storefront taking real
   * calls, so the domain resolves nowhere on purpose. The numbers are in valid
   * Saudi format and are reserved-range, for the same reason.
   */
  contact: {
    /** E.164, for the tel: href. */
    phone: '+966112990090',
    /** Grouped for display. Latin digits in both languages (CLAUDE.md). */
    phoneDisplay: '+966 11 299 0090',
    whatsapp: '+966552990090',
    whatsappDisplay: '+966 55 299 0090',
  },
} as const;

export type Brand = typeof brand;

/** The address people actually write to. Derived, so a rename is still one line. */
export const email = `hello@${brand.domain}`;

/** wa.me wants the number bare: no `+`, no spaces. */
export const whatsappUrl = `https://wa.me/${brand.contact.whatsapp.replace(/\D/g, '')}`;

/** The wordmark for a given language. */
export function wordmark(lang: 'en' | 'ar'): string {
  return lang === 'ar' ? brand.nameAr : brand.name;
}

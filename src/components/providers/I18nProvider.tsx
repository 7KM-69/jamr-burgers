'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ScrollTrigger } from '@/lib/gsap';
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  dictionaries,
  dirFor,
  otherLang,
  type Dictionary,
  type Dir,
  type Lang,
} from '@/i18n';

type I18nValue = {
  lang: Lang;
  dir: Dir;
  /** The active dictionary. Every user-facing string in the app comes from here. */
  t: Dictionary;
  /** The language the toggle would switch to. */
  next: Lang;
  toggle: () => void;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  initialLang = DEFAULT_LANG,
  children,
}: {
  initialLang?: Lang;
  children: ReactNode;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);

  const toggle = useCallback(() => {
    setLang((current) => {
      const target = otherLang(current);
      const dir = dirFor(target);

      // Persist, so the *server* renders the right <html lang dir> next time and
      // there is no LTR flash before hydration.
      document.cookie = `${LANG_COOKIE}=${target};path=/;max-age=${LANG_COOKIE_MAX_AGE};samesite=lax`;

      // React does not own <html>, so set it directly. Doing it here rather than
      // in an effect means the direction flips in the same frame as the copy.
      const root = document.documentElement;
      root.lang = target;
      root.dir = dir;

      // Every ScrollTrigger start/end was measured against the *other* language's
      // text. Arabic reflows to different line counts, so every trigger position
      // is now wrong. Refresh once the new glyphs have actually been laid out —
      // two frames, because the font swap and the reflow land on separate ones.
      // Skipping this is the classic bug where the scroll choreography works
      // perfectly in English and silently drifts in Arabic.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ScrollTrigger.refresh();
        });
      });

      return target;
    });
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir: dirFor(lang),
      t: dictionaries[lang],
      next: otherLang(lang),
      toggle,
    }),
    [lang, toggle],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside <I18nProvider>.');
  }
  return value;
}

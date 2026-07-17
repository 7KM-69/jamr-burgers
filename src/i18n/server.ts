import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_LANG, LANG_COOKIE, dictionaries, isLang, type Dictionary, type Lang } from './index';

/** The active language, read server-side from the cookie the toggle writes. */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLang()];
}

type RouteKey = Exclude<keyof Dictionary['routes'], 'notFound'>;

/**
 * Per-route <title> and description, in the reader's language.
 *
 * The layout supplies the `%s — JAMR` template, so a route only states its own
 * half of the title. Without this every page in the site would share one title,
 * which is the kind of thing nobody notices until it is in a search result.
 */
export async function routeMetadata(section: RouteKey): Promise<Metadata> {
  const t = await getDictionary();
  const copy = t.routes[section];

  return {
    title: copy.title,
    description: copy.lede,
  };
}

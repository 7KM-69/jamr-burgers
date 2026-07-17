

'use client';

import type { Dictionary } from '@/i18n';
import { useI18n } from '@/components/providers/I18nProvider';
import { RouteStage } from './RouteStage';

/**
 * Binds a route to its copy. The language can change without a navigation, so
 * the title and lede have to come from the client dictionary rather than being
 * baked in on the server.
 */
export function RouteIntro({
  section,
}: {
  section: Exclude<keyof Dictionary['routes'], 'notFound'>;
}) {
  const { t } = useI18n();
  const copy = t.routes[section];

  return <RouteStage title={copy.title} lede={copy.lede} />;
}

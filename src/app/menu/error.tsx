'use client';

import { useEffect } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { EmberAction } from '@/components/ui/EmberAction';

/**
 * The menu could not be read from the database.
 *
 * This boundary exists BECAUSE `getProducts()` throws instead of returning `[]`.
 * The alternative — swallowing the error and rendering an empty grid — is the
 * failure mode this project has already shipped once: a green build over a page
 * that renders nothing. An empty menu looks like a menu. This does not.
 *
 * It is a client component (Next requires it) and it reuses the site's own
 * vocabulary rather than inventing an "error page" style: the copy is in the two
 * dictionaries, the retry is the same ember block as every other primary action,
 * and the fire metaphor holds — the kitchen is not answering.
 *
 * `reset()` re-runs the Server Component. If Postgres is back, the menu is back;
 * there is no reload and no lost cart.
 */
export default function MenuError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    // The digest is the only handle on the server-side stack; the message that
    // crossed the RSC boundary is deliberately opaque. Log it, never render it —
    // it is English, developer-facing, and would be untranslated in the Arabic UI.
    console.error('menu: failed to load products', error.digest ?? error.message);
  }, [error]);

  return (
    <section className="flex min-h-[80svh] flex-col items-center justify-center gap-6 px-gutter text-center">
      <div
        aria-hidden
        className="ember-glow pointer-events-none absolute start-1/2 top-1/3 h-[30vmin] w-[50vmin] -translate-x-1/2 opacity-20 rtl:translate-x-1/2"
      />

      <span aria-hidden className="relative block size-3 rounded-full border border-ember" />

      <h1 className="display relative text-h2 text-bone">{t.menu.error.title}</h1>
      <p className="measure-tight relative text-lead text-ash-700">{t.menu.error.body}</p>

      <EmberAction onClick={reset} className="relative mt-2">
        {t.menu.error.retry}
      </EmberAction>
    </section>
  );
}

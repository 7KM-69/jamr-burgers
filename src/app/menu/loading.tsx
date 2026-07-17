/**
 * The menu, while Postgres is answering.
 *
 * A skeleton, not a spinner: the six cards are a known shape, so the page can hold
 * that shape and let the content land into it. A spinner in the middle of a content
 * area throws the layout away and then rebuilds it, which is why it reads as slower
 * than it is even when it is not.
 *
 * The pulse is a CSS animation, so `prefers-reduced-motion` in globals.css stops it
 * dead — and a still skeleton is still a skeleton. Nothing is lost.
 *
 * No copy at all. There is nothing true to say here yet, and "Loading…" is not a
 * sentence in either of this site's languages until it has to be.
 */
export default function MenuLoading() {
  return (
    <>
      {/* The stage the RouteIntro will occupy. Same 95svh, so the grid does not
          jump up the page and then back down when the real title arrives. */}
      <section className="flex min-h-[95svh] flex-col justify-end px-gutter pb-16 pt-40">
        <div className="mx-auto w-full max-w-[80rem]">
          <div className="h-[clamp(2.5rem,6.5vw,6.5rem)] w-[min(28rem,70%)] animate-pulse bg-ash-200" />
          <div className="mt-8 h-5 w-[min(34rem,85%)] animate-pulse bg-ash-200" />
        </div>
      </section>

      <section className="px-gutter pb-section">
        <div className="mx-auto w-full max-w-[80rem]">
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li
                key={i}
                className="flex flex-col border border-ash-400 bg-ash-100"
                style={{ borderRadius: 'var(--radius-card)' }}
              >
                <div className="aspect-[4/3] w-full animate-pulse bg-ash-200" />

                <div className="flex flex-col gap-5 p-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="h-6 w-40 animate-pulse bg-ash-200" />
                    <div className="h-6 w-16 animate-pulse bg-ash-200" />
                  </div>

                  <div className="space-y-2">
                    <div className="h-3 w-full animate-pulse bg-ash-200" />
                    <div className="h-3 w-4/5 animate-pulse bg-ash-200" />
                  </div>

                  <div className="h-10 w-full animate-pulse border-y border-ash-400 bg-ash-200/50" />

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {[0, 1, 2, 3].map((row) => (
                      <div key={row} className="h-4 w-full animate-pulse bg-ash-200" />
                    ))}
                  </div>

                  <div className="mt-1 h-11 w-full animate-pulse bg-ash-200" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

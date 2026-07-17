'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * A product photograph, and what happens when there isn't one.
 *
 * `image_path` arrives from the database already root-relative — `/products/<slug>.jpg`,
 * guaranteed by a CHECK constraint against the slug (CONTRACT.md §9.1). It goes
 * straight into `next/image`. No prefixing, no template string, no `/public`.
 *
 * ## The failure state is drawn, not left to the browser
 *
 * If the file is missing, Chromium paints its broken-image glyph and the card
 * becomes a bug report. So `onError` swaps in a charred field carrying the burger's
 * rank — the card keeps its shape, its name, its price and its spec, and loses only
 * the photograph. Nobody is told "image failed"; they are simply shown a burger with
 * no picture, which is what has happened.
 *
 * This is the one state on this page I could not photograph without breaking the
 * data on purpose, so it is written to be correct by construction: no layout shift
 * (the fallback fills the same `absolute inset-0`), no console noise beyond the
 * network 404 itself, and `alt` still carries the name.
 */
export function ProductImage({
  src,
  alt,
  index,
  priority,
}: {
  src: string;
  alt: string;
  /** The card's rank on the price ladder, already zero-padded. */
  index: string;
  priority: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden
        className="absolute inset-0 grid place-items-center bg-ash-100"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 120%, color-mix(in oklab, var(--color-ember) 14%, transparent), transparent 62%)',
        }}
      >
        <span className="num display text-6xl text-ash-400">{index}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      onError={() => setFailed(true)}
      /* The grid is 1 / 2 / 3 columns, so a card is never wider than a third of a
         1280px content column on desktop and never narrower than a full 390px
         phone. Telling the browser that up front is the difference between serving
         a 1440px JPEG to a phone and serving it a 390px one. */
      sizes="(min-width: 1280px) 26rem, (min-width: 768px) 44vw, 92vw"
      priority={priority}
      className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
    />
  );
}

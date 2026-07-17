/**
 * Measure the true painted extent of every burger layer, in art space (1000x800).
 *
 *   node scripts/measure-layers.mjs
 *
 * This is the instrument the rasterizer's stacking is derived from. Nothing here
 * is hand-guessed: each SVG is rasterized alone onto a transparent canvas and the
 * alpha channel is scanned row by row.
 *
 * Two thresholds, because they answer two different questions:
 *
 *   core — alpha >= 220. The SOLID BODY of the ingredient. Every layer in this
 *          art set carries a blurred contact shadow and an ember glow, which are
 *          semi-transparent and therefore fall out at this threshold. This is the
 *          shape that physically has to seat on the layer below, so this is the
 *          one the stack is built from.
 *   ink  — alpha >= 24. Everything the layer paints, shadow and glow included.
 *          Reported only to show how far a shadow bleeds past the body; if you
 *          stacked on THIS you would seat every layer on its own shadow and open
 *          a dark gap under it. That is exactly the bug that shipped.
 */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ART = path.resolve(process.cwd(), 'public/art/burger');

export const LAYER_FILES = [
  'bun-bottom.svg',
  'patty.svg',
  'lamb-patty.svg',
  'veg-patty.svg',
  'chicken.svg',
  'cheese.svg',
  'tomato.svg',
  'lettuce.svg',
  'chili.svg',
  'bun-top.svg',
];

/**
 * Rasterize each SVG alone and scan its alpha. Returns a map keyed by file name.
 * Exported so the rasterizer measures rather than assumes.
 */
export async function measureLayers(files = LAYER_FILES) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });

  const svgs = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, await readFile(path.join(ART, file), 'utf8')]),
    ),
  );

  const measurements = await page.evaluate(async (svgSources) => {
    const out = {};

    for (const [file, svg] of Object.entries(svgSources)) {
      const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const img = new Image();
      img.width = 1000;
      img.height = 800;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error(`${file} failed to decode`));
        img.src = uri;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 800;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, 1000, 800);
      ctx.drawImage(img, 0, 0, 1000, 800);
      const { data } = ctx.getImageData(0, 0, 1000, 800);

      // Row-by-row alpha census. MIN_RUN guards against a stray antialiased
      // pixel defining the top of a layer.
      const MIN_RUN = 8;
      const census = (minAlpha) => {
        let top = null;
        let bottom = null;
        let widest = { y: null, w: -1 };
        const widths = new Array(800).fill(0);
        for (let y = 0; y < 800; y++) {
          let count = 0;
          for (let x = 0; x < 1000; x++) {
            if (data[(1000 * y + x) * 4 + 3] >= minAlpha) count++;
          }
          widths[y] = count;
          if (count >= MIN_RUN) {
            if (top === null) top = y;
            bottom = y;
          }
          if (count > widest.w) widest = { y, w: count };
        }
        return { top, bottom, widest, widths };
      };

      const core = census(220);
      const ink = census(24);

      if (core.top === null) throw new Error(`${file} painted no opaque pixels`);

      /**
       * Where the layer's SOLID BODY actually starts and stops along one row.
       *
       * This is what a leader line has to reach. The layer's DOM box is the whole
       * 1000x800 canvas and is mostly transparent, so `getBoundingClientRect()` in
       * the browser can never answer this question — the alpha channel can, and
       * only here.
       *
       * RUN guards the answer against a single antialiased pixel or a stray blob
       * of char: the edge is the first place where the body is genuinely present,
       * not the first place a pixel happens to be.
       */
      const rowSpan = (y, minAlpha = 220, RUN = 4) => {
        const solid = (x) => data[(1000 * y + x) * 4 + 3] >= minAlpha;
        let left = null;
        let right = null;
        for (let x = 0; x <= 1000 - RUN; x++) {
          let ok = true;
          for (let k = 0; k < RUN; k++) if (!solid(x + k)) { ok = false; break; }
          if (ok) { left = x; break; }
        }
        for (let x = 999; x >= RUN - 1; x--) {
          let ok = true;
          for (let k = 0; k < RUN; k++) if (!solid(x - k)) { ok = false; break; }
          if (ok) { right = x; break; }
        }
        return { left, right };
      };

      /**
       * The BULK of the layer: every row at least half as wide as its widest.
       *
       * Not coreTop..coreBottom. The cheese's three drips hang 50px below the slab
       * and drag `coreBottom` down with them, which put the naive midpoint at
       * y=431 — a row where the slab has already ended on the left but not on the
       * right, and the "silhouette" it measured there was 0.29-0.82: violently
       * lopsided, an artefact of the drips rather than a fact about the cheese.
       * A leader line aimed at that would have stopped in mid-air over the burger.
       *
       * Half the equator width is the line between "this is the ingredient" and
       * "this is something dangling off it".
       */
      const cutoff = core.widest.w * 0.5;
      let bulkTop = null;
      let bulkBottom = null;
      for (let y = 0; y < 800; y++) {
        if (core.widths[y] >= cutoff) {
          if (bulkTop === null) bulkTop = y;
          bulkBottom = y;
        }
      }

      // The row a label points at: the vertical middle of that bulk. Not the widest
      // row — a label belongs at the layer's optical middle, and the line has to
      // leave from wherever that middle is.
      const centreY = Math.round((bulkTop + bulkBottom) / 2);
      const centre = rowSpan(centreY);
      if (centre.left === null) throw new Error(`${file}: no solid body at its own centre row`);

      out[file] = {
        coreTop: core.top,
        coreBottom: core.bottom,
        coreHeight: core.bottom - core.top,
        // The equator: the widest opaque row. For a 2.5D disc this is where the
        // silhouette peaks, and it is the most reliable landmark on the shape.
        equatorY: core.widest.y,
        equatorWidth: core.widest.w,
        // The bulk, the row at its middle, and the silhouette's two edges on it.
        bulkTop,
        bulkBottom,
        centreY,
        centreLeft: centre.left,
        centreRight: centre.right,
        inkTop: ink.top,
        inkBottom: ink.bottom,
      };
    }

    return out;
  }, svgs);

  await browser.close();
  return measurements;
}

// Run directly: print the table. (pathToFileURL, not string surgery — this repo
// lives at a path with a space in it, which naive `file://` + argv[1] gets wrong.)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const m = await measureLayers();
  console.table(
    Object.fromEntries(
      Object.entries(m).map(([file, v]) => [
        file,
        {
          coreTop: v.coreTop,
          coreBottom: v.coreBottom,
          coreH: v.coreHeight,
          equatorY: v.equatorY,
          centreY: v.centreY,
          centreL: v.centreLeft,
          centreR: v.centreRight,
          inkTop: v.inkTop,
          inkBottom: v.inkBottom,
          shadowBleed: v.inkBottom - v.coreBottom,
        },
      ]),
    ),
  );
}

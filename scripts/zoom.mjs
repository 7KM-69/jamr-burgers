/**
 * Look closely at a screenshot you already took.
 *
 *   node scripts/zoom.mjs screenshots/04-hero-en-desktop.png 1050,690,420,260
 *   node scripts/zoom.mjs screenshots/06-stack-en-desktop.png 400,700,1200,400 --out=conn
 *
 * The region is `x,y,w,h` in the SOURCE PNG's own pixels (our shots are taken at
 * deviceScaleFactor 2, so a 1440x900 viewport is a 2880x1800 file).
 *
 * Why this exists: a 2880px-wide PNG is downsampled to ~2000px before anyone —
 * human or model — actually looks at it, and a 12px seam between two burger layers
 * is exactly the kind of defect that survives that downsample as "probably fine".
 * The three defects in this section were all found by looking at pixels, not at
 * code. This is the magnifying glass.
 *
 * Writes screenshots/_zoom/<name>.png, upscaled 2x with smoothing off so the
 * pixels stay pixels.
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const [file, region, ...rest] = process.argv.slice(2);
const flags = new Map(
  rest
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = 'true'] = a.slice(2).split('=');
      return [k, v];
    }),
);

if (!file || !region) {
  console.error('usage: node scripts/zoom.mjs <png> <x,y,w,h> [--scale=2] [--out=name]');
  process.exit(1);
}

const [x, y, w, h] = region.split(',').map(Number);
if ([x, y, w, h].some((n) => !Number.isFinite(n))) {
  console.error(`bad region "${region}" — expected x,y,w,h`);
  process.exit(1);
}

const scale = Number(flags.get('scale') ?? 2);
const name = flags.get('out') ?? `${path.basename(file, '.png')}-${x}x${y}`;
const OUT_DIR = path.resolve(process.cwd(), 'screenshots/_zoom');

/**
 * A data URI, not a file:// URL. `page.setContent()` runs on an opaque origin and
 * Chromium refuses to load file:// subresources into it — the image comes back
 * broken and the crop is a rectangle of background. Same trap as the rasterizer.
 */
const mime = path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const src = `data:${mime};base64,${(await readFile(path.resolve(process.cwd(), file))).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Math.round(w * scale), height: Math.round(h * scale) },
});

await page.setContent(`<!doctype html><html><head><style>
  html,body { margin:0; padding:0; background:#0B0A09; overflow:hidden; }
  .win { width:${w * scale}px; height:${h * scale}px; overflow:hidden; position:relative; }
  img {
    position:absolute;
    left:${-x * scale}px; top:${-y * scale}px;
    width:auto; height:auto;
    transform-origin: 0 0; transform: scale(${scale});
    image-rendering: pixelated;
  }
</style></head><body><div class="win"><img id="i" src="${src}"></div></body></html>`);

const ok = await page.evaluate(async () => {
  const img = document.getElementById('i');
  await img.decode().catch(() => {});
  return img.naturalWidth > 0;
});
if (!ok) {
  await browser.close();
  throw new Error(`${file} did not decode — wrong path?`);
}

await mkdir(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `${name}.png`);
await page.locator('.win').screenshot({ path: out });
await browser.close();

console.log(`  ✓ ${path.relative(process.cwd(), out)}  (${w}x${h} @ ${scale}x)`);

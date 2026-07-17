/**
 * Layer-art validation — proves public/art/burger/*.svg still assembles.
 *
 *   node scripts/validate-layer-art.mjs
 *
 * ---------------------------------------------------------------------------
 * THIS SCRIPT NO LONGER SHIPS ANYTHING. READ THIS BEFORE CHANGING IT BACK.
 * ---------------------------------------------------------------------------
 *
 * It used to be scripts/rasterize-products.mjs, and it wrote the six menu shots to
 * public/products/<slug>.jpg by composing them from the SVG layers. The menu cards
 * are photographs now (scripts/product-photos.mjs), and that script is the sole
 * owner of public/products/.
 *
 * Two scripts writing one artefact is two sources of truth, and the loser is
 * whoever runs second. Left as it was, this file's entire purpose — being
 * re-runnable — was a loaded gun: one `node scripts/rasterize-products.mjs` would
 * have silently overwritten all six photographs with the illustrations, reverted
 * the site's art direction, and exited 0 while doing it. Nobody would have looked
 * at public/products/ again until a screenshot came back wrong.
 *
 * It was not deleted, because it is the only thing that proves the layer art is
 * still assemblable, and the INGREDIENT SHOWCASE depends on exactly that: the
 * showcase must close the burger at spread=0, so a stack with a hole in it is a
 * visible defect on the site's signature scroll moment. The closure check below is
 * that proof, and it is worth keeping.
 *
 * So the artefact-writing was severed from the checking. Output now goes to a
 * throwaway, git-ignored directory (OUT, below). The frames it writes are contact
 * prints for a human to look at when the layer art changes — they are not assets,
 * nothing imports them, and no route serves them.
 *
 * The recipes below are therefore no longer "products". They are the set of layer
 * COMBINATIONS the art must survive: substituting a lamb patty for a beef one,
 * stacking two patties, dropping the tomato and lettuce. If the art can close all
 * of them, the showcase's own stack is safe.
 *
 * ---------------------------------------------------------------------------
 * HOW THE STACK IS BUILT — and why the previous version produced floating crowns
 * ---------------------------------------------------------------------------
 *
 * Every layer is drawn IN REGISTER on a shared 1000x800 canvas, at the y it
 * occupies in the ONE fully-assembled burger:
 *
 *   bun-bottom 509-647 · patty 415-551 · cheese 378-484
 *   tomato 333-403 · lettuce 292-368 · bun-top 118-319
 *
 * Stack those six with no offset and it closes perfectly. That is the trap: it
 * makes `dy: 0` look like it works. But each layer's natural y assumes THE FULL
 * STACK IS UNDERNEATH IT. Drop the tomato and the lettuce from a recipe and the
 * crown does not fall to meet the cheese — it stays at y=118, hanging 59px above
 * a void. The old code papered over this with hand-guessed `dy` constants
 * (`-95`, `-105`) that were fitted to nothing and closed nothing.
 *
 * So the stack is DERIVED, bottom-up, from measurements of the art itself:
 *
 *   1. Rasterize every layer alone and scan its alpha to find its solid core
 *      (scripts/measure-layers.mjs). The core deliberately excludes each layer's
 *      blurred contact shadow and ember glow — those are semi-transparent and
 *      bleed up to 48px below the body. Seat a layer on its neighbour's SHADOW
 *      and you have built the gap you were trying to close.
 *
 *   2. Read the "nest" of each role — how deep it settles into whatever is below
 *      it — straight out of the canonical assembled burger. These are the
 *      artist's own intended overlaps, not my opinion:
 *        protein 42 · melt 69 · slice 25 · leaf 35 · crown 27
 *
 *   3. Walk each recipe bottom-up, seating every layer on whatever is ACTUALLY
 *      beneath it in that recipe:
 *        dy = (seatingSurface + nest) - layer.coreBottom
 *        seatingSurface = layer.coreTop + dy
 *
 *   4. Recentre the finished stack on the canonical stack's centre, so a
 *      four-layer burger and a six-layer double sit in the same optical position
 *      on their cards while still being honestly different heights.
 *
 * Fed the canonical six, this reproduces dy=0 exactly — which is the proof the
 * model is a faithful generalisation of the art rather than a second guess.
 *
 * Nothing below is a magic number. If the art moves, re-run and the stack
 * re-derives.
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { measureLayers } from './measure-layers.mjs';

const ART = path.resolve(process.cwd(), 'public/art/burger');

/**
 * A throwaway, git-ignored scratch directory — NOT public/products/, and NOT
 * anywhere under public/ at all, so nothing this writes can ever be served or
 * mistaken for an asset.
 *
 * If you are about to point this back at public/products/: don't. That directory
 * holds photographs now and scripts/product-photos.mjs owns it. See the header.
 */
const OUT = path.resolve(process.cwd(), '.layer-art-proofs');

if (OUT.split(path.sep).includes('public')) {
  throw new Error('validate-layer-art.mjs must never write inside public/ — see the header.');
}

const WIDTH = 1200;
const HEIGHT = 900;

/** The art canvas is 1000x800. The stage is that, uniformly scaled by 0.9. */
const ART_W = 1000;
const ART_H = 800;
const STAGE_W = 900;
const STAGE_H = 720;
const ART_TO_STAGE = STAGE_H / ART_H; // 0.9 — identical on both axes, so no letterboxing.

/**
 * The one fully-assembled burger every layer was drawn against. Every nest value
 * in this file is measured out of THIS stack. It is the art's own ground truth.
 */
const CANONICAL = [
  'bun-bottom.svg',
  'patty.svg',
  'cheese.svg',
  'tomato.svg',
  'lettuce.svg',
  'bun-top.svg',
];

/**
 * What each layer *is*, structurally. Nest is a property of the role, so a lamb
 * patty presses into a bun exactly as far as a beef patty does, and a second
 * patty presses into melted cheese exactly as far as the first pressed into the
 * heel. Substitutions therefore need no new numbers.
 */
const ROLE = {
  'bun-bottom.svg': 'heel',
  'patty.svg': 'protein',
  'lamb-patty.svg': 'protein',
  'veg-patty.svg': 'protein',
  'chicken.svg': 'protein',
  'cheese.svg': 'melt',
  'tomato.svg': 'slice',
  'lettuce.svg': 'leaf',
  'bun-top.svg': 'crown',

  /**
   * A GARNISH rides on the stack but does not carry it.
   *
   * The chili is scattered slices, not a disc. Its bounding box (346-454) is
   * wide and tall, but down the axis of the burger it is mostly air. Treating it
   * as a structural layer and seating the crown on its bbox top hung the bun 62px
   * above the cheese with nothing between them — the pixel closure check caught
   * exactly this, which is the entire reason that check exists.
   *
   * So: a garnish is placed at the position it was DRAWN at relative to the layer
   * it garnishes, and the seating surface passes straight through it. The crown
   * lands on the cheese; the chili peeks out from under its rim, which is what
   * chili on a burger actually does.
   */
  'chili.svg': 'garnish',
};

/** Which layer each garnish was drawn to sit on. Its nest is derived from that. */
const GARNISH_BASE = {
  'chili.svg': 'cheese.svg',
};

/**
 * The layer combinations the art must survive. Bottom of the stack first — paint
 * order and physical order are the same thing.
 *
 * These keys were product slugs when this script drew the menu cards. They are kept
 * as-is because they are still the most legible names for the six stack shapes worth
 * testing (a double, a substituted protein, a garnish, a no-tomato-no-lettuce
 * recipe), but nothing downstream reads them any more and they bind to no database.
 */
const RECIPES = {
  'charcoal-smash': ['bun-bottom.svg', 'patty.svg', 'cheese.svg', 'bun-top.svg'],
  'double-flame': [
    'bun-bottom.svg',
    'patty.svg',
    'cheese.svg',
    'patty.svg',
    'cheese.svg',
    'bun-top.svg',
  ],
  firebird: ['bun-bottom.svg', 'chicken.svg', 'lettuce.svg', 'bun-top.svg'],
  'cinder-lamb': ['bun-bottom.svg', 'lamb-patty.svg', 'tomato.svg', 'bun-top.svg'],
  inferno: ['bun-bottom.svg', 'patty.svg', 'cheese.svg', 'chili.svg', 'bun-top.svg'],
  'green-ember': [
    'bun-bottom.svg',
    'veg-patty.svg',
    'tomato.svg',
    'lettuce.svg',
    'bun-top.svg',
  ],
};

// ---------------------------------------------------------------------------
// 1. Measure the art.
// ---------------------------------------------------------------------------

console.log('Measuring layer geometry from the art…');
const M = await measureLayers(Object.keys(ROLE));

// ---------------------------------------------------------------------------
// 2. Derive each role's nest from the canonical stack.
// ---------------------------------------------------------------------------

const NEST = {};
for (let i = 1; i < CANONICAL.length; i++) {
  const upper = M[CANONICAL[i]];
  const lower = M[CANONICAL[i - 1]];
  // How far the upper layer's body sinks past the top of the layer below it.
  NEST[ROLE[CANONICAL[i]]] = upper.coreBottom - lower.coreTop;
}

// A garnish's nest comes from its own drawn relationship to the layer it garnishes.
for (const [file, base] of Object.entries(GARNISH_BASE)) {
  NEST[file] = M[file].coreBottom - M[base].coreTop;
}

for (const [file, role] of Object.entries(ROLE)) {
  if (role === 'heel') continue;
  const nest = role === 'garnish' ? NEST[file] : NEST[role];
  if (nest === undefined) {
    throw new Error(`${file}: role '${role}' has no nest derived from the art.`);
  }
}

console.log(
  '  nests (art units, derived): ' +
    Object.entries(NEST)
      .map(([r, n]) => `${r} ${n}`)
      .join(' · '),
);

/** The canonical stack's own core centre — every product is recentred onto this. */
const CANON_TOP = Math.min(...CANONICAL.map((f) => M[f].coreTop));
const CANON_BOTTOM = Math.max(...CANONICAL.map((f) => M[f].coreBottom));
const CANON_CENTER = (CANON_TOP + CANON_BOTTOM) / 2;

// ---------------------------------------------------------------------------
// 3. Seat each recipe, bottom-up.
// ---------------------------------------------------------------------------

/**
 * @returns {{ file: string, dy: number, overlap: number|null }[]}
 *   `overlap` is how far this layer's body sinks into the one below — it must be
 *   positive for every layer or the stack has a hole in it.
 */
function seat(files) {
  const placed = [];
  let surface = null; // art-space y of the top of the layer below

  for (const file of files) {
    const m = M[file];
    if (!m) throw new Error(`no measurement for ${file}`);

    const role = ROLE[file];

    let dy;
    if (surface === null) {
      dy = 0; // the heel defines the ground; it does not move.
    } else {
      const nest = role === 'garnish' ? NEST[file] : NEST[role];
      dy = surface + nest - m.coreBottom;
    }

    const bottom = m.coreBottom + dy;
    placed.push({
      file,
      dy,
      role,
      overlap: surface === null ? null : bottom - surface,
    });

    // A garnish does not raise the stack: whatever comes next still seats on the
    // structural layer below it. Everything else becomes the new seating surface.
    if (surface === null || role !== 'garnish') {
      surface = m.coreTop + dy;
    }
  }

  // Recentre onto the canonical stack's centre so every card is optically aligned.
  const top = Math.min(...placed.map((p) => M[p.file].coreTop + p.dy));
  const bottom = Math.max(...placed.map((p) => M[p.file].coreBottom + p.dy));
  const shift = CANON_CENTER - (top + bottom) / 2;
  for (const p of placed) p.dy += shift;

  return placed;
}

// ---------------------------------------------------------------------------
// 4. Render.
// ---------------------------------------------------------------------------

const svgCache = new Map();

/**
 * Layers are inlined as data URIs, NOT as file:// URLs.
 *
 * This bit me: `page.setContent()` renders on an about:blank document with an
 * opaque origin, and Chromium refuses to load file:// subresources into it. Every
 * <img> came back broken, the script still exited 0, and it wrote six frames of
 * empty background. A data URI has no origin to be blocked on.
 */
async function dataUri(file) {
  if (!svgCache.has(file)) {
    const svg = await readFile(path.join(ART, file), 'utf8');
    svgCache.set(file, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  return svgCache.get(file);
}

async function html(placed) {
  const imgs = (
    await Promise.all(
      placed.map(async ({ file, dy }, i) => {
        const uri = await dataUri(file);
        return `
        <img data-src="${file}" src="${uri}" style="
          position:absolute; inset:0; width:100%; height:100%;
          object-fit:contain; z-index:${i + 1};
          transform: translateY(${(dy * ART_TO_STAGE).toFixed(2)}px);
        ">`;
      }),
    )
  ).join('');

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; background:#0B0A09; }
  .frame {
    width:${WIDTH}px; height:${HEIGHT}px; position:relative; overflow:hidden;
    background:#0B0A09; display:grid; place-items:center;
  }
  /* The coal. Same ember language as the site, so a card photographed here sits
     on the same page as the hero without a seam. */
  .glow {
    position:absolute; left:50%; top:56%;
    width:${Math.round(WIDTH * 0.78)}px; height:${Math.round(HEIGHT * 0.5)}px;
    transform:translate(-50%,-50%);
    background: radial-gradient(circle at 50% 50%,
      rgba(255,77,28,0.42) 0%,
      rgba(255,77,28,0.18) 34%,
      rgba(255,176,32,0.07) 56%,
      rgba(255,176,32,0) 72%);
    filter: blur(30px);
  }
  .vignette {
    position:absolute; inset:0;
    background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%);
  }
  .stage { position:relative; width:${STAGE_W}px; height:${STAGE_H}px; }
</style></head>
<body>
  <div class="frame">
    <div class="glow"></div>
    <div class="stage">${imgs}</div>
    <div class="vignette"></div>
  </div>
</body>
</html>`;
}

/**
 * The closure check — the assertion that would have caught what shipped.
 *
 * Re-composes the placed layers onto a TRANSPARENT canvas and walks a narrow band
 * down the centre of the burger. Every row between the top of the crown and the
 * bottom of the heel must be solid. A run of empty rows is a hole you can see
 * daylight through, and it fails the build.
 *
 * This tests the rendered pixels, not the arithmetic that produced them — so it
 * still catches a layer whose art disagrees with its measurement.
 */
async function findHole(page, placed) {
  const layers = await Promise.all(
    placed.map(async ({ file, dy }) => ({ uri: await dataUri(file), dy })),
  );

  return page.evaluate(
    async ({ layers, ART_W, ART_H }) => {
      const canvas = document.createElement('canvas');
      canvas.width = ART_W;
      canvas.height = ART_H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, ART_W, ART_H);

      for (const { uri, dy } of layers) {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = uri;
        });
        ctx.drawImage(img, 0, dy, ART_W, ART_H);
      }

      const { data } = ctx.getImageData(0, 0, ART_W, ART_H);

      // A narrow band down the axis of the burger. Every layer — even the apex of
      // the crown — covers the centre, so a transparent row here is a real hole
      // and not just the silhouette narrowing.
      const X0 = 480;
      const X1 = 520;
      const SOLID = 200; // alpha; excludes the semi-transparent shadows entirely
      const NEEDED = 34; // of the 41 columns in the band

      const solidRow = (y) => {
        let n = 0;
        for (let x = X0; x <= X1; x++) {
          if (data[(ART_W * y + x) * 4 + 3] >= SOLID) n++;
        }
        return n >= NEEDED;
      };

      let top = null;
      let bottom = null;
      for (let y = 0; y < ART_H; y++) {
        if (solidRow(y)) {
          if (top === null) top = y;
          bottom = y;
        }
      }
      if (top === null) return { error: 'the stack painted nothing at all' };

      // Longest run of non-solid rows strictly inside the stack.
      let worst = 0;
      let worstAt = null;
      let run = 0;
      for (let y = top; y <= bottom; y++) {
        if (solidRow(y)) {
          run = 0;
        } else {
          run++;
          if (run > worst) {
            worst = run;
            worstAt = y - run + 1;
          }
        }
      }
      return { top, bottom, worst, worstAt };
    },
    { layers, ART_W, ART_H },
  );
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
});

const digests = new Map();
const failures = [];

console.log('');

for (const [slug, files] of Object.entries(RECIPES)) {
  const placed = seat(files);

  // Arithmetic check: every layer must bite into the one below it.
  for (const p of placed) {
    if (p.overlap !== null && p.overlap <= 0) {
      failures.push(`${slug}: ${p.file} floats ${-p.overlap}px above the layer below it`);
    }
  }

  await page.setContent(await html(placed), { waitUntil: 'load' });

  /**
   * Assert every layer actually painted.
   *
   * The original version of this check was worthless: it asked `img.complete`,
   * and a BROKEN image reports complete === true. So it passed on six frames that
   * contained nothing but a broken-image icon. The only honest question is
   * whether the bitmap has width.
   */
  const missing = await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
    return imgs.filter((img) => img.naturalWidth === 0).map((img) => img.dataset.src);
  });

  if (missing.length > 0) {
    await browser.close();
    throw new Error(`${slug}: ${missing.length} layer(s) failed to render — ${missing.join(', ')}`);
  }

  // Pixel check: the stack must actually close.
  const hole = await findHole(page, placed);
  if (hole.error) {
    failures.push(`${slug}: ${hole.error}`);
  } else if (hole.worst > 2) {
    failures.push(
      `${slug}: ${hole.worst}px hole through the stack at art-y ${hole.worstAt} — it does not close`,
    );
  }

  const file = path.join(OUT, `${slug}.jpg`);
  const buffer = await page
    .locator('.frame')
    .screenshot({ path: file, type: 'jpeg', quality: 92 });

  // Six products must be six different pictures. If two hash the same, a recipe
  // did not reach the renderer — precisely the failure that shipped once and that
  // a green checkmark did not catch.
  const digest = createHash('md5').update(buffer).digest('hex');
  if (digests.has(digest)) {
    await browser.close();
    throw new Error(
      `${slug} is byte-identical to ${digests.get(digest)} — the layer recipes are not being applied.`,
    );
  }
  digests.set(digest, slug);

  const seams = placed
    .filter((p) => p.overlap !== null)
    .map((p) => `${p.overlap}`)
    .join('/');
  console.log(
    `  ✓ ${slug.padEnd(15)} ${String(files.length).padStart(2)} layers · ` +
      `seams ${seams.padEnd(18)} · span ${hole.top}-${hole.bottom} · ${digest.slice(0, 8)}`,
  );
}

await browser.close();

if (failures.length > 0) {
  console.error('\nThe stacks do not close:\n');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(
  `\nThe layer art assembles: 6 combinations · all distinct · every stack closes.` +
    `\nContact prints (not assets, git-ignored): ${path.relative(process.cwd(), OUT)}`,
);

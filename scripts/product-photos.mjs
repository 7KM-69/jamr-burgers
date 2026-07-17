/**
 * Product photographs — public/products/<slug>.jpg
 *
 *   node scripts/product-photos.mjs
 *
 * THIS SCRIPT IS THE ONLY OWNER OF public/products/*.jpg.
 *
 * It replaced scripts/rasterize-products.mjs, which composed these six files out of
 * the SVG layer art in public/art/burger/. Two scripts writing one artefact is two
 * sources of truth, and the loser is whoever runs second: re-running the rasterizer
 * would have silently put the illustrations back and reverted the site with a green
 * exit code. The rasterizer is now scripts/validate-layer-art.mjs — it still proves
 * the layer art closes (the ingredient showcase depends on that), but it writes to a
 * throwaway directory and cannot touch public/products/ any more.
 *
 * The hero and the ingredient showcase still use the SVG layers, and must: the
 * showcase has to CLOSE the burger at spread=0 and EXPLODE it at spread=1. A
 * photograph of a whole burger cannot be pulled apart, and a photograph of an
 * exploded burger cannot be closed, because every layer was shot at its own angle.
 * Only the layer art does both. Photographs are for the menu cards, where the burger
 * never moves.
 *
 * ---------------------------------------------------------------------------
 * LICENCE
 * ---------------------------------------------------------------------------
 * Every photograph is from Pexels, under the Pexels licence: free to use, no
 * attribution required, modification permitted. We credit anyway —
 * public/products/CREDITS.md is generated from the SOURCES table below, so the
 * manifest cannot drift from what was actually downloaded.
 *
 * ---------------------------------------------------------------------------
 * WHY A CROP BOX AND A GRADE, AND NOT SIX DOWNLOADS
 * ---------------------------------------------------------------------------
 * The cards are `aspect-[4/3]` + `object-cover` on --ink, and the cart drawer crops
 * the SAME file to a 64px SQUARE. So the burger must sit horizontally centred, or
 * the drawer beheads it. Each photo therefore declares a focus box in normalised
 * source coordinates, and the crop is computed from the real decoded dimensions
 * rather than assumed.
 *
 * Six raw stock downloads do not read as one set — they were shot in six rooms under
 * six lights against six backgrounds. So every frame goes through ONE grade: the same
 * desaturation, the same contrast, the same warm ember wash from below, the same
 * vignette. Only `exposure` varies per photo, and only to bring six different
 * meterings onto one level.
 *
 * BUT — and this cost three of these six a rebuild — THE GRADE IS NOT WHAT MAKES THEM
 * A SET. An earlier version of this file claimed it was. It is not true, and the
 * pixels said so: a shared grade NUDGES colour, it cannot convert a grey studio
 * backdrop, a brown sweep or a gold plate into --ink (#0B0A09). Desaturating a beige
 * panel yields a duller beige panel, still glowing next to five black ones.
 *
 *   >> BACKGROUND IS A SOURCING CRITERION, NOT A GRADING ONE. <<
 *
 * Filter candidates on "was this shot on black/near-black" FIRST, before subject,
 * before composition, before anything. Every photo below earns its place by arriving
 * dark; the grade only harmonises what is already close. Judge a candidate at the
 * card's crop UNDER this grade — never in the search result, where everything looks
 * fine.
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'public/products');

const WIDTH = 1600;
const HEIGHT = 1200; // 4:3 — the card's box exactly.
const QUALITY = 0.82;

/** Above the fold on /menu with `priority` on the first cards. Keep them honest. */
const MAX_BYTES = 320 * 1024;

/**
 * slug -> the photograph, why it is that photograph, and how to frame it.
 *
 * `focus`  cx/cy = where the burger's centre sits in the source (0..1).
 *          zoom  = fraction of the source WIDTH the crop spans. Smaller = tighter.
 * `exposure` multiplies brightness. Only knob allowed to differ between photos.
 */
const SOURCES = {
  'charcoal-smash': {
    id: 10339423,
    photographer: 'Feyza Yıldırım',
    page: 'https://www.pexels.com/photo/burger-with-patty-10339423/',
    // "Two patties smashed thin. Aged cheddar, burnt onion jam, charcoal bun."
    // The only true charcoal bun in the pool, already shot on near-black, with an
    // amber onion jam under the melt. The card's words are all in the frame.
    why: 'Black charcoal sesame bun on near-black; melted cheddar and amber onion jam.',
    // cx is pushed right of the burger's own centre on purpose: a bright magenta cup
    // of pickled onion sits at the source's left edge and is the only saturated
    // non-ember thing in the whole set. Framing it out costs nothing.
    focus: { cx: 0.55, cy: 0.72, zoom: 0.8 },
    exposure: 1.12,
  },
  'double-flame': {
    id: 12325274,
    photographer: 'The Good Burger',
    page: 'https://www.pexels.com/photo/close-up-shot-of-a-cheeseburger-12325274/',
    // "Twice the beef, twice the cheese, twice the fire." Two patties and two slices
    // of cheese, both unmistakable, on a brioche bun — which is what the spec plate
    // says (`bun: brioche`). Both patties carry a real char line.
    why: 'Two beef patties and two cheese slices on a brioche bun, lit hard on near-black.',
    // Replaced 14709732 (Mounir Salah). That photo had the right SUBJECT — the stack
    // was correct and true to the copy — but it was shot against a brown studio sweep
    // and graded warm beige. It sat on the card as a pale panel next to five dark
    // ones. The grade could not rescue it and that is the whole point: desaturation,
    // contrast and a vignette MOVE colour, they do not replace a backdrop. Background
    // is a sourcing criterion, not a grading one. This one was shot on near-black to
    // begin with, so it needs no rescue.
    focus: { cx: 0.5, cy: 0.47, zoom: 0.84 },
    exposure: 1.06,
  },
  firebird: {
    id: 33254635,
    photographer: 'Alankrit Saini',
    page: 'https://www.pexels.com/photo/double-chicken-burger-33254635/',
    // "Buttermilk fried chicken, shattered crust, hot honey." The craggy crust is
    // the whole point of the card and this is the only shot where you can read it.
    why: 'Craggy buttermilk fried-chicken crust on a black plate.',
    // Cropped tighter than the rest (zoom 0.70 vs 0.82) for one reason: this frame's
    // bottom-left carries a pale grey plate-edge field and its bottom-right has fries,
    // so at the looser crop it read a shade lighter than the other five on the grid.
    // The extra crop drops both corners while keeping the shattered crust — the point
    // of the card — full-frame. cy nudged up slightly so the tighter box stays on the
    // crust rather than the plate.
    focus: { cx: 0.52, cy: 0.44, zoom: 0.7 },
    exposure: 0.97,
  },
  'cinder-lamb': {
    id: 11584930,
    photographer: 'Levent Tatli',
    page: 'https://www.pexels.com/photo/close-up-of-a-hamburger-11584930/',
    // "Lamb over open embers. Harissa, mint yogurt, toasted sesame."
    //
    // Matched word by word on everything a photograph can carry: a GRILLED, seared
    // patty (not fried); a red sauce over it reading as harissa; a white sauce beside
    // it reading as mint yogurt; and a bun visibly crusted with sesame seeds, which
    // is what the spec plate claims (`bun: sesame`). Shot on near-black.
    //
    // Replaced 34407507 (Ramon Rangel). That photo was a DEEP-FRIED BREADED cutlet on
    // a gold plate, which failed twice over: it contradicts "lamb over open embers"
    // outright, and its breaded crust collided head-on with `firebird`, whose entire
    // identity is the shattered buttermilk crust. Two cards cannot both be the fried
    // one. A charred patty is the only honest read of this copy.
    //
    // THREE shots were tried and rejected here before that, all for one reason — they
    // looked right in the search result and wrong at the card's crop and grade:
    //
    //   4628555  patties smoking on a grill. The 4:3 crop threw away the smoke and the
    //            grill, i.e. the entire reason it was chosen, leaving a soft bun.
    //   33920157 a burger in front of live flame. The flame's core is channel-clipped,
    //            and a clipped white has no hue to recover: lowering exposure walked it
    //            to neutral grey, which through the set's desaturation came out BEIGE.
    //            It read as cream, not fire.
    //   23744956 a burger with a flame plume behind it — the same clipped-core failure
    //            as 33920157, plus a cocktail pick and orange wrapping paper.
    //
    // The lesson every time: judge a photo AT THE CROP AND UNDER THE GRADE THE CARD
    // ACTUALLY USES, never in the search result.
    why: 'Seared grilled patty under a red harissa-like sauce and a white yogurt-like sauce, on a true sesame bun.',
    // zoom 0.86 rather than the full frame: the source has a scatter of out-of-focus
    // amber highlights across its top, and tightening the box pushes all but one out
    // of frame. The survivor is a single small ember-coloured point at the top left —
    // on a brand named for embers it reads as a spark, so it stays.
    focus: { cx: 0.5, cy: 0.6, zoom: 0.86 },
    exposure: 1.04,
  },
  inferno: {
    id: 35723478,
    photographer: 'Lucas Porras',
    page: 'https://www.pexels.com/photo/delicious-gourmet-burger-with-toppings-close-up-35723478/',
    // "Ghost pepper, charred jalapeño, chili oil. We warned you once."
    //
    // A hard-charred BEEF patty (`patty: beef`) under strips of blistered red chili,
    // everything under an oily gloss that reads as the chili oil. The heat is in the
    // frame rather than implied, and every solid in it is a vegetable — there is no
    // meat here except the patty itself.
    //
    // Replaced 6488939 (Piotr Arnoldes). Two independent defects: under its jalapeños
    // lay thin marbled deep-red slices that were cured meat of an INDETERMINATE kind —
    // plausibly pastrami or sujuk, plausibly pepperoni or bacon, and the photograph did
    // not say. On an Arabic brand that ambiguity is not worth a little chili legibility.
    // And it was the one source shot on a light grey table, so it broke the set's ink
    // surface no matter how tightly it was cropped.
    why: 'Charred beef patty under blistered red chili strips and an oily gloss, on black.',
    // The source is a macro and its full width is the frame; there is no looser crop to
    // take. Deliberately the tightest card of the six, which suits the one product whose
    // claim is pure heat.
    focus: { cx: 0.5, cy: 0.5, zoom: 1.0 },
    exposure: 1.12,
  },
  'green-ember': {
    id: 37881956,
    photographer: 'Sylwester Ficek',
    page: 'https://www.pexels.com/photo/close-up-of-a-gourmet-vegan-burger-with-black-background-37881956/',
    // "Grilled halloumi and mushroom. No meat, no apology."
    // "No meat" is the one claim on this menu a photograph can FALSIFY, so this was
    // chosen last and most carefully. Every "mushroom burger" result on Pexels had a
    // beef patty under the mushrooms — this is a genuinely meatless burger, shot on
    // pure black, with white cheese slices reading as the halloumi. No meat is in
    // the frame, so the card cannot contradict itself.
    why: 'Genuinely meatless burger on pure black; white cheese slices read as halloumi.',
    // cy sits above the burger's true centre so the mauve tabletop it stands on stays
    // below the frame edge.
    focus: { cx: 0.5, cy: 0.575, zoom: 0.82 },
    exposure: 1.04,
  },
};

/**
 * The slugs in supabase/seed.sql are authoritative, and `products` carries a CHECK
 * constraint pinning image_path to '/products/' || slug || '.jpg'. So this script may
 * emit exactly these six filenames: one missing file renders a broken image on /menu,
 * and one invented slug is a file nothing will ever request. Neither failure is
 * visible from inside this script's own output, so assert the set here rather than
 * trusting that SOURCES was edited carefully.
 */
const AUTHORITATIVE_SLUGS = [
  'charcoal-smash',
  'double-flame',
  'firebird',
  'cinder-lamb',
  'inferno',
  'green-ember',
];

{
  const have = Object.keys(SOURCES).sort();
  const want = [...AUTHORITATIVE_SLUGS].sort();
  const missing = want.filter((s) => !have.includes(s));
  const invented = have.filter((s) => !want.includes(s));
  if (missing.length || invented.length) {
    throw new Error(
      `SOURCES does not match the authoritative slugs in supabase/seed.sql.` +
        (missing.length ? ` Missing: ${missing.join(', ')}.` : '') +
        (invented.length ? ` Not a real product: ${invented.join(', ')}.` : ''),
    );
  }
  for (const [slug, s] of Object.entries(SOURCES)) {
    for (const key of ['id', 'photographer', 'page', 'why', 'focus', 'exposure']) {
      if (s[key] === undefined) throw new Error(`${slug}: SOURCES entry is missing \`${key}\``);
    }
  }
}

/**
 * ONE grade, applied identically to all six. This is the set.
 *
 * `saturate` pulls the six wildly different colour castes (a purple bar light, a
 * white kitchen table, a red neon) toward one temperature; the ember wash then puts
 * the brand's own warmth back from below, where the coals would be.
 */
const GRADE = {
  saturate: 0.86,
  contrast: 1.08,
};

const srcUrl = (id) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2400`;

async function download(id) {
  const res = await fetch(srcUrl(id), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for photo ${id}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // A 404 page saved as .jpg is the classic silent failure. Assert the magic bytes.
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    throw new Error(`photo ${id} is not a JPEG (${buf.length} bytes) — probably an error page`);
  }
  return buf;
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
await mkdir(OUT, { recursive: true });

const digests = new Map();
const report = [];

console.log('');

for (const [slug, spec] of Object.entries(SOURCES)) {
  const raw = await download(spec.id);

  const result = await page.evaluate(
    async ({ b64, focus, exposure, grade, W, H, quality }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('decode failed'));
        img.src = `data:image/jpeg;base64,${b64}`;
      });
      if (img.naturalWidth === 0) throw new Error('decoded to zero width');

      const sW = img.naturalWidth;
      const sH = img.naturalHeight;

      // Crop box, computed from the REAL decoded size, clamped inside the source.
      let sw = sW * focus.zoom;
      let sh = (sw * H) / W;
      if (sh > sH) {
        sh = sH;
        sw = (sh * W) / H;
      }
      const sx = Math.max(0, Math.min(sW - sw, focus.cx * sW - sw / 2));
      const sy = Math.max(0, Math.min(sH - sh, focus.cy * sH - sh / 2));

      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });

      ctx.fillStyle = '#0B0A09';
      ctx.fillRect(0, 0, W, H);

      ctx.filter = `saturate(${grade.saturate}) contrast(${grade.contrast}) brightness(${exposure})`;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      ctx.filter = 'none';

      // The coal: ember warmth rising from under the burger. soft-light keeps the
      // highlights on the food intact instead of staining them orange.
      const ember = ctx.createRadialGradient(W / 2, H * 1.02, 0, W / 2, H * 1.02, H * 0.95);
      ember.addColorStop(0, 'rgba(255,77,28,0.5)');
      ember.addColorStop(0.45, 'rgba(255,176,32,0.16)');
      ember.addColorStop(1, 'rgba(255,176,32,0)');
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = ember;
      ctx.fillRect(0, 0, W, H);

      // Charcoal the corners so the frame melts into --ink instead of ending on a seam.
      // This is doing most of the work of making six rooms look like one: it eats the
      // white kitchen table, the grey studio sweep and the tabletop edges that survive
      // the crop, and lands every card on the same --ink border.
      const vig = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.16, W / 2, H * 0.5, W * 0.7);
      vig.addColorStop(0, 'rgba(11,10,9,0)');
      vig.addColorStop(0.5, 'rgba(11,10,9,0.22)');
      vig.addColorStop(0.78, 'rgba(11,10,9,0.62)');
      vig.addColorStop(1, 'rgba(11,10,9,0.95)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // Mean luminance of the finished frame. If the photo silently failed to draw,
      // this is the flat #0B0A09 background and reads ~4. A real graded frame is
      // nowhere near that. This is the assertion that a green exit code is not.
      const { data } = ctx.getImageData(0, 0, W, H);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }

      return {
        dataUrl: c.toDataURL('image/jpeg', quality),
        srcW: sW,
        srcH: sH,
        luma: sum / (data.length / 4),
      };
    },
    {
      b64: raw.toString('base64'),
      focus: spec.focus,
      exposure: spec.exposure,
      grade: GRADE,
      W: WIDTH,
      H: HEIGHT,
      quality: QUALITY,
    },
  );

  const buf = Buffer.from(result.dataUrl.split(',')[1], 'base64');

  // ---- Assert on what actually landed. A script that exits 0 has verified nothing.
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    throw new Error(`${slug}: output is not a JPEG`);
  }
  if (result.luma < 12) {
    throw new Error(
      `${slug}: mean luminance ${result.luma.toFixed(1)} — the frame is essentially empty, ` +
        `the photograph did not draw`,
    );
  }
  if (result.luma > 200) {
    throw new Error(`${slug}: mean luminance ${result.luma.toFixed(1)} — blown out`);
  }
  if (buf.length > MAX_BYTES) {
    throw new Error(
      `${slug}: ${(buf.length / 1024).toFixed(0)}kb exceeds the ${MAX_BYTES / 1024}kb budget`,
    );
  }
  const digest = createHash('md5').update(buf).digest('hex');
  if (digests.has(digest)) {
    throw new Error(`${slug} is byte-identical to ${digests.get(digest)} — a crop never applied`);
  }
  digests.set(digest, slug);

  await writeFile(path.join(OUT, `${slug}.jpg`), buf);
  report.push({ slug, ...spec, bytes: buf.length, digest });

  console.log(
    `  ✓ public/products/${slug}.jpg  ${String((buf.length / 1024).toFixed(0)).padStart(3)}kb · ` +
      `src ${result.srcW}x${result.srcH} · luma ${result.luma.toFixed(1).padStart(5)} · ${digest.slice(0, 8)}`,
  );
}

await browser.close();

// Dimensions are asserted from the canvas contract above (every frame is drawn at
// exactly WIDTH x HEIGHT), and distinctness from the digest map. Both are now proven
// for all six or we threw.

const credits = `# Product photograph credits

<!-- Generated by scripts/product-photos.mjs. Do not edit by hand — re-run the script. -->

The six menu photographs in this directory are stock photography from **Pexels**, used
under the [Pexels licence](https://www.pexels.com/license/): free for commercial and
non-commercial use, no attribution required, modification permitted. Attribution is
given here anyway.

Each file is cropped to the card's 4:3 box and put through one shared grade
(desaturate ${GRADE.saturate} · contrast ${GRADE.contrast} · ember wash · vignette). Sources are downloaded
fresh from the Pexels CDN by the script; nothing here is scraped from any other site.

What actually makes the six read as one set is that **all six were shot on black or
near-black before we touched them**. The grade only harmonises what already matched.
An earlier revision of this file credited the grade for the set and shipped three
photos — a grey studio table, a brown sweep, a gold plate — that it could not rescue;
a shared grade nudges colour, it cannot replace a backdrop. Background is a sourcing
criterion, not a grading one.

| slug | photograph | photographer | why this photo |
|---|---|---|---|
${report
  .map((r) => `| \`${r.slug}\` | [${r.id}](${r.page}) | ${r.photographer} | ${r.why} |`)
  .join('\n')}

## Honest notes

Each note describes **the photograph that actually ships in this directory**, and
nothing else. Rejected candidates appear only where they are named as rejected.

- **\`cinder-lamb\`** — no photograph of a *lamb* burger exists on Pexels or Unsplash;
  both search engines fall back to generic beef for "lamb burger". A lamb patty in a
  bun is not visually distinguishable from beef, so the shipped shot does not
  contradict the copy — but it is not a photograph of lamb and nothing here claims it
  is. Everything else on the card is literally in the frame: the patty is grilled and
  seared rather than fried, the bun genuinely carries sesame seeds (\`BUN: Sesame\`), and
  the red and white sauces read as the harissa and the mint yogurt. The red sauce is
  more likely ketchup and the white one mayonnaise; they are the right colours in the
  right places, which is as far as stock photography goes. One small out-of-focus amber
  point sits at the top left; on a brand named for embers it reads as a spark and was
  left in.
- **\`green-ember\`** — no photograph of a *halloumi* burger exists on either site
  either. "No meat" is the one claim on this menu that a photograph can falsify, so
  this one was chosen last and most carefully: every Pexels "mushroom burger" result
  turned out to have a beef patty under the mushrooms. The shipped shot is a genuinely
  meatless burger with white cheese slices reading as halloumi. No meat is in the
  frame. It is not literally halloumi and mushroom.
- **\`inferno\`** — the patty is beef and the blistered red strips over it are chili;
  every solid in the frame is a vegetable. The copy also says *charred jalapeño*, and
  the green in the frame is guacamole, not jalapeño — it is the right colour in the
  right place, but it is not the named ingredient. That is the one soft spot on this
  card and it is a garnish, not a falsified claim.
- **\`double-flame\`** — two patties and two cheese slices, exactly as the copy says, on
  the brioche the spec plate names. Nothing about this card is a stretch.
- **\`charcoal-smash\`** — every word on the card is in the frame: the bun is genuinely
  charcoal-black, the cheddar is melted, the onion jam is under it. A few out-of-focus
  fries intrude at the right edge. They are dim and warm and read as part of the plate;
  the vignette takes most of them.
- **\`firebird\`** — the shattered buttermilk crust, the point of the card, fills the
  frame and is fully legible. This frame's bottom-left carried a soft pale-grey
  plate-edge field and its bottom-right had fries, so at the set's standard crop it
  read a shade lighter than its neighbours. It is therefore cropped tighter than the
  rest (zoom 0.70 vs 0.82), which drops both corners; what remains is the golden fried
  stack, which is intrinsically light-toned food rather than a stray background — an
  honest brightness, not a backdrop leaking in.
- Photographs showing bacon were rejected outright wherever it was unmistakable and
  avoidable: \`double-flame\` (28828556, 10761390), \`charcoal-smash\` (4628428),
  \`cinder-lamb\` (34407501, 22119687, 10922929).
`;

await writeFile(path.join(OUT, 'CREDITS.md'), credits);

console.log(`\n6 photographs written · all distinct · ${WIDTH}x${HEIGHT} · CREDITS.md regenerated.`);

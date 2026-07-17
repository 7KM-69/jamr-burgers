/**
 * Build the photographic ingredient-showcase layers.
 *
 *   node scripts/burger-photo-layers.mjs
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PRODUCES
 * ---------------------------------------------------------------------------
 *
 * Six PNGs in public/art/burger/photo/, each the FULL 1000x800 art canvas with a
 * real alpha channel, transparent nearly everywhere. Never trimmed to content:
 * the showcase's `yPercent` is a percentage of the element's own height and the
 * element IS the whole canvas, which is the only reason the explosion scales from
 * 390px to 1920px with no media queries. Crop a layer to its ingredient and that
 * silently breaks.
 *
 * ---------------------------------------------------------------------------
 * WHY TWO SOURCES
 * ---------------------------------------------------------------------------
 *
 * One frame would be ideal: one camera, one light, so the layers are guaranteed to
 * close. Pexels 14935009 gives four of the six that way. It cannot give the sixth:
 * its heel sits in crumpled parchment whose hue (~30) and saturation (0.52-0.85)
 * are indistinguishable from the bun crust's (~30-43, 0.38-0.54), and the paper
 * physically occludes the heel's bottom silhouette - that edge is not in the
 * photograph and could only be invented.
 *
 * The fix is NOT a foreign heel beside that frame's crown: the two bun halves are
 * on screen simultaneously in the exploded state, so a mismatched *pair* is the
 * most visible possible seam. Instead both halves come from ONE other frame - the
 * project's own direction reference, which carries a sesame crown and a
 * grill-marked heel on pure black from a single camera. The mismatch therefore
 * lands between bread and vegetables, which is far more forgiving than between the
 * top and bottom of the same bun.
 *
 * The reference's bacon is at y250-498, and the crown (92-229) and heel (829-965)
 * bands do not touch it. Cutting those bands excludes the pork structurally rather
 * than by retouching around it.
 *
 * ---------------------------------------------------------------------------
 * HOW THE MATTE WORKS
 * ---------------------------------------------------------------------------
 *
 * Both sources are ingredients lit against a near-black ground, so alpha is the
 * pixel's distance from that known ground, and the colour is UNPREMULTIPLIED
 * against it:
 *
 *     c = (observed - ground * (1 - a)) / a
 *
 * That is the difference between removing the dark spill and merely thresholding
 * it. A threshold leaves every edge pixel contaminated with the ground it was shot
 * on - a black fringe that reads as a cheap cut-out, worst of all on the lettuce,
 * whose frilly edge is almost entirely edge. Unpremultiplying reconstructs the
 * ingredient's own colour, so the lettuce lands clean.
 *
 * ---------------------------------------------------------------------------
 * HOW THE STACK IS REGISTERED
 * ---------------------------------------------------------------------------
 *
 * Every layer keeps its own ASPECT - nothing is ever squashed, because a squashed
 * bun reads as fake instantly - but each layer's body WIDTH and body CENTRE are
 * normalised onto the SVG set's own silhouette (`w` and `cy` below).
 *
 * Both sources are shot from a HIGHER CAMERA ANGLE than the vector art was drawn
 * at. The reference's heel shows its whole grill-marked top face, so its aspect is
 * 0.44 where the SVG heel's is 0.21; Mota's patty is 0.53 against the SVG's 0.19.
 * That has two consequences worth stating plainly:
 *
 *  1. The layers are chunky, so they overlap far more than the vector set does.
 *     That is correct, not a fudge: at this angle most of a layer's image height is
 *     its foreshortened TOP FACE, which the next layer up sits on and hides. Only
 *     the front crust/rim band shows - which is what a real burger looks like from
 *     slightly above.
 *  2. Scaled to a common size the crown and heel ALONE overrun the span the stack
 *     has to live in. The stage renders this canvas at clamp(16rem,34vw,30rem) -
 *     480x384 on desktop - and the yPercent ladder drifts +22%/-18% of its height,
 *     so a taller stack does not crop gracefully: it climbs out of a PINNED section
 *     and into the headline.
 *
 * Hence CENTRES, not a seating chain. Each body's centre is placed on the centre of
 * the SVG band for its role. An earlier version seated each layer against the one
 * below's top EDGE and chained the offsets; that is meaningless for 2.5D layers -
 * when a disc rests on another, their image centres differ only by the lower one's
 * thickness, not by the size of its ellipse - and the chained error put the patty
 * hanging below the heel. Centres are absolute, so no error can accumulate, and
 * every label still lands where geometry.ts says it does.
 *
 * Normalising width and centre preserves what actually sells "one photograph" - the
 * viewing ANGLE of each layer - while discarding what does not survive the
 * composite: the relative size of one leaf (Mota's lettuce is genuinely 1.85x his
 * patty's width, which assembles into an umbrella with a burger under it). That is
 * an art-direction choice and this is the honest name for it.
 *
 * The authored yPercent ladder is the scroll choreography the user explicitly asked
 * to preserve, so the art moves to fit it, never the other way round.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ART_W = 1000;
const ART_H = 800;

const REF = path.resolve(process.cwd(), 'docs/reference/exploded-burger-direction.jpg');
const MOTA = path.resolve(process.cwd(), 'docs/reference/source-pexels-14935009.jpg');
const OUT = path.resolve(process.cwd(), 'public/art/burger/photo');

/**
 * Sources, and the ground each was shot on.
 *
 * Alpha ramps between two colour-distances from that ground rather than dividing by
 * a single threshold, and `d0` is the reason. A ground is never one colour: Mota's
 * measures rgb(11,13,28) on average but ranges to rgb(23,20,37) in the corners,
 * which is a distance of ~17 from the mean. Divided by a single T=52 that is
 * alpha 0.33 — so every pixel of empty background inside the rect came out a third
 * opaque and each layer carried a faint RECTANGLE of dark wash around it. Invisible
 * on its own, obvious the moment six of them stack up on the ink.
 *
 *   d0 — at or below this distance the pixel IS the ground. Must clear its noise.
 *   d1 — at or above this the pixel is fully the ingredient.
 */
const SOURCES = {
  // Pure black (rgb 0,0,1), so the noise floor is nearly nil and the toe can be tight.
  ref: { file: REF, ground: [1, 1, 1], d0: 8, d1: 48 },
  mota: { file: MOTA, ground: [11, 13, 28], d0: 20, d1: 62 },
};

/**
 * Where each ingredient lives in its source frame, bottom of the stack first.
 *
 * The rects are deliberately GENEROUS - a rect that clips its ingredient puts a
 * hard rectangular edge through the art, which is exactly what a first pass here
 * produced. Every rect is verified against the band scans quoted above.
 *
 *   w  - target body width, art-canvas px: the SVG set's silhouette width for the
 *        role (geometry.ts centre-row spans).
 *   cy - target body centre, art-canvas px: the centre of the SVG set's band for
 *        the role. Height follows from `w` and the layer's natural aspect.
 */
const LAYERS = [
  // ref bands: crown y92-229 x211-523 . heel y829-965 x214-519 . bacon y250-498 (never touched)
  /**
   * top:829 is forced, and the top edge is allowed to touch.
   *
   * A lettuce frond hangs down from the layer above and tapers to a point at
   * (368, 828); the heel's apex begins at 829. There is no row that both excludes
   * the lettuce and leaves the bun a margin - so the choice is a green frond
   * embedded in the bun layer, or the bun's topmost row flush with the rect.
   *
   * The bun wins, because what it costs is nothing: the touched span is ~34px of a
   * 305px-wide body, on the extreme back rim - the part the patty sits on and
   * covers completely in the closed stack. A lettuce frond welded to the bun would
   * be visible in every exploded frame.
   */
  {
    key: 'bunBottom',
    out: 'bun-bottom.png',
    src: 'ref',
    rect: { left: 195, top: 829, width: 345, height: 145 },
    clipOk: ['top'],
    w: 671,
    cy: 578, // SVG band 509-647
  },
  {
    key: 'patty',
    out: 'patty.png',
    src: 'mota',
    rect: { left: 1000, top: 1360, width: 1560, height: 640 },
    w: 715,
    cy: 483, // SVG band 415-551
  },
  {
    key: 'cheese',
    out: 'cheese.png',
    src: 'mota',
    rect: { left: 1000, top: 840, width: 1600, height: 500 },
    w: 680,
    cy: 431, // SVG band 378-484
  },
  {
    key: 'tomato',
    out: 'tomato.png',
    src: 'mota',
    rect: { left: 1000, top: 2060, width: 1600, height: 470 },
    w: 686,
    cy: 368, // SVG band 333-403
  },
  /**
   * The lettuce's lowest fronds hang down IN FRONT OF Mota's own heel, so the
   * pixel count between them never reaches zero - there is no row to cut on. Stop
   * at 3855 and a flat rect edge runs through the frond tips, which is precisely
   * the frilly silhouette that makes the layer read as lettuce.
   *
   * So the rect runs past them to 4050 and a hue gate does the separating instead:
   * below the overlap the lettuce is unambiguously GREEN while the heel's cut face
   * (g-max(r,b) = -14) and the parchment (-66) are warm or neutral, so greenness
   * cuts cleanly where luminance cannot.
   *
   * The gate is confined to the overlap zone and ramped in over 40px. Applied to
   * the whole layer it would eat the leaves' near-neutral specular highlights and
   * punch holes in them; above the overlap, plain distance-to-ground is already
   * correct.
   */
  {
    key: 'lettuce',
    out: 'lettuce.png',
    src: 'mota',
    rect: { left: 560, top: 3150, width: 2500, height: 900 },
    w: 770,
    cy: 330, // SVG band 292-368
    gate: (x, y, r, g, b) => {
      // Fully green-only BEFORE the heel's white cut face appears at y=3865. An
      // earlier version ramped 3835->3875 and was still letting 25% through at
      // 3865, which smeared a grey ghost of the bun under the leaves.
      const Y0 = 3790, Y1 = 3845;
      if (y < Y0) return 1;
      const green = Math.max(0, Math.min(1, (g - Math.max(r, b)) / 18));
      const t = Math.min(1, (y - Y0) / (Y1 - Y0));
      return 1 - t + t * green;
    },
  },
  /**
   * Ends at y=229 - the crown's own last row - and the bottom edge is allowed to
   * touch, because nothing is lost by it: the rect stops exactly where the bun
   * stops. The bun's underside there is a flat cut face, a hard straight edge in
   * the photograph itself, and in the closed stack the lettuce covers it entirely.
   *
   * One row lower and the layer picks up the lettuce crumb dangling at y230-244,
   * which the speck filter cannot remove because it is CONNECTED to the bun's
   * silhouette. Two rows lower again and it would reach the bacon at y250.
   */
  {
    key: 'bunTop',
    out: 'bun-top.png',
    src: 'ref',
    rect: { left: 195, top: 70, width: 345, height: 160 },
    clipOk: ['bottom'],
    w: 651,
    cy: 219, // SVG band 118-319
  },
];

const SOLID = 200;

/**
 * Matte a rect out of a source: alpha from distance to the known ground,
 * unpremultiplied. An optional `gate` scales alpha per pixel, in SOURCE
 * coordinates - see the lettuce for why that is needed.
 */
async function cut({ file, ground, d0, d1 }, rect, gate) {
  const { data, info } = await sharp(file).extract(rect).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const out = Buffer.alloc(W * H * 4);

  for (let i = 0, j = 0; i < W * H; i++, j += C) {
    const r = data[j], g = data[j + 1], b = data[j + 2];
    const d = Math.sqrt((r - ground[0]) ** 2 + (g - ground[1]) ** 2 + (b - ground[2]) ** 2);
    let a = Math.max(0, Math.min(1, (d - d0) / (d1 - d0)));
    if (gate) a *= gate(rect.left + (i % W), rect.top + ((i / W) | 0), r, g, b);
    if (a > 0.93) a = 1;

    const o = i * 4;
    if (a === 0) continue; // the buffer is already zeroed
    out[o] = Math.max(0, Math.min(255, (r - ground[0] * (1 - a)) / a));
    out[o + 1] = Math.max(0, Math.min(255, (g - ground[1] * (1 - a)) / a));
    out[o + 2] = Math.max(0, Math.min(255, (b - ground[2] * (1 - a)) / a));
    out[o + 3] = Math.round(a * 255);
  }
  return { buf: out, W, H };
}

/**
 * Drop disconnected specks.
 *
 * The reference has a lettuce crumb dangling under the crown, and both JPEGs shed
 * the odd compression speck out in the ground. Neither is an ingredient, and a
 * stray green dot floating beside the bun in the exploded state reads as dirt on
 * the lens.
 *
 * The threshold is a FRACTION OF THE LARGEST component, not an absolute: the
 * tomato is legitimately two separate slices of comparable size, so "keep only the
 * biggest" would silently delete one of them. Everything dropped is logged - a
 * filter that removes something you did not expect is a filter you need to see.
 */
function dropSpecks(raw, key, minFraction = 0.02) {
  const { buf, W, H } = raw;
  const label = new Int32Array(W * H).fill(-1);
  const sizes = [];
  const stack = [];

  for (let start = 0; start < W * H; start++) {
    if (label[start] !== -1 || buf[start * 4 + 3] < 128) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % W, y = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const np = ny * W + nx;
        if (label[np] !== -1 || buf[np * 4 + 3] < 128) continue;
        label[np] = id;
        stack.push(np);
      }
    }
    sizes.push(size);
  }

  const biggest = Math.max(...sizes);
  const doomed = new Set(sizes.map((s, i) => (s < biggest * minFraction ? i : -1)).filter((i) => i >= 0));
  if (doomed.size) {
    const px = [...doomed].reduce((n, i) => n + sizes[i], 0);
    console.log(`     ${key}: dropped ${doomed.size} speck(s), ${px}px (largest kept: ${biggest}px)`);
  }
  for (let i = 0; i < W * H; i++) {
    if (label[i] >= 0 && doomed.has(label[i])) {
      buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = buf[i * 4 + 3] = 0;
    }
  }
  return raw;
}

/** The alpha bbox of a raw RGBA buffer, at SOLID threshold. */
function bbox({ buf, W, H }) {
  let top = null, bottom = null, left = 1e9, right = -1;
  for (let y = 0; y < H; y++) {
    let rowHas = false;
    for (let x = 0; x < W; x++) {
      if (buf[(y * W + x) * 4 + 3] >= SOLID) {
        rowHas = true;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    if (rowHas) { if (top === null) top = y; bottom = y; }
  }
  if (top === null) throw new Error('cut produced no solid pixels - check the rect');
  return { top, bottom, left, right, w: right - left + 1, h: bottom - top + 1 };
}

// ---------------------------------------------------------------------------
// 1. Cut every layer and measure its natural body.
// ---------------------------------------------------------------------------

console.log('Cutting layers from source frames...\n');
const cuts = {};
for (const L of LAYERS) {
  const raw = dropSpecks(await cut(SOURCES[L.src], L.rect, L.gate), L.key);
  const b = bbox(raw);

  // A body touching its rect edge means the rect clipped the ingredient.
  const ok = L.clipOk ?? [];
  const clipped = [];
  if (b.top === 0) clipped.push('top');
  if (b.bottom === raw.H - 1) clipped.push('bottom');
  if (b.left === 0) clipped.push('left');
  if (b.right === raw.W - 1) clipped.push('right');
  const bad = clipped.filter((side) => !ok.includes(side));
  if (bad.length) {
    throw new Error(`${L.key}: rect clips the ingredient on ${bad.join('/')} - widen it.`);
  }

  cuts[L.key] = { raw, b };
  console.log(`  ${L.key.padEnd(10)} ${L.src.padEnd(4)} body ${b.w}x${b.h}  (aspect ${(b.h / b.w).toFixed(2)})`);
}

// ---------------------------------------------------------------------------
// 2. Place each body on its target width + centre, and write the canvas.
// ---------------------------------------------------------------------------

await mkdir(OUT, { recursive: true });
console.log('');

let stackTop = Infinity;
let stackBottom = -Infinity;

for (const L of LAYERS) {
  const { raw, b } = cuts[L.key];
  const s = L.w / b.w;

  const bodyH = b.h * s;
  const bodyTop = L.cy - bodyH / 2;
  stackTop = Math.min(stackTop, bodyTop);
  stackBottom = Math.max(stackBottom, bodyTop + bodyH);

  /**
   * Trim the CUT to its body before resizing. The source rects are deliberately
   * generous, so scaled up they are wider than the canvas and sharp refuses to
   * composite them. Only this intermediate is trimmed - the OUTPUT is always the
   * full 1000x800 canvas, which is the contract the explosion depends on.
   *
   * The margin keeps the soft edge: `bbox` is measured at alpha>=200, and the
   * anti-aliased pixels that sell the cut live outside that boundary.
   */
  const M = 12;
  const x0 = Math.max(0, b.left - M);
  const y0 = Math.max(0, b.top - M);
  const cw = Math.min(raw.W, b.right + 1 + M) - x0;
  const ch = Math.min(raw.H, b.bottom + 1 + M) - y0;

  const resized = await sharp(Buffer.from(raw.buf), { raw: { width: raw.W, height: raw.H, channels: 4 } })
    .extract({ left: x0, top: y0, width: cw, height: ch })
    .resize({ width: Math.max(1, Math.round(cw * s)), height: Math.max(1, Math.round(ch * s)), kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  const left = Math.round(ART_W / 2 - (b.left - x0 + b.w / 2) * s);
  const top = Math.round(bodyTop - (b.top - y0) * s);

  const m = await sharp(resized).metadata();
  if (left < 0 || top < 0 || left + m.width > ART_W || top + m.height > ART_H) {
    throw new Error(
      `${L.key}: placed art (${m.width}x${m.height} at ${left},${top}) leaves the ${ART_W}x${ART_H} canvas.`,
    );
  }

  await sharp({
    create: { width: ART_W, height: ART_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, L.out));

  console.log(
    `  ${L.out.padEnd(15)} body ${L.w}x${bodyH.toFixed(0)} at y ${bodyTop.toFixed(0)}..${(bodyTop + bodyH).toFixed(0)}` +
      `  (resample x${s.toFixed(2)}${s > 1 ? ' UPSCALE' : ''})`,
  );
}

console.log(
  `\nStack spans y ${stackTop.toFixed(0)}..${stackBottom.toFixed(0)} ` +
    `(${(stackBottom - stackTop).toFixed(0)}px; the SVG set spans 118..647 = 529px).`,
);
console.log(`Wrote 6 layers -> ${path.relative(process.cwd(), OUT)}`);

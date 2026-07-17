/**
 * Derive the burger's label geometry from the art, and write it into
 * src/components/burger/geometry.ts.
 *
 *   node scripts/derive-burger-geometry.mjs
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * The ingredient showcase draws a leader line from each label to the layer it
 * names. That line only does its job if it actually ARRIVES: in an exploded
 * diagram the line IS the information — it is the only thing binding the word
 * "TOMATO" to the red disc rather than to the yellow one above it. A line that
 * stops 150px short does not read as a deliberate editorial rule. It reads as
 * unfinished, and the eye that follows it arrives nowhere.
 *
 * The first version made the line a constant (`w-12 xl:w-20`). A constant cannot
 * arrive, because the distance it has to cover is not a constant: it is
 *
 *     (the layer's silhouette edge)  −  (the label box's inner edge)
 *
 * and both of those move with the viewport, with the reading direction, and with
 * how far the layer has drifted in the explosion.
 *
 * The layer's silhouette edge is the hard part. Every layer's DOM element is the
 * FULL 1000x800 canvas — it is transparent almost everywhere and the ingredient is
 * painted somewhere in the middle of it. So `getBoundingClientRect()` in the
 * browser reports the canvas, never the burger, and there is no runtime API that
 * will tell you where the drawn pixels stop. Only the alpha channel knows, and you
 * can only ask it offline. That is this script.
 *
 * It emits, per layer, three numbers as FRACTIONS of the art canvas — resolution-
 * independent, so the component multiplies them by whatever width the stage
 * happens to be and gets pixels that are right at 1024 and right at 1920:
 *
 *   centreY   — the vertical middle of the layer's solid body. Where the label
 *               belongs, and therefore the row the line leaves from.
 *   edgeStart — the left edge of the solid body ON THAT ROW.
 *   edgeEnd   — the right edge of the solid body ON THAT ROW.
 *
 * Nothing here is authored. If the art moves, re-run and the diagram re-derives.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { measureLayers } from './measure-layers.mjs';

/** LayerKey (src/components/burger/layers.ts) -> art file. Keep in sync with BURGER_LAYERS. */
const LAYERS = {
  bunBottom: 'bun-bottom.svg',
  patty: 'patty.svg',
  cheese: 'cheese.svg',
  tomato: 'tomato.svg',
  lettuce: 'lettuce.svg',
  bunTop: 'bun-top.svg',
};

const ART_W = 1000;
const ART_H = 800;
const OUT = path.resolve(process.cwd(), 'src/components/burger/geometry.ts');

console.log('Measuring the burger art…');
const m = await measureLayers(Object.values(LAYERS));

const rows = Object.entries(LAYERS).map(([key, file]) => {
  const v = m[file];

  const centreY = v.centreY / ART_H;
  // +1 on the right edge: `centreRight` is the last solid pixel's index, and the
  // silhouette ends at the far side of it.
  const edgeStart = v.centreLeft / ART_W;
  const edgeEnd = (v.centreRight + 1) / ART_W;

  if (!(edgeEnd > edgeStart) || edgeStart < 0 || edgeEnd > 1) {
    throw new Error(`${file}: nonsense silhouette [${edgeStart}, ${edgeEnd}]`);
  }

  return { key, file, centreY, edgeStart, edgeEnd, raw: v };
});

const f = (n) => n.toFixed(4);

const body = rows
  .map(
    ({ key, file, centreY, edgeStart, edgeEnd, raw }) =>
      `  // ${file} — body ${raw.coreTop}-${raw.coreBottom}, centre row ${raw.centreY}, ` +
      `solid there from x=${raw.centreLeft} to x=${raw.centreRight}\n` +
      `  ${key}: { centreY: ${f(centreY)}, edgeStart: ${f(edgeStart)}, edgeEnd: ${f(edgeEnd)} },`,
  )
  .join('\n');

const file = `import type { LayerKey } from './layers';

/**
 * GENERATED — do not edit by hand.
 *   node scripts/derive-burger-geometry.mjs
 *
 * Where each ingredient actually IS inside its ${ART_W}x${ART_H} art canvas, measured
 * from the alpha channel of the SVG itself (scripts/measure-layers.mjs).
 *
 * Every value is a fraction of the canvas, so it survives every viewport: the stage
 * multiplies it by the burger's rendered width and gets pixels.
 *
 *   centreY    the vertical middle of the layer's solid body, 0 = top of canvas.
 *              The row a label sits on and a leader line leaves from.
 *   edgeStart  the left-hand edge of the solid body on that row, 0 = left of canvas.
 *   edgeEnd    the right-hand edge of the solid body on that row.
 *
 * These are the SILHOUETTE, not the element box. The element box is the whole
 * canvas and is transparent nearly everywhere — which is exactly why the browser
 * cannot measure this for itself and why this file has to exist.
 */
export type LayerArt = {
  centreY: number;
  edgeStart: number;
  edgeEnd: number;
};

export const LAYER_ART: Record<LayerKey, LayerArt> = {
${body}
};
`;

await writeFile(OUT, file, 'utf8');

console.log('');
console.table(
  Object.fromEntries(
    rows.map(({ key, centreY, edgeStart, edgeEnd }) => [
      key,
      { centreY: f(centreY), edgeStart: f(edgeStart), edgeEnd: f(edgeEnd) },
    ]),
  ),
);
console.log(`\n  ✓ ${path.relative(process.cwd(), OUT)}`);

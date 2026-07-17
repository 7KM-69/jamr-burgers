import type { LayerKey } from './layers';

/**
 * GENERATED — do not edit by hand.
 *   node scripts/derive-burger-geometry.mjs
 *
 * Where each ingredient actually IS inside its 1000x800 art canvas, measured
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
  // bun-bottom.svg — body 509-647, centre row 578, solid there from x=164 to x=835
  bunBottom: { centreY: 0.7225, edgeStart: 0.1640, edgeEnd: 0.8360 },
  // patty.svg — body 415-551, centre row 481, solid there from x=142 to x=857
  patty: { centreY: 0.6012, edgeStart: 0.1420, edgeEnd: 0.8580 },
  // cheese.svg — body 378-484, centre row 410, solid there from x=163 to x=843
  cheese: { centreY: 0.5125, edgeStart: 0.1630, edgeEnd: 0.8440 },
  // tomato.svg — body 333-403, centre row 367, solid there from x=157 to x=843
  tomato: { centreY: 0.4587, edgeStart: 0.1570, edgeEnd: 0.8440 },
  // lettuce.svg — body 292-368, centre row 333, solid there from x=113 to x=883
  lettuce: { centreY: 0.4163, edgeStart: 0.1130, edgeEnd: 0.8840 },
  // bun-top.svg — body 118-319, centre row 227, solid there from x=174 to x=825
  bunTop: { centreY: 0.2838, edgeStart: 0.1740, edgeEnd: 0.8260 },
};

import type { Dictionary } from '@/i18n';
import { LAYER_ART } from './geometry';

export type LayerKey = 'bunTop' | 'lettuce' | 'tomato' | 'cheese' | 'patty' | 'bunBottom';

/** The five labelled ingredients. The heel shares the bun's label. */
export type LabelKey = keyof Dictionary['stack']['layers'];

export type BurgerLayer = {
  key: LayerKey;
  src: string;
  /**
   * The i18n key for this layer's label, or null for the heel — the bun is one
   * ingredient in two pieces, and labelling it twice would be a lie about the
   * count in the headline ("five layers").
   */
  label: LabelKey | null;

  /**
   * Where the layer travels to when the stack pulls apart.
   *
   * Percentages, not pixels, and of the *element's own* height — every layer is
   * the full 1000x800 canvas, so `yPercent` is a percentage of the whole stage
   * and the separation therefore scales perfectly from 390px to 1920px with no
   * media queries and no recalculation on resize.
   */
  yPercent: number;
  /** Sideways fan. Multiplied by dirSign() so it mirrors in RTL. */
  xPercent: number;
  /** Degrees. Tiny — this is an exploded diagram, not a tornado. */
  rotate: number;

  /** Logical side. Alternates, so two adjacent labels can never collide. */
  side: 'start' | 'end';
};

/** A layer, plus where it ends up and where its silhouette is once it gets there. */
export type PlacedLayer = BurgerLayer & {
  /**
   * Vertical position of the layer's optical middle once it has drifted, as a
   * fraction of the stage height. This is where its label sits and where its
   * leader line leaves from.
   *
   * DERIVED, not authored: the art's own measured centre row (geometry.ts, read
   * out of the SVG's alpha channel) plus the layer's drift. The five numbers this
   * replaced were hand-fitted and happened to be close; the sixth would not have
   * been, and nobody would have noticed until it was in a screenshot.
   */
  anchor: number;
  /** That same middle BEFORE the layer drifts — a fraction of the art canvas. */
  centreY: number;
  /** The layer's silhouette on that row, as fractions of the art canvas. */
  edgeStart: number;
  edgeEnd: number;
};

/**
 * Order matters: this is paint order, bottom of the array on top of the stack.
 * Reversed visually by z-index below — the heel must paint first.
 */
export const BURGER_LAYERS: readonly BurgerLayer[] = [
  {
    key: 'bunBottom',
    src: '/art/burger/bun-bottom.svg',
    label: null,
    yPercent: 22,
    xPercent: 0,
    rotate: 0,
    side: 'end',
  },
  {
    key: 'patty',
    src: '/art/burger/patty.svg',
    label: 'patty',
    yPercent: 16,
    xPercent: 0.8,
    rotate: 0.8,
    side: 'start',
  },
  {
    key: 'cheese',
    src: '/art/burger/cheese.svg',
    label: 'cheese',
    yPercent: 7,
    xPercent: -1.4,
    rotate: -1.1,
    side: 'end',
  },
  {
    key: 'tomato',
    src: '/art/burger/tomato.svg',
    label: 'tomato',
    yPercent: -1,
    xPercent: 1.6,
    rotate: 1.2,
    side: 'start',
  },
  {
    key: 'lettuce',
    src: '/art/burger/lettuce.svg',
    label: 'lettuce',
    yPercent: -9,
    xPercent: -1.8,
    rotate: -1.4,
    side: 'end',
  },
  {
    key: 'bunTop',
    src: '/art/burger/bun-top.svg',
    label: 'bun',
    yPercent: -18,
    xPercent: 0,
    rotate: 0,
    side: 'start',
  },
];

/**
 * Where the layer lands, folded in from the art measurements.
 *
 * `yPercent` is a percentage of the element's own height, and every layer element
 * IS the whole art canvas — so the drift is the same fraction of the stage, and
 * `anchor` is just "where the art draws it" + "how far it moves". One addition, no
 * media queries, correct at every width.
 */
function place(layer: BurgerLayer): PlacedLayer {
  const art = LAYER_ART[layer.key];
  return {
    ...layer,
    anchor: art.centreY + layer.yPercent / 100,
    centreY: art.centreY,
    edgeStart: art.edgeStart,
    edgeEnd: art.edgeEnd,
  };
}

/** Only the layers that carry a label, top-down — the order the eye reads them. */
export const LABELLED_LAYERS: readonly (PlacedLayer & { label: LabelKey })[] = [...BURGER_LAYERS]
  .reverse()
  .filter((layer): layer is BurgerLayer & { label: LabelKey } => layer.label !== null)
  .map((layer) => ({ ...place(layer), label: layer.label }));

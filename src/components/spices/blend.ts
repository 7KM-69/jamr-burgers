import type { Dictionary } from '@/i18n';

/**
 * The rub, as geometry and arithmetic. The WORDS (name, note) are the other half
 * and live in the dictionary, because they are copy and they are translated.
 *
 * The two halves are bound by this key, and the binding is enforced below — the
 * same arrangement as locations/branches.ts, and for the same reason: a spice in
 * the dictionary with no share here would be a spoke pointing at nothing.
 */
export type SpiceKey = keyof Dictionary['spices']['spices'];

export interface Spice {
  key: SpiceKey;
  /** Percent of the rub, by weight. The nine must total 100 — asserted below. */
  share: number;
  /**
   * Where it sits on the wheel, in degrees clockwise from twelve o'clock.
   *
   * Derived, not authored: nine spokes, evenly spaced, in the order the rub is
   * weighed out. Hand-written angles would drift out of step with the list the
   * moment anyone reordered it.
   */
  angle: number;
}

/**
 * Reading order — heaviest first, so the wheel is weighed out from the top and
 * runs clockwise down through the trace ingredients. This is the source list; the
 * angles come from its length and the shares are checked against it.
 */
const SHARES: ReadonlyArray<readonly [SpiceKey, number]> = [
  ['pepper', 18],
  ['coriander', 14],
  ['cumin', 13],
  ['paprika', 12],
  ['fennel', 11],
  ['sumac', 10],
  ['cardamom', 8],
  ['chilli', 8],
  ['cinnamon', 6],
];

/**
 * A percentage that does not total 100 is a lie told with a number, and it is the
 * kind of lie nobody proofreads. Throwing at module load means it throws during
 * `next build` — so the wheel cannot ship claiming shares that do not add up.
 */
const total = SHARES.reduce((sum, [, share]) => sum + share, 0);
if (total !== 100) {
  throw new Error(`blend.ts: the nine shares must total 100%, not ${total}%.`);
}

const keys = SHARES.map(([key]) => key);
if (new Set(keys).size !== keys.length) {
  throw new Error('blend.ts: a spice is listed twice.');
}

export const BLEND: readonly Spice[] = SHARES.map(([key, share], i) => ({
  key,
  share,
  angle: (360 / SHARES.length) * i,
}));

/** The largest share, so the mobile bars can be scaled against the leader. */
export const MAX_SHARE = Math.max(...SHARES.map(([, share]) => share));

/**
 * Where a spice's label sits on the wheel, as a percentage of the stage.
 *
 * The ring is a CIRCLE, and a circle is symmetrical about the vertical axis — so
 * unlike the Riyadh plan in branches.ts there is no geography to protect and the
 * wheel could be mirrored harmlessly. It is not mirrored anyway, because there is
 * nothing to gain: the labels are text and read correctly in either direction on
 * their own. What DOES have to flip is which side of its own dot each label hangs
 * off, so the word grows away from the hub instead of across it — and that is
 * decided by `side` below, per label, from the angle.
 */
export function polar(angle: number, radius: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: 50 + radius * Math.cos(rad),
    y: 50 + radius * Math.sin(rad),
    /**
     * Right half of the wheel → the label runs outward to the right of its dot;
     * left half → outward to the left. PHYSICAL, like the map's `labelSide`: it is
     * a fact about which way is "away from the middle of this diagram", not about
     * which way the reader reads.
     */
    side: (Math.cos(rad) >= 0 ? 'right' : 'left') as 'left' | 'right',
  };
}

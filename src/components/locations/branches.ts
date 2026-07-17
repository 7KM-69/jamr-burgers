import type { Dictionary } from '@/i18n';

/**
 * Where the branches sit on the schematic — the GEOMETRY half of a branch. The
 * words (district, street, hours) are the other half and live in the dictionary,
 * because they are copy and they are translated.
 *
 * The two halves are bound by this key, and the binding is enforced below.
 */
export type BranchKey = keyof Dictionary['locations']['branches'];

export interface Branch {
  key: BranchKey;

  /**
   * Position on the plan, 0–100 of its width and height.
   *
   * !! These are PHYSICAL left/top, and that is deliberate. !!
   *
   * Everywhere else in this codebase a horizontal offset is a logical property
   * (`insetInlineStart`) or is multiplied by `dirSign()`, so that Arabic mirrors
   * the layout. A MAP MUST NOT MIRROR. Al Malqa is north of Al Olaya in both
   * languages; Qurtubah is east of it in both languages. Flipping the plan in RTL
   * would not translate the city, it would reflect it — and hand an Arabic reader
   * a diagram of a Riyadh that does not exist.
   *
   * This is the same rule the ingredient showcase already follows: the labels
   * mirror, the ART does not. Geography is art.
   */
  x: number;
  y: number;

  /**
   * Which physical side of its pin the label hangs off — also unmirrored, for the
   * same reason. It is set per-branch rather than computed, because the only thing
   * that decides it is whether the label would run off the edge of the plan, and
   * that is a fact about this arrangement of pins, not a rule.
   */
  labelSide: 'left' | 'right';

  /** Not open yet. Renders as a hollow ring and trades its hours for a badge. */
  soon?: boolean;
}

/**
 * A Record keyed by BranchKey, not an array — so a branch in the dictionary with
 * no pin here (or a pin here with no dictionary entry, or a typo in either) is a
 * COMPILE error rather than a marker silently missing from the map.
 */
const PINS: Record<BranchKey, Omit<Branch, 'key'>> = {
  olaya: { x: 38, y: 66, labelSide: 'right' },
  nakheel: { x: 62, y: 32, labelSide: 'right' },
  malqa: { x: 42, y: 12, labelSide: 'right' },
  // Far enough east that a right-hand label would run off the plan.
  qurtubah: { x: 84, y: 50, labelSide: 'left' },
  diriyah: { x: 12, y: 34, labelSide: 'right', soon: true },
};

/**
 * Reading order for the index: the flagship first, the unlit one last. This is an
 * editorial decision and has nothing to do with the geometry, which is why it is
 * a separate list.
 */
const ORDER: readonly BranchKey[] = ['olaya', 'nakheel', 'malqa', 'qurtubah', 'diriyah'];

/**
 * The type system checks that every key in ORDER is a real BranchKey. It cannot
 * check that every real BranchKey is IN ORDER — a `readonly BranchKey[]` is
 * perfectly happy to be short one. That gap is exactly big enough to lose a whole
 * branch out of the index while its pin still burns on the map, so close it here:
 * this throws at module load, which means it throws during `next build`.
 */
const missing = (Object.keys(PINS) as BranchKey[]).filter((key) => !ORDER.includes(key));
if (missing.length > 0 || new Set(ORDER).size !== ORDER.length) {
  throw new Error(
    `branches.ts: ORDER must list every branch exactly once. Missing: [${missing.join(', ')}].`,
  );
}

export const BRANCHES: readonly Branch[] = ORDER.map((key) => ({ key, ...PINS[key] }));

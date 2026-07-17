# ADR 0001 — The ingredient showcase stays on vector art

**Status:** Accepted · **Date:** 2026-07-17

## Context

The ingredient showcase is the signature scroll moment: six burger layers that sit closed
at `spread=0` and drift apart, labelled, at `spread=1`. It ships with hand-authored SVG
layers (`public/art/burger/*.svg`).

We tried to replace them with photographic layers, to match a reference image of an
exploded burger. The motion had to survive untouched — the drift ladder in
`src/components/burger/layers.ts` is the design, and it was not up for renegotiation.

## Decision

**Keep the SVG art.** The photographic version is abandoned, not deferred.

## Why — two independent blockers, both measured rather than assumed

### 1. Geometry: photographic layers cannot separate under this ladder

The ladder (`yPercent`: 22, 16, 7, −1, −9, −18) is tuned to the SVGs' *thin* profiles. It
produces inter-layer gaps of **6, 3, 39, 29 and 45 px**. Separation requires

```
(h_i + h_j) / 2  <  ~102 px
```

A camera ~20° above the subject sees each layer's foreshortened **top face**, so
photographic layers are **240–372 px** tall — two to six times the budget. They overlap at
full spread: the "exploded diagram" reads as a squashed stack. Restoring clean gaps needs
the burger rendered at **k < 0.20** — 13% of the canvas width. Absurd.

The SVG layers are not a stylistic choice that happens to work. They are *why* the ladder
works: a flat vector layer has no top face to foreshorten.

### 2. Sourcing: no free frame yields all six layers

Best candidate was Pexels 14935009 (Mario Mota, 3456×5184) — one camera, one light, no
pork, orange cheddar matching the i18n copy. **Five of six layers cut cleanly**, including
the lettuce (the hard case) via unpremultiplying against the known ground,
`c = (obs − bg·(1−a)) / a`, rather than thresholding.

The **heel** is unrecoverable from that frame:

- No matte exists. Bun crust reads H≈30–43 / S≈0.38–0.54; the parchment under it reads
  H≈28–31 / S≈0.52–0.85 — *identical hue, overlapping saturation*, and the bun's cut face
  is as desaturated as the paper. A saturation matte deletes part of the bun.
- Its bottom silhouette is **occluded** by the parchment. It cannot be extracted, only
  invented — and an invented layer beside five real ones, in the signature moment, is
  illustration wearing a photograph's clothes.

Substituting the bun pair from the low-resolution reference image (736×1075, JPEG on
black, no alpha) produced a **visible black halo** on the crown and visibly soft sesame —
next to a 3456 px patty, replacing *infinitely sharp vector*. That is a downgrade.

## Consequences

- The showcase renders from vector art and stays crisp at every viewport and DPR.
- `src` in `layers.ts` is the only coupling to the art, so this decision is a one-line
  revert if the blocker ever clears.
- The cut PNGs are kept on disk (`public/art/burger/photo/`, git-ignored) so the work is
  not lost. Reviving this needs **one asset**: a frame with both bun halves separated on a
  plain dark ground.
- `scripts/validate-layer-art.mjs` continues to prove the layer art closes. It writes to a
  throwaway directory and cannot touch `public/products/`.

## What generalises

The bar for replacing working art is **better**, not different. Both blockers were found by
rendering and looking — arithmetic caught the geometry, and the eye caught the halo. A
green build would have reported success for a stack whose layers silently overlap.

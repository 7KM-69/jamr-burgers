# Design decisions — JAMR

Decisions taken by `design` that deviate from, or resolve an ambiguity in, `CLAUDE.md`.
Recorded so no change is silent.

---

## 1. `--ash` is `#171513`, not `#17151300`

`CLAUDE.md` specifies `--ash: #17151300`. That is an 8-digit hex: the trailing `00` is an
**alpha channel of zero**, so every card surface and border painted with it would be fully
transparent — i.e. invisible.

Ruled a typo by the lead. Resolved to base `#171513` and expanded into a warm-grey ramp,
because one grey cannot serve as card fill, hairline border, and muted text at once:

| Token | Value | Use | Contrast on `--ink` |
|---|---|---|---|
| `--color-ash-100` | `#12100f` | deep card, one step off ink | — |
| `--color-ash-200` | `#171513` | **ash base** — card surface | — |
| `--color-ash-300` | `#201d1a` | raised / hover surface | — |
| `--color-ash-400` | `#2c2825` | hairline border, default | — |
| `--color-ash-500` | `#3d3733` | border, emphasised | — |
| `--color-ash-600` | `#6b615a` | **decorative only** | 3.2:1 — fails AA for text |
| `--color-ash-700` | `#9a8f86` | muted body text | 6.3:1 — passes AA |

`ash-600` is deliberately marked decorative-only in `globals.css`. It is the one grey in the
ramp that is tempting for secondary copy and would quietly fail accessibility.

Measured contrast for the rest of the palette on `--ink` (`#0b0a09`): `--bone` 16:1,
`--flame` 10.7:1, `--ember` 5.9:1 — all pass AA for body text. `--ink` on an `--ember` fill is
5.9:1, which is why the primary CTA is ink-on-ember rather than bone-on-ember.

## 2. Artwork is authored SVG, not photography

No photographic assets exist and no image-generation tool was reachable from this agent's
toolset. The burger is therefore **hand-authored vector art**: six cut-out layers on
transparent grounds (`public/art/burger/*.svg`), drawn on one shared `0 0 1000 800` canvas so
they stack with zero offset maths and separate with a pure `translateY`.

This is a deliberate art direction, not a stopgap: cut-out vector layers are what make the
ingredient showcase possible at all, they are resolution-independent, they carry no licensing
risk, and they let the ember rim-light be part of the artwork rather than a filter.

The swap path is cheap if photography arrives later: `BurgerStack` takes its layers from one
array (`src/components/burger/layers.ts`), each with a `src`. Replace the six `src` values
with cut-out PNGs and nothing else changes.

## 3. Language is cookie-driven, switched without a reload

`CLAUDE.md` requires `<html lang dir>` to flip and gives no routing scheme. Rather than
`/en` + `/ar` route trees (which would double every route and force `db`/`api` to care about
locale), the language is a cookie (`jamr_lang`) read server-side in `layout.tsx`, so the
correct `lang`/`dir` are in the **first byte of HTML** — no hydration flash for Arabic users.

The toggle then swaps in place: both dictionaries are small and already on the client, so it
sets the cookie, mutates `document.documentElement.lang`/`dir`, re-renders from context, and
calls `ScrollTrigger.refresh()` after the reflow settles. No navigation, no flash.

## 4. Non-home routes exist as designed stages, not stubs

Part 3 (page-transition shell) cannot be demonstrated or reviewed with only one route, and a
nav whose links 404 fails the polish bar on its own. So `/menu`, `/spices`, `/locations`,
`/contact`, `/account`, `/auth` and `404` ship now as real, in-brand route stages with real
copy from `src/i18n` — a title and a lede, correctly typeset in both languages. They are not
placeholders (no lorem, no TODO); later build parts fill them with their functionality.

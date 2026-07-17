/**
 * Screenshot protocol — CLAUDE.md.
 *
 *   node scripts/shot.mjs <NN-slug> [route] [options]
 *
 *   node scripts/shot.mjs 03-chrome /            --at-top
 *   node scripts/shot.mjs 04-hero  /             --section=hero --at-top
 *   node scripts/shot.mjs 05-stats /             --section=experience
 *   node scripts/shot.mjs 06-stack /             --section=stack --reduced
 *
 * =============================================================================
 * What this script is for, and why it is written the way it is
 * =============================================================================
 *
 * A screenshot is not evidence. A screenshot of a section that has finished
 * animating is evidence. Everything below exists to close the gap between those
 * two sentences, because this script has closed it wrongly three times and each
 * wrong answer shipped a picture that looked like proof and was not.
 *
 * ## The three failures, and the one defect underneath them
 *
 * The old check was: "scroll until an element matching `--until` is on screen and
 * `getComputedStyle(el).opacity >= 0.9`". It failed three ways:
 *
 *   1. `--until='[data-stat-rule]'`  The stat rules reveal with `scaleY`. Their
 *      opacity is 1 from the first frame to the last. The check was true before
 *      the animation began, and photographed `230 / KCAL` with `PROTEIN` floating
 *      above nothing.  →  NOT EVERY REVEAL TOUCHES OPACITY.
 *
 *   2. `--until='[data-count]'`  The counters are spans nested inside the
 *      `[data-animate]` wrapper that carries the fade. `getComputedStyle(span)
 *      .opacity` is `1` while the parent sits at `0`, because opacity is not
 *      inherited as a computed value — it composites. The check certified an
 *      element nobody could see, mid-count, reading 241 on its way to its target.
 *      →  A NODE'S OWN STYLE DOES NOT TELL YOU WHETHER IT IS ON THE SCREEN.
 *
 *   3. `--until='[data-animate]'`  That attribute exists in every section. The
 *      hero's are already revealed at rest, so "everything on screen matching it
 *      is revealed" was true at `scrollY = 0`. It photographed the hero, four
 *      times, under the filename of another section.
 *      →  A PROPERTY PROBE HAS NO IDEA WHICH SECTION IT IS LOOKING AT.
 *
 * The fourth selector would have been wrong for a fourth reason. The defect is
 * not the selector: it is that a hand-picked CSS property on a hand-picked node
 * is a PROXY for "this section is finished", and the proxy keeps breaking.
 *
 * ## What it does instead: two independent witnesses, and a tripwire
 *
 * WITNESS 1 — the page declares it, from GSAP's own playhead.
 *   Every animated section carries `data-section="<key>"` and publishes
 *   `data-motion="pending" | "ready"` on its own root. `motionGate()` in
 *   src/lib/gsap.ts drives that off `progress()` of the section's own animations,
 *   so a fade, a `scaleY`, a masked line, a count-up and a pinned scrub all
 *   report completion identically and this script never has to know which it is.
 *   A section with no `data-motion` at all is a hard FAILURE — "I cannot verify
 *   this" is a result, "I assumed it was fine" is not.
 *
 * WITNESS 2 — the rendered page agrees, computed here, independently.
 *   (a) COMPOSITED VISIBILITY, not computed opacity: `effectiveOpacity()` walks
 *       the ancestor chain and multiplies, and returns 0 for any `display:none` /
 *       `visibility:hidden` ancestor. This is what failure 2 needed.
 *   (b) COUNTERS HAVE ARRIVED: every `[data-count]` in the section must render
 *       EXACTLY `data-value + data-suffix`. A picture of a counter mid-count is a
 *       picture of a number no user will ever see. This is ground truth from the
 *       DOM and it does not care what GSAP claims.
 *   (c) NOTHING IS MOVING: a fingerprint of the computed transform / opacity /
 *       visibility of every element in the section (plus the counters' text) must
 *       be byte-identical across three consecutive samples. Catches Lenis still
 *       easing and a scrub still settling — the things the gate cannot see.
 *       Elements running a CSS animation are excluded from it, because the scroll
 *       tick breathes forever by design and would never let the page look still.
 *
 * Neither witness is sufficient alone, which is the whole point:
 *   · Stability alone certifies a section that has not STARTED — an untriggered
 *     section below the fold is perfectly still.
 *   · The gate alone trusts the code under test, and can fire while the page is
 *     still easing underneath it.
 *
 * TRIPWIRE — "I did not have to scroll" is a bug signal, not a success.
 *   Without `--at-top`, the section must be genuinely BELOW the fold at load. If
 *   it was already on screen at `scrollY = 0`, the run FAILS: whatever the check
 *   then proved, it did not prove it by finding the section. That is exactly how
 *   failure 3 produced four pictures of the hero.
 *
 * FRAMING — after readiness, the section is centred (or top-aligned if it is
 *   taller than the viewport) before the shutter opens. A section half out of
 *   frame is not a photograph of the section. For the pinned showcase this is a
 *   no-op: at the end of its pin it already fills the viewport exactly.
 *
 * Options
 *   --section=<key>  the section to photograph: `hero` | `origin` | `experience`
 *                    | `stack`, or a raw CSS selector. Required for anything
 *                    below the fold.
 *   --at-top         the section is on screen at rest (hero, nav). Suppresses the
 *                    tripwire and does not scroll.
 *   --click=<sel>    click this selector before verifying. REPEATABLE, in order.
 *                    See below.
 *   --full           full-page capture instead of the viewport
 *   --reduced        emulate prefers-reduced-motion: reduce
 *   --url=<origin>   defaults to http://localhost:3000
 *   --expect-status=<code>
 *                    the DOCUMENT itself must return this HTTP status. For the 404
 *                    page, and only for it. See below.
 *
 * ## --click, and why the cart is photographed by USING it
 *
 * A drawer does not exist until someone opens it, so part 9 needed a way to reach a
 * state the page only enters on interaction. Two options: seed the state (write
 * localStorage before boot), or perform the interaction.
 *
 * Seeding is a lie in the shape of a fixture. It proves the drawer can RENDER a cart
 * someone hand-wrote; it proves nothing about the add-to-cart button, the id the card
 * passes it, or whether those ids are the ones the database actually returned. The
 * bug that ships is always in the seam, not in the renderer.
 *
 * So `--click` performs the real gesture, on the real DOM, against the real six rows:
 *
 *   --click='[data-add="charcoal-smash"]' --click='[data-cart-open]'
 *
 * The first selector only matches if a card for the slug `charcoal-smash` rendered —
 * which only happens if Postgres returned that row. The screenshot is therefore
 * evidence of the whole chain, and a run against an empty grid FAILS at the click
 * instead of quietly photographing an empty state and calling it a cart.
 *
 * ## --expect-status, and why it is an assertion rather than a mute
 *
 * A custom 404 page must be served WITH a 404 status — that is the entire contract
 * between it and a crawler. Chromium logs every non-2xx response as a console
 * error, including the navigation response, so the one page on this site that is
 * behaving correctly was the only one this script failed: four console errors, all
 * of them the page being right.
 *
 * The temptation is to filter that string out. Don't: "Failed to load resource: 404"
 * is exactly what a genuinely missing chunk or a dead image also says, and muting it
 * blinds the harness to real breakage on every other route.
 *
 * So instead of believing the run less, believe it MORE. `--expect-status=404` says
 * what the document's status must be; the run FAILS if the status is anything else
 * (a 404 page quietly served as 200 is now a caught bug, which it was not before),
 * and only then are console errors whose source URL is that same document ignored —
 * a sub-resource that 404s still fails the run, because its URL is not the document's.
 *
 * Writes screenshots/NN-slug-{lang}-{viewport}.png for both languages and both
 * viewports — four files, and you are expected to look at all four.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const LANGS = ['en', 'ar'];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const LANG_COOKIE = 'jamr_lang';
const OUT_DIR = path.resolve(process.cwd(), 'screenshots');

/* --- search parameters ---------------------------------------------------- */

/** Furthest we will travel looking for a section before giving up. */
const SCROLL_BUDGET = 16000;
/** Wheel granularity. Lenis integrates the deltas, so smaller = more faithful. */
const STEP = 200;
/** Coarse phase: get the section into frame. */
const COARSE_BURST = 600;
/** Fine phase: creep, so we cannot overshoot the end of a pinned scrub. */
const FINE_STEP = 200;
/** How long a reveal is given to run at rest before we step again. */
const GRACE_MS = 4000;
const POLL_MS = 120;
/** How still is still: N identical fingerprints in a row. */
const STABLE_SAMPLES = 3;
/** Section is "in frame enough" to start waiting on it. */
const COVERAGE_SEARCH = 0.45;
/** Section is framed well enough to photograph. */
const COVERAGE_SHOOT = 0.92;
/** Framing is close enough. */
const FRAME_TOLERANCE_PX = 6;

const argv = process.argv.slice(2);
const flags = new Map(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = 'true'] = a.slice(2).split('=');
      return [k, v];
    }),
);
const positional = argv.filter((a) => !a.startsWith('--'));

/**
 * Collected separately from `flags`, and deliberately so, for two reasons:
 *   · `flags` is a Map, so a repeated --click would overwrite the previous one and
 *     only the last gesture would be performed — silently.
 *   · a selector contains '=' (`[data-add="firebird"]`), and the Map's split('=')
 *     would truncate it to `[data-add`, which matches nothing.
 * `slice()` keeps the whole value; the order in argv is the order they are clicked.
 */
const clicks = argv
  .filter((a) => a.startsWith('--click='))
  .map((a) => a.slice('--click='.length));

const slug = positional[0];
const route = positional[1] ?? '/';

if (!slug) {
  console.error(
    'usage: node scripts/shot.mjs <NN-slug> [route] [--section=<key>] [--at-top] [--full] [--reduced]',
  );
  process.exit(1);
}

const origin = flags.get('url') ?? 'http://localhost:3000';
const fullPage = flags.has('full');
const reduced = flags.has('reduced');
const atTop = flags.has('at-top');

const expectStatus = flags.has('expect-status') ? Number(flags.get('expect-status')) : 200;
if (!Number.isInteger(expectStatus)) {
  console.error(`--expect-status must be an integer, got "${flags.get('expect-status')}".`);
  process.exit(1);
}

const rawSection = flags.get('section') ?? null;
/** `--section=experience` is sugar for `[data-section="experience"]`. */
const sectionSel = rawSection
  ? /^[a-z][a-z0-9-]*$/i.test(rawSection)
    ? `[data-section="${rawSection}"]`
    : rawSection
  : null;

if (!sectionSel && !atTop) {
  console.error(
    'refusing to shoot: pass --section=<key> (what am I photographing?) or --at-top\n' +
      'A screenshot with nothing to verify against is not evidence.',
  );
  process.exit(1);
}

/* --- the page probe -------------------------------------------------------- *
 * One round trip returns everything both witnesses need. Runs in the page.
 * -------------------------------------------------------------------------- */

function probe(page, selector) {
  return page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document.body;
    if (!root) return { missing: true, matches: 0 };

    const matches = sel ? document.querySelectorAll(sel).length : 1;

    /**
     * Composited visibility. `getComputedStyle(el).opacity` is a LOCAL value: a
     * span reports 1 while its parent is at 0 and nothing is on the screen.
     * Opacity multiplies down the tree; this is the number that decides whether a
     * human can see the element.
     */
    const effectiveOpacity = (node) => {
      let o = 1;
      for (let n = node; n instanceof Element; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        o *= Number.parseFloat(cs.opacity || '1');
      }
      return o;
    };

    // --- counters: they must have ARRIVED, not merely be animating ----------
    // Only the ones actually in the frame: a counter three sections below the
    // camera is not part of the photograph, and it has not been triggered yet.
    const inFrame = (el) => {
      const rects = el.getClientRects();
      if (!rects.length) return false;
      const b = el.getBoundingClientRect();
      return b.top < window.innerHeight && b.bottom > 0;
    };

    const counters = [...root.querySelectorAll('[data-count]')].filter(inFrame).map((el) => ({
      text: (el.textContent ?? '').trim(),
      expected: `${el.dataset.value ?? ''}${el.dataset.suffix ?? ''}`,
      opacity: Number(effectiveOpacity(el).toFixed(3)),
    }));

    // --- fingerprint: is anything still moving? -----------------------------
    // Local, per-element properties only. An ancestor's CSS animation perturbs a
    // descendant's *rect* but never its own computed transform, so this cannot be
    // poisoned from above — which is why rects are deliberately not in here.
    let hash = 2166136261;
    const add = (s) => {
      for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    };

    for (const el of [root, ...root.querySelectorAll('*')]) {
      // The scroll tick is an infinite CSS keyframe animation. It is decoration,
      // it never settles, and including it would mean the page is never still.
      if (
        typeof el.getAnimations === 'function' &&
        el.getAnimations().some((a) => a.playState === 'running')
      ) {
        continue;
      }
      const cs = getComputedStyle(el);
      add(cs.transform);
      add(cs.opacity);
      add(cs.visibility);
    }
    for (const c of counters) add(c.text);

    const r = root.getBoundingClientRect();
    const vh = window.innerHeight;
    const framed = Math.min(r.height, vh);
    const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));

    return {
      missing: false,
      matches,
      motion: root instanceof HTMLElement ? (root.dataset.motion ?? null) : null,
      rootOpacity: Number(effectiveOpacity(root).toFixed(3)),
      top: Math.round(r.top),
      height: Math.round(r.height),
      viewport: vh,
      coverage: framed > 0 ? visible / framed : 0,
      passed: r.bottom < 0,
      counters,
      hash,
      scrollY: Math.round(window.scrollY),
    };
  }, selector);
}

/** Everything except stillness, which needs more than one sample. */
function verdict(p, scoped) {
  const reasons = [];
  if (scoped && p.motion !== 'ready') reasons.push(`data-motion="${p.motion}"`);
  if (scoped && p.rootOpacity < 0.99) reasons.push(`section composited opacity ${p.rootOpacity}`);
  for (const c of p.counters) {
    if (c.text !== c.expected) reasons.push(`counter reads "${c.text}", target "${c.expected}"`);
    if (c.opacity < 0.99) reasons.push(`counter "${c.text}" composited opacity ${c.opacity}`);
  }
  if (scoped && p.coverage < COVERAGE_SEARCH) {
    reasons.push(`only ${Math.round(p.coverage * 100)}% in frame`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Poll until the section is finished AND still — or until it is provably STUCK.
 *
 * The third return value is the one that makes this fast and honest: if the
 * fingerprint has not changed for STABLE_SAMPLES polls and the section still is
 * not ready, then nothing is running, and waiting longer cannot help. That is a
 * section whose ScrollTrigger has not fired yet, or a scrubbed timeline parked
 * mid-way — both need more SCROLL, not more time. Waiting the full grace period
 * on every one of those would turn the pinned showcase into a two-minute crawl,
 * and shortening the grace period instead would photograph a reveal mid-flight.
 */
async function pollFinish(page, selector, budgetMs) {
  const scoped = Boolean(selector);
  let last = null;
  let same = 0;
  const started = Date.now();

  for (;;) {
    const p = await probe(page, selector);
    const v = verdict(p, scoped);

    same = p.hash === last ? same + 1 : 1;
    last = p.hash;

    if (same >= STABLE_SAMPLES) {
      // Still, and finished: this is the frame to photograph.
      if (v.ok) return { done: true, idle: false, probe: p, reasons: [] };
      // Still, and not finished: nothing is animating. More time is not the answer.
      return { done: false, idle: true, probe: p, reasons: v.reasons };
    }

    if (Date.now() - started > budgetMs) {
      return { done: false, idle: false, probe: p, reasons: v.ok ? ['still moving'] : v.reasons };
    }

    await page.waitForTimeout(POLL_MS);
  }
}

/* --- scrolling ------------------------------------------------------------- */

/** Lenis owns the scroll position, so drive it with real wheel events. */
async function wheelBy(page, px) {
  const size = page.viewportSize();
  await page.mouse.move(size.width / 2, size.height / 2);

  const dir = Math.sign(px);
  const total = Math.abs(px);
  for (let sent = 0; sent < total; sent += STEP) {
    await page.mouse.wheel(0, dir * Math.min(STEP, total - sent));
    await page.waitForTimeout(24);
  }
}

/** Lenis keeps easing after the last wheel event. Wait for the page to stop. */
async function settle(page) {
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const start = window.scrollY;
        setTimeout(() => resolve(Math.abs(window.scrollY - start) < 0.5), 200);
      }),
    null,
    { timeout: 10000 },
  );
}

/**
 * Scroll until the section is finished. Two phases, and the split is not
 * cosmetic:
 *
 *   COARSE — bursts of 600px to bring the section into frame. Cheap; nothing to
 *   wait for yet.
 *
 *   FINE — 200px at a time, settling and polling after each step. This is what
 *   keeps the pinned showcase honest: its timeline reaches its end at exactly one
 *   scroll position (the last pixel of the pin), and a 600px burst would sail
 *   200-600px past it, leaving the section a quarter of the way off the top of
 *   the screen with no way back that does not rewind the scrub.
 */
async function reach(page, selector, label) {
  const first = await probe(page, selector);

  if (first.missing) throw new Error(`${label}: no element matches "${selector}".`);
  if (first.matches > 1) {
    throw new Error(
      `${label}: "${selector}" matches ${first.matches} elements. A section selector must be unique.`,
    );
  }
  if (first.motion === null) {
    throw new Error(
      `${label}: "${selector}" publishes no data-motion attribute, so there is no way to know ` +
        `whether its entrance has finished. Give the section a motionGate() (src/lib/gsap.ts).`,
    );
  }

  if (atTop) {
    const r = await pollFinish(page, selector, GRACE_MS);
    if (!r.done) {
      throw new Error(`${label}: --at-top, but the section is not finished: ${r.reasons.join('; ')}`);
    }
    return 0;
  }

  // The tripwire. If the section was already on screen before we moved, then
  // finding it "revealed" proves nothing about our ability to find it at all.
  if (first.top < first.viewport * 0.9) {
    throw new Error(
      `${label}: "${selector}" was already on screen at scrollY=0 (top ${first.top}px of a ` +
        `${first.viewport}px viewport). I did not have to scroll to reach it, so this run would ` +
        `prove nothing. If that is intended, pass --at-top.`,
    );
  }

  let travelled = 0;

  // Phase 1 — coarse: get it into frame. Nothing to wait for yet.
  for (;;) {
    const p = await probe(page, selector);
    if (p.coverage >= COVERAGE_SEARCH) break;
    if (travelled > SCROLL_BUDGET) {
      throw new Error(`${label}: scrolled ${travelled}px and "${selector}" never came into frame.`);
    }
    await wheelBy(page, COARSE_BURST);
    travelled += COARSE_BURST;
    await settle(page);
  }

  // Phase 2 — fine: creep, and after every step let the page stop and let any
  // reveal actually run before asking again.
  for (;;) {
    await settle(page);

    const r = await pollFinish(page, selector, GRACE_MS);
    if (r.done) return travelled;

    if (r.probe.passed) {
      throw new Error(
        `${label}: scrolled past "${selector}" and it never reported finished ` +
          `(data-motion="${r.probe.motion}").`,
      );
    }
    if (travelled > SCROLL_BUDGET) {
      throw new Error(
        `${label}: scrolled ${travelled}px and "${selector}" never finished: ${r.reasons.join('; ')}. ` +
          `Refusing to photograph whatever is under the camera instead.`,
      );
    }

    await wheelBy(page, FINE_STEP);
    travelled += FINE_STEP;
  }
}

/**
 * Put the section in the middle of the frame — or at the top of it, if it is
 * taller than the viewport.
 *
 * Scrolling BACK is safe: every entrance on this site is `once: true`, and the
 * one scrubbed timeline (the pinned showcase) is a pure function of scroll
 * position — so backing up to the last pixel of the pin lands it at exactly the
 * progress it was already at. For the same reason the correction there is
 * usually zero: at the end of its pin the section already fills the viewport.
 */
async function frame(page, selector, label) {
  for (let i = 0; i < 4; i++) {
    const p = await probe(page, selector);
    // Fits: centre it. Taller than the frame: start it at the top, so the shot is
    // reproducible and always begins where the section begins.
    const desiredTop = p.height + 48 <= p.viewport ? Math.round((p.viewport - p.height) / 2) : 0;
    const delta = p.top - desiredTop;

    if (Math.abs(delta) <= FRAME_TOLERANCE_PX) break;
    await wheelBy(page, delta);
    await settle(page);
  }

  /**
   * Park the cursor where it cannot hover anything.
   *
   * `wheelBy()` moves the mouse to the CENTRE of the viewport to send wheel events —
   * so at the moment the shutter opens, the cursor is sitting on whatever is in the
   * middle of the frame. On the menu that is a product card, and every grid
   * screenshot came back with exactly one of six cards in its hover state: flame-
   * filled button, lit rule, scaled photograph. It reads as an inconsistent design
   * rather than as the harness's own fingerprint on the picture.
   *
   * The rest state is what these shots are for. The hover state is real and can be
   * photographed deliberately; it should never arrive by accident.
   *
   * The wait is longer than the longest hover transition on the site (the 700ms image
   * scale) because an element with a RUNNING CSS transition is excluded from the
   * stability fingerprint by design — so the poll below would happily call the page
   * "still" while the un-hover is in mid-flight.
   */
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);

  const r = await pollFinish(page, selector, GRACE_MS);
  if (!r.done) throw new Error(`${label}: framing broke the end state: ${r.reasons.join('; ')}`);

  const p = r.probe;
  if (p.coverage < COVERAGE_SHOOT) {
    throw new Error(
      `${label}: only ${Math.round(p.coverage * 100)}% of the section is in frame (top ${p.top}px, ` +
        `height ${p.height}px, viewport ${p.viewport}px). That is not a photograph of it.`,
    );
  }
  return p;
}

/* --- the shot -------------------------------------------------------------- */

async function shoot(browser, lang, name, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });

  await context.addCookies([{ name: LANG_COOKIE, value: lang, url: origin }]);

  const page = await context.newPage();

  const url = `${origin}${route}`;

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // The document's own non-2xx status is reported here as a console error. When
    // that status is the one we ASSERTED below, it is the page working, not the page
    // failing — and the check is by source URL, so a sub-resource that 404s (a dead
    // chunk, a missing image) still has a different URL and still fails the run.
    if (expectStatus !== 200 && msg.location()?.url === url) return;
    errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const label = `${lang}/${name}`;

  const response = await page.goto(url, { waitUntil: 'networkidle' });

  const status = response?.status();
  if (status !== expectStatus) {
    throw new Error(
      `${label}: ${url} returned HTTP ${status}, expected ${expectStatus}. ` +
        `A 404 page served as 200 is not a 404 page.`,
    );
  }

  // Fonts first: shooting before they swap photographs the fallback face, and
  // every line length in the layout is wrong in that photo.
  await page.evaluate(() => document.fonts.ready);

  // Then the loader. It removes itself by setting display:none at the end of the
  // curtain; under reduced motion CSS never shows it at all.
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('[data-loader]');
        if (!el) return true;
        return getComputedStyle(el).display === 'none';
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {
      throw new Error(`${label}: the loader never cleared. Nothing below it can be photographed.`);
    });

  // The gestures that put the page into the state we came to photograph. Performed
  // after the loader is gone (it covers everything, so nothing under it is clickable)
  // and before any section is verified (the section may not exist until they land).
  //
  // A failing click is a HARD failure and must stay one: `[data-add="firebird"]` not
  // matching means the menu did not render that burger, which is precisely the bug
  // this whole harness exists to catch. Swallowing it here would photograph a closed
  // drawer over an empty grid and report success.
  for (const selector of clicks) {
    try {
      await page.click(selector, { timeout: 8000 });
    } catch {
      throw new Error(
        `${label}: --click='${selector}' matched nothing (or was not clickable) within 8s. ` +
          `If this is a product button, the menu did not render that product — which is the ` +
          `failure, not the click.`,
      );
    }
    // Let the resulting state land (a React re-render, then the GSAP timeline that
    // the state change starts). The real readiness check is still the gate below.
    await page.waitForTimeout(150);
  }

  let note = '';
  if (sectionSel) {
    const travelled = await reach(page, sectionSel, label);
    const p = await frame(page, sectionSel, label);
    note = `  (scrolled ${travelled}px · scrollY ${p.scrollY} · ${Math.round(p.coverage * 100)}% framed)`;
  } else {
    // No section to verify: the page must at least have stopped moving.
    await settle(page);
    const r = await pollFinish(page, null, GRACE_MS);
    if (!r.done) throw new Error(`${label}: page never settled: ${r.reasons.join('; ')}`);
    note = '  (page top, unscoped — no section was verified)';
  }

  const file = path.join(OUT_DIR, `${slug}-${lang}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`  ✓ ${path.relative(process.cwd(), file)}${note}`);

  if (errors.length) {
    console.warn(`  ! console errors (${label}):`);
    for (const e of errors) console.warn(`      ${e}`);
  }

  await context.close();
  return errors.length;
}

/* --- run ------------------------------------------------------------------- */

const browser = await chromium.launch();
await mkdir(OUT_DIR, { recursive: true });

console.log(
  `shooting ${slug} — ${origin}${route}` +
    (sectionSel ? ` — section ${sectionSel}` : '') +
    (reduced ? ' (reduced motion)' : ''),
);

let errorCount = 0;
try {
  for (const lang of LANGS) {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      errorCount += await shoot(browser, lang, name, viewport);
    }
  }
} finally {
  await browser.close();
}

if (errorCount > 0) {
  console.error(`\n${errorCount} console error(s). A part with console errors is not done.`);
  process.exit(1);
}
console.log('\ndone.');

/**
 * Screenshot pass for part 12 — the loyalty meter. It lives in two protected-ish
 * places: the /account page (needs a verified session) and the cart drawer (on
 * every route). Stock `scripts/shot.mjs` cannot inject a session, so this script
 * signs in through the REAL /auth form with a fixture account and then drives the
 * two mount sites, plus the signed-out drawer, for both languages and both
 * viewports.
 *
 *   node scripts/shot-loyalty.mjs [--reduced]
 *
 * Env:
 *   EMAIL / PASSWORD   the confirmed fixture to sign in as (defaults to the live
 *                      1-confirmed-order fixture — the real "1 / 5" state).
 *   SHOT_TAG           inserted into filenames (e.g. "reward" for the mocked
 *                      reward-available run). Empty by default.
 *
 * States captured:
 *   account     the full meter on /account (signed in)
 *   drawer      the compact meter in an open cart drawer (signed in)
 *   signedout   the drawer meter with no session — the "start the count" prompt
 *
 * A meter screenshot must show the coals LANDED, not stranded mid-ignite: the
 * account shots wait for the section's own data-motion="ready" gate (which only
 * flips once its entrance timeline has run to the end) before the shutter opens.
 * Console errors fail the run.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';
const OUT_DIR = path.resolve(process.cwd(), 'screenshots');
const reduced = process.argv.includes('--reduced');
const suffix = reduced ? '-reduced' : '';
const tag = process.env.SHOT_TAG ? `-${process.env.SHOT_TAG}` : '';

// Defaults to the live fixture the task provisioned: confirmed, exactly one
// confirmed order → getLoyaltyProgress() returns { 1, 1, 0 } → a real "1 / 5".
const EMAIL = process.env.EMAIL ?? 'ahmadmadi2006+jamr-co-1784191064483@gmail.com';
const PASSWORD = process.env.PASSWORD ?? 'EmberCoal-1784191064483';

const LANGS = ['en', 'ar'];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const LANG_COOKIE = 'jamr_lang';

let errorCount = 0;

/** Lenis owns the scroll position; wheel it back to the top so the (hide-on-scroll)
 *  nav is in view and the cart button is clickable. */
async function toTop(page, viewport) {
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, -1500);
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => window.scrollY < 2, null, { timeout: 5000 }).catch(() => {});
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
}

async function loaderGone(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-loader]');
      return !el || getComputedStyle(el).display === 'none';
    },
    null,
    { timeout: 15000 },
  );
}

/** Sign in through the real form once; return the storage state for reuse. */
async function signIn(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/auth`, { waitUntil: 'networkidle' });
  await loaderGone(page);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('[data-auth-submit]');
  await page.waitForURL(/\/account/, { timeout: 20000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

async function newContext(browser, lang, viewport, storageState) {
  const context = await browser.newContext({
    storageState,
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await context.addCookies([{ name: LANG_COOKIE, value: lang, url: ORIGIN }]);
  return context;
}

function watchErrors(page, label) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return () => {
    if (errors.length) {
      errorCount += errors.length;
      console.warn(`  ! console errors (${label}):`);
      for (const e of errors) console.warn(`      ${e}`);
    }
  };
}

async function shootAccount(browser, lang, name, viewport, storageState) {
  const label = `${lang}/${name}/account${suffix}`;
  const context = await newContext(browser, lang, viewport, storageState);
  const page = await context.newPage();
  const flush = watchErrors(page, label);

  await page.goto(`${ORIGIN}/account`, { waitUntil: 'networkidle' });
  await loaderGone(page);
  // The stage only reports ready once its entrance timeline (and, under motion,
  // the coal ignite it triggers) has landed. This is what keeps the shot off a
  // half-lit meter.
  await page.waitForFunction(
    () => document.querySelector('[data-section="account"]')?.getAttribute('data-motion') === 'ready',
    null,
    { timeout: 15000 },
  );
  // Let any hover/CSS transitions settle, park the cursor away from controls.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(700);

  const file = path.join(OUT_DIR, `12-loyalty-account${tag}-${lang}-${name}${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${path.relative(process.cwd(), file)}`);

  flush();
  await context.close();
}

async function shootDrawer(browser, lang, name, viewport, storageState, state) {
  const label = `${lang}/${name}/${state}${suffix}`;
  const context = await newContext(browser, lang, viewport, storageState);
  const page = await context.newPage();
  const flush = watchErrors(page, label);

  await page.goto(`${ORIGIN}/menu`, { waitUntil: 'networkidle' });
  await loaderGone(page);

  // Put a real burger in the cart so the drawer is a full order, not an empty one —
  // the meter band shows in either case, but a populated drawer is the honest frame.
  const slugs = await page.$$eval('[data-add]', (els) =>
    els.map((e) => e.getAttribute('data-add')).filter(Boolean),
  );
  if (slugs.length < 1) throw new Error(`${label}: menu rendered no add buttons`);
  await page.click(`[data-add="${slugs[0]}"]`);

  // The add-click auto-scrolled to the card, which hid the scroll-away nav. Bring
  // the page (and the cart button) back to the top before opening the drawer.
  await toTop(page, viewport);
  await page.click('[data-cart-open]');
  // The drawer publishes data-motion; wait for the open timeline to reach its end.
  await page.waitForFunction(
    () => document.querySelector('[data-section="cart"]')?.getAttribute('data-motion') === 'ready',
    null,
    { timeout: 15000 },
  );
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);

  const file = path.join(OUT_DIR, `12-loyalty-${state}${tag}-${lang}-${name}${suffix}.png`);
  await page.screenshot({ path: file }); // viewport — the drawer is fixed full-height
  console.log(`  ✓ ${path.relative(process.cwd(), file)}`);

  flush();
  await context.close();
}

const browser = await chromium.launch();
await mkdir(OUT_DIR, { recursive: true });
console.log(`shooting 12-loyalty${tag}${suffix} — signing in as ${EMAIL}`);

const storageState = await signIn(browser);

try {
  for (const lang of LANGS) {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      await shootAccount(browser, lang, name, viewport, storageState);
      await shootDrawer(browser, lang, name, viewport, storageState, 'drawer');
      // Signed-out drawer: no storage state, only on the un-tagged normal run
      // (the mocked reward run has nothing extra to say about the signed-out state).
      if (!tag && !reduced) {
        await shootDrawer(browser, lang, name, viewport, undefined, 'signedout');
      }
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

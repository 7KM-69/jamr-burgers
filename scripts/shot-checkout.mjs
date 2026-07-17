/**
 * Screenshot pass for /checkout (part 11). The protected page needs a verified
 * session, which stock `scripts/shot.mjs` has no way to inject — so this loads the
 * authenticated storage state saved by `scripts/drive-checkout.mjs` and drives the
 * real page through its three photographable states, for both languages and both
 * viewports:
 *
 *   form    the details form + provisional summary + the reward toggle
 *   error   local validation: empty name + malformed phone → banner + field errors
 *   review  the SERVER's priced summary (this places a real PENDING order)
 *
 *   node scripts/shot-checkout.mjs [--reduced]
 *
 * Console errors fail the run (a part with console errors is not done). The review
 * shots leave PENDING orders behind — harmless (pending never counts toward
 * loyalty), and the point is to prove the server priced the order, not to confirm
 * four of them.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';
const STATE_PATH = process.env.STATE_PATH ?? 'scripts/.checkout-state.json';
const OUT_DIR = path.resolve(process.cwd(), 'screenshots');
const reduced = process.argv.includes('--reduced');
const suffix = reduced ? '-reduced' : '';

const LANGS = ['en', 'ar'];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const LANG_COOKIE = 'jamr_lang';

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

async function motionReady(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-section="checkout"]')?.getAttribute('data-motion') === 'ready',
    null,
    { timeout: 15000 },
  );
  // Let the phase fade and any hover transitions settle, then park the cursor.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
}

/**
 * Return the page to the top before a fullPage capture. Lenis owns the scroll
 * position (it is not `window.scrollTo`-able), and a click on a control low in a
 * tall form leaves the page scrolled — which makes Playwright paint the FIXED nav
 * mid-document in the stitched fullPage image. Wheel-up events are honoured by both
 * Lenis and native scroll, so this drives it back to 0.
 */
async function toTop(page, viewport) {
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, -1500);
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => window.scrollY < 2, null, { timeout: 5000 }).catch(() => {});
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
}

let errorCount = 0;

async function run(lang, name, viewport, browser) {
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await context.addCookies([{ name: LANG_COOKIE, value: lang, url: ORIGIN }]);

  const page = await context.newPage();
  const label = `${lang}/${name}${suffix}`;
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  // Seed the cart with real burgers (the confirmed order cleared it). Real
  // gestures against the real six rows, so the ids are the ones the DB returned.
  await page.goto(`${ORIGIN}/menu`, { waitUntil: 'networkidle' });
  await loaderGone(page);
  const slugs = await page.$$eval('[data-add]', (els) =>
    els.map((e) => e.getAttribute('data-add')).filter(Boolean),
  );
  if (slugs.length < 2) throw new Error(`${label}: menu rendered ${slugs.length} add buttons`);
  await page.click(`[data-add="${slugs[0]}"]`);
  await page.click(`[data-qty-plus="${slugs[0]}"]`);
  await page.click(`[data-add="${slugs[1]}"]`);

  await page.goto(`${ORIGIN}/checkout`, { waitUntil: 'networkidle' });
  await loaderGone(page);
  await motionReady(page);

  const shoot = async (phase) => {
    await toTop(page, viewport);
    const file = path.join(OUT_DIR, `11-checkout-${phase}-${lang}-${name}${suffix}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ✓ ${path.relative(process.cwd(), file)}`);
  };

  // 1) FORM — clean (name prefilled from the account; phone/address empty).
  await shoot('form');

  // 2) ERROR — empty name + malformed phone, then submit for local validation.
  await page.fill('input[name="customerName"]', '');
  await page.fill('input[name="customerPhone"]', 'abc');
  await page.fill('textarea[name="customerAddress"]', '');
  await page.click('[data-checkout-submit]');
  await page.waitForSelector('[role="alert"]', { timeout: 5000 });
  await page.waitForTimeout(300);
  await shoot('error');

  // 3) REVIEW — fix the fields, place the order, wait for the server's summary.
  await page.fill('input[name="customerName"]', 'Test Diner');
  await page.fill('input[name="customerPhone"]', '+966 50 123 4567');
  await page.fill('textarea[name="customerAddress"]', 'Al Olaya, Tahlia Street, Building 12, Floor 3, Riyadh');
  await page.click('[data-checkout-submit]');
  await page.waitForSelector('[data-checkout-confirm]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
  await shoot('review');

  if (errors.length) {
    errorCount += errors.length;
    console.warn(`  ! console errors (${label}):`);
    for (const e of errors) console.warn(`      ${e}`);
  }

  await context.close();
}

const browser = await chromium.launch();
await mkdir(OUT_DIR, { recursive: true });
console.log(`shooting 11-checkout${suffix} — ${ORIGIN}/checkout`);

try {
  for (const lang of LANGS) {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      await run(lang, name, viewport, browser);
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

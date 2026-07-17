/**
 * One-off LIVE end-to-end drive of the checkout seam (part 11), against the real
 * Supabase project. NOT the screenshot protocol — a screenshot proves a form
 * renders; this proves an order lands.
 *
 *   node scripts/drive-checkout.mjs
 *
 * Email confirmation is ON for this project, so a fresh account cannot sign in
 * until its link is clicked. The project owner's inbox is reachable through the
 * `gws` Google Workspace CLI, so this script:
 *
 *   1. signs up a fresh plus-alias account through the real /auth form,
 *   2. polls Gmail (via `gws`) for the Supabase confirmation mail and opens its
 *      link — which confirms the address,
 *   3. signs in through the real form to establish a verified session,
 *   4. adds real burgers to the cart by clicking the real /menu buttons,
 *   5. drives /checkout: fills the form, places the PENDING order (server prices
 *      it), reviews the SERVER totals, confirms it, and reads the confirmed
 *      OrderSummary the RPC returned.
 *
 * It saves the authenticated storage state to scratch so the screenshot pass can
 * photograph the protected page without repeating the email dance. It prints the
 * created address so it can be removed from the Supabase dashboard (no
 * service-role key exists here to delete it from code).
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';
const STATE_PATH = process.env.STATE_PATH ?? 'scripts/.checkout-state.json';
const stamp = Date.now();
// Reuse an already-confirmed account when given one (avoids Supabase's signup
// rate limit and the email round trip); otherwise create + confirm a fresh one.
const REUSE = Boolean(process.env.EMAIL && process.env.PASSWORD);
const EMAIL = process.env.EMAIL ?? `ahmadmadi2006+jamr-co-${stamp}@gmail.com`;
const PASSWORD = process.env.PASSWORD ?? `EmberCoal-${stamp}`;
const NAME = 'Test Diner';

/**
 * Run a gws call and parse its JSON stdout. We invoke gws's own node entrypoint
 * with an ARGV ARRAY (not a shell string): PowerShell 5.1 strips the double quotes
 * out of an inline `--params '{"k":"v"}'`, but execFileSync hands argv straight to
 * the child with no shell in between, so the JSON survives intact.
 *
 * `gws` prints "Using keyring backend: keyring" to stderr; ignore stderr, parse
 * only stdout.
 */
const GWS_RUN = 'C:\\Users\\ahmad\\AppData\\Roaming\\npm\\node_modules\\@googleworkspace\\cli\\run.js';
function gws(argv) {
  const out = execFileSync('node', [GWS_RUN, ...argv], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function log(...a) {
  console.log(...a);
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

/** Poll Gmail for the confirmation mail to EMAIL and return its confirm URL. */
async function fetchConfirmLink() {
  for (let attempt = 0; attempt < 24; attempt++) {
    const list = gws([
      'gmail', 'users', 'messages', 'list',
      '--params', JSON.stringify({ userId: 'me', q: `to:${EMAIL} newer_than:1h`, maxResults: 1 }),
    ]);
    const id = list?.messages?.[0]?.id;
    if (id) {
      const msg = gws([
        'gmail', 'users', 'messages', 'get',
        '--params', JSON.stringify({ userId: 'me', id, format: 'full' }),
      ]);
      const url = extractLink(msg);
      if (url) return url;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('confirmation email never arrived within ~60s');
}

/** Walk the MIME parts, decode base64url bodies, find the Supabase verify link. */
function extractLink(msg) {
  const bodies = [];
  const walk = (part) => {
    if (!part) return;
    if (part.body?.data) {
      const buf = Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      bodies.push(buf.toString('utf8'));
    }
    for (const p of part.parts ?? []) walk(p);
  };
  walk(msg.payload);
  const text = bodies.join('\n');
  // Supabase confirmation links point at /auth/v1/verify?…redirect_to=…
  const m = text.match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]*/i);
  return m ? m[0].replace(/&amp;/g, '&') : null;
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  log(`\n=== live checkout drive ===`);
  log(`origin : ${ORIGIN}`);
  log(`email  : ${EMAIL}`);

  if (REUSE) {
    log(`step 1-2: reusing already-confirmed account (skipping signup + email)`);
  } else {
    /* 1. sign up --------------------------------------------------------- */
    await page.goto(`${ORIGIN}/auth`, { waitUntil: 'networkidle' });
    await loaderGone(page);
    await page.click('[data-mode="signup"]');
    await page.fill('input[name="fullName"]', NAME);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('[data-auth-submit]');
    await page.waitForURL(/\/auth\/check/, { timeout: 20000 });
    log(`step 1 : signed up — landed on /auth/check`);

    /* 2. confirm via email ----------------------------------------------- */
    const link = await fetchConfirmLink();
    log(`step 2 : confirmation link found`);
    await page.goto(link, { waitUntil: 'networkidle' }).catch(() => {});
    log(`         opened it — address confirmed`);
  }

  /* 3. sign in ----------------------------------------------------------- */
  await page.goto(`${ORIGIN}/auth`, { waitUntil: 'networkidle' });
  await loaderGone(page);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('[data-auth-submit]');
  await page.waitForURL(/\/account/, { timeout: 20000 });
  log(`step 3 : signed in — session established (on /account)`);

  /* 4. add real burgers to the cart -------------------------------------- */
  await page.goto(`${ORIGIN}/menu`, { waitUntil: 'networkidle' });
  await loaderGone(page);
  const slugs = await page.$$eval('[data-add]', (els) =>
    els.map((e) => e.getAttribute('data-add')).filter(Boolean),
  );
  if (slugs.length < 2) throw new Error(`menu rendered ${slugs.length} add buttons — expected 6`);
  // Two of the first burger, one of the second — a non-trivial subtotal. The add
  // button SWAPS to a qty stepper after the first unit, so the second unit is the
  // stepper's plus, not a second `data-add` click.
  await page.click(`[data-add="${slugs[0]}"]`);
  await page.click(`[data-qty-plus="${slugs[0]}"]`);
  await page.click(`[data-add="${slugs[1]}"]`);
  log(`step 4 : added to cart — 2×${slugs[0]}, 1×${slugs[1]}`);

  /* 5. drive checkout ---------------------------------------------------- */
  await page.goto(`${ORIGIN}/checkout`, { waitUntil: 'networkidle' });
  await loaderGone(page);

  await page.fill('input[name="customerName"]', NAME);
  await page.fill('input[name="customerPhone"]', '+966 50 123 4567');
  await page.fill('textarea[name="customerAddress"]', 'Al Olaya, Tahlia Street, Building 12, Floor 3, Riyadh');
  await page.click('[data-checkout-submit]');

  // The review step renders the server's numbers. Read them off the DOM.
  await page.waitForSelector('[data-checkout-confirm]', { timeout: 20000 });
  const reviewTotal = await page.textContent('[data-checkout-confirm]');
  log(`step 5 : order PLACED — review step reached (button: "${reviewTotal?.trim()}")`);

  await page.click('[data-checkout-confirm]');
  // Done phase renders the order reference.
  await page.waitForFunction(
    () => document.body.innerText.includes('#'),
    null,
    { timeout: 20000 },
  );
  const confirmedText = await page.locator('body').innerText();
  const refMatch = confirmedText.match(/#([0-9A-F]{8})/);
  log(`step 6 : order CONFIRMED — ref ${refMatch ? refMatch[0] : '(not parsed)'}`);

  await context.storageState({ path: STATE_PATH });
  log(`\nsaved authenticated storage state → ${STATE_PATH}`);
  writeFileSync(
    'scripts/.checkout-account.json',
    JSON.stringify({ email: EMAIL, password: PASSWORD }, null, 2),
  );
  log(`saved credentials → scripts/.checkout-account.json`);
  log(`\nconsole errors during run: ${consoleErrors.length}`);
  for (const e of consoleErrors) log(`   ! ${e}`);
  log(`\nNOTE: remove ${EMAIL} from the Supabase dashboard when done.`);
} catch (err) {
  log(`\nDRIVE FAILED: ${err.message}`);
  await page.screenshot({ path: 'scripts/.checkout-fail.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}

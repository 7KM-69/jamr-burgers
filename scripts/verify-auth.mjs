/**
 * One-off live verification of the real sign-up flow against the real Supabase
 * project. NOT part of the screenshot protocol — a screenshot proves a form
 * renders; this proves the button is wired to a database.
 *
 *   node scripts/verify-auth.mjs
 *
 * It drives the actual /auth form in a real browser: create-account tab, fill,
 * submit, and then reads where the app took the user.
 *
 *   → /auth/check   email confirmation is ON: the account was created and is
 *                   waiting on a link. Expected for this project.
 *   → /account      confirmation is OFF: sign-up returned a session and went
 *                   straight in. The same UI handles both.
 *
 * The address is a PLUS-ALIAS of the project owner's own inbox, so a confirmation
 * mail (if one is sent) lands with them and nobody else. There is no service-role
 * key in this codebase, so the created user cannot be deleted from here — the run
 * prints the address it used so it can be removed from the Supabase dashboard.
 */
import { chromium } from '@playwright/test';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';
const stamp = Date.now();
const EMAIL = `ahmadmadi2006+jamr-${stamp}@gmail.com`;
const PASSWORD = `EmberCoal-${stamp}`;
const NAME = 'Test Diner';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

function log(...args) {
  console.log(...args);
}

try {
  log(`\n=== live sign-up verification ===`);
  log(`origin   : ${ORIGIN}`);
  log(`email    : ${EMAIL}`);

  await page.goto(`${ORIGIN}/auth`, { waitUntil: 'networkidle' });

  // Wait for the loader curtain to lift, then switch to create-account.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-loader]');
    return !el || getComputedStyle(el).display === 'none';
  }, null, { timeout: 15000 });

  await page.click('[data-mode="signup"]');
  await page.fill('input[name="fullName"]', NAME);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);

  await page.click('[data-auth-submit]');

  // The action → server → router.push resolves to one of these two URLs.
  const outcome = await Promise.race([
    page.waitForURL(/\/auth\/check/, { timeout: 20000 }).then(() => 'check'),
    page.waitForURL(/\/account/, { timeout: 20000 }).then(() => 'account'),
  ]).catch(() => null);

  const finalUrl = page.url();
  log(`\nlanded on: ${finalUrl}`);

  if (outcome === 'check') {
    const heading = await page.locator('h1').first().innerText();
    log(`RESULT   : sign-up SUCCEEDED — email confirmation is ON.`);
    log(`           the app routed to the "check your inbox" screen ("${heading.replace(/\n/g, ' ')}").`);
    log(`           a confirmation link was sent to ${EMAIL}.`);
    log(`           /account cannot be reached until that link is clicked, so it`);
    log(`           was not screenshotted signed-in. This is a true result, not a failure.`);

    // Bonus: sign IN with the just-created, unconfirmed account and prove the
    // EMAIL_NOT_CONFIRMED path routes to the same screen (from=signin) rather than
    // flashing "wrong password".
    await page.goto(`${ORIGIN}/auth`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-loader]');
      return !el || getComputedStyle(el).display === 'none';
    }, null, { timeout: 15000 });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('[data-auth-submit]');
    const signinOutcome = await page
      .waitForURL(/\/auth\/check.*from=signin/, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    log(
      signinOutcome
        ? `           sign-in on the unconfirmed account correctly routed to /auth/check?from=signin.`
        : `           NOTE: sign-in on the unconfirmed account did NOT route to the check screen (url: ${page.url()}).`,
    );
  } else if (outcome === 'account') {
    const heading = await page.locator('h1').first().innerText();
    log(`RESULT   : sign-up SUCCEEDED and returned a session — email confirmation is OFF.`);
    log(`           landed on /account ("${heading.replace(/\n/g, ' ')}"). Screenshotting it.`);
    await page.screenshot({ path: 'screenshots/10-account-live-en-desktop.png' });
  } else {
    // Neither URL — an error banner is the likely outcome.
    const banner = await page.locator('[role="alert"]').first().innerText().catch(() => '');
    log(`RESULT   : sign-up did NOT navigate. On-screen message: "${banner.replace(/\n/g, ' ').trim()}"`);
    log(`           (this can mean the address domain was rejected by the signup validator.)`);
  }

  log(`\nconsole errors during run: ${consoleErrors.length}`);
  for (const e of consoleErrors) log(`   ! ${e}`);
} finally {
  await browser.close();
}

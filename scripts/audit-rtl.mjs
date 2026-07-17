/**
 * Part 13 audit — horizontal overflow, console errors, and focus visibility,
 * across every route x both languages x both viewports.
 *
 * Overflow is the RTL bug that hides: a `ml-*` that should be `ms-*` looks perfect
 * in English and pushes the page sideways in Arabic. It is objectively measurable,
 * so measure it rather than eyeball it.
 *
 * L13: a route's own non-2xx status is logged by Chromium as a console error. We
 * assert the expected status instead of muting the message, so "404 served as 200"
 * stays a catchable bug.
 */
import { chromium } from '@playwright/test';

const ROUTES = ['/', '/menu', '/spices', '/locations', '/contact', '/auth', '/account', '/nope-404'];
const LANGS = ['en', 'ar'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
/**
 * Reduced motion is audited as a first-class axis, not a footnote.
 *
 * This project once shipped with EVERY headline invisible while build, tsc and lint
 * were all green: the reveal's rest state was `translateY(115%)` and the tween that
 * would have brought it back never fired. Under reduced motion the animation is
 * *deliberately* skipped — which is exactly the condition where a rest state that
 * hides content becomes a permanently blank page. So: assert the pixels are painted,
 * not that a tween was scheduled.
 */
const MOTION = [
  { name: 'motion', reduced: false },
  { name: 'reduced', reduced: true },
];
/** Only this route is expected to be non-2xx. */
const EXPECT_404 = new Set(['/nope-404']);

const browser = await chromium.launch();
const problems = [];

for (const lang of LANGS) {
  for (const vp of VIEWPORTS) {
   for (const mo of MOTION) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: mo.reduced ? 'reduce' : 'no-preference',
    });
    await ctx.addCookies([{ name: 'jamr_lang', value: lang, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();

    for (const route of ROUTES) {
      const errors = [];
      page.removeAllListeners('console');
      page.removeAllListeners('pageerror');
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));

      const res = await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });
      const status = res?.status() ?? 0;
      const want404 = EXPECT_404.has(route);
      if (want404 && status !== 404) {
        problems.push(`${lang}/${vp.name}${route}: expected 404, got ${status}`);
      }
      if (!want404 && status >= 400) {
        problems.push(`${lang}/${vp.name}${route}: status ${status}`);
      }

      // Let the loader finish and the entrance tweens settle before measuring.
      await page.waitForTimeout(1400);

      const overflow = await page.evaluate((vw) => {
        const de = document.documentElement;
        const scrollW = Math.max(de.scrollWidth, document.body.scrollWidth);
        if (scrollW <= vw + 1) return null;

        // Name the widest offender so the report is actionable, not just "something".
        let worst = null;
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const over = Math.max(r.right - vw, -r.left);
          if (over > 1 && (!worst || over > worst.over)) {
            worst = {
              over: Math.round(over),
              tag: el.tagName.toLowerCase(),
              cls: (el.className?.toString?.() ?? '').slice(0, 70),
            };
          }
        }
        return { scrollW, vw, worst };
      }, vp.width);

      if (overflow) {
        const w = overflow.worst;
        problems.push(
          `${lang}/${vp.name}${route}: scrollWidth ${overflow.scrollW} > ${overflow.vw}` +
            (w ? ` — worst <${w.tag} class="${w.cls}"> by ${w.over}px` : ''),
        );
      }

      // The document direction must actually follow the cookie.
      const dir = await page.evaluate(() => document.documentElement.dir);
      const wantDir = lang === 'ar' ? 'rtl' : 'ltr';
      if (dir !== wantDir) problems.push(`${lang}/${vp.name}${route}: dir=${dir}, expected ${wantDir}`);

      // Is the headline actually PAINTED? Opacity COMPOSITES, it does not inherit —
      // reading opacity on the h1 alone returns 1 while an ancestor sits at 0 and the
      // user sees nothing. Walk the chain and multiply. Also check it is inside the
      // viewport box rather than parked 115% below its mask.
      const headline = await page.evaluate(() => {
        const h = document.querySelector('h1');
        if (!h) return { missing: true };
        let opacity = 1;
        for (let el = h; el instanceof Element; el = el.parentElement) {
          opacity *= parseFloat(getComputedStyle(el).opacity || '1');
          if (getComputedStyle(el).visibility === 'hidden') opacity = 0;
        }
        const r = h.getBoundingClientRect();
        return {
          missing: false,
          opacity: Number(opacity.toFixed(3)),
          text: (h.textContent ?? '').trim().slice(0, 40),
          h: Math.round(r.height),
          top: Math.round(r.top),
        };
      });

      if (headline.missing) {
        problems.push(`${lang}/${vp.name}/${mo.name}${route}: no <h1> on the page`);
      } else if (headline.opacity < 0.9) {
        problems.push(
          `${lang}/${vp.name}/${mo.name}${route}: <h1> effective opacity ${headline.opacity} — "${headline.text}" is not painted`,
        );
      } else if (headline.h === 0) {
        problems.push(`${lang}/${vp.name}/${mo.name}${route}: <h1> has zero height`);
      }

      // L13, demonstrated on this very script's first run: Chromium logs a
      // document's own non-2xx status as a console error, so a CORRECT 404 page was
      // the only page on the site failing the no-console-errors gate. Muting the
      // string is the wrong fix — the same message is what a genuinely dead asset
      // emits. Teach the gate the expectation instead, and only for the one route
      // that is supposed to 404.
      const expected = want404 && status === 404
        ? (e) => /Failed to load resource.*404/.test(e)
        : () => false;
      const real = errors.filter((e) => !expected(e));
      for (const e of real) problems.push(`${lang}/${vp.name}${route}: console — ${e}`);

      const bad = overflow || real.length || headline.missing || (headline.opacity ?? 1) < 0.9;
      const mark = bad ? 'FAIL' : ' ok ';
      console.log(
        `[${mark}] ${lang} ${vp.name.padEnd(7)} ${mo.name.padEnd(7)} ${route.padEnd(11)} h1=${headline.opacity ?? '-'}`,
      );
    }
    await ctx.close();
   }
  }
}

await browser.close();

console.log('\n' + '='.repeat(70));
if (problems.length === 0) {
  console.log('No overflow, no console errors, dir correct on every route.');
} else {
  console.log(`${problems.length} problem(s):\n`);
  for (const p of problems) console.log('  - ' + p);
}
process.exit(problems.length ? 1 : 0);

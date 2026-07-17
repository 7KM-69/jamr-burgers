/**
 * Part 14 — keyboard focus visibility.
 *
 * A visible focus ring is not "is there a :focus-visible rule in the CSS" — it is
 * "when a keyboard user tabs to this control, does a ring actually paint". So drive
 * real Tab presses and read the computed outline on whatever ends up focused.
 *
 * The trap this guards against: `outline-none` with no replacement. It looks fine
 * with a mouse and strands a keyboard user with no idea where they are.
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const problems = [];

for (const route of ['/', '/menu', '/auth']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  let checked = 0;
  let withRing = 0;

  // Walk the first 20 tab stops. Enough to cover nav, lang toggle, cart, and the
  // first interactive elements of the page body.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      // A boxShadow or ring counts too — some components ring that way.
      const hasShadowRing = s.boxShadow !== 'none' && s.boxShadow !== '';
      const tag = el.tagName.toLowerCase();
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
      return { tag, label, visible: hasOutline || hasShadowRing };
    });
    if (!info) continue;
    // Only judge genuinely interactive stops.
    if (!['a', 'button', 'input', 'select', 'textarea'].includes(info.tag)) continue;
    checked++;
    if (info.visible) withRing++;
    else problems.push(`${route}: <${info.tag}> "${info.label}" focused with NO visible ring`);
  }

  console.log(`${route.padEnd(8)} ${withRing}/${checked} focus stops show a ring`);
  await ctx.close();
}

await browser.close();
console.log('\n' + '='.repeat(60));
if (problems.length === 0) {
  console.log('Every interactive focus stop paints a visible ring.');
} else {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log('  - ' + p);
}
process.exit(problems.length ? 1 : 0);

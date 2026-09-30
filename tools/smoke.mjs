// End-to-end checks in headless Chromium:
//  1. Cold boot (cleared storage, no dev flags) on a phone viewport, played
//     through one full job with real touch taps. Composited screenshots saved.
//  2. Dev boot for ~10s: sim time advances, no console errors.
//  3. Stills sweep over every screen from the game's own registry; fails on
//     blank frames.
// Usage: node tools/smoke.mjs [--quick]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'notes', 'captures');
fs.mkdirSync(OUT, { recursive: true });
const quick = process.argv.includes('--quick');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const g = execSync('npm root -g').toString().trim();
  return await import(path.join(g, 'playwright', 'index.mjs'));
}

const { chromium } = await loadPlaywright();
const PORT = 8765;
const server = await serve(PORT);
const BASE = `http://localhost:${PORT}/`;
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };

const exe = fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function newPage() {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

// Real touch at the centre of an element.
async function tap(page, selector) {
  const el = page.locator(selector).first();
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
}

async function lumaStats(page, buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 200; c.height = Math.round((img.height / img.width) * 200);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; sum += l; sum2 += l * l; n++; }
    const mean = sum / n;
    return { mean, std: Math.sqrt(sum2 / n - mean * mean) };
  }, buf.toString('base64'));
}

async function shot(page, name, { full = false } = {}) {
  const buf = await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  const st = await lumaStats(page, buf);
  check(st.mean > 2 && st.std / 255 > 0.02, `${name}: non-blank (mean ${st.mean.toFixed(0)}, std ${st.std.toFixed(1)})`);
  return buf;
}

// ---------------------------------------------------------------- 1. cold boot
console.log('1. Cold boot, real touch play-through');
{
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE);
  await page.waitForFunction(() => window.__crimedogBooted);
  check((await page.locator('[data-act="new-game"]').count()) === 1, 'title shows New Game on cold boot');
  check((await page.locator('#diag').isHidden()), 'no dev overlay without flag');
  await shot(page, '01-title');
  await tap(page, '[data-act="new-game"]');
  await shot(page, '02-intro');
  await tap(page, '[data-act="start"]');
  check(await page.locator('main[data-screen="job"]').count() === 1, 'job screen after intro');
  await shot(page, '03-job');
  await tap(page, '.nav [data-to="pub"]');
  await shot(page, '04-pub');
  // Hire the two cheapest dogs we can afford.
  const fees = await page.$$eval('main .dog-card .fee', (els) => els.map((e) => Number(e.textContent.replace(/[^0-9]/g, ''))));
  const order = fees.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  let hired = 0;
  for (const i of order.slice(0, 3)) {
    await tap(page, `main .dog-card >> nth=${i - hired}`);
    if (hired === 0) await shot(page, '05-dog-modal');
    const hireBtn = page.locator('.modal [data-act="hire"]');
    if (await hireBtn.count() && await hireBtn.isEnabled()) { await tap(page, '.modal [data-act="hire"]'); hired++; }
    if (await page.locator('.modal').count()) await tap(page, '.modal .close');
    if (hired >= 2) break;
  }
  await tap(page, '.nav [data-to="crew"]');
  const crewCount = await page.locator('main .dog-card.hired').count();
  check(crewCount >= 2, `hired crew via taps (${crewCount} on crew incl. old mate)`);
  await shot(page, '06-crew');
  await tap(page, '.nav [data-to="kit"]');
  await tap(page, '[data-act="buy"][data-kit="lockpicks"]');
  await tap(page, '[data-act="buy"][data-kit="bags"]');
  await shot(page, '07-kit');
  await tap(page, '.nav [data-to="job"]');
  await tap(page, '[data-act="pick"][data-purpose="case"]');
  await tap(page, '.modal [data-act="picked"] >> nth=0');
  check((await page.locator('.intel.known').count()) >= 1, 'casing the joint revealed intel');
  await tap(page, '[data-act="go"][data-to="plan"]');
  await tap(page, '[data-act="autoplan"]');
  await shot(page, '08-plan');
  await shot(page, '08b-plan-full', { full: true });
  await tap(page, '[data-act="pull"]');
  check(await page.locator('main[data-screen="heist"]').count() === 1, 'heist playback screen');
  await tap(page, '[data-act="heist-toggle"]'); // pause
  for (let k = 0; k < 5; k++) if (await page.locator('[data-act="heist-step"]').count()) await tap(page, '[data-act="heist-step"]');
  await shot(page, '09-heist');
  if (await page.locator('[data-act="heist-skip"]').count()) await tap(page, '[data-act="heist-skip"]');
  await shot(page, '10-heist-end');
  await tap(page, '[data-act="resolve"]');
  check(await page.locator('main[data-screen="aftermath"]').count() === 1, 'aftermath screen');
  await shot(page, '11-aftermath');
  if (await page.locator('[data-act="fence"]:not([disabled])').count()) await tap(page, '[data-act="fence"]:not([disabled])');
  await tap(page, '[data-act="pay"][data-pct="30"]');
  check(await page.locator('[data-grade]').count() === 1, 'graded');
  await shot(page, '12-grade');
  await tap(page, '[data-act="next-job"]');
  check(await page.locator('main[data-screen="job"], main[data-screen="over"]').count() === 1, 'next job or game over');
  // Reload: save persists
  await page.reload();
  await page.waitForFunction(() => window.__crimedogBooted);
  check(await page.locator('[data-act="continue"]').count() === 1, 'continue offered after reload');
  check(errors.length === 0, `no console errors on cold path (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1b. short viewport modal
console.log('1b. Profile close button stays reachable with browser toolbars showing');
{
  const ctx = await browser.newContext({ ...phone, viewport: { width: 375, height: 560 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?dev=1&seed=3`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { document.getElementById('diag').hidden = true; window.cd.teleport('pub'); });
  await tap(page, 'main .dog-card');
  await page.waitForTimeout(300);
  const at = async () => page.evaluate(() => { const r = document.querySelector('.modal .close').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
  const a = await at();
  check(a.top >= 24 && a.bottom <= a.vh, `close button on screen at open (top ${a.top})`);
  await page.evaluate(() => { const m = document.querySelector('.modal'); m.scrollTop = m.scrollHeight; });
  await page.waitForTimeout(150);
  const b = await at();
  check(b.top >= 24 && b.bottom <= b.vh, `close button still on screen after scrolling (top ${b.top})`);
  await shot(page, 'modal-short-viewport');
  const box = await page.locator('.modal .close').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  check((await page.locator('.modal').count()) === 0, 'tapping ✕ closes the profile');
  await ctx.close();
}

// ---------------------------------------------------------------- 2. dev boot
console.log('2. Dev boot: sim time advances');
{
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}?dev=1&seed=42`);
  await page.waitForFunction(() => window.cd);
  const a = await page.evaluate(() => window.cd.getState());
  await page.waitForTimeout(quick ? 2000 : 10000);
  const b = await page.evaluate(() => window.cd.getState());
  check(b.simTime > a.simTime + 1, `sim time advanced ${a.simTime} -> ${b.simTime}`);
  check(b.frames > a.frames, 'frames advanced');
  check(a.invariants.length === 0, 'state invariants hold');
  // freeze / step
  await page.evaluate(() => { window.cd.freeze(); });
  const f1 = await page.evaluate(() => window.cd.getState().simTime);
  await page.waitForTimeout(400);
  const f2 = await page.evaluate(() => window.cd.getState().simTime);
  check(f1 === f2, 'freeze() stops sim time');
  await page.evaluate(() => window.cd.step(10));
  const f3 = await page.evaluate(() => window.cd.getState().simTime);
  check(Math.abs(f3 - f2 - 10 / 60) < 0.01, 'step(10) advances exactly 10 fixed steps');
  // deterministic replay: same seed, same heist
  const r1 = await page.evaluate(() => { window.cd.setSeed(7); window.cd.teleport('heist'); window.cd.step(500); return window.cd.getState().heist; });
  const r2 = await page.evaluate(() => { window.cd.setSeed(7); window.cd.teleport('heist'); window.cd.step(500); return window.cd.getState().heist; });
  check(JSON.stringify(r1) === JSON.stringify(r2), `seeded heist replays identically (${r1.outcome}, ${r1.beats} beats)`);
  check(r1.beat === r1.beats - 1, 'step() plays heist to the end');
  const w = await page.evaluate(() => { window.cd.setSeed(11); return window.cd.win(); });
  check(w === 'S', `win() yields a perfect grade (${w})`);
  await page.evaluate(() => window.cd.resume());
  check(errors.length === 0, `no console errors in dev boot (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 3. stills sweep
console.log('3. Stills sweep over every screen');
{
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}?dev=1&seed=2024`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => document.getElementById('diag').hidden = true);
  const screens = await page.evaluate(() => window.cd.screens());
  const order = ['title', 'intro', 'job', 'pub', 'crew', 'kit', 'fixer', 'plan', 'heist', 'aftermath', 'over'];
  check(JSON.stringify(screens.slice().sort()) === JSON.stringify(order.slice().sort()), 'registry matches sweep order');
  for (const s of order) {
    const got = await page.evaluate((sc) => {
      if (sc === 'title') { window.cd.clearAll(); }
      else if (sc === 'intro') { window.cd.setSeed(2024); window.cd.teleport('intro'); }
      else if (sc === 'plan') { window.cd.spawn('dog', 'crew'); window.cd.teleport('plan'); }
      else if (sc === 'heist') { window.cd.teleport('heist'); window.cd.step(6); }
      else window.cd.teleport(sc);
      return window.cd.getState().screen;
    }, s);
    check(got === s, `teleport(${s}) -> ${got}`);
    await page.waitForTimeout(150);
    await shot(page, `sweep-${s}`);
  }
  await page.evaluate(() => { window.cd.setSeed(5); window.cd.cam('hero-close'); });
  await shot(page, 'cam-hero-close');
  await tap(page, '.modal [data-act="share"]');
  await page.waitForSelector('[data-card-preview]');
  await page.waitForTimeout(300);
  const w = await page.$eval('[data-card-preview]', (img) => img.decode().then(() => img.naturalWidth));
  check(w === 600, `share card renders a 600px PNG (${w})`);
  await shot(page, 'share-card');
  check(errors.length === 0, `no console errors in sweep (${errors.join(' | ')})`);
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.log(`\nFAILED (${failures.length}):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nAll smoke checks passed. Captures in notes/captures/');

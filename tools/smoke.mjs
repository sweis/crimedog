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
  // Favicon, app icons, manifest and link preview all load from the real page.
  const brand = await page.evaluate(async () => {
    const urls = [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')].map((l) => l.href)
      // The preview image may point at the public site; fetch the same file from here.
      .concat([...document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')].map((m) => new URL(new URL(m.content, location.href).pathname, location.href).href));
    const res = await Promise.all(urls.map(async (u) => [u.split('/').pop(), (await fetch(u)).status]));
    return res;
  });
  check(brand.length >= 6 && brand.every(([, st]) => st === 200), `icons and link preview load (${brand.map(([f, st]) => `${f} ${st}`).join(', ')})`);
  check((await page.locator('#diag').isHidden()), 'no dev overlay without flag');
  await shot(page, '01-title');
  await tap(page, '[data-act="new-game"]');
  await shot(page, '02-intro');
  await tap(page, '[data-act="start"]');
  check(await page.locator('main[data-screen="select"]').count() === 1, 'job board after intro');
  check(await page.locator('.offer').count() >= 2, 'at least two leads on the board');
  await shot(page, '02b-job-board');
  await tap(page, '[data-act="take-offer"]');
  check(await page.locator('main[data-screen="job"]').count() === 1, 'taking an offer opens the job');
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
  const shop = await page.evaluate(() => ({
    lockup: document.querySelector('main .lockup')?.innerText || '',
    pickSale: document.querySelectorAll('main [data-act="buy"][data-kit="lockpicks"]').length,
    bagSale: document.querySelectorAll('main [data-act="buy"][data-kit="bags"]').length,
  }));
  check(/Lockpicks/.test(shop.lockup) && /Big Swag Bags/.test(shop.lockup) && shop.pickSale === 0 && shop.bagSale === 1, `bought kit moves to the lock-up; the used-up kind stays on sale (${JSON.stringify(shop).slice(0, 160)})`);
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
  for (let k = 0; k < 12; k++) if (await page.locator('[data-act="heist-step"]').count()) await tap(page, '[data-act="heist-step"]');
  // The log grows downwards: the newest beat should be in view between the sticky header and controls.
  await page.waitForTimeout(700);
  const seen = await page.evaluate(() => {
    const b = document.querySelector('.beat[data-latest]').getBoundingClientRect();
    const head = document.querySelector('.heist-head').getBoundingClientRect();
    const ctl = document.querySelector('.heist-controls').getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), head: Math.round(head.bottom), ctl: Math.round(ctl.top), scrolled: scrollY };
  });
  check(seen.scrolled > 0 && seen.top >= seen.head - 2 && seen.bottom <= seen.ctl + 2, `latest beat in view after stepping (${JSON.stringify(seen)})`);
  const phases = await page.evaluate(() => [...document.querySelectorAll('.beat.stage')].map((b) => ({ phase: b.querySelector('.phase')?.textContent, block: b.querySelector('.phase') && getComputedStyle(b.querySelector('.phase')).display })));
  check(phases.length > 0 && phases.every((x) => x.phase?.endsWith(':') && x.block === 'block'), `each step's name is on its own line (${phases.map((x) => x.phase).join(' | ')})`);
  await shot(page, '09-heist');
  if (await page.locator('[data-act="heist-skip"]').count()) await tap(page, '[data-act="heist-skip"]');
  await shot(page, '10-heist-end');
  await tap(page, '[data-act="resolve"]');
  check(await page.locator('main[data-screen="aftermath"]').count() === 1, 'aftermath screen');
  await shot(page, '11-aftermath');
  if (await page.locator('[data-act="fence"]:not([disabled])').count()) await tap(page, '[data-act="fence"]:not([disabled])');
  // A £0 take only offers "nothing to split"; otherwise pay a fair cut.
  await tap(page, (await page.locator('[data-act="pay"][data-pct="30"]').count()) ? '[data-act="pay"][data-pct="30"]' : '[data-act="pay"]');
  check(await page.locator('[data-grade]').count() === 1, 'graded');
  await shot(page, '12-grade');
  check(await page.locator('.verdict').count() === 1, 'grade card has a verdict');
  await page.waitForTimeout(3500); // let the toasts clear
  await page.evaluate(() => document.querySelector('.verdict').scrollIntoView({ block: 'center' }));
  await shot(page, '12b-verdict');
  await tap(page, '[data-act="next-job"]');
  check(await page.locator('main[data-screen="select"], main[data-screen="over"]').count() === 1, 'back to the job board (or game over)');
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

// ---------------------------------------------------------------- 1c. profile fits without scrolling
console.log('1c. Crew profile fits on phone screens with actions visible');
for (const [w, h] of [[390, 844], [375, 667]]) {
  const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?dev=1&seed=3`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { document.getElementById('diag').hidden = true; window.cd.teleport('pub'); });
  await tap(page, 'main .dog-card');
  await page.waitForTimeout(300);
  const measure = () => page.evaluate(() => {
    const m = document.querySelector('.modal');
    const btns = [...m.querySelectorAll('.dm-actions .btn')].map((b) => ({ r: b.getBoundingClientRect(), over: b.scrollWidth > b.clientWidth + 1 }));
    return { scroll: m.scrollHeight - m.clientHeight, bottom: Math.max(...btns.map((b) => b.r.bottom)), overflow: btns.some((b) => b.over), vh: innerHeight };
  });
  const a = await measure();
  check(a.scroll <= 1 && a.bottom <= a.vh && !a.overflow, `${w}x${h}: new face fits, actions on screen (scroll ${a.scroll}, bottom ${Math.round(a.bottom)}/${a.vh})`);
  await tap(page, '.modal [data-act="surveil"]');
  await page.waitForTimeout(300);
  const b = await measure();
  const toastHitsActions = await page.evaluate(() => {
    const t = document.querySelector('#toast .t');
    if (!t) return false;
    const tr = t.getBoundingClientRect();
    return [...document.querySelectorAll('.dm-actions .btn')].some((el) => { const r = el.getBoundingClientRect(); return !(tr.bottom < r.top || tr.top > r.bottom || tr.right < r.left || tr.left > r.right); });
  });
  check(!toastHitsActions, `${w}x${h}: toast does not cover the profile's buttons`);
  const tb = await page.evaluate(() => { const r = document.querySelector('#toast .t')?.getBoundingClientRect(); return r && { w: r.width, top: r.top, bottom: r.bottom, vw: Math.min(innerWidth, 540), vh: innerHeight }; });
  check(!tb || (tb.w >= tb.vw - 40 && tb.bottom < tb.vh / 2), `${w}x${h}: toast is page-wide and up top (${tb && `${Math.round(tb.w)}px wide, ${Math.round(tb.top)}-${Math.round(tb.bottom)}`})`);
  check(b.scroll <= 1 && b.bottom <= b.vh && !b.overflow, `${w}x${h}: tailed dog (more traits) still fits (scroll ${b.scroll})`);
  if (w === 375) await shot(page, 'profile-375x667');
  // A legendary: every talent known, plus a signature line.
  await page.evaluate(() => { window.cd.spawn('dog', 'legend'); window.cd.teleport('pub'); document.getElementById('toast').innerHTML = ''; });
  await tap(page, 'main .dog-card.legendary');
  await page.waitForTimeout(300);
  const c = await measure();
  check(c.scroll <= 1 && c.bottom <= c.vh && !c.overflow, `${w}x${h}: legendary profile fits (scroll ${c.scroll}, bottom ${Math.round(c.bottom)}/${c.vh})`);
  if (w === 375) await shot(page, 'profile-legendary-375x667');
  await ctx.close();
}

// ---------------------------------------------------------------- 1f. stars
console.log('1f. A star in the first pub; hiring them opens a secret option');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=12`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(12); window.cd.teleport('pub'); });
  const st = await page.evaluate(() => window.cd.getState());
  check(st.stars.length === 1 && st.stars[0].rarity === 'rare' && st.stars[0].signature, `first pub has a rare star (${JSON.stringify(st.stars)})`);
  check(await page.locator('main .dog-card.rare .rar').count() === 1, 'star card carries the Rare badge');
  await shot(page, 'star-pub');
  await tap(page, 'main .dog-card.rare');
  await tap(page, '.modal [data-act="hire"]');
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
  if (await page.locator('.modal [data-act="close-modal"]').count()) await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, '.nav [data-to="job"]');
  await tap(page, 'main [data-act="go"][data-to="plan"]');
  await page.waitForTimeout(200);
  check(await page.locator('.opt.secret').count() >= 1, 'plan shows a secret option once the star is hired');
  await tap(page, '.opt.secret');
  const after = await page.evaluate(() => {
    const s = window.cd.getState();
    const step = document.querySelector('.opt.secret.on')?.closest('.plan-step')?.dataset.stage;
    return { step, plan: step ? s.job.plan[step] : null };
  });
  check(after.plan && after.plan.approach.startsWith('s_') && after.plan.dog === st.stars[0].id, `picking it puts the star on that step (${JSON.stringify(after)})`);
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; document.querySelector('.opt.secret.on').scrollIntoView({ block: 'center' }); });
  await shot(page, 'star-plan');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1g. crew drama
console.log('1g. Crew drama: a scene on the job board, answered with a real tap');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=8`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(8); window.cd.spawn('cash', 2000); window.cd.teleport('select'); window.cd.spawn('arc', 'debt'); window.cd.teleport('select'); });
  await page.waitForTimeout(200);
  check(await page.locator('.modal.story [data-act="drama"]').count() === 2, 'debt scene shows two choices');
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
  await shot(page, 'drama-scene');
  const before = await page.evaluate(() => window.cd.getState());
  await tap(page, '.modal.story [data-act="drama"][data-i="0"]');
  const after = await page.evaluate(() => window.cd.getState());
  const arc = after.arcs.find((a) => a.id === before.arcs[0].id);
  check(after.cash < before.cash && after.drama.some((d) => d.id === before.arcs[0].dog && d.edge === 1) && arc && arc.node !== 'start',
    `paying the debt costs cash, fires the dog up and moves the story on (${before.cash}->${after.cash}, ${arc?.node})`);
  check(await page.locator('.modal.story').count() === 0, 'scene closes');
  // The fired-up dog shows it on the crew page.
  await page.evaluate(() => { window.cd.teleport('crew'); });
  check(await page.locator('main .dog-card .chip.good', { hasText: 'Fired up' }).count() === 1, 'crew page shows "Fired up"');
  await shot(page, 'drama-crew');
  // A regular who has earned it gets promoted after a clean job.
  const promo = await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    window.cd.teleport('plan');
    const s = window.cd.live();
    const d = Object.values(s.dogs).find((x) => x.met && !x.rarity);
    for (const k of Object.keys(d.skills)) d.skills[k] = Math.min(d.skills[k], 3);
    Object.assign(d, { jobs: 5, relation: 40 });
    d.skills.sneak = 5;
    s.cash += 5000;
    E.hire(s, d.id);
    window.cd.win();
    window.cd.teleport('aftermath');
    return { promoted: s.after.promoted, rarity: d.rarity, signature: d.signature };
  });
  check(promo.rarity === 'rare' && promo.promoted?.length === 1 && promo.signature === 'phantom', `a regular who earned it is promoted (${JSON.stringify(promo)})`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'drama-promoted');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1h. kinds of job
console.log('1h. Kinds of job: a long con on the board, taken and planned with real taps');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=21`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(async () => {
    const { genJob } = await import('/src/heists.js');
    const { makeRng } = await import('/src/rng.js');
    window.cd.setSeed(21);
    window.cd.teleport('select');
    const s = window.cd.live();
    s.offers[0].job = genJob(s, makeRng({ s: 5 }), { type: 'con', tier: 2 });
    s.offers[1].job = genJob(s, makeRng({ s: 6 }), { type: 'van', tier: 2 });
    window.cd.teleport('select');
  });
  const chips = await page.locator('main .offer .chip.dark').allTextContents();
  check(chips.some((c) => /Long Con/.test(c)) && chips.some((c) => /Van Job/.test(c)), `job board shows the kind of job (${chips.join(', ')})`);
  await shot(page, 'job-types-board');
  await tap(page, 'main .offer [data-act="take-offer"]');
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    const s = window.cd.live();
    s.cash += 3000;
    for (const id of s.pub.slice(0, 3)) E.hire(s, id);
    window.cd.teleport('job');
  });
  await tap(page, 'main [data-act="go"][data-to="plan"]');
  const steps = await page.locator('main .plan-step h3').allTextContents();
  check(steps.some((t) => /The Introduction/.test(t)) && steps.some((t) => /The Pitch/.test(t)) && !steps.some((t) => /Getaway/.test(t)), `a con plans its own steps (${steps.join(' | ')})`);
  const st = await page.evaluate(() => window.cd.getState().job);
  check(st.type === 'con' && st.noInsider, 'getState: a con, no insiders');
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; window.scrollTo(0, 0); });
  await shot(page, 'job-types-con-plan');
  if (await page.locator('.plan-step[data-stage="specialist"]').count()) {
    await page.evaluate(() => document.querySelector('.plan-step[data-stage="specialist"]').scrollIntoView({ block: 'center' }));
    await shot(page, 'job-types-specialist');
  }
  await tap(page, '.nav [data-to="fixer"]');
  check(await page.locator('main [data-purpose="insider"][disabled]').count() === 1, 'fixer: no inside dog on a con');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1i. casing
console.log('1i. Casing: the picker says what to look for; being spotted is explained');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=32`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(32); window.cd.spawn('dog', 'crew'); window.cd.spawn('dog', 'crew'); window.cd.teleport('job'); });
  await tap(page, 'main [data-act="pick"][data-purpose="case"]');
  const note = await page.locator('.modal p.muted').first().textContent();
  check(/Finds/.test(note) && /unseen/.test(note), `case picker lists what to look for (${note})`);
  await shot(page, 'casing-picker');
  // A clumsy caser: keep casing until someone's spotted.
  const spotted = await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    const s = window.cd.live();
    const d = s.dogs[s.crew[0]];
    for (const k of Object.keys(d.skills)) d.skills[k] = 0;
    d.talents = [];
    s.cash += 5000;
    for (let i = 0; i < 20 && !s.job.alert; i++) { s.job.daysLeft = 5; for (const k of Object.keys(s.job.intel)) s.job.intel[k] = false; E.caseJoint(s, d.id); }
    window.cd.teleport('job');
    return s.job.alert;
  });
  const alertText = await page.locator('main .alert-note').textContent().catch(() => '');
  check(spotted > 0 && /spotted casing the joint/.test(alertText), `job screen explains the alert (${alertText.trim()})`);
  await page.evaluate(() => { document.querySelector('main .alert-note').scrollIntoView({ block: 'center' }); });
  await shot(page, 'casing-alert');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1j. leaders and wildcards
console.log('1j. Roles: a leader and a wildcard show on the crew and the plan');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=41`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => {
    window.cd.setSeed(41);
    window.cd.spawn('dog', 'crew'); window.cd.spawn('dog', 'crew'); window.cd.spawn('dog', 'crew');
    const s = window.cd.live();
    s.dogs[s.crew[0]].role = { kind: 'leader', level: 2 };
    s.dogs[s.crew[1]].role = { kind: 'wildcard', level: 3 };
    s.dogs[s.crew[2]].role = null;
    window.cd.teleport('crew');
  });
  check(await page.locator('main .chip.role.leader').count() === 1 && await page.locator('main .chip.role.wildcard').count() === 1, 'crew cards show the leader and the wildcard');
  await shot(page, 'roles-crew');
  await tap(page, '.nav [data-to="job"]');
  await tap(page, 'main [data-act="go"][data-to="plan"]');
  const chips = await page.locator('main > p.dm-chips .chip').allTextContents();
  check(chips.some((c) => /Every step \+4%/.test(c)) && chips.some((c) => /unexpected/.test(c)), `plan says what they bring (${chips.join(', ')})`);
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; window.scrollTo(0, 0); });
  await shot(page, 'roles-plan');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1k. special kit
console.log('1k. Special kit: shown in the shop, offered on jobs, kept after a win');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=51`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(51); window.cd.teleport('kit'); });
  check(await page.locator('main .kit.locked').count() === 6, 'the shop lists 6 pieces found only on jobs');
  await page.evaluate(() => document.querySelector('main h2.mt').scrollIntoView({ block: 'start' }));
  await shot(page, 'special-kit-shop');
  await page.evaluate(async () => {
    const { genJob } = await import('/src/heists.js');
    const { makeRng } = await import('/src/rng.js');
    window.cd.teleport('select');
    const s = window.cd.live();
    s.offers[0].job = genJob(s, makeRng({ s: 9 }), { type: 'breakin', venueType: 'museum' });
    s.offers[0].job.prize = 'detector';
    window.cd.teleport('select');
  });
  check(/Laser Detector/.test(await page.locator('main .offer').first().textContent()), 'the job board shows the prize');
  await tap(page, 'main .offer [data-act="take-offer"]');
  await page.evaluate(() => { window.cd.win(); window.cd.teleport('aftermath'); window.scrollTo(0, 0); });
  const kept = await page.evaluate(() => ({ kit: window.cd.getState().kit.detector, text: document.querySelector('main .events')?.textContent || '' }));
  check(kept.kit === 1 && /Kept/.test(kept.text), `a win keeps the Laser Detector (${kept.kit})`);
  await shot(page, 'special-kit-kept');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1l. heist history
console.log('1l. Heist history: share a heist from the aftermath, read it back on the rap sheet');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=61`);
  await page.waitForFunction(() => window.cd);
  // A real heist: hire, plan, pull, play out, fence, pay.
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    window.cd.setSeed(61);
    window.cd.teleport('plan');
    const s = window.cd.live();
    s.cash += 3000;
    for (const id of s.pub.slice(0, 3)) E.hire(s, id);
    E.pullJob(s);
    E.resolveHeist(s);
    if (s.after.step === 'deliver') E.deliver(s);
    if (s.after.step === 'fence') E.fence(s, 'hal');
    E.payCrew(s, s.after.received ? 30 : 0);
    window.cd.teleport('aftermath');
  });
  await tap(page, 'main [data-act="share-recap"]');
  await page.waitForSelector('[data-card-preview]');
  const w = await page.$eval('[data-card-preview]', (img) => img.decode().then(() => img.naturalWidth));
  check(w === 600, `heist card renders a 600px PNG (${w})`);
  await page.waitForTimeout(200);
  await shot(page, 'history-card');
  // Save the card image itself to look at.
  const png = await page.$eval('[data-card-preview]', async (img) => { const b = await (await fetch(img.src)).blob(); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s); });
  fs.writeFileSync(path.join(OUT, 'history-card-image.png'), Buffer.from(png, 'base64'));
  await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, 'main [data-act="next-job"]');
  for (let g = 0; g < 10; g++) {
    if (await page.locator('[data-act="story-ok"]').count()) await tap(page, '[data-act="story-ok"]');
    else if (await page.locator('.modal.story [data-act="drama"]').count()) await tap(page, '.modal.story [data-act="drama"]:last-of-type');
    else break;
  }
  await tap(page, 'main [data-act="history"]');
  check(await page.locator('.modal .rap').count() === 1, 'the rap sheet lists the job');
  await tap(page, '.modal .rap');
  const st = await page.evaluate(() => window.cd.getState().history[0]);
  const shown = await page.locator('.modal .rc-steps > li').count();
  check(shown === st.steps && st.crew === 3, `the recap retells every step (${shown}/${st.steps}) and the crew (${st.crew})`);
  await shot(page, 'history-recap');
  // The career card: from the rap sheet, the same card as a picture.
  await tap(page, '.modal [data-act="history"]');
  await tap(page, '.modal [data-act="career"]');
  const tiles = await page.locator('.modal .career .cr-stats .tile').count();
  const best = await page.locator('.modal .career .cr-row .gbadge').count();
  check(tiles === 9 && best >= 1, `career card: the record (${tiles} tiles) and the best job (${best})`);
  await shot(page, 'career-card');
  await tap(page, '.modal [data-act="share-career"]');
  await page.waitForSelector('[data-card-preview]');
  const cw = await page.$eval('[data-card-preview]', (img) => img.decode().then(() => img.naturalWidth));
  check(cw === 780, `career card renders a 780px PNG (${cw})`);
  await shot(page, 'career-card-share');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1m. top-bar panes & help
console.log('1m. Top bar: tap each stat for its pane; help from the title and the top bar');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Cold: help from the title screen, before there's a game.
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await tap(page, '.title-actions [data-act="help"]');
  check(await page.locator('.modal details.help').count() >= 6, 'help opens from the title screen');
  await tap(page, '.modal details.help:nth-of-type(2) summary');
  check(await page.locator('.modal details.help[open]').count() === 2, 'a help section opens on tap');
  await shot(page, 'help-title');
  await tap(page, '.modal [data-act="close-modal"]');
  check(await page.locator('.modal').count() === 0, 'help closes back to the title');
  // A few jobs in, so the charts have something to draw.
  await page.goto(`${BASE}?hooks=1&seed=29`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    window.cd.setSeed(29);
    const s = window.cd.live();
    for (let j = 0; j < 5; j++) {
      window.cd.teleport('plan');
      s.cash += 800;
      s.heat = Math.min(s.heat, 20); // keep the career alive for the charts
      for (const id of s.pub) if (s.crew.length < 3 && !s.dogs[id].undercover) E.hire(s, id);
      E.autoPlan(s);
      E.pullJob(s);
      E.resolveHeist(s);
      if (s.after.step === 'deliver') E.deliver(s);
      if (s.after.step === 'fence') E.fence(s, 'hal');
      E.payCrew(s, s.after.received ? 30 : 0);
      E.nextJob(s);
      s.story = [];
    }
    window.cd.teleport('select');
  });
  const st = await page.evaluate(() => window.cd.getState());
  check(st.books.jobs.length >= 5 && st.timeline.length === st.books.jobs.length + 1, `books kept for ${st.books.jobs.length} jobs, timeline ${st.timeline.length}`);
  await tap(page, '.topbar [data-pane="cash"]');
  const cols = await page.locator('.modal .chart [data-act="tip"]').count();
  check(cols === Math.min(12, st.books.jobs.length), `the books chart one column per job (${cols})`);
  const pl = await page.locator('.modal details.pl').count();
  check(pl === st.books.jobs.length, `job-by-job P&L rows (${pl})`);
  await tap(page, '.modal .chart [data-act="tip"]:last-of-type');
  const tip = await page.locator('.modal .chart-tip').innerText();
  check(tip.startsWith(st.books.jobs[0].label), `tapping the latest column names it (${tip})`);
  await shot(page, 'pane-cash');
  await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, '.topbar [data-pane="rep"]');
  check(await page.locator('.modal .chart polyline').count() === 1 && (await page.locator('.modal .hero-fig').innerText()).startsWith(String(st.rep)), 'reputation pane: line chart and the current rep');
  await shot(page, 'pane-rep');
  await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, '.topbar [data-pane="heat"]');
  const meter = await page.locator('.modal .meter').getAttribute('aria-valuenow');
  check(meter === String(st.heat) && await page.locator('.modal .chart polyline').count() === 1, `Inspector pane: meter at ${meter}, line chart`);
  await shot(page, 'pane-heat');
  await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, 'main [data-pane="day"]'); // on phones the day lives on the job board
  check(await page.locator('.modal .news li').count() > 0, 'the day book lists the news');
  await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, '.topbar [data-act="help"]');
  check(await page.locator('.modal details.help').count() >= 6, 'help opens from the top bar');
  const ver = await page.evaluate(() => window.cd.getState().version);
  check((await page.locator('.modal .version').innerText()) === `Version ${ver}`, `help shows the version (${ver})`);
  await page.locator('.modal .version').evaluate((e) => e.scrollIntoView({ block: 'end' }));
  await shot(page, 'help-version');
  await shot(page, 'help-topbar');
  // Nothing in the top bar spills off a small phone.
  await page.setViewportSize({ width: 360, height: 700 });
  await tap(page, '.modal [data-act="close-modal"]');
  const spill = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(spill <= 0, `top bar fits at 360px with no sideways scroll (${spill})`);
  await shot(page, 'topbar-360');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1n. the Inspector and the new jobs
console.log('1n. The Inspector: his scene, a setup, his file; the new kinds of job');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=41`);
  await page.waitForFunction(() => window.cd);
  // Two jobs in, he introduces himself on the job board.
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    window.cd.setSeed(41);
    const s = window.cd.live();
    const his = [];
    for (let j = 0; j < 2; j++) {
      his.push(...s.story.filter((x) => x.type === 'inspector'));
      s.story = [];
      window.cd.teleport('plan');
      s.cash += 800;
      for (const id of s.pub.slice(0, 2)) E.hire(s, id);
      E.autoPlan(s);
      E.pullJob(s);
      E.resolveHeist(s);
      if (s.after.step === 'deliver') E.deliver(s);
      if (s.after.step === 'fence') E.fence(s, 'hal');
      E.payCrew(s, s.after.received ? 30 : 0);
      E.nextJob(s);
    }
    his.push(...s.story.filter((x) => x.type === 'inspector'));
    s.story = his.slice(0, 1);
    window.cd.teleport('select');
  });
  let st = await page.evaluate(() => window.cd.getState());
  check(st.inspector.met && st.inspector.moves.includes('plant') && st.inspector.story[0] === 'inspector', `he has introduced himself by job 3 (${st.inspector.moves})`);
  check(await page.locator('.modal.inspector').count() === 1, 'his scene is up on the job board');
  await shot(page, 'inspector-scene');
  await tap(page, '.modal.inspector [data-act="drama"]');
  st = await page.evaluate(() => window.cd.getState());
  check(st.story === 0, 'answered with a real tap');
  // A stranger's tip that is really a setup: cased, it shows.
  const tipId = await page.evaluate(async () => {
    const H = await import('/src/heists.js');
    const I = await import('/src/inspector.js');
    const R = await import('/src/rng.js');
    const s = window.cd.live();
    const job = H.genJob(s, R.makeRng({ s: 5 }), { type: 'roof', twist: 'storm' });
    I.makeTip(job, true);
    s.offers.unshift({ id: job.id, source: 'own', kind: 'own', job });
    s.inspector.plant = true; // and another of his coppers is in the pub
    window.cd.teleport('select');
    return job.id;
  });
  check((await page.locator(`[data-offer="${tipId}"]`).innerText()).includes('stranger'), 'the tip says who it came from');
  await shot(page, 'tip-on-board');
  await tap(page, `[data-act="take-offer"][data-id="${tipId}"]`);
  check(await page.evaluate(() => { const s = window.cd.live(); return s.pub.some((id) => s.dogs[id].undercover); }), 'his plant is in the pub');
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    const s = window.cd.live();
    s.cash += 1000;
    E.tipFor(s, 'tipster'); // a tipster who knows the one thing you're after
    window.cd.teleport('job');
  });
  const chips = await page.locator('main .job-card').innerText();
  check(chips.includes('setup') && chips.includes('A Storm Tonight'), 'casing shows it\'s a setup; the twist is on the job');
  await shot(page, 'setup-spotted');
  // Pull it anyway: the trap springs at the vault.
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    const s = window.cd.live();
    window.cd.teleport('plan');
    for (const id of s.pub.filter((x) => !s.dogs[x].undercover).slice(0, 3)) E.hire(s, id);
    for (const d of E.crewDogs(s)) for (const k of Object.keys(d.skills)) d.skills[k] = 5;
    E.autoPlan(s);
    window.cd.teleport('heist');
    window.cd.step(400);
  });
  const res = await page.evaluate(() => window.cd.live().result);
  check(res.setup || res.aborted || res.outcome === 'bust', `pulling a setup goes badly (${res.setup ? 'sprung' : res.outcome})`);
  if (res.setup) await shot(page, 'setup-sprung');
  // The new kinds of job: take each from the board with a tap and plan it.
  for (const type of ['tunnel', 'roof', 'fix', 'train']) {
    const id = await page.evaluate(async (t) => {
      const H = await import('/src/heists.js');
      const R = await import('/src/rng.js');
      const s = window.cd.live();
      window.cd.teleport('select');
      s.story = [];
      const job = H.genJob(s, R.makeRng({ s: t.length * 7 }), { type: t, tier: 2 });
      s.offers.unshift({ id: job.id, source: 'own', kind: 'own', job });
      window.cd.teleport('select');
      return job.id;
    }, type);
    await tap(page, `[data-act="take-offer"][data-id="${id}"]`);
    await page.evaluate(async () => {
      const E = await import('/src/engine.js');
      const s = window.cd.live();
      s.cash += 3000;
      for (const id of s.pub.filter((x) => !s.dogs[x].undercover).slice(0, 3)) E.hire(s, id);
      E.autoPlan(s);
      window.cd.teleport('plan');
    });
    const n = await page.locator('main .plan-step').count();
    const want = await page.evaluate(() => window.cd.live().job.stages.filter((x) => !x.hidden).length);
    check(n === want && n >= 4, `${type}: plan shows all ${want} steps`);
    await shot(page, `job-${type}-plan`);
  }
  // His file: a trick he has seen twice is marked on the plan and in the heat pane.
  const ap = await page.evaluate(() => {
    const s = window.cd.live();
    const plan = Object.values(s.job.plan).find((p) => p?.approach);
    s.mo = { [plan.approach]: 2 };
    window.cd.teleport('plan');
    return plan.approach;
  });
  check((await page.locator(`.opt[data-ap="${ap}"]`).innerText()).includes('seen this before (+2)'), 'the plan marks a trick he knows');
  await shot(page, 'inspector-file-plan');
  await tap(page, '.topbar [data-pane="heat"]');
  const pane = (await page.locator('.modal').innerText()).toLowerCase();
  check(pane.includes('his file on your methods') && pane.includes('his moves'), 'the heat pane shows his file and his moves');
  await shot(page, 'pane-heat-file');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1o. rivals, the ringer, retirement
console.log('1o. Rivals, the boxing-club ringer, and retiring');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=52`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(52); window.cd.teleport('select'); window.cd.spawn('cash', 3000); window.cd.spawn('rival', 'jacksIntro'); window.cd.teleport('select'); });
  check(await page.locator('.modal.rival.jacks').count() === 1, 'the Jack Russells\' scene is up');
  await shot(page, 'rival-jacks');
  await tap(page, '.modal.rival [data-act="drama"]:last-of-type');
  // Mischief, then rob their lock-up: it goes on the board.
  await page.evaluate(() => { window.cd.spawn('rival', 'jacksMischief'); window.cd.teleport('select'); });
  const robIdx = await page.evaluate(() => window.cd.live().story[0].choices.findIndex((c) => c.effect === 'rob'));
  await tap(page, `.modal.rival [data-act="drama"][data-i="${robIdx}"]`);
  let st = await page.evaluate(() => window.cd.getState());
  check(st.rivals.jacks.board && st.offers.some((o) => o.id === st.rivals.jacks.board), 'their lock-up is on the job board');
  // Dan's note, then the Ghost in the shadows.
  await page.evaluate(() => { window.cd.spawn('rival', 'danNote'); window.cd.teleport('select'); });
  check(await page.locator('.modal.rival.dan').count() === 1, 'Dandy Dan\'s note is up');
  await shot(page, 'rival-dan');
  await tap(page, '.modal.rival [data-act="drama"]:last-of-type');
  await page.evaluate(() => { window.cd.spawn('rival', 'ghost'); window.cd.teleport('select'); });
  check(await page.locator('.modal.rival.ghost .silhouette').count() === 1, 'the Ghost stays in the shadows');
  await shot(page, 'rival-ghost');
  await tap(page, '.modal.rival [data-act="drama"]');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await tap(page, '.nav [data-to="players"]');
  check((await page.locator('main').innerText()).includes('The Competition'), 'the Players tab lists the competition');
  await page.locator('main h2', { hasText: 'The Competition' }).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot(page, 'rivals-board');
  // The ringer at the boxing club, with a calling card ticked by tap.
  const ringer = await page.evaluate(async () => {
    const H = await import('/src/heists.js');
    const R = await import('/src/rng.js');
    const s = window.cd.live();
    let job;
    for (let k = 1; k < 40 && !job?.ringer; k++) job = H.genJob(s, R.makeRng({ s: k }), { type: 'fix', venueType: 'ring' });
    s.offers.unshift({ id: job.id, source: 'own', kind: 'own', job });
    window.cd.teleport('select');
    return job.id;
  });
  await tap(page, `[data-act="take-offer"][data-id="${ringer}"]`);
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    const s = window.cd.live();
    for (const id of s.pub.filter((x) => !s.dogs[x].undercover).slice(0, 3)) E.hire(s, id);
    E.autoPlan(s);
    window.cd.teleport('plan');
  });
  check((await page.locator('main .plan-step h3').allInnerTexts()).join('|').includes('Into the Ring'), 'the ringer: our fighter goes into the ring');
  await tap(page, 'main [data-act="calling-card"]');
  check(await page.evaluate(() => window.cd.live().job.callingCard === true), 'calling card ticked with a tap');
  await page.locator('main .calling-card').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'calling-card');
  // Retire: the nest egg fills, two taps, and the epilogues.
  // A career's worth of history: a close mate, a runner, a star who worked with you.
  await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    const D = await import('/src/dogs.js');
    window.cd.teleport('select');
    const s = window.cd.live();
    const [mate, runner] = Object.values(s.dogs).filter((d) => d.met && !d.rarity && !d.undercover);
    Object.assign(mate, { jobs: 6, relation: 70, status: 'free' });
    if (runner) Object.assign(runner, { jobs: 2, status: 'gone', left: 'runner', ranWith: 'The Golden Bone', relation: -100 });
    const star = D.genDog(s, E.rngOf(s), { quality: 2, rarity: 'legendary', signature: true });
    Object.assign(star, { met: true, jobs: 1 });
    s.dogs[star.id] = star;
    s.story = [];
    window.cd.spawn('retire');
    window.cd.teleport('select');
  });
  check(await page.locator('main .retire-note').count() === 1, 'the job board says you can retire');
  await page.locator('main .retire-note').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -80));
  await shot(page, 'nest-egg');
  await tap(page, 'main .retire-note');
  check(await page.locator('.modal [data-act="retire"]').count() === 1, 'the 💷 pane has the nest egg and the retire button');
  await shot(page, 'nest-egg-pane');
  await tap(page, '.modal [data-act="retire"]');
  check(await page.evaluate(() => window.cd.getState().over === null), 'one tap only asks');
  await tap(page, '.modal [data-act="retire"]');
  st = await page.evaluate(() => window.cd.getState());
  check(st.over?.reason === 'retired' && st.over.epilogues.length >= 4, `retired, with ${st.over?.epilogues?.length} epilogues`);
  check(await page.locator('main .epilogue').count() === st.over.epilogues.length, 'the ending shows every epilogue');
  await shot(page, 'retired');
  await page.locator('main .epilogues').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot(page, 'retired-epilogues');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1p. the talent, from the job board
console.log('1p. The bottom bar between jobs: pub, crew, players, back to the board, then take a job');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=63`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(63); window.cd.teleport('select'); });
  check(await page.locator('.nav button').count() === 6 && await page.locator('.nav [data-to="job"].on').count() === 1, 'the bottom bar is on the job board, on the Job tab');
  check(await page.locator('.nav [data-to="fixer"]:disabled').count() === 1, 'the fixer is shut until you pick a job');
  await shot(page, 'board-nav');
  await tap(page, '.nav [data-to="pub"]');
  const seen = await page.evaluate(() => [...document.querySelectorAll('main .dog-card')].map((e) => e.dataset.id));
  check(await page.evaluate(() => document.querySelector('main').dataset.screen) === 'pub' && seen.length >= 4, `the pub from the job board (${seen.length} about)`);
  await shot(page, 'board-pub');
  await tap(page, 'main .dog-card');
  check(await page.locator('.modal [data-act="hire"]').count() === 0 && (await page.locator('.modal').innerText()).includes('Pick a job to hire'), 'no hiring before a job');
  await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, '.nav [data-to="crew"]');
  check((await page.locator('main').innerText()).includes('Little Black Book') && await page.locator('main .dog-card').count() >= 1, 'your book from the job board');
  await shot(page, 'board-crew');
  await tap(page, '.nav [data-to="players"]');
  check(await page.evaluate(() => document.querySelector('main').dataset.screen) === 'players' && (await page.locator('main').innerText()).includes('The Bulldog Firm'), 'the Players tab lists the outfits');
  await shot(page, 'players-tab');
  await tap(page, '.nav [data-to="job"]');
  check(await page.evaluate(() => document.querySelector('main').dataset.screen) === 'select', 'the Job tab is the job board');
  // Take a job: the faces you saw are still in the pub.
  await tap(page, 'main [data-act="take-offer"]');
  const pub = await page.evaluate(() => window.cd.live().pub);
  check(seen.every((id) => pub.includes(id)), `everyone you saw is still there (${seen.filter((id) => pub.includes(id)).length}/${seen.length}, pub now ${pub.length})`);
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1q. runners, amends, reputation
console.log('1q. A runner hunted down and forgiven; amends with a crossed outfit; the sides of a reputation');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=71`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(71); window.cd.teleport('select'); window.cd.spawn('cash', 6000); window.cd.spawn('runner'); window.cd.teleport('select'); });
  check(await page.locator('.modal.runner').count() === 1, 'the runner\'s scene is up');
  await shot(page, 'runner-scene');
  await tap(page, '.modal.runner [data-act="drama"][data-i="0"]');
  let st = await page.evaluate(() => window.cd.getState());
  check(st.runners[0]?.stage === 'hunting', `the word is out (${st.runners[0]?.stage})`);
  // Two jobs' worth of leads, then they're found.
  await page.evaluate(async () => { const R = await import('/src/runners.js'); const s = window.cd.live(); R.runnersBetweenJobs(s, { chance: () => false, pick: (a) => a[0] }); R.runnersBetweenJobs(s, { chance: () => false, pick: (a) => a[0] }); s.story = []; window.cd.teleport('select'); });
  await tap(page, '.nav [data-to="players"]');
  check(await page.locator('main [data-act="runner-act"][data-effect="mercy"]').count() === 1, 'found: the Players tab offers mercy, the farm, or stealing it back');
  await page.locator('main [data-act="runner-act"]').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'runner-found');
  await tap(page, 'main [data-act="runner-act"][data-effect="mercy"]');
  st = await page.evaluate(() => window.cd.getState());
  check(st.runners[0].ended === 'mercy' && st.repute.hardness < 0, `mercy: back in your book, and you\'re softer (${st.repute.hardness})`);
  // An outfit that's turned on you: make amends with a hard job.
  await page.evaluate(() => { const s = window.cd.live(); s.groups.firm.standing = -60; window.cd.teleport('select'); });
  await tap(page, '.nav [data-to="players"]');
  check(await page.locator('main [data-act="amends"][data-g="firm"]').count() === 2, 'the Firm can be squared: pay up or a hard job');
  await page.locator('main [data-act="amends"][data-g="firm"]').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'amends');
  await tap(page, 'main [data-act="amends"][data-g="firm"][data-how="job"]');
  await tap(page, '.nav [data-to="job"]');
  check(await page.locator('main .offer button', { hasText: 'Make amends' }).count() === 1, 'the amends job is on the job board');
  // The sides of a reputation.
  await tap(page, '.topbar [data-pane="rep"]');
  const pane = (await page.locator('.modal').innerText()).toLowerCase();
  check(pane.includes('track record') && pane.includes('generosity') && pane.includes('soft or hard'), 'the reputation pane shows its sides');
  await shot(page, 'pane-rep-sides');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1r. the pound and the hospital
console.log('1r. One nicked, one hurt: pay the hospital bill, and a brief that can only cut so much');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=81`);
  await page.waitForFunction(() => window.cd);
  const ids = await page.evaluate(async () => {
    const E = await import('/src/engine.js');
    const S = await import('/src/sim.js');
    window.cd.setSeed(81);
    window.cd.teleport('plan');
    const s = window.cd.live();
    s.cash += 9000;
    const [a, b] = s.pub.filter((id) => !s.dogs[id].undercover).slice(0, 2);
    E.hire(s, a);
    E.hire(s, b);
    s.dogs[a].record = 3;
    s.result = S.blankResult(s.crew, { secured: s.job.loot.map((l) => l.id), escaped: [], captured: [{ id: a, talked: false, sentence: 6 }], hurt: [{ id: b, jobs: 3, skill: 'agility' }], outcome: 'messy' });
    s.phase = 'heist';
    E.resolveHeist(s);
    window.cd.teleport('aftermath');
    return { nicked: a, hurt: b };
  });
  const events = await page.locator('main .events').innerText();
  check(events.includes('in hospital for 3 jobs') && events.includes('previous'), 'the aftermath says who\'s in hospital and who went down, and why');
  await page.locator('main [data-act="pay-hospital"]').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'aftermath-hospital');
  await tap(page, 'main [data-act="pay-hospital"]');
  check(await page.evaluate((id) => window.cd.live().dogs[id].hospital.paid, ids.hurt), 'hospital bill paid with a tap');
  // Through to the job board, then the crew tab.
  await page.evaluate(async () => { const E = await import('/src/engine.js'); const s = window.cd.live(); if (s.after.step === 'deliver') E.deliver(s); if (s.after.step === 'fence') E.fence(s, 'hal'); E.payCrew(s, 30); E.nextJob(s); s.story = []; window.cd.teleport('select'); });
  await tap(page, '.nav [data-to="crew"]');
  const crewText = await page.locator('main').innerText();
  check(crewText.includes('In Hospital') && crewText.includes('In the Pound'), 'the crew tab lists the hospital and the pound');
  await tap(page, `main .dog-card[data-id="${ids.nicked}"]`);
  let briefs = 0;
  while (briefs < 6 && await page.locator('.modal [data-act="lawyer"]').count()) { await tap(page, '.modal [data-act="lawyer"]'); briefs++; }
  const left = await page.evaluate((id) => window.cd.live().dogs[id], ids.nicked);
  check(left.status === 'pound' && left.sentence >= Math.ceil(left.sentenceStart / 2) && briefs >= 1, `briefs cut the sentence (${briefs} taps) but they still serve ${left.sentence} of ${left.sentenceStart}`);
  check((await page.locator('.modal').innerText()).includes('No brief can shorten it'), 'the profile says no brief can shorten it further');
  await shot(page, 'pound-brief-limit');
  await tap(page, '.modal [data-act="close-modal"]');
  await tap(page, `main .dog-card[data-id="${ids.hurt}"]`);
  check((await page.locator('.modal').innerText()).includes('A bad knee'), 'the profile shows the lasting injury');
  await shot(page, 'hospital-profile');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1d. hire from a plan step
console.log('1s. How the crew get on: chemistry on the plan, marks on the crew, and a recruit to case the joint');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=23`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(23); window.cd.teleport('pub'); window.cd.live().cash += 9000; window.cd.teleport('pub'); });
  // Hire three from the pub with real taps.
  for (let k = 0; k < 3; k++) {
    await tap(page, 'main .dog-card:not(.hired)');
    if (await page.locator('.modal [data-act="hire"]').count()) await tap(page, '.modal [data-act="hire"]');
    if (await page.locator('.modal .close').count()) await tap(page, '.modal .close');
  }
  const crew = await page.evaluate(() => window.cd.live().crew.slice());
  check(crew.length === 3, `hired three at the pub (${crew.length})`);
  // Two who can't stand each other, two who are thick as thieves.
  await page.evaluate(([a, b, c]) => {
    const s = window.cd.live();
    const key = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
    s.bonds = { [key(a, b)]: -70, [key(b, c)]: 70 };
    window.cd.teleport('plan');
  }, crew);
  const chem = await page.locator('main .chem .chip').allInnerTexts();
  check(chem.some((t) => t.startsWith('💢')) && chem.some((t) => t.startsWith('💚')), `the plan shows who gets on and who doesn't (${chem.join(' | ')})`);
  await shot(page, 'bonds-plan');
  await tap(page, 'nav [data-act="go"][data-to="crew"]');
  const marks = await page.locator('main .dog-card .chip:is(.good,.bad)').allInnerTexts();
  check(marks.filter((t) => t.startsWith('💢')).length === 2 && marks.filter((t) => t.startsWith('💚')).length === 2, `each of the pair is marked on their card (${marks.join(' | ')})`);
  await shot(page, 'bonds-crew');
  // Case the joint → recruit someone suited to it → back to the list with them on it.
  await tap(page, 'nav [data-act="go"][data-to="job"]');
  await tap(page, 'main [data-act="pick"][data-purpose="case"]');
  await tap(page, '.modal [data-act="recruit"]');
  check(await page.locator('.modal h2').innerText() === 'Recruit someone to case it', 'the recruit list opens from the casing picker');
  await shot(page, 'bonds-recruit');
  if (await page.locator('.modal .dog-card').count()) {
    await tap(page, '.modal .dog-card');
    const after = await page.evaluate(() => window.cd.live().crew.length);
    check(after === 4 && (await page.locator('.modal h2').innerText()) === 'Who cases the joint?', `recruited, and back to the casing list (${after} crew)`);
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

console.log('1t. A four-star job: on the board, its master in the pub, asking around for the rest, the master steps on the plan');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=32`);
  await page.waitForFunction(() => window.cd);
  const jobId = await page.evaluate(async () => {
    const H = await import('/src/heists.js');
    const { makeRng } = await import('/src/rng.js');
    window.cd.setSeed(32);
    window.cd.teleport('select');
    const s = window.cd.live();
    Object.assign(s, { rep: 60, cash: 20000 });
    s.stats.jobs = 10;
    const job = H.genJob(s, makeRng({ s: 32 }), { tier: H.GRAND_TIER, owner: null });
    s.offers.push(H.ownOffer(job));
    window.cd.teleport('select');
    document.getElementById('toast').innerHTML = '';
    return job.id;
  });
  const card = `main .offer[data-offer="${jobId}"]`;
  check(await page.locator(`${card}.grand`).count() === 1, 'the four-star job stands out on the board');
  const cardText = await page.locator(card).innerText();
  check(cardText.includes('★★★★') && cardText.includes('Three masters') && (cardText.match(/ 8\+/g) || []).length === 3, `it says what it takes (${cardText.replace(/\s+/g, ' ').slice(0, 160)})`);
  await page.locator(card).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => scrollBy(0, -70));
  await shot(page, 'grand-board');
  await tap(page, `${card} [data-act="take-offer"]`);
  const st = await page.evaluate(() => { const s = window.cd.live(); return { phase: s.phase, star: s.job.masterStar, pub: s.pub, masters: s.job.stages.filter((x) => x.master).map((x) => x.needs.skill) }; });
  check(st.phase === 'plan' && st.star && st.pub.includes(st.star), 'taking it brings its master to the pub');
  // The pub, with real taps: the master, then ask around.
  await tap(page, '.nav [data-to="pub"]');
  await page.waitForTimeout(3000);
  check(await page.locator(`main .dog-card[data-id="${st.star}"]`).count() === 1, 'the master is in the pub');
  check((await page.locator(`main .dog-card[data-id="${st.star}"] .chip.good`).allInnerTexts()).some((t) => t.startsWith('👑')), 'and marked as one of the masters the job needs');
  await shot(page, 'grand-pub');
  await tap(page, `main .dog-card[data-id="${st.star}"]`);
  await tap(page, '.modal [data-act="hire"]');
  await tap(page, '.modal .close');
  let heard = 0;
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
    await tap(page, 'main [data-act="ask-around"]');
    const t = await page.locator('#toast .t').last().innerText().catch(() => '');
    if (/turns up/.test(t)) {
      heard++;
      const fresh = await page.evaluate(() => window.cd.live().pub[0]);
      check((await page.locator(`main .dog-card[data-id="${fresh}"] .chip.good`).allInnerTexts()).some((x) => x.startsWith('👑')), 'the master who turned up is marked as one');
      await page.locator(`main .dog-card[data-id="${fresh}"]`).evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await shot(page, 'grand-ask-around');
      await page.waitForTimeout(3000); // the toast fades: the master's card underneath
      await shot(page, 'grand-ask-around-card');
      break;
    }
  }
  console.log(`  (asked around: ${heard ? 'a master turned up' : 'nobody this time'})`);
  // The plan: each master step says who's up to it.
  await tap(page, '.nav [data-to="job"]');
  await tap(page, 'main [data-act="go"][data-to="plan"]');
  const chips = await page.evaluate(() => [...document.querySelectorAll('.plan-step[data-stage^="master_"] .stage-head .chip')].map((c) => ({ t: c.textContent.trim(), good: c.classList.contains('good') })));
  check(chips.length === 3 && chips.every((c) => /8\+ only/.test(c.t)) && chips.some((c) => c.good) && chips.some((c) => !c.good), `master steps say 8+ only, ticked where the crew has it (${JSON.stringify(chips)})`);
  await page.locator('.plan-step[data-stage^="master_"]').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => scrollBy(0, -70));
  await shot(page, 'grand-plan');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

console.log('1u. Breeds and sizes: a step for someone small, from the board to the plan, and a capped skill on a profile');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=3`);
  await page.waitForFunction(() => window.cd);
  const info = await page.evaluate(async () => {
    const H = await import('/src/heists.js');
    const { makeRng } = await import('/src/rng.js');
    window.cd.setSeed(3);
    window.cd.teleport('select');
    const s = window.cd.live();
    s.cash = 20000;
    s.story = [];
    let job;
    for (let k = 1; k < 400 && !job; k++) { const j = H.genJob(s, makeRng({ s: k }), { type: 'breakin', tier: 2 }); if (j.stages.some((x) => x.needsSize === 'small')) job = j; }
    s.offers.unshift(H.ownOffer(job));
    window.cd.teleport('select');
    document.getElementById('toast').innerHTML = '';
    return { id: job.id, step: job.stages.find((x) => x.needsSize).id };
  });
  check((await page.locator(`main .offer[data-offer="${info.id}"]`).innerText()).includes('Small only'), 'the board says the job wants someone small');
  await tap(page, `main .offer[data-offer="${info.id}"] [data-act="take-offer"]`);
  // Hire someone big first, then hire for the small step from the plan.
  await tap(page, '.nav [data-to="pub"]');
  const big = await page.evaluate(async () => { const { sizeOf } = await import('/src/dogs.js'); const s = window.cd.live(); return s.pub.find((id) => sizeOf(s.dogs[id]) === 'large'); });
  await tap(page, `main .dog-card[data-id="${big}"]`);
  await tap(page, '.modal [data-act="hire"]');
  await tap(page, '.modal .close');
  await tap(page, '.nav [data-to="job"]');
  await tap(page, 'main [data-act="go"][data-to="plan"]');
  check(await page.locator(`.plan-step[data-stage="${info.step}"] .stage-head .chip.bad`).count() === 1, 'the step says nobody on the crew is small enough');
  await tap(page, `.plan-step[data-stage="${info.step}"] [data-act="hire-for"]`);
  check((await page.locator('.hire-banner').innerText()).includes('Needs someone small'), 'the pub says who to look for');
  const firstSize = await page.evaluate(async () => { const { sizeOf } = await import('/src/dogs.js'); const id = document.querySelector('main .dog-card').dataset.id; return sizeOf(window.cd.live().dogs[id]); });
  check(firstSize === 'small', `someone small is top of the list (${firstSize})`);
  await tap(page, 'main .dog-card');
  check(/ · (Toy|Terrier|Hound|Herding|Sporting|Working|Non-Sporting) · Small/.test(await page.locator('.modal .dm-sub').innerText()), 'the profile gives breed group and size');
  await tap(page, '.modal [data-act="hire"]');
  await page.waitForTimeout(300);
  const st = await page.evaluate(async (step) => { const { sizeOf } = await import('/src/dogs.js'); const s = window.cd.live(); const p = s.job.plan[step]; return { size: p?.dog && sizeOf(s.dogs[p.dog]), screen: window.cd.getState().screen }; }, info.step);
  check(st.screen === 'plan' && st.size === 'small', `back on the plan, someone small on the step (${JSON.stringify(st)})`);
  check(await page.locator(`.plan-step[data-stage="${info.step}"] .stage-head .chip.good`).count() === 1, 'and the step says so');
  await page.locator(`.plan-step[data-stage="${info.step}"]`).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => { scrollBy(0, -70); document.getElementById('toast').innerHTML = ''; });
  await shot(page, 'size-step-plan');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

console.log('1v. Planning in one place: the prep strip, the job\'s needs in the pub, unlocking an option from the plan, first-visit tips');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=3`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}?hooks=1&seed=3`);
  await page.waitForFunction(() => window.cd);
  // A rooftop job: its rope options are locked until you own a rope.
  const id = await page.evaluate(async () => {
    const H = await import('/src/heists.js');
    const { makeRng } = await import('/src/rng.js');
    window.cd.setSeed(3);
    window.cd.teleport('select');
    const s = window.cd.live();
    s.cash = 5000;
    s.story = [];
    s.kit.grapple = 0;
    const job = H.genJob(s, makeRng({ s: 9 }), { type: 'roof', tier: 1 });
    s.offers.unshift(H.ownOffer(job));
    window.cd.teleport('select');
    return job.id;
  });
  check(await page.locator('main .tip [data-act="tip-ok"]').count() === 1, 'a word in your ear on the job board, first time');
  await tap(page, 'main .tip [data-act="tip-ok"]');
  check(await page.locator('main .tip').count() === 0, 'gone once you\'ve got it');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('crimedog.tips') || '[]').includes('select')), 'and remembered');
  await tap(page, `main .offer[data-offer="${id}"] [data-act="take-offer"]`);
  const strip = await page.locator('header .prep').innerText();
  check(/Crew\s*0/.test(strip) && /Intel\s*0\/\d/.test(strip), `the top bar shows crew, intel and plan while planning (${strip.replace(/\n/g, ' ')})`);
  check(await page.locator('main .tip').count() === 1, 'a tip on the job, first time');
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
  await shot(page, 'prep-strip-job');
  await tap(page, 'header .prep [data-to="pub"]');
  const stages = await page.evaluate(() => window.cd.live().job.stages.filter((x) => !x.hidden).length);
  check(await page.locator('main .cover-card .cover').count() === stages, `the pub lists every step the job needs (${stages})`);
  await tap(page, 'main .cover >> nth=2');
  check(await page.locator('main .hire-banner').count() === 1, 'a step in the pub hires for that step');
  await tap(page, 'main .dog-card');
  await tap(page, '.modal [data-act="hire"]');
  await page.waitForTimeout(300);
  check(await page.locator('main[data-screen="plan"]').count() === 1, 'hired, and back on the plan');
  const pencilled = await page.evaluate(() => { const s = window.cd.live(); return s.job.stages.filter((x) => !x.hidden && s.job.plan[x.id]?.dog).length; });
  check(pencilled === stages, `first look at the plan: the crew pencil in the rest (${pencilled}/${stages})`);
  await tap(page, '.nav [data-to="kit"]');
  const forJob = await page.locator('main .kit .for-job').allInnerTexts();
  check(forJob.some((t) => /This job: opens/.test(t)) && forJob.some((t) => /helps on/.test(t)), `the kit shop says what's useful on this job (${forJob.slice(0, 3).join(' | ')})`);
  await page.locator('main .kit.useful').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
  await shot(page, 'kit-for-job');
  await tap(page, 'header .prep [data-to="plan"]');
  const lockedSel = 'main .opt.locked[data-ap]';
  const locked = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => ({ ap: e.dataset.ap, stage: e.dataset.stage, rope: /Grappling Rope/.test(e.innerText) })), lockedSel);
  const rope = locked.find((x) => x.rope) || locked[0];
  check(!!rope, `the plan has a locked option (${locked.map((x) => x.ap).join(', ')})`);
  await tap(page, `main .opt.locked[data-ap="${rope.ap}"][data-stage="${rope.stage}"]`);
  check(await page.locator('.modal [data-act="unlock-buy"], .modal [data-act="unlock-tip"], .modal [data-act="pick"]').count() >= 1, 'tapping it says how to unlock it, with the button right there');
  await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
  await shot(page, 'unlock-sheet');
  const before = await page.evaluate(() => window.cd.live().cash);
  await tap(page, '.modal [data-act="unlock-buy"], .modal [data-act="unlock-tip"]');
  const after = await page.evaluate(async (r) => { const E = await import('/src/engine.js'); const s = window.cd.live(); return { cash: s.cash, plan: s.job.plan[r.stage], best: E.bestDogFor(s, r.stage, r.ap), modal: !!document.querySelector('.modal') }; }, rope);
  check(after.cash < before && after.plan?.approach === rope.ap && after.plan.dog === after.best && !after.modal, `unlocked, on the plan, with the best person on it (${JSON.stringify(after)})`);
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

console.log('1w. Share cards inside a sandboxed frame (as hosted): a crew card and the career card draw');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setContent(`<body style="margin:0"><iframe sandbox="allow-scripts allow-popups" src="${BASE}?hooks=1&seed=7" style="border:0;width:390px;height:844px"></iframe></body>`);
  let f = null;
  for (let k = 0; k < 40 && !f; k++) { f = page.frames().find((x) => x.url().startsWith(BASE)); if (!f) await page.waitForTimeout(100); }
  await f.waitForFunction(() => window.__crimedogBooted);
  check(await f.evaluate(() => window.origin) === 'null', 'the frame has an opaque origin, like the hosted build');
  const ftap = async (sel) => {
    const el = f.locator(sel).first();
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const b = await el.boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(200);
  };
  const cardShown = async () => {
    await f.waitForFunction(() => [...document.querySelectorAll('.modal img')].some((i) => i.src.startsWith('blob:') && i.naturalWidth >= 780) || document.querySelector('#toast .t.bad'), null, { timeout: 15000 }).catch(() => {});
    return f.evaluate(() => {
      const img = [...document.querySelectorAll('.modal img')].find((i) => i.src.startsWith('blob:') && i.naturalWidth >= 780);
      return { w: img?.naturalWidth || 0, h: img?.naturalHeight || 0, bad: document.querySelector('#toast .t.bad')?.textContent || '' };
    });
  };
  await ftap('[data-act="new-game"]');
  for (let k = 0; k < 6 && !(await f.locator('[data-act="start"]').count()); k++) await ftap('[data-act="intro-next"]');
  await ftap('[data-act="start"]');
  await ftap('main [data-act="take-offer"]');
  await ftap('.nav [data-to="pub"]');
  await ftap('main .dog-card');
  await ftap('.modal [data-act="share"]');
  const crew = await cardShown();
  check(crew.w === 780 && crew.h > 600 && !crew.bad, `a crew card draws in the sandbox (${JSON.stringify(crew)})`);
  await page.screenshot({ path: 'notes/captures/share-card-sandboxed.png' });
  await ftap('.modal .close');
  await f.evaluate(() => { document.getElementById('toast').innerHTML = ''; window.cd.teleport('select'); });
  await ftap('[data-act="pane"][data-pane="cash"]');
  if (await f.locator('.modal [data-act="career"]').count()) await ftap('.modal [data-act="career"]');
  else await f.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'career'; document.body.appendChild(b); b.click(); b.remove(); });
  await ftap('.modal [data-act="share-career"]');
  const career = await cardShown();
  check(career.w === 780 && career.h > 600 && !career.bad, `the career card draws in the sandbox (${JSON.stringify(career)})`);
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

console.log('1x. Walking away takes two taps; anything in between starts over');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?hooks=1&seed=5`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(5); window.cd.teleport('select'); window.cd.live().story = []; window.cd.teleport('select'); });
  await tap(page, 'main [data-act="take-offer"]');
  const rep0 = await page.evaluate(() => window.cd.live().rep);
  await tap(page, 'main [data-act="walk-away"]');
  check((await page.locator('main [data-act="walk-away"]').innerText()).includes('Really walk away'), 'the first tap asks');
  await tap(page, 'main [data-act="time"][data-t="day"]');
  check(!(await page.locator('main [data-act="walk-away"]').innerText()).includes('Really'), 'another tap in between: it asks again');
  await tap(page, 'main [data-act="walk-away"]');
  await tap(page, 'main [data-act="walk-away"]');
  const after = await page.evaluate(() => ({ phase: window.cd.live().phase, rep: window.cd.live().rep }));
  check(after.phase === 'select' && after.rep < rep0, `two taps: walked away, rep ${rep0} -> ${after.rep}`);
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

console.log('1d. Hiring from a planning step returns to that step');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?dev=1&seed=3`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { document.getElementById('diag').hidden = true; window.cd.spawn('cash', 5000); window.cd.spawn('dog', 'crew'); window.cd.teleport('plan'); });
  const stageId = await page.evaluate(() => window.cd.getState().job.stages.filter((st) => !st.hidden)[2].id);
  const crewBefore = (await page.evaluate(() => window.cd.getState().crew)).length;
  // A star you've worked with who has since left town: in your book, but not hireable.
  const awayId = await page.evaluate(() => {
    window.cd.spawn('dog', 'legend');
    const s = window.cd.live();
    const id = s.pub.at(-1);
    s.pub = s.pub.filter((x) => x !== id);
    Object.assign(s.dogs[id], { met: true, status: 'free', inTown: 'some other job' });
    return id;
  });
  await tap(page, `.plan-step[data-stage="${stageId}"] [data-act="hire-for"]`);
  check(await page.locator('main[data-screen="pub"] .hire-banner').count() === 1, 'plan step opens the pub in hiring-for mode');
  check(await page.locator(`main .dog-card[data-id="${awayId}"]`).count() === 0, 'a star who\'s out of town isn\'t offered for the step');
  check((await page.locator('.hire-banner').innerText()).includes('step 3'), 'banner names the step');
  await shot(page, 'hire-for-step');
  await tap(page, 'main .dog-card');
  check((await page.locator('.modal [data-act="hire"]').innerText()).includes('step 3'), 'hire button says which step');
  await tap(page, '.modal [data-act="hire"]');
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => window.cd.getState());
  const hired = st.crew[st.crew.length - 1].id;
  check(st.screen === 'plan' && st.crew.length === crewBefore + 1, `back on the plan with a new hire (${st.screen}, crew ${st.crew.length})`);
  check(st.job.plan[stageId]?.dog === hired && !!st.job.plan[stageId]?.approach, 'new hire is assigned to that step');
  const inView = await page.evaluate((id) => { const r = document.querySelector(`.plan-step[data-stage="${id}"]`).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }, stageId);
  check(inView, 'plan is scrolled to the step');
  await shot(page, 'hire-for-step-returned');
  // Back without hiring also returns to the step
  await tap(page, `.plan-step[data-stage="${stageId}"] [data-act="hire-for"]`);
  await tap(page, '[data-act="hire-back"]');
  const back = await page.evaluate(() => window.cd.getState().screen);
  check(back === 'plan', 'back button returns to the plan');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1e. groups: story, deal, relations
console.log('1e. Groups offer jobs once you have a name');
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?dev=1&seed=5`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { document.getElementById('diag').hidden = true; });
  const early = await page.evaluate(() => window.cd.getState().offers);
  check(early.every((o) => o.source === 'own'), 'a new career only has your own leads');
  // Build a reputation and come back to the board until an outfit calls.
  let st;
  for (let k = 0; k < 8; k++) {
    st = await page.evaluate(() => { window.cd.spawn('rep', 80); window.cd.teleport('job'); window.cd.teleport('select'); return window.cd.getState(); });
    if (st.offers.some((o) => o.source !== 'own')) break;
  }
  check(st.offers.some((o) => o.source !== 'own'), `outfits make offers at high rep (${st.offers.map((o) => o.source).join(', ')})`);
  check(await page.locator('.modal.story').count() === 1, 'first contact shows a story scene');
  await shot(page, 'group-story');
  // Clear any scenes: group stories, and crew drama (taking the free last option).
  for (let g = 0; g < 10; g++) {
    if (await page.locator('[data-act="story-ok"]').count()) await tap(page, '[data-act="story-ok"]');
    else if (await page.locator('.modal.story [data-act="drama"]').count()) await tap(page, '.modal.story [data-act="drama"]:last-of-type');
    else break;
  }
  await shot(page, 'group-board');
  const offerId = st.offers.find((o) => o.source !== 'own').id;
  await tap(page, `[data-act="take-offer"][data-id="${offerId}"]`);
  check(await page.locator('.deal-card').count() === 1, 'job screen shows the deal');
  await shot(page, 'group-deal');
  const grade = await page.evaluate(() => window.cd.win());
  const rel = await page.evaluate(() => window.cd.getState().after.relations);
  check(rel.some((r) => r.delta > 0), `a finished job warms the patron (${grade})`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  await shot(page, 'group-relations');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
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
  const order = ['title', 'intro', 'select', 'job', 'pub', 'crew', 'kit', 'fixer', 'plan', 'heist', 'aftermath', 'over'];
  check(JSON.stringify(screens.slice().sort()) === JSON.stringify(order.slice().sort()), 'registry matches sweep order');
  for (const s of order) {
    const got = await page.evaluate((sc) => {
      if (sc === 'title') { window.cd.clearAll(); }
      else if (sc === 'intro') { window.cd.setSeed(2024); window.cd.teleport('intro'); }
      else if (sc === 'select') { window.cd.teleport('select'); }
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
  check(w === 780, `share card renders a 780px PNG, the profile card at 2x (${w})`);
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

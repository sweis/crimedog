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
    const star = s.crew.find((c) => c.id === s.stars[0]?.id) || null;
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
  await page.goto(`${BASE}?hooks=1&seed=31`);
  await page.waitForFunction(() => window.cd);
  await page.evaluate(() => { window.cd.setSeed(31); window.cd.spawn('dog', 'crew'); window.cd.spawn('dog', 'crew'); window.cd.teleport('job'); });
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
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 1d. hire from a plan step
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
  await tap(page, `.plan-step[data-stage="${stageId}"] [data-act="hire-for"]`);
  check(await page.locator('main[data-screen="pub"] .hire-banner').count() === 1, 'plan step opens the pub in hiring-for mode');
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

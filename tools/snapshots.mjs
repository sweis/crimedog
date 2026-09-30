// Deterministic screenshots of every screen (fixed seed, animations off), for
// checking that a refactor changed nothing visible.
//   node tools/snapshots.mjs <outDir>                 capture
//   node tools/snapshots.mjs <outDir> --compare <dir>  capture and diff against a baseline
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';

const out = process.argv[2];
const cmpIdx = process.argv.indexOf('--compare');
const baseline = cmpIdx > 0 ? process.argv[cmpIdx + 1] : null;
if (!out) { console.log('usage: node tools/snapshots.mjs <outDir> [--compare <baselineDir>]'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

let pw;
try { pw = await import('playwright'); } catch { pw = await import(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')); }
const PORT = 8790;
const server = await serve(PORT);
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// Each shot: a name and the dev-hook steps that set it up (seeded, so identical every run).
const SHOTS = [
  ['title', () => window.cd.clearAll()],
  ['intro', () => { window.cd.setSeed(77); window.cd.teleport('intro'); }],
  ['select', () => { window.cd.setSeed(77); window.cd.teleport('select'); }],
  ['select-groups', () => { window.cd.setSeed(77); window.cd.spawn('rep', 80); window.cd.teleport('job'); window.cd.teleport('select'); }],
  ['job', () => { window.cd.setSeed(77); window.cd.teleport('job'); }],
  ['pub', () => { window.cd.setSeed(77); window.cd.teleport('pub'); }],
  ['profile', () => { window.cd.setSeed(77); window.cd.cam('hero-close'); }],
  ['kit', () => { window.cd.setSeed(77); window.cd.teleport('kit'); }],
  ['fixer', () => { window.cd.setSeed(77); window.cd.teleport('fixer'); }],
  ['plan', () => { window.cd.setSeed(77); window.cd.spawn('cash', 3000); window.cd.spawn('dog', 'crew'); window.cd.spawn('dog', 'crew'); window.cd.teleport('plan'); document.querySelector('[data-act="autoplan"]').click(); }],
  ['crew', () => { window.cd.teleport('crew'); }],
  ['heist', () => { window.cd.teleport('heist'); window.cd.step(8); }],
  ['heist-end', () => { window.cd.step(300); }],
  ['aftermath', () => { window.cd.teleport('aftermath'); }],
  ['grade', () => { window.cd.setSeed(78); window.cd.win(); }],
  ['over', () => { window.cd.teleport('over'); }],
];

await page.goto(`http://localhost:${PORT}/?dev=1&seed=77`);
await page.waitForFunction(() => window.cd);
let worst = 0;
for (const [name, fn] of SHOTS) {
  await page.evaluate(fn);
  await page.evaluate(() => { document.getElementById('diag').hidden = true; document.getElementById('toast').innerHTML = ''; window.scrollTo(0, 0); });
  await page.waitForTimeout(120);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  if (baseline && fs.existsSync(path.join(baseline, `${name}.png`))) {
    const [a, b] = [fs.readFileSync(path.join(baseline, `${name}.png`)), fs.readFileSync(file)].map((x) => x.toString('base64'));
    const diff = await page.evaluate(async ([a64, b64]) => {
      const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); return i; };
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return 1;
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
      let changed = 0;
      for (let k = 0; k < da.length; k += 4) if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 24) changed++;
      return changed / (da.length / 4);
    }, [a, b]);
    worst = Math.max(worst, diff);
    console.log(`${diff > 0.001 ? '✗' : '✓'} ${name.padEnd(14)} ${(diff * 100).toFixed(3)}% pixels changed`);
  } else console.log(`  ${name}`);
}
await browser.close();
server.close();
if (errors.length) { console.log('page errors:', errors); process.exit(1); }
if (baseline && worst > 0.001) process.exit(1);

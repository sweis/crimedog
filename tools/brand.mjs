// Draw the brand artwork into assets/: favicon (SVG + 32px PNG), app icons
// (180 / 192 / 512) and the 1200x630 link-preview image.
//   node tools/brand.mjs                              draw everything
//   node tools/brand.mjs --site https://host/path/    also make index.html's preview URLs absolute
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'assets');
let pw;
try { pw = await import('playwright'); } catch { pw = await import(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')); }
const PORT = 8791;
const server = await serve(PORT);
const browser = await pw.chromium.launch();

async function shot(query, size, file, sel) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/tools/brand.html?${query}`);
  await page.waitForFunction(() => window.brandReady);
  await page.locator(sel).screenshot({ path: path.join(out, file), omitBackground: true });
  if (file === 'icon-512.png') {
    // The scalable favicon: the same artwork as a standalone SVG file.
    const svg = await page.evaluate(() => window.iconSVG(512));
    fs.writeFileSync(path.join(out, 'icon.svg'), svg.replace(/\n\s*/g, ''));
  }
  await page.close();
  console.log('  ', file);
}

await shot('size=512', [512, 512], 'icon-512.png', '#icon > svg');
await shot('size=192', [192, 192], 'icon-192.png', '#icon > svg');
await shot('size=32', [32, 32], 'favicon-32.png', '#icon > svg');
await shot('size=180&square', [180, 180], 'apple-touch-icon.png', '#icon > svg');
await shot('og', [1200, 630], 'og-image.png', '#og');
await browser.close();
server.close();

// Link unfurlers (Facebook, LinkedIn, some chat apps) want absolute image URLs.
const siteIdx = process.argv.indexOf('--site');
if (siteIdx > 0) {
  const site = process.argv[siteIdx + 1].replace(/\/?$/, '/');
  const file = path.join(root, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/(property="og:image" content=")[^"]*/, `$1${site}assets/og-image.png`)
    .replace(/(name="twitter:image" content=")[^"]*/, `$1${site}assets/og-image.png`);
  html = /property="og:url"/.test(html)
    ? html.replace(/(property="og:url" content=")[^"]*/, `$1${site}`)
    : html.replace('<meta property="og:type"', `<meta property="og:url" content="${site}">\n  <meta property="og:type"`);
  fs.writeFileSync(file, html);
  console.log('   index.html preview URLs ->', site);
}

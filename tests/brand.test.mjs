// Favicon, app icons and link previews: every file the page points to exists and is the right size.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pngSize = (file) => {
  const b = fs.readFileSync(path.join(root, file));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} is a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const meta = (attr, name) => html.match(new RegExp(`${attr}="${name}" content="([^"]*)"`))?.[1];
const local = (url) => url.replace(/^https?:\/\/[^/]+(\/[^/]*)*?\/(?=assets\/)/, '');

test('the page has a real favicon and app icons', () => {
  for (const [rel, href] of html.matchAll(/<link rel="(icon|apple-touch-icon|manifest)" href="([^"]+)"/g).map((m) => [m[1], m[2]])) {
    assert.ok(fs.existsSync(path.join(root, href)), `${rel}: ${href} exists`);
  }
  assert.match(html, /rel="icon" href="assets\/icon\.svg"/);
  assert.deepEqual(pngSize('assets/favicon-32.png'), [32, 32]);
  assert.deepEqual(pngSize('assets/apple-touch-icon.png'), [180, 180]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
    if (icon.type === 'image/png') assert.deepEqual(pngSize(icon.src), icon.sizes.split('x').map(Number), icon.src);
  }
});

test('sharing the link shows a 1200x630 preview with a title and description', () => {
  for (const [attr, name] of [['property', 'og:title'], ['property', 'og:description'], ['property', 'og:image'], ['name', 'twitter:card'], ['name', 'twitter:image']]) {
    assert.ok(meta(attr, name), `${name} is set`);
  }
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  const img = local(meta('property', 'og:image'));
  assert.deepEqual(pngSize(img), [1200, 630]);
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.ok(fs.statSync(path.join(root, img)).size < 1024 * 1024, 'preview under 1 MB');
});

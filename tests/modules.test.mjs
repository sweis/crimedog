import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Every browser module must at least parse and load (main.js needs a DOM, so
// it's covered by the Playwright smoke test instead).
test('all src modules load', async () => {
  const files = fs.readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'main.js');
  for (const f of files) await assert.doesNotReject(import(`../src/${f}`), f);
});

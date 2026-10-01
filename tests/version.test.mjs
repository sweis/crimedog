// The version in the help panel matches package.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERSION } from '../src/version.js';
import { helpModal } from '../src/panes.js';

test('the help panel shows the version, and it matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, VERSION);
  assert.ok(helpModal().includes(`Version ${VERSION}`));
});

// Every skill matters on a job, and every kind of specialist turns up in the pub.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { SKILLS, APPROACHES, OBSTACLES, VAULTS, ENTRY_POOL, EXIT_POOL, GETAWAY_POOL, BREEDS, TALENTS, NEUTRAL_SKILLS } from '../src/data.js';
import { capOf } from '../src/dogs.js';
import { specialty } from '../src/dogs.js';
import { takeJob } from './helpers.mjs';

test('every skill has several ways to use it, across different kinds of step', () => {
  const where = {
    entry: ENTRY_POOL, exit: EXIT_POOL, getaway: GETAWAY_POOL,
    obstacle: Object.values(OBSTACLES).flatMap((o) => o.options), vault: Object.values(VAULTS).flatMap((v) => v.options),
  };
  for (const sk of SKILLS) {
    const kinds = Object.keys(where).filter((k) => where[k].some((ap) => APPROACHES[ap].skill === sk));
    const count = Object.values(APPROACHES).filter((a) => a.skill === sk && !a.signature).length;
    assert.ok(count >= 4, `${sk}: ${count} approaches`);
    assert.ok(kinds.length >= 3, `${sk}: only in ${kinds}`);
    // Skills that come with the body have breeds known for them; aim, tech, wheels and locks are anybody's.
    if (NEUTRAL_SKILLS.includes(sk)) assert.ok(Object.keys(BREEDS).every((b) => !BREEDS[b].bias.includes(sk) && capOf(b, sk) >= 8), `${sk}: anybody's`);
    else assert.ok(Object.values(BREEDS).filter((b) => b.bias.includes(sk)).length >= 3, `${sk}: breeds`);
    assert.equal(Object.values(TALENTS).filter((t) => t.skill === sk).length, 10, `${sk}: talents`);
  }
});

test('the pub spreads its specialists across every skill', () => {
  const n = 200;
  const firstPub = Object.fromEntries(SKILLS.map((sk) => [sk, 0]));
  let seen = 0;
  for (let seed = 1; seed <= n; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    const shown = new Set();
    for (let k = 0; k < 3; k++) {
      if (k) { s.job.daysLeft = 5; E.askAround(s); }
      const here = new Set(s.pub.map((id) => specialty(s.dogs[id])));
      here.forEach((sk) => shown.add(sk));
      if (!k) for (const sk of here) if (sk) firstPub[sk]++;
    }
    seen += shown.size;
  }
  for (const sk of SKILLS) assert.ok(firstPub[sk] / n >= 0.3, `${sk} in only ${firstPub[sk]}/${n} first pubs`);
  assert.ok(seen / n >= 8.5, `specialities seen after two asks: ${(seen / n).toFixed(1)}`);
});

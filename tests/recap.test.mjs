// Heist history: every finished job is kept as a recap of who did what and how it went.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { shortName } from '../src/dogs.js';
import { HISTORY_MAX } from '../src/recap.js';
import { takeJob, finish, fakeHeist } from './helpers.mjs';

function playOne(seed) {
  const s = E.newGame(seed);
  takeJob(s);
  s.cash = 5000;
  for (const id of s.pub.slice(0, 3)) E.hire(s, id);
  E.pullJob(s);
  const r = s.result;
  E.resolveHeist(s);
  finish(s);
  return { s, r };
}

test('a finished job leaves a recap: every step, who tried it and how it went', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { s, r } = playOne(seed);
    const h = s.history[0];
    assert.equal(h.name, s.job.name);
    assert.equal(h.grade, s.after.grade.letter);
    assert.equal(h.type, s.job.type);
    const attempts = r.beats.filter((b) => (b.kind === 'ok' || b.kind === 'fail') && b.approach);
    assert.equal(h.steps.reduce((n, st) => n + st.tries.length, 0), attempts.length, `seed ${seed}: every attempt retold`);
    const names = new Set(r.crew.map((id) => shortName(s.dogs[id])));
    for (const st of h.steps) for (const t of st.tries) assert.ok(names.has(t.dog), `${t.dog} was on the crew`);
    assert.equal(h.crew.length, r.crew.length);
    for (const c of h.crew) {
      assert.ok(c.look && c.breed, 'enough to draw them');
      const fate = r.captured.some((x) => x.id === c.id) ? 'nicked' : null;
      if (fate) assert.ok(['nicked', 'farm'].includes(c.fate));
    }
    assert.deepEqual(h.loot.length, r.secured.length);
    JSON.parse(JSON.stringify(h)); // saves cleanly
  }
});

test('the history keeps the last thirty jobs, newest first', () => {
  const s = E.newGame(3);
  for (let j = 0; j < HISTORY_MAX + 5; j++) {
    takeJob(s);
    fakeHeist(s);
    finish(s);
    E.nextJob(s);
    while (s.story.length) s.story.shift();
  }
  assert.equal(s.history.length, HISTORY_MAX);
  assert.ok(s.history[0].day > s.history[1].day);
});

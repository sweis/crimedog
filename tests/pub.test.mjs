// The pub from the job board: who's about before you pick a job is who's there when you take it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { genJob } from '../src/heists.js';
import { makeRng } from '../src/rng.js';
import { skillOf } from '../src/dogs.js';
import { takeJob, fakeHeist, finish } from './helpers.mjs';

test('the pub is filled on the job board, and the same faces are there when you take a job', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = E.newGame(seed);
    for (let j = 0; j < 3; j++) {
      assert.equal(s.phase, 'select');
      const board = s.pub.slice();
      assert.ok(board.length >= 5, `seed ${seed}: ${board.length} in the pub`);
      assert.ok(board.every((id) => s.dogs[id] && s.dogs[id].status === 'free'));
      takeJob(s);
      for (const id of board) assert.ok(s.pub.includes(id), `seed ${seed} job ${j}: ${id} still there`);
      fakeHeist(s);
      finish(s);
      while (s.story.length) E.dismissStory(s);
      E.nextJob(s);
      if (s.over) break;
    }
  }
});

test('you can\'t hire from the job board, only once you have a job', () => {
  const s = E.newGame(5);
  const id = s.pub[0];
  assert.equal(E.hire(s, id).ok, false);
  takeJob(s);
  s.cash = 5000;
  assert.ok(E.hire(s, id).ok);
});

test('a job needing a specialist brings one in when you take it', () => {
  let found = 0;
  for (let seed = 1; seed <= 200 && found < 10; seed++) {
    const s = E.newGame(seed);
    const job = genJob(s, makeRng({ s: seed }), { type: 'breakin' });
    const sp = job.stages.find((st) => st.needs);
    if (!sp) continue;
    found++;
    s.offers[0].job = job;
    s.offers[0].id = job.id;
    takeJob(s);
    assert.ok(s.pub.some((d) => skillOf(s.dogs[d], sp.needs.skill) >= sp.needs.min), `seed ${seed}`);
  }
  assert.ok(found >= 5);
});

test('a star seen from the job board can be hired on the job you take', () => {
  let seen = 0;
  for (let seed = 1; seed <= 300 && seen < 5; seed++) {
    const s = E.newGame(seed);
    s.rep = 80;
    takeJob(s);
    fakeHeist(s);
    finish(s);
    while (s.story.length) E.dismissStory(s);
    E.nextJob(s);
    if (s.over) continue;
    const star = s.pub.map((id) => s.dogs[id]).find((d) => d.rarity && d.inTown === s.townKey);
    if (!star) continue;
    seen++;
    takeJob(s);
    s.cash = 50000;
    const r = E.hire(s, star.id);
    assert.ok(r.ok, r.msg);
  }
  assert.ok(seen >= 3, `stars seen from the board: ${seen}`);
});

// The career card: the nest egg, reputation, the Inspector, the record, best and
// worst jobs, the closest mate and the biggest enemy.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { careerOf } from '../src/career.js';
import { rivalsOf } from '../src/rivals.js';
import { newRunner } from '../src/runners.js';
import { genDog } from '../src/dogs.js';
import { career } from '../tools/balance.mjs';

test('a fresh game: nothing to show off yet, and nothing breaks', () => {
  const s = E.newGame(1);
  const c = careerOf(s);
  assert.equal(c.record.jobs, 0);
  assert.equal(c.best, null);
  assert.equal(c.worst, null);
  // You start with an old mate in your book; nobody else counts yet.
  assert.ok(!c.closest || s.dogs[c.closest.dog].met);
  assert.equal(c.enemy, null);
  assert.equal(c.status, 'Still at large');
  assert.ok(c.nest.pct >= 0 && c.nest.pct < 100);
});

test('the record adds up over real careers, and arrests and the rest are counted', () => {
  let arrests = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s } = career(seed, seed % 2 ? 'smart' : 'reckless', 12);
    const c = careerOf(s);
    const R = c.record;
    assert.equal(R.success + R.failed, R.jobs, `seed ${seed}`);
    for (const k of ['arrests', 'runners', 'lost', 'hospital', 'farmed']) assert.ok(Number.isInteger(R[k]) && R[k] >= 0, `${k}: ${R[k]}`);
    // The counters agree with the rap sheet (it holds every job of a short career).
    const fates = s.history.flatMap((h) => h.crew.map((x) => x.fate));
    assert.equal(R.arrests - (s.stats.pinched || 0), fates.filter((f) => f === 'nicked').length, `seed ${seed} arrests (plus any picked up later)`);
    assert.equal(R.hospital, fates.filter((f) => f === 'hospital').length, `seed ${seed} hospital`);
    arrests += R.arrests;
    if (c.best && c.worst) assert.ok('SABCDF'.indexOf(c.best.grade) <= 'SABCDF'.indexOf(c.worst.grade), `seed ${seed}`);
    if (c.closest) assert.ok(['free', 'crew', 'pound', 'hospital', 'retired'].includes(s.dogs[c.closest.dog].status));
    if (s.over) assert.notEqual(c.status, 'Still at large');
  }
  assert.ok(arrests > 0, 'somebody got nicked somewhere');
});

test('an older save without the counters reads them off the rap sheet', () => {
  const { s } = career(5, 'reckless', 10);
  const want = careerOf(s).record;
  for (const k of ['arrests', 'runners', 'lost', 'hospital']) delete s.stats[k];
  assert.deepEqual(careerOf(s).record, want);
});

test('the biggest enemy: a crossed outfit beats a rival with a grudge; a runner counts too', () => {
  const s = E.newGame(2);
  const R = rivalsOf(s);
  R.dan.met = true;
  R.dan.beef = 1;
  assert.equal(careerOf(s).enemy.id, 'dan');
  const rng = E.rngOf(s);
  const d = genDog(s, rng, {});
  s.dogs[d.id] = d;
  newRunner(s, d, 'the Golden Bone', 900, rng);
  assert.equal(careerOf(s).enemy.kind, 'runner');
  assert.match(careerOf(s).enemy.why, /Golden Bone/);
  s.groups.family.standing = -60;
  const e = careerOf(s).enemy;
  assert.equal(e.kind, 'group');
  assert.equal(e.id, 'family');
  // The Ghost is a mystery, never an enemy.
  R.ghost.met = true;
  R.ghost.beef = 9;
  assert.notEqual(careerOf(s).enemy.id, 'ghost');
});

test('retiring: the epilogues and the career card agree on who your closest mate is', async () => {
  const { RETIRE } = await import('../src/retire.js');
  let checked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { s } = career(seed, 'smart', 20);
    if (s.over) continue;
    while (s.story.length) E.dismissStory(s);
    s.cash = RETIRE.goal;
    E.retireNow(s);
    const closest = careerOf(s).closest;
    const first = s.over.epilogues[0];
    if (!closest || !['close', 'pound'].includes(first.kind)) continue;
    assert.equal(first.dog, closest.dog, `seed ${seed}: the epilogue names ${s.dogs[first.dog].first}, the card ${closest.name}`);
    for (const e of s.over.epilogues.slice(1)) assert.ok(e.kind !== 'close' || e.dog !== closest.dog, `seed ${seed}: ${closest.name} twice`);
    checked++;
  }
  assert.ok(checked >= 15, `${checked} careers checked`);
});

test('a tie on how much they like you goes to whoever has done more jobs with you', async () => {
  const { RETIRE } = await import('../src/retire.js');
  const s = E.newGame(3);
  const rng = E.rngOf(s);
  const a = genDog(s, rng, {});
  const b = genDog(s, rng, {});
  for (const d of Object.values(s.dogs)) d.relation = 0;
  Object.assign(a, { met: true, relation: 100, jobs: 3 });
  Object.assign(b, { met: true, relation: 100, jobs: 9 });
  s.dogs[a.id] = a;
  s.dogs[b.id] = b;
  s.cash = RETIRE.goal;
  E.retireNow(s);
  assert.equal(careerOf(s).closest.dog, b.id);
  assert.equal(s.over.epilogues[0].dog, b.id);
  assert.equal(s.over.epilogues[0].kind, 'close');
});

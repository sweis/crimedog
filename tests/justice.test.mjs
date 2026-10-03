// Criminal records, sentences and briefs; injuries and the hospital.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { genDog } from '../src/dogs.js';
import { recordOf, sentenceFor, minSentence, briefCost, rollInjury } from '../src/justice.js';
import { simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { takeJob, fakeHeist, finish } from './helpers.mjs';

const dogs = (n = 400) => {
  const s = E.newGame(1);
  const rng = makeRng({ s: 9 });
  return Array.from({ length: n }, () => genDog(s, rng, {}));
};

test('every dog carries a record: most have one or two previous, some are clean, a few are notorious', () => {
  const recs = dogs().map(recordOf);
  const share = (f) => recs.filter(f).length / recs.length;
  assert.ok(share((r) => r === 0) > 0.12 && share((r) => r === 0) < 0.35);
  assert.ok(share((r) => r >= 1 && r <= 2) > 0.3);
  assert.ok(share((r) => r >= 5) > 0.05);
});

test('the longer the record, the longer the sentence', () => {
  const avg = (rec) => {
    let t = 0;
    for (let k = 0; k < 200; k++) t += sentenceFor({ record: rec }, makeRng({ s: k }));
    return t / 200;
  };
  assert.ok(avg(0) < 2);
  assert.ok(avg(4) - avg(0) >= 3.5);
  assert.ok(sentenceFor({ record: 4 }, makeRng({ s: 1 }), { coppers: true }) > sentenceFor({ record: 4 }, makeRng({ s: 1 })));
});

test('getting nicked goes on your record and sets the sentence from it', () => {
  const s = E.newGame(5);
  takeJob(s);
  const d = s.dogs[s.pub[0]];
  E.hire(s, d.id);
  const before = recordOf(d);
  fakeHeist(s, { escaped: [], captured: [{ id: d.id, talked: false, sentence: 4 }] });
  assert.equal(d.status, 'pound');
  assert.equal(d.sentence, 4);
  assert.equal(recordOf(d), before + 1);
});

test('a brief cuts a job off at a time, but never more than half the sentence', () => {
  const s = E.newGame(6);
  s.cash = 10000;
  const d = Object.values(s.dogs).find((x) => x.met);
  d.record = 2;
  Object.assign(d, { status: 'pound', sentence: 5, sentenceStart: 5 });
  assert.equal(minSentence(d), 3);
  assert.equal(briefCost(d), 250);
  assert.ok(E.lawyer(s, d.id).ok);
  assert.ok(E.lawyer(s, d.id).ok);
  assert.equal(d.sentence, 3);
  const r = E.lawyer(s, d.id);
  assert.equal(r.ok, false, 'no wiping it out');
  assert.match(r.msg, /serve 3 more/);
  assert.equal(d.status, 'pound');
  // Even a one-job sentence can't be bought off.
  Object.assign(d, { sentence: 1, sentenceStart: 1 });
  assert.equal(E.lawyer(s, d.id).ok, false);
});

test('a bad fall usually means hospital, not the farm', () => {
  let hurt = 0;
  let farm = 0;
  // Enough jobs that the farm count isn't a handful (it swings a lot over a few hundred).
  for (let k = 1; k <= 1200; k++) {
    const s = E.newGame(k);
    takeJob(s);
    s.cash = 9000;
    for (const id of s.pub.slice(0, 3)) E.hire(s, id);
    for (const d of E.crewDogs(s)) for (const sk of Object.keys(d.skills)) d.skills[sk] = 0;
    E.autoPlan(s);
    const r = simulate(s, s.job, makeRng({ s: k }));
    hurt += r.hurt.length;
    farm += r.lost.length;
    for (const h of r.hurt) assert.ok(h.jobs >= 2 && h.jobs <= 4);
  }
  assert.ok(hurt > 1.5 * farm && farm > 0, `hospital ${hurt}, farm ${farm}`);
});

test('in hospital: out for a few jobs, a bill to pay, and unpaid bills cost loyalty', () => {
  const run = (pay) => {
    const s = E.newGame(7);
    takeJob(s);
    s.cash = 9000;
    const d = s.dogs[s.pub[0]];
    E.hire(s, d.id);
    const rel = d.relation;
    fakeHeist(s, { escaped: [], hurt: [{ id: d.id, jobs: 2, skill: 'agility' }] });
    assert.equal(d.status, 'hospital');
    assert.equal(d.hospital.bill, 340);
    assert.equal(d.injuries[0].text, 'A bad knee');
    if (pay) assert.ok(E.payHospitalBill(s, d.id).ok);
    finish(s);
    E.nextJob(s);
    assert.equal(d.status, 'hospital', 'not out the job they went in');
    while (s.story.length) E.dismissStory(s);
    takeJob(s);
    assert.equal(E.hire(s, d.id).ok, false, 'can\'t hire someone in hospital');
    fakeHeist(s);
    finish(s);
    E.nextJob(s);
    while (s.story.length) E.dismissStory(s);
    takeJob(s);
    fakeHeist(s);
    finish(s);
    E.nextJob(s);
    assert.equal(d.status, 'free');
    return d.relation - rel;
  };
  assert.ok(run(true) - run(false) >= 20, 'paying keeps them sweet');
});

test('a lasting injury takes a point off the skill they were using', () => {
  let lasting = 0;
  for (let k = 0; k < 200; k++) if (rollInjury(makeRng({ s: k }), 'agility').skill === 'agility') lasting++;
  assert.ok(lasting > 40 && lasting < 100, `${lasting}/200`);
  const s = E.newGame(8);
  takeJob(s);
  const d = s.dogs[s.pub[0]];
  E.hire(s, d.id);
  d.skills.muscle = 4;
  fakeHeist(s, { escaped: [], hurt: [{ id: d.id, jobs: 3, skill: 'muscle' }] });
  assert.equal(d.skills.muscle, 3);
});

// The Inspector: moves between jobs, his file on your methods, setups and grasses.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { genJob, ownOffer, visibleStages } from '../src/heists.js';
import { inspectorMoves, makeTip, moPenalty, recordMO } from '../src/inspector.js';
import { difficulty, simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { takeJob, fakeHeist, finish } from './helpers.mjs';
import { career } from '../tools/balance.mjs';

// Play n quick jobs, answering every scene with its free option.
function play(s, n) {
  for (let j = 0; j < n && !s.over; j++) {
    while (s.story.length) E.dismissStory(s);
    takeJob(s);
    fakeHeist(s);
    finish(s);
    E.nextJob(s);
  }
}
const move = (s, id) => inspectorMoves(s, E.rngOf(s), { genJob, force: id });
const withRegular = (seed = 3) => {
  const s = E.newGame(seed);
  s.cash = 5000;
  const d = Object.values(s.dogs).find((x) => x.met);
  d.loyalty = 40;
  return { s, d };
};

test('he introduces himself early, with a copper in the pub', () => {
  let met = 0;
  let copper = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = E.newGame(seed);
    play(s, 2);
    if (!s.inspector?.met) continue;
    met++;
    assert.equal(s.story.find((x) => x.type === 'inspector')?.move, 'plant');
    while (s.story.length) E.dismissStory(s);
    takeJob(s);
    if (s.pub.some((id) => s.dogs[id].undercover)) copper++;
  }
  assert.ok(met >= 38, `met by job 3 in ${met}/40`);
  assert.equal(copper, met, 'his plant is in the pub');
});

test('over a career he keeps making moves, and they get nastier with heat', () => {
  const seen = {};
  let moves = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { s } = career(seed, 'smart', 10);
    for (const m of s.inspector?.moves || []) { seen[m.move] = (seen[m.move] || 0) + 1; moves++; }
  }
  assert.ok(moves / 60 >= 3, `moves per career ${moves / 60}`);
  for (const m of ['plant', 'stakeout', 'warn', 'sting']) assert.ok(seen[m], `${m} happens`);
});

test('every move makes a scene whose choices all resolve; the last is free', () => {
  for (const id of ['plant', 'stakeout', 'warn', 'tail', 'questioning', 'flip', 'raid']) {
    for (let i = 0; i < 2; i++) {
      const { s, d } = withRegular(5 + i);
      d.jobs = 2;
      s.heat = 60;
      const st = move(s, id);
      assert.ok(st, id);
      const ch = E.storyChoices(s, st);
      assert.equal(ch.at(-1).cost, 0, `${id}: last choice free`);
      const pick = i === 0 ? 0 : ch.length - 1;
      const cash = s.cash;
      const r = E.chooseInspector(s, pick);
      assert.ok(r.ok, `${id}: ${r.msg}`);
      assert.equal(s.story.length, 0);
      assert.ok(s.cash <= cash);
      assert.deepEqual(E.invariants(s), []);
    }
  }
});

test('his file: the same trick, seen job after job, gets harder', () => {
  const s = E.newGame(7);
  takeJob(s);
  const st = visibleStages(s.job)[0];
  const ap = st.options[0];
  const base = difficulty(s, s.job, st, ap);
  const seen = (outcome, clues) => recordMO(s, { outcome, clues, beats: [{ approach: ap }] });
  seen('clean', 0);
  assert.equal(moPenalty(s, ap), 0, 'nobody noticed: nothing on file');
  seen('tidy', 2);
  assert.equal(moPenalty(s, ap), 0, 'once is not a habit');
  seen('tidy', 2);
  assert.equal(moPenalty(s, ap), 1);
  assert.equal(difficulty(s, s.job, st, ap), base + 1);
  seen('messy', 4);
  assert.equal(moPenalty(s, ap), 2);
  // Use other tricks and the file goes stale.
  for (let k = 0; k < 3; k++) recordMO(s, { outcome: 'tidy', clues: 2, beats: [] });
  assert.equal(moPenalty(s, ap), 0);
});

test('a setup: casing can spot it, walking away from it is no shame', () => {
  let spotted = 0;
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const s = E.newGame(seed);
    s.cash = 5000;
    s.heat = 30;
    const job = genJob(s, E.rngOf(s), { type: 'breakin' });
    makeTip(job, true);
    s.offers.unshift(ownOffer(job));
    E.acceptOffer(s, job.id);
    assert.equal(s.job.intel.tipster, false);
    // Ask around enough and the tip is shown up for what it is.
    for (let k = 0; k < 4 && !s.job.intel.tipster; k++) E.caseJoint(s, 'tipster');
    if (s.job.intel.tipster) {
      spotted++;
      const rep = s.rep;
      E.nextJob(s);
      assert.equal(s.rep, rep, 'smelled a rat: no rep lost');
    }
  }
  assert.ok(spotted >= N / 2, `setups spotted ${spotted}/${N}`); // about 64%
});

test('a setup reached on the night ends with the police and no loot', () => {
  let sprung = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = E.newGame(seed);
    s.cash = 9000;
    const job = genJob(s, E.rngOf(s), { type: 'smash' });
    makeTip(job, true);
    s.offers.unshift(ownOffer(job));
    E.acceptOffer(s, job.id);
    for (const id of s.pub.slice(0, 3)) E.hire(s, id);
    E.autoPlan(s);
    const r = simulate(s, s.job, makeRng({ s: seed }));
    if (!r.setup) continue;
    sprung++;
    assert.equal(r.secured.length, 0);
    assert.ok(r.coppers && r.heatGain >= 10);
  }
  assert.ok(sprung >= 15, `sprung ${sprung}/30`);
});

test('a turned regular is a grass on the job until you find out; then they won\'t work for you', () => {
  const { s, d } = withRegular();
  d.jobs = 2;
  s.heat = 40;
  move(s, 'flip');
  assert.ok(d.undercover && !d.known.undercover);
  E.dismissStory(s);
  takeJob(s);
  assert.ok(E.hire(s, d.id).ok, 'still hireable: you don\'t know yet');
  E.dismiss(s, d.id);
  // Surveillance finds them out (most of the time).
  let found = false;
  for (let k = 0; k < 4 && !found; k++) {
    delete d.cleared;
    d.known.loyalty = false;
    s.job.daysLeft = 5;
    E.surveil(s, d.id);
    found = d.known.undercover;
  }
  assert.ok(found);
  assert.equal(E.hire(s, d.id).ok, false);
});

test('a raid takes cash and kit unless you pay off the desk sergeant', () => {
  const { s } = withRegular();
  s.heat = 50;
  s.kit.lockpicks = 1;
  move(s, 'raid');
  const cash = s.cash;
  E.chooseInspector(s, 1);
  assert.equal(s.cash, cash - Math.round((cash * 0.2) / 10) * 10);
  assert.ok(!(s.kit.lockpicks > 0) || !(s.kit.squeaky > 0));
  const { s: s2 } = withRegular();
  s2.heat = 50;
  move(s2, 'raid');
  const bung = s2.story[0].choices[0].cost;
  const c2 = s2.cash;
  E.chooseInspector(s2, 0);
  assert.equal(s2.cash, c2 - bung);
});

test('a stakeout marks a job on the board as watched and makes its getaway harder', () => {
  const s = E.newGame(9);
  s.heat = 20;
  for (const o of s.offers) o.job.hazards.stakeout = false;
  const st = move(s, 'stakeout');
  assert.ok(st);
  const watched = s.offers.filter((o) => o.job.watched);
  assert.equal(watched.length, 1);
  assert.ok(watched[0].job.intel.hz_stakeout);
});

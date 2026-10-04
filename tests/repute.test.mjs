// Reputation's sides: track record and generosity make the score; soft or hard changes how the crew feel.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { generosityOf, hardnessOf, generosityBonus, addHardness, crewFeeling } from '../src/repute.js';
import { simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { addRep } from '../src/util.js';
import { takeJob, fakeHeist } from './helpers.mjs';

// One job, paid out at `pct`.
function jobPaid(seed, pct) {
  const s = E.newGame(seed);
  takeJob(s);
  fakeHeist(s);
  if (s.after.step === 'deliver') E.deliver(s);
  if (s.after.step === 'fence') E.fence(s, 'hal');
  s.cash += 10000; // can always cover the cut
  assert.ok(E.payCrew(s, pct).ok);
  return s;
}

test('generous cuts raise generosity and the score; stiffing the crew lowers both and hardens you', () => {
  const generous = jobPaid(3, 45);
  const stiff = jobPaid(3, 0);
  assert.ok(generosityOf(generous) > 50 && generosityOf(stiff) < 50);
  assert.ok(generous.rep > stiff.rep, `${generous.rep} vs ${stiff.rep}`);
  assert.equal(generous.repParts.generosity, generosityBonus(generosityOf(generous)));
  assert.equal(stiff.repParts.generosity, generosityBonus(generosityOf(stiff)));
  assert.ok(hardnessOf(stiff) > 0 && hardnessOf(generous) < 0);
});

test('soft or hard never changes the score', () => {
  const s = E.newGame(4);
  const rep = s.rep;
  addHardness(s, 80);
  addHardness(s, -150);
  assert.equal(s.rep, rep);
  assert.equal(hardnessOf(s), -70);
});

test('a hard mastermind has fewer runners; a soft one, a few more', () => {
  const runs = (h) => {
    let n = 0;
    for (let k = 1; k <= 300; k++) {
      const s = E.newGame(k);
      s.hardness = h;
      takeJob(s);
      s.cash = 9000;
      for (const id of s.pub.slice(0, 3)) E.hire(s, id);
      for (const d of E.crewDogs(s)) { d.greed = 90; d.loyalty = 10; d.quirks = d.quirks.filter((q) => q !== 'goodboy'); }
      E.autoPlan(s);
      n += simulate(s, s.job, makeRng({ s: k })).runners.length;
    }
    return n;
  };
  const hard = runs(100);
  const even = runs(0);
  const soft = runs(-100);
  assert.ok(hard < even * 0.5, `hard ${hard} vs even ${even}`);
  assert.ok(soft >= even, `soft ${soft} vs even ${even}`);
});

test('hard masterminds are harder to warm to', () => {
  const warmth = (h) => {
    const s = E.newGame(6);
    s.hardness = h;
    takeJob(s);
    fakeHeist(s);
    if (s.after.step === 'deliver') E.deliver(s);
    if (s.after.step === 'fence') E.fence(s, 'hal');
    const d = s.dogs[s.result.crew[0]];
    const before = d.relation;
    s.cash += 10000;
    E.payCrew(s, 30);
    return d.relation - before;
  };
  assert.ok(warmth(-100) - warmth(100) >= 6, `${warmth(-100)} vs ${warmth(100)}`);
  assert.equal(Math.round(crewFeeling({ hardness: 100 }).warmth), -4);
});

test('the farm hardens you; a brief for someone in the pound softens you', () => {
  const s = E.newGame(7);
  const d = Object.values(s.dogs).find((x) => x.met);
  E.farm(s, d.id);
  assert.equal(hardnessOf(s), 15);
  const t = E.newGame(8);
  const p = Object.values(t.dogs).find((x) => x.met);
  p.status = 'pound';
  p.sentence = 3;
  E.lawyer(t, p.id);
  assert.ok(hardnessOf(t) < 0 && generosityOf(t) > 50);
});

test('the bigger your name, the harder it grows: gains taper from 40 to nothing at the top; losses hit in full', async () => {
  const { repGain } = await import('../src/util.js');
  assert.equal(repGain(20, 9), 9);
  assert.equal(repGain(39, 9), 9);
  assert.ok(repGain(60, 9) < 9 && repGain(80, 9) < repGain(60, 9) && repGain(95, 9) <= 1);
  assert.equal(repGain(100, 14), 0);
  assert.equal(repGain(90, -4), -4);
});

test('a big name brings expectations: from 50 every job is marked down, so a so-so one can cost you', () => {
  assert.equal(E.repExpected(30), 0);
  assert.equal(E.repExpected(50), 1);
  assert.equal(E.repExpected(70), 2);
  assert.equal(E.repExpected(90), 3);
  // Straight A's settle short of the top on the record alone; it takes S's (or a generous cut) to get there.
  const settle = (grade) => {
    const s = { rep: 25, repParts: {} };
    for (let j = 0; j < 60; j++) addRep(s, { S: 14, A: 9, B: 6, C: 3 }[grade] - E.repExpected(s.rep));
    return s.rep;
  };
  assert.ok(settle('A') < 95 && settle('A') >= 80, `${settle('A')}`);
  assert.ok(settle('C') <= 70 && settle('C') < settle('A'), `${settle('C')}`);
  assert.ok(settle('S') > settle('A'));
});

test('masters answer more readily the bigger your name: a quarter at 50, a half at the top', () => {
  assert.equal(E.masterChance(50), 0.25);
  assert.equal(E.masterChance(100), 0.5);
  assert.ok(E.masterChance(75) > 0.25 && E.masterChance(75) < 0.5);
  assert.equal(E.masterChance(20), 0.25);
});

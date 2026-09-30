import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { genOffers } from '../src/groups.js';
import { fakeHeist as fake, boardWith as offer } from './helpers.mjs';

test('heat 100 ends the game at the next job instead of cooling off', () => {
  const s = E.newGame(2);
  E.acceptOffer(s, s.offers[0].id);
  fake(s);
  E.fence(s, 'hal'); E.payCrew(s, 30);
  s.heat = 100;
  E.nextJob(s);
  assert.equal(s.over?.reason, 'inspector');
});

test('a sting after a delivery keeps the delivery money on the books', () => {
  const { s, o } = offer('poodle', 'commission');
  E.acceptOffer(s, o.id);
  s.job.stingFence = true;
  fake(s);
  E.deliver(s);
  const got = s.after.received;
  assert.ok(got > 0);
  if (s.after.step === 'fence') E.fence(s, 'francesca');
  assert.equal(s.after.received, got);
});

test('paying a debt removes the marker job; botching a stale marker creates no £0 debt', () => {
  const { s, o } = offer('family', 'commission');
  s.groups.family.debt = { amount: 500, patience: 2 };
  genOffers(s, E.rngOf(s));
  assert.ok(s.offers.some((x) => x.kind === 'marker'));
  E.payDebt(s, 'family');
  assert.ok(!s.offers.some((x) => x.kind === 'marker'));
  // a marker taken after the debt is gone, then botched
  s.groups.family.debt = { amount: 500, patience: 2 };
  genOffers(s, E.rngOf(s));
  const m = s.offers.find((x) => x.kind === 'marker');
  E.acceptOffer(s, m.id);
  s.groups.family.debt = null;
  fake(s, { secured: [], outcome: 'bust' });
  E.payCrew(s, 0);
  assert.equal(s.groups.family.debt, null);
});

test('farming a crew member takes them off the plan and out of the building', () => {
  const s = E.newGame(3);
  E.acceptOffer(s, s.offers[0].id);
  const id = s.pub.find((x) => s.dogs[x].fee <= s.cash);
  E.hire(s, id);
  E.autoPlan(s);
  s.job.insider = id;
  E.farm(s, id);
  assert.equal(s.job.insider, null);
  assert.ok(Object.values(s.job.plan).every((p) => p.dog !== id));
});

test('pound time starts the job after you are caught', () => {
  const s = E.newGame(4);
  E.acceptOffer(s, s.offers[0].id);
  const id = s.pub.find((x) => s.dogs[x].fee <= s.cash);
  E.hire(s, id);
  fake(s, { secured: [], outcome: 'bust', escaped: [], captured: [{ id, talked: true, sentence: 1 }] });
  E.payCrew(s, 0);
  E.nextJob(s);
  assert.equal(s.dogs[id].status, 'pound', 'still inside after the job they were caught on');
  E.acceptOffer(s, s.offers[0].id);
  E.hire(s, s.pub.find((x) => s.dogs[x].fee <= s.cash));
  fake(s);
  E.fence(s, 'hal'); E.payCrew(s, 30);
  E.nextJob(s);
  assert.equal(s.dogs[id].status, 'free', 'out after serving one job');
});

test('sniffing out a plant does not count against the crew grade', () => {
  const s = E.newGame(5);
  E.acceptOffer(s, s.offers[0].id);
  const [a, b] = s.pub.filter((x) => s.dogs[x].fee <= 400).slice(0, 2);
  s.cash = 5000;
  E.hire(s, a); E.hire(s, b);
  fake(s, { exposed: [b], escaped: [a] });
  E.fence(s, 'hal'); E.payCrew(s, 30);
  assert.equal(s.after.grade.parts.crew, 15);
});

test('nextJob only runs after a job (or to walk away from one)', () => {
  const s = E.newGame(6);
  assert.equal(E.nextJob(s).ok, false);
});

test('walking away is not a free way to cool off', () => {
  const s = E.newGame(7);
  E.acceptOffer(s, s.offers[0].id);
  s.heat = 40;
  E.nextJob(s);
  assert.equal(s.heat, 40);
});

test('the dog who eats the evidence is one who was actually on the job', async () => {
  const { simulate } = await import('../src/sim.js');
  const { makeRng } = await import('../src/rng.js');
  const s = E.newGame(5);
  E.acceptOffer(s, s.offers[0].id);
  s.cash = 5000;
  const [a, b] = s.pub.slice(0, 2);
  E.hire(s, a); E.hire(s, b);
  for (const id of [a, b]) s.dogs[id].quirks = ['eatsevidence'];
  // a is first on the plan but only drives the getaway, so on jobs that stop short a never acts.
  const getaway = s.job.stages.find((st) => st.id === 'getaway');
  E.setPlan(s, 'getaway', { dog: a, approach: getaway.options[0] });
  for (const st of s.job.stages) if (st !== getaway) E.setPlan(s, st.id, { dog: b, approach: st.options[0] });
  let ate = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = simulate(s, s.job, makeRng({ s: seed }));
    const acted = new Set(r.beats.filter((x) => x.kind === 'ok' || x.kind === 'fail').map((x) => x.dog));
    for (const x of r.beats.filter((y) => /eats a glove/.test(y.text))) {
      assert.ok(acted.has(x.dog), `seed ${seed}: ${x.dog} ate evidence without acting`);
      ate++;
    }
  }
  assert.ok(ate > 0);
});

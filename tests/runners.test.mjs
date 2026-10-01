// Crew who do a runner become rivals: hunt them down, then steal it back, the farm, or mercy.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { newRunner, runnersBetweenJobs } from '../src/runners.js';
import { hardnessOf } from '../src/repute.js';
import { takeJob, fakeHeist, finish } from './helpers.mjs';

// A game at the job board where your old mate has just run off with the takings.
function ranOff(seed = 4) {
  const s = E.newGame(seed);
  s.cash = 5000;
  const d = Object.values(s.dogs).find((x) => x.met);
  for (const k of Object.keys(d.skills)) d.skills[k] = 1;
  d.talents = [];
  Object.assign(d, { status: 'gone', left: 'runner', relation: -100 });
  newRunner(s, d, 'The Golden Bone', 2000, E.rngOf(s));
  return { s, d, r: s.runners[d.id] };
}
const pick = (s, effect) => E.chooseRunner(s, s.story[0].choices.findIndex((c) => c.effect === effect));
const nextBetween = (s) => runnersBetweenJobs(s, E.rngOf(s));

test('a runner on a job becomes a rival to deal with', () => {
  for (let seed = 1; seed < 400; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    s.cash = 9000;
    const d = s.dogs[s.pub[0]];
    E.hire(s, d.id);
    fakeHeist(s, { runners: [{ id: d.id, lootId: s.job.loot[0].id }], secured: s.job.loot.slice(1).map((l) => l.id) });
    assert.equal(s.runners[d.id].stage, 'loose');
    assert.equal(s.runners[d.id].took, s.job.loot[0].name);
    const st = s.story.find((x) => x.type === 'runner');
    assert.ok(st && st.dog === d.id && st.choices.some((c) => c.effect === 'hunt'));
    return;
  }
});

test('putting the word out finds them after a couple of jobs (quicker with a tracker)', () => {
  const { s, r } = ranOff();
  const cash = s.cash;
  pick(s, 'hunt');
  assert.equal(s.cash, cash - 150);
  assert.equal(r.stage, 'hunting');
  nextBetween(s);
  assert.equal(r.stage, 'hunting', 'one lead is not enough');
  nextBetween(s);
  assert.equal(r.stage, 'found');
  assert.equal(s.story.at(-1).move, 'found');
  // With a good nose in your book it takes one job.
  const t = ranOff(5);
  const nose = Object.values(t.s.dogs).find((x) => x.status === 'free') || null;
  if (nose) {
    nose.met = true;
    nose.skills.nose = 5;
    t.s.story = [];
    E.runnerAction(t.s, t.d.id, 'hunt');
    nextBetween(t.s);
    assert.equal(t.r.stage, 'found');
  }
});

test('steal it back: their hideout goes on the board, stays there, and a win gets it back', () => {
  const { s, d, r } = ranOff();
  r.stage = 'found';
  s.story = [];
  assert.ok(E.runnerAction(s, d.id, 'stealback').ok);
  const o = s.offers.find((x) => x.job.runnerHit === d.id);
  assert.ok(o && o.job.loot[0].name === 'The Golden Bone' && o.job.loot[0].value >= 2000);
  E.digLeads(s);
  assert.ok(s.offers.some((x) => x.job.runnerHit === d.id), 'still on the board');
  E.acceptOffer(s, o.id);
  fakeHeist(s);
  finish(s);
  assert.equal(r.stage, 'done');
  assert.equal(r.ended, 'robbed');
  assert.ok(s.after.rivals.some((t) => t.includes('back from')));
});

test('the farm is hard, gets some of it back and earns a little fear', () => {
  const { s, d, r } = ranOff();
  r.stage = 'found';
  s.story = [];
  const cash = s.cash;
  const rep = s.rep;
  E.runnerAction(s, d.id, 'farm');
  assert.equal(d.status, 'farm');
  assert.equal(s.cash, cash + 1000);
  assert.equal(hardnessOf(s), 12);
  assert.equal(s.rep, rep + 2);
});

test('mercy is soft: they give back a little and come back to your book, grateful', () => {
  const { s, d, r } = ranOff();
  r.stage = 'found';
  s.story = [];
  const cash = s.cash;
  E.runnerAction(s, d.id, 'mercy');
  assert.equal(d.status, 'free');
  assert.equal(s.cash, cash + 600);
  assert.equal(hardnessOf(s), -12);
  takeJob(s);
  assert.ok(E.hire(s, d.id).ok, 'hireable again');
});

test('you can\'t jump ahead: no farm before they\'re found', () => {
  const { s, d } = ranOff();
  assert.equal(E.runnerAction(s, d.id, 'farm').ok, false);
});

test('while loose, runners make trouble now and then', () => {
  let trouble = 0;
  for (let k = 1; k <= 40; k++) {
    const { s } = ranOff(k);
    s.story = [];
    const heat = s.heat;
    nextBetween(s);
    if (s.heat > heat || s.sabotage) trouble++;
  }
  assert.ok(trouble >= 3 && trouble <= 18, `trouble ${trouble}/40`);
});

// Crew who retire, and one last job: "Just when I thought I was out, they pull me back in."
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { retireChance, releaseChance, lastJobCost, LAST_JOB_LINE, crewRetirements } from '../src/lastjob.js';
import { epilogues } from '../src/retire.js';
import { careerOf } from '../src/career.js';
import { genJob, ownOffer } from '../src/heists.js';
import { simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { career } from '../tools/balance.mjs';
import { takeJob, fakeHeist } from './helpers.mjs';

// A game with a retired regular, on the board.
function withRetiree(seed = 3) {
  const s = E.newGame(seed);
  s.cash = 20000;
  s.story = [];
  const d = s.dogs[s.pub[0]];
  Object.assign(d, { met: true, jobs: 9, relation: 30, stints: 1 });
  s.pub = s.pub.filter((id) => id !== d.id);
  d.status = 'retired';
  d.retired = { day: 1, why: 'age', jobs: 9 };
  return { s, d };
}

test('the more jobs, the likelier to retire; the pound makes it likelier still', () => {
  const d = { jobs: 4, stints: 0 };
  assert.equal(retireChance(d), 0, 'not after a handful of jobs');
  assert.ok(retireChance({ jobs: 20, stints: 0 }) > retireChance({ jobs: 8, stints: 0 }));
  assert.ok(retireChance({ jobs: 8, stints: 2 }) > retireChance({ jobs: 8, stints: 0 }));
  assert.ok(releaseChance({ jobs: 5, stints: 2 }) > releaseChance({ jobs: 5, stints: 1 }));
  assert.ok(releaseChance({ jobs: 5, stints: 1 }) > retireChance({ jobs: 5, stints: 1 }), 'walking out of the pound is when it bites');
  // Over real careers: it happens, mostly to those who've done time, and it's a scene.
  let n = 0;
  let poundTime = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { s } = career(seed, 'smart', 20);
    for (const d of Object.values(s.dogs).filter((x) => x.retired)) {
      n++;
      if (d.stints) poundTime++;
      assert.ok(['retired', 'crew', 'pound', 'hospital', 'farm', 'gone'].includes(d.status));
    }
  }
  assert.ok(n > 20 && n < 200, `${n} retirements in 60 careers`);
  assert.ok(poundTime / n > 0.5, `${poundTime}/${n} had done time`);
});

test('a retirement is told as a scene, and they leave the pub', () => {
  const s = E.newGame(5);
  s.story = [];
  const d = s.dogs[s.pub[0]];
  Object.assign(d, { met: true, jobs: 40, stints: 3, relation: 20 });
  for (let k = 0; k < 200 && !d.retired; k++) crewRetirements(s, makeRng({ s: k }), [d]);
  assert.equal(d.status, 'retired');
  assert.ok(!s.pub.includes(d.id));
  assert.equal(s.story.at(-1).type, 'retire');
  assert.ok(E.chooseStory(s, 0).ok);
});

test('one last job: dearer, the line, on the crew; walk away and the offer stands', () => {
  const { s, d } = withRetiree();
  assert.equal(E.oneLastJob(s, d.id).ok, false, 'pick a job first');
  takeJob(s);
  const cost = lastJobCost(s, d);
  assert.ok(cost >= 2 * d.fee, `${cost} vs fee ${d.fee}`);
  const cash = s.cash;
  const r = E.oneLastJob(s, d.id);
  assert.ok(r.ok, r.msg);
  assert.ok(r.msg.includes(LAST_JOB_LINE));
  assert.equal(s.cash, cash - cost);
  assert.equal(d.status, 'crew');
  assert.ok(s.crew.includes(d.id));
  // Walk away: back to retirement, no last job done, still on offer next time.
  E.nextJob(s);
  assert.equal(d.status, 'retired');
  assert.ok(!d.lastJobDone);
  takeJob(s);
  assert.ok(E.oneLastJob(s, d.id).ok);
});

test('after the last job they\'re retired for good; if it goes wrong, the next one costs more', () => {
  const { s, d } = withRetiree();
  takeJob(s);
  const before = lastJobCost(s, d);
  E.oneLastJob(s, d.id);
  fakeHeist(s, { crew: s.crew.slice(), escaped: s.crew.filter((id) => id !== d.id), captured: [{ id: d.id, stage: 'vault', sentence: 2, talked: false }] });
  assert.equal(d.lastJobDone.fate, 'nicked');
  assert.equal(s.after.lastJobs[0].fate, 'nicked');
  assert.equal(s.lastJobFear, 1);
  assert.ok(lastJobCost(s, d) > before, 'word gets round');
  // Serve the time: out of the pound and straight back to retirement.
  if (s.after.step === 'deliver') E.deliver(s);
  if (s.after.step === 'fence') E.fence(s, 'hal');
  E.payCrew(s, 30);
  for (let k = 0; k < 6 && d.status === 'pound'; k++) { E.nextJob(s); s.story = []; if (d.status === 'pound') { takeJob(s); fakeHeist(s); if (s.after.step === 'fence') E.fence(s, 'hal'); E.payCrew(s, 0); } }
  E.nextJob(s);
  assert.equal(d.status, 'retired');
  if (s.phase === 'select') takeJob(s);
  assert.equal(E.oneLastJob(s, d.id).ok, false, 'never again');
});

test('on their last job, the luck runs out: collared, hurt or the farm, more often', () => {
  const bad = { on: 0, off: 0 };
  for (let k = 1; k <= 400; k++) {
    for (const on of [false, true]) {
      const s = E.newGame(k);
      const job = genJob(s, makeRng({ s: k }), { type: 'breakin', tier: 2 });
      s.offers.unshift(ownOffer(job));
      E.acceptOffer(s, job.id);
      s.cash = 20000;
      for (const id of s.pub.slice(0, 3)) E.hire(s, id);
      E.autoPlan(s);
      const d = s.dogs[s.crew[0]];
      if (on) d.lastJob = s.job.id;
      const r = simulate(s, s.job, makeRng({ s: k * 7 }));
      const hit = r.captured.some((c) => c.id === d.id) || (r.hurt || []).some((h) => h.id === d.id) || (r.lost || []).some((l) => l.id === d.id);
      if (hit) bad[on ? 'on' : 'off']++;
    }
  }
  assert.ok(bad.on > bad.off * 1.25, `bad ends ${bad.off} -> ${bad.on} of 400`);
});

test('a last job is remembered: on the career card and in the epilogues', () => {
  const { s, d } = withRetiree();
  takeJob(s);
  E.oneLastJob(s, d.id);
  fakeHeist(s, { crew: s.crew.slice(), escaped: s.crew.slice() });
  if (s.after.step === 'deliver') E.deliver(s);
  if (s.after.step === 'fence') E.fence(s, 'hal');
  E.payCrew(s, 30);
  assert.equal(d.lastJobDone.fate, 'away');
  assert.ok(d.lastJobDone.grade);
  const c = careerOf(s);
  assert.equal(c.lastJob.dog, d.id);
  assert.match(c.lastJob.text, /one last job/);
  const eps = epilogues(s, makeRng({ s: 1 }));
  assert.ok(eps.some((e) => e.dog === d.id && /one last job/i.test(e.text)), JSON.stringify(eps.map((e) => e.title)));
});

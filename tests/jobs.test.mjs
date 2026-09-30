// Kinds of job: each lays out different steps with different options and rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { APPROACHES, JOB_TYPES, SIGNATURES } from '../src/data.js';
import { genJob, visibleStages } from '../src/heists.js';
import { skillOf } from '../src/dogs.js';
import { simulate, odds, approachAvailable, signatureFits } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { takeJob } from './helpers.mjs';

const jobsOf = (type, n = 60) => Array.from({ length: n }, (_, k) => {
  const s = E.newGame(k + 1);
  return { s, job: genJob(s, makeRng({ s: k + 7 }), { type, tier: 1 + (k % 3) }) };
});
const ids = (job) => job.stages.map((st) => st.id);
const isUngated = (ap) => { const a = APPROACHES[ap]; return !a.needKit && !a.needIntel && !a.needInsider && !a.needBribe; };

test('the job board offers every kind of job', () => {
  const seen = {};
  for (let seed = 1; seed <= 150; seed++) {
    const s = E.newGame(seed);
    s.rep = 70;
    E.digLeads(s);
    for (const o of s.offers) seen[o.job.type] = (seen[o.job.type] || 0) + 1;
  }
  const total = Object.values(seen).reduce((a, b) => a + b, 0);
  for (const t of Object.keys(JOB_TYPES)) assert.ok((seen[t] || 0) / total >= 0.08, `${t}: ${seen[t]}/${total}`);
});

test('each kind of job has its own shape', () => {
  for (const { job } of jobsOf('con')) {
    assert.ok(ids(job).includes('obs_pitch') && ids(job).includes('obs_convincer'));
    assert.ok(!ids(job).includes('getaway'), 'a con has no getaway');
    assert.equal(job.time, 'day');
    assert.ok(job.mark);
  }
  for (const { job } of jobsOf('smash')) {
    assert.ok(job.stages.length <= 5 && !ids(job).includes('exit'));
    assert.equal(job.stages.find((st) => st.kind === 'vault').vaultType, 'counter');
  }
  for (const { job } of jobsOf('van')) {
    assert.equal(job.stages[0].label, 'Stop the Van');
    assert.ok(ids(job).includes('obs_guards'));
    assert.equal(job.stages.find((st) => st.kind === 'vault').vaultType, 'van');
  }
  for (const { job } of jobsOf('swap')) assert.equal(job.stages.find((st) => st.kind === 'vault').vaultType, 'switch');
  // Different kinds of job use different ways in.
  const entries = (type) => new Set(jobsOf(type).flatMap(({ job }) => job.stages[0].options));
  const breakin = entries('breakin');
  for (const t of ['con', 'smash', 'van']) assert.ok([...entries(t)].every((ap) => ap === 'e_ram' || !breakin.has(ap)), `${t} entries`);
});

test('every visible step has an option needing no kit, intel or insider', () => {
  for (const t of Object.keys(JOB_TYPES)) {
    for (const { job } of jobsOf(t, 80)) for (const st of job.stages) assert.ok(st.options.some(isUngated), `${t} ${st.id}`);
  }
});

test('some jobs allow no insiders: no insider way in, and planting one is refused', () => {
  for (const t of ['con', 'smash']) for (const { job } of jobsOf(t)) assert.ok(job.noInsider, t);
  const breakins = jobsOf('breakin', 200).map(({ job }) => job);
  const closed = breakins.filter((j) => j.noInsider);
  assert.ok(closed.length > 10 && closed.length < 80, `closed break-ins: ${closed.length}/200`);
  for (const j of closed) assert.ok(!j.stages[0].options.includes('e_insider'));
  for (const j of breakins.filter((x) => !x.noInsider)) assert.ok(j.stages[0].options.includes('e_insider'));
  const s = E.newGame(3);
  s.offers[0].job = genJob(s, makeRng({ s: 1 }), { type: 'con' });
  takeJob(s);
  s.cash = 5000;
  E.hire(s, s.pub[1]);
  const r = E.plantInsider(s, s.crew[0]);
  assert.equal(r.ok, false);
  assert.match(r.msg, /No way to get anyone inside/);
});

test('specialist steps: one skill, 4+ to do it well, and someone in the pub who can', () => {
  let found = 0;
  for (let seed = 1; seed <= 200 && found < 25; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    const st = s.job.stages.find((x) => x.needs);
    if (!st) continue;
    found++;
    assert.ok(st.options.every((ap) => APPROACHES[ap].skill === st.needs.skill), 'one skill');
    assert.ok(s.pub.some((id) => skillOf(s.dogs[id], st.needs.skill) >= st.needs.min), `seed ${seed}: someone qualified in the pub`);
    // Out of their depth vs up to it.
    const d = s.dogs[s.pub[0]];
    const saved = { ...d.skills };
    d.talents = [];
    d.skills[st.needs.skill] = st.needs.min - 1;
    const low = odds(s, s.job, st, st.options[0], d).p;
    d.skills[st.needs.skill] = st.needs.min;
    const ok = odds(s, s.job, st, st.options[0], d).p;
    d.skills = saved;
    assert.ok(ok - low > 0.3, `seed ${seed}: ${low.toFixed(2)} -> ${ok.toFixed(2)}`);
  }
  assert.ok(found >= 20, `specialist steps found: ${found}`);
});

test('a switch needs a replica, and its swaps are the kind nobody notices', () => {
  const s = E.newGame(9);
  s.offers[0].job = genJob(s, makeRng({ s: 4 }), { type: 'swap' });
  takeJob(s);
  const st = s.job.stages.find((x) => x.vaultType === 'switch');
  const ap = st.options.find((x) => APPROACHES[x].needKit === 'replica');
  assert.equal(approachAvailable(s, s.job, ap).ok, false);
  s.cash = 5000;
  assert.ok(E.buy(s, 'replica').ok);
  assert.ok(approachAvailable(s, s.job, ap).ok);
  assert.ok(APPROACHES[ap].swap);
});

test('signature moves stay off steps where they make no sense', () => {
  for (const { job } of jobsOf('con')) {
    for (const st of job.stages.filter((x) => x.noSig)) for (const sig of Object.keys(SIGNATURES)) assert.ok(!signatureFits(sig, st), `${sig} on ${st.id}`);
  }
});

test('every kind of job plays out to an end', () => {
  for (const t of Object.keys(JOB_TYPES)) {
    for (let k = 1; k <= 30; k++) {
      const s = E.newGame(k);
      s.offers[0].job = genJob(s, makeRng({ s: k }), { type: t });
      takeJob(s);
      s.cash = 5000;
      for (const id of s.pub.slice(0, 3)) E.hire(s, id);
      E.autoPlan(s);
      const r = simulate(s, s.job, makeRng({ s: k * 3 }));
      assert.equal(r.beats.at(-1).kind, 'end', `${t} ${k}`);
      assert.ok(['clean', 'tidy', 'messy', 'bust', 'aborted'].includes(r.outcome));
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { TALENTS, APPROACHES, KIT, INTEL, OBSTACLES, VAULTS, VENUES, QUIRKS, SKILLS } from '../src/data.js';
import { visibleStages } from '../src/heists.js';
import { odds } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

// Play one job with a simple policy. mode: 'smart' | 'reckless'
export function playJob(s, mode) {
  const rng = makeRng({ s: s.seed * 7 + s.stats.jobs });
  if (mode === 'smart') {
    // hire top 3 affordable
    const pub = s.pub.map((id) => s.dogs[id]).sort((a, b) => b.fee - a.fee);
    for (const d of Object.values(s.dogs).filter((d) => d.met && d.status === 'free')) E.hire(s, d.id);
    for (const d of pub) if (s.crew.length < 4 && s.cash > d.fee + 400) E.hire(s, d.id);
    if (!s.crew.length && s.pub.length) E.hire(s, s.pub[0]);
    for (const k of ['lockpicks', 'squeaky', 'bags', 'smoke']) if (s.cash > 500) E.buy(s, k);
    while (s.job.daysLeft > 1 && s.crew.length && s.cash > 200 && Object.values(s.job.intel).some((v) => !v)) {
      const best = E.crewDogs(s).sort((a, b) => b.skills.nose - a.skills.nose)[0];
      if (!E.caseJoint(s, best.id).ok) break;
    }
    for (const id of s.crew.slice()) if (s.dogs[id].undercover && s.cash > 100) { E.surveil(s, id); if (s.dogs[id].known.undercover) E.dismiss(s, id); }
  } else {
    if (s.pub.length) E.hire(s, rng.pick(s.pub));
  }
  if (!s.crew.length) return E.nextJob(s);
  const r = E.pullJob(s);
  assert.ok(r.ok, r.msg);
  E.resolveHeist(s);
  if (s.after.step === 'fence') {
    const f = s.job.buyer ? 'collector' : 'hal';
    assert.ok(E.fence(s, f).ok);
  }
  const pr = E.payCrew(s, mode === 'smart' ? 30 : 0);
  assert.ok(pr.ok, pr.msg);
  return E.nextJob(s);
}

test('talents: exactly 100 with valid skills', () => {
  assert.equal(Object.keys(TALENTS).length, 100);
  for (const t of Object.values(TALENTS)) assert.ok(SKILLS.includes(t.skill), t.id);
});

test('approaches reference valid skills, kit and intel', () => {
  for (const [id, a] of Object.entries(APPROACHES)) {
    assert.ok(SKILLS.includes(a.skill), id);
    if (a.needKit) assert.ok(KIT[a.needKit], id);
    if (a.kitBonus) assert.ok(KIT[a.kitBonus], id);
    if (a.needIntel) assert.ok(INTEL[a.needIntel], id);
    if (a.intelBonus) assert.ok(INTEL[a.intelBonus], id);
    assert.ok(a.ok && a.fail, id);
  }
  for (const o of [...Object.values(OBSTACLES), ...Object.values(VAULTS)]) for (const ap of o.options) assert.ok(APPROACHES[ap], ap);
});

test('same seed generates identical games', () => {
  const a = E.newGame(1234), b = E.newGame(1234);
  assert.deepEqual(a, b);
  const c = E.newGame(1235);
  assert.notEqual(JSON.stringify(a.job), JSON.stringify(c.job));
});

test('every generated job: each visible stage has an ungated option; intel keys valid', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = E.newGame(seed);
    const j = s.job;
    assert.ok(j.name && j.loot.length >= 2, `seed ${seed}`);
    for (const st of j.stages) {
      assert.ok(st.options.length >= 2, `${seed} ${st.id}`);
      assert.ok(st.options.some((ap) => { const a = APPROACHES[ap]; return !a.needKit && !a.needIntel && !a.needInsider && !a.needBribe; }), `${seed} ${st.id} all gated`);
    }
    for (const k of Object.keys(j.intel)) assert.ok(INTEL[k], k);
    for (const h of Object.keys(j.hazards)) assert.ok(`hz_${h}` in j.intel);
  }
});

test('full runs: no invariant violations, games end or continue sanely', () => {
  const tally = { smart: { wins: 0, jobs: 0 }, reckless: { wins: 0, jobs: 0 } };
  for (const mode of ['smart', 'reckless']) {
    for (let seed = 1; seed <= 60; seed++) {
      const s = E.newGame(seed);
      for (let j = 0; j < 12 && !s.over; j++) {
        playJob(s, mode);
        const errs = E.invariants(s);
        assert.deepEqual(errs, [], `seed ${seed} job ${j} ${mode}`);
        const last = s.history[0];
        if (last) { tally[mode].jobs++; if (['S', 'A', 'B'].includes(last.grade)) tally[mode].wins++; }
      }
      JSON.parse(JSON.stringify(s)); // serialisable
    }
  }
  const sr = tally.smart.wins / tally.smart.jobs, rr = tally.reckless.wins / tally.reckless.jobs;
  console.log('win rates (B or better)', { smart: sr.toFixed(2), reckless: rr.toFixed(2), tally });
  assert.ok(sr > rr, 'planning should beat recklessness');
});

test('simulation is deterministic for a given state', () => {
  const a = E.newGame(99), b = E.newGame(99);
  for (const s of [a, b]) { E.hire(s, s.pub[0]); E.hire(s, s.pub[1]); E.pullJob(s); }
  assert.deepEqual(a.result, b.result);
});

test('undercover dogs appear only with heat', () => {
  const s = E.newGame(5);
  assert.ok(!Object.values(s.dogs).some((d) => d.undercover));
  s.heat = 90;
  let found = false;
  for (let i = 0; i < 20 && !found; i++) { E.refreshPub(s); found = s.pub.some((id) => s.dogs[id].undercover); }
  assert.ok(found);
});

test('game over triggers', () => {
  const s = E.newGame(3); s.heat = 100; E.checkGameOver(s); assert.equal(s.over.reason, 'inspector');
  const t = E.newGame(3); t.rep = 0; E.checkGameOver(t); assert.equal(t.over.reason, 'nobody');
  const u = E.newGame(3); u.cash = 0; E.checkGameOver(u); assert.equal(u.over.reason, 'broke');
});

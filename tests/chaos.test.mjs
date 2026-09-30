import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { chaosStats } from '../tools/chaos.mjs';

// Heists should be chaotic: hazards turn up early, and pear-shaped jobs
// regularly cost crew to the police or to the farm.
test('chaos: hazards, arrests and losses are common from the first jobs', () => {
  const early = chaosStats(60, 5);
  console.log(early);
  assert.equal(Number(early.jobsWithHazard), 1, 'every job hides a hazard');
  assert.ok(Number(early.jobsWithCat) >= 0.25, `cats ${early.jobsWithCat}`);
  assert.ok(Number(early.surprises) >= 0.2, `surprises ${early.surprises}`);
  assert.ok(Number(early.lossWhenPearShaped) >= 0.45, `crew lost when pear-shaped ${early.lossWhenPearShaped}`);
  assert.ok(Number(early.arrestsPerJob) >= 0.5, `arrests ${early.arrestsPerJob}`);
  assert.ok(Number(early.farmPerJob) >= 0.04, `farm ${early.farmPerJob}`);
});

test('crew lost in a heist go to the farm for good', () => {
  for (let seed = 1; seed < 300; seed++) {
    const s = E.newGame(seed);
    E.acceptOffer(s, s.offers[0].id);
    E.hire(s, s.pub.find((id) => s.dogs[id].fee <= s.cash));
    if (!s.crew.length) continue;
    E.pullJob(s);
    if (!s.result.lost.length) continue;
    const id = s.result.lost[0].id;
    assert.ok(!s.result.escaped.includes(id));
    E.resolveHeist(s);
    assert.equal(s.dogs[id].status, 'farm');
    assert.ok(!s.crew.includes(id));
    return;
  }
  assert.fail('no heist lost anyone in 300 tries');
});

test('farming a copper earns respect; farming a real crook costs it', () => {
  const s = E.newGame(12);
  E.acceptOffer(s, s.offers[0].id);
  const [a, b] = s.pub.map((id) => s.dogs[id]);
  a.undercover = true; a.met = true;
  b.undercover = false; b.met = true;
  const rep0 = s.rep;
  assert.ok(E.farm(s, a.id).ok);
  assert.ok(s.rep > rep0, `copper: ${rep0} -> ${s.rep}`);
  const rep1 = s.rep;
  assert.ok(E.farm(s, b.id).ok);
  assert.ok(s.rep < rep1, `legit: ${rep1} -> ${s.rep}`);
});

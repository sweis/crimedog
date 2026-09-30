// Casing: every kind of specialist finds their kind of intel; getting spotted says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { SKILLS, INTEL } from '../src/data.js';
import { takeJob } from './helpers.mjs';

function caseWith(skill, seeds = 150) {
  let found = 0;
  let spotted = 0;
  const kinds = {};
  for (let seed = 1; seed <= seeds; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    s.cash = 5000;
    const d = s.dogs[s.pub[0]];
    E.hire(s, d.id);
    for (const k of SKILLS) d.skills[k] = 1;
    d.skills[skill] = 5;
    d.talents = [];
    const r = E.caseJoint(s, d.id);
    found += r.revealed.length;
    for (const k of r.revealed) kinds[INTEL[k].skill] = (kinds[INTEL[k].skill] || 0) + 1;
    if (r.spotted) spotted++;
  }
  return { perDay: found / seeds, spotted: spotted / seeds, kinds };
}

test('no one skill dominates casing: each specialist finds their own kind of intel', () => {
  const by = Object.fromEntries(['nose', 'tech', 'sneak', 'charm'].map((sk) => [sk, caseWith(sk)]));
  const rates = Object.values(by).map((x) => x.perDay);
  assert.ok(Math.max(...rates) / Math.min(...rates) < 1.3, `finds per day ${JSON.stringify(rates)}`);
  for (const [sk, x] of Object.entries(by)) {
    const top = Object.entries(x.kinds).sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(top, sk, `${sk} specialists mostly find ${sk} intel (${JSON.stringify(x.kinds)})`);
  }
  // Sneaks don't get spotted; nosy types do.
  assert.ok(by.sneak.spotted < 0.08 && by.nose.spotted > 0.15, `spotted: sneak ${by.sneak.spotted}, nose ${by.nose.spotted}`);
  assert.ok(caseWith('muscle').perDay < Math.min(...rates), 'muscle is no use for casing');
});

test('when a caser is spotted, the job says why security is on alert', () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    s.cash = 5000;
    const d = s.dogs[s.pub[0]];
    E.hire(s, d.id);
    for (const k of SKILLS) d.skills[k] = 0;
    d.talents = [];
    const r = E.caseJoint(s, d.id);
    if (!r.spotted) continue;
    assert.equal(s.job.alert, 1);
    assert.match(s.job.alertWhy[0], /spotted casing the joint/);
    assert.match(r.msg, /every step \+1 harder/);
    return;
  }
  assert.fail('nobody was ever spotted');
});

// Leaders and wildcards: what they bring just by being on the crew.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { WILD } from '../src/data.js';
import { genJob, visibleStages } from '../src/heists.js';
import { odds, simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { takeJob, fakeHeist } from './helpers.mjs';

// A break-in with a planned crew of three; the third dog can be made a leader or wildcard.
function crewOf3(seed) {
  const s = E.newGame(seed);
  s.offers[0].job = genJob(s, makeRng({ s: seed }), { type: 'breakin', tier: 2 });
  takeJob(s);
  s.cash = 10000;
  for (const id of s.pub.slice(0, 3)) E.hire(s, id);
  for (const id of s.crew) s.dogs[id].role = null;
  E.autoPlan(s);
  return s;
}

test('about one in five dogs is a leader or a wildcard', () => {
  const seen = { leader: 0, wildcard: 0, none: 0 };
  for (let seed = 1; seed <= 150; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    for (const id of s.pub) seen[s.dogs[id].role?.kind || 'none']++;
  }
  const total = seen.leader + seen.wildcard + seen.none;
  const share = (seen.leader + seen.wildcard) / total;
  assert.ok(share > 0.12 && share < 0.3, `role share ${share.toFixed(2)}`);
  assert.ok(seen.leader > 20 && seen.wildcard > 20, JSON.stringify(seen));
});

test('a leader steadies everyone on every step, without a step of their own', () => {
  const s = crewOf3(4);
  const [a, , c] = s.crew.map((id) => s.dogs[id]);
  const st = visibleStages(s.job)[0];
  const ap = st.options[0];
  const before = odds(s, s.job, st, ap, a).p;
  c.role = { kind: 'leader', level: 3 };
  const after = odds(s, s.job, st, ap, a).p;
  assert.ok(Math.abs(after - before - 0.06) < 0.001 || after === 0.97, `${before} -> ${after}`);
});

test('a leader keeps the crew together: fewer runners and fewer talkers', () => {
  const tally = (withLeader) => {
    let runners = 0;
    let talked = 0;
    for (let k = 1; k <= 150; k++) {
      const s = crewOf3(k);
      const crew = s.crew.map((id) => s.dogs[id]);
      for (const d of crew) { d.greed = 90; d.loyalty = 10; d.nerve = 20; d.quirks = []; }
      if (withLeader) crew[2].role = { kind: 'leader', level: 3 };
      const r = simulate(s, s.job, makeRng({ s: k }));
      runners += r.runners.length;
      talked += r.captured.filter((c) => c.talked).length;
    }
    return { runners, talked };
  };
  const without = tally(false);
  const withL = tally(true);
  assert.ok(withL.runners < without.runners, `runners ${without.runners} -> ${withL.runners}`);
  assert.ok(withL.talked <= without.talked, `talked ${without.talked} -> ${withL.talked}`);
});

test('wildcards bring boons and trouble, mostly boons', () => {
  const texts = { good: new Set(WILD.good.map((e) => e.text)), bad: new Set(WILD.bad.map((e) => e.text)) };
  let good = 0;
  let bad = 0;
  for (let k = 1; k <= 150; k++) {
    const s = crewOf3(k);
    const w = s.dogs[s.crew[2]];
    w.role = { kind: 'wildcard', level: 3 };
    const r = simulate(s, s.job, makeRng({ s: k }));
    const name = w.nick ? w.nick.replace(/^The /, '') : w.first;
    for (const b of r.beats.filter((x) => x.dog === w.id)) {
      const t = b.text.replaceAll(name, '{d}');
      if (texts.good.has(t)) good++;
      if (texts.bad.has(t)) bad++;
    }
  }
  assert.ok(good > 20 && bad > 5 && good > bad, `wild events: ${good} good, ${bad} bad`);
});

test('leaders and wildcards grow into it on jobs they get away from', () => {
  const s = crewOf3(2);
  const d = s.dogs[s.crew[0]];
  d.role = { kind: 'leader', level: 1 };
  let grew = false;
  for (let k = 0; k < 20 && !grew; k++) {
    fakeHeist(s, { escaped: s.crew.slice(), crew: s.crew.slice() });
    grew = s.after.improved.some((im) => im.id === d.id && im.role === 'leader');
    s.phase = 'plan';
  }
  assert.ok(grew && d.role.level >= 2);
});

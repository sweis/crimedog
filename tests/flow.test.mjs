// Planning without running round the houses: unlock an option from the plan, buy
// what the plan is short of, and put the right person on a step.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { APPROACHES, KIT } from '../src/data.js';
import { genJob, visibleStages, ownOffer } from '../src/heists.js';
import { approachAvailable, odds } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

function planning(seed, type = 'breakin') {
  const s = E.newGame(seed);
  const job = genJob(s, makeRng({ s: seed }), { type, tier: 2 });
  s.offers.unshift(ownOffer(job));
  E.acceptOffer(s, job.id);
  s.cash = 5000;
  return s;
}

test('a tipster sells the one thing you want, for a day and a bit more than pot luck', () => {
  const s = planning(3);
  const k = Object.keys(s.job.intel).find((x) => !s.job.intel[x]);
  const { cash } = s;
  const days = s.job.daysLeft;
  assert.ok(E.tipFor(s, k).ok);
  assert.equal(s.job.intel[k], true);
  assert.equal(s.cash, cash - E.TIP_FOR);
  assert.equal(s.job.daysLeft, days - 1);
  assert.ok(E.TIP_FOR > 120, 'dearer than a random tip');
  assert.equal(E.tipFor(s, k).ok, false, 'not twice');
  assert.equal(E.tipFor(s, 'no_such_thing').ok, false);
  s.job.daysLeft = 0;
  const k2 = Object.keys(s.job.intel).find((x) => !s.job.intel[x]);
  if (k2) assert.equal(E.tipFor(s, k2).ok, false, 'no days, no tipster');
});

test('an intel-locked option says which intel; buying it opens the option', () => {
  for (let seed = 1; seed < 80; seed++) {
    const s = planning(seed);
    const st = visibleStages(s.job).find((x) => x.options.some((ap) => APPROACHES[ap].needIntel && !s.job.intel[APPROACHES[ap].needIntel] && APPROACHES[ap].needIntel in s.job.intel));
    if (!st) continue;
    const ap = st.options.find((x) => APPROACHES[x].needIntel && APPROACHES[x].needIntel in s.job.intel);
    const av = approachAvailable(s, s.job, ap);
    assert.equal(av.ok, false);
    assert.match(av.reason, /^Needs the /);
    assert.ok(E.tipFor(s, APPROACHES[ap].needIntel).ok);
    assert.ok(approachAvailable(s, s.job, ap).ok);
    return;
  }
  assert.fail('no intel-locked option found');
});

test('the plan knows when it is short of consumables, and buying one squares it', () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = planning(seed);
    const uses = visibleStages(s.job).flatMap((st) => st.options.filter((ap) => KIT[APPROACHES[ap].needKit]?.consumable).map((ap) => [st, ap]));
    if (uses.length < 1) continue;
    E.hire(s, s.pub[0]);
    const [st, ap] = uses[0];
    const kit = APPROACHES[ap].needKit;
    s.kit[kit] = 0;
    E.buy(s, kit);
    assert.ok(E.setPlan(s, st.id, { approach: ap, dog: s.crew[0] }).ok);
    assert.deepEqual(E.kitShort(s), {});
    s.kit[kit] = 0;
    assert.deepEqual(E.kitShort(s), { [kit]: 1 });
    assert.ok(E.planProblems(s).some((p) => p.includes(KIT[kit].name)));
    E.buy(s, kit);
    assert.deepEqual(E.kitShort(s), {});
    return;
  }
  assert.fail('no consumable option found');
});

test('picking an approach puts the crew member who looks best at it on the step', () => {
  const s = planning(5);
  for (const id of s.pub.slice(0, 3)) E.hire(s, id);
  const crew = E.crewDogs(s);
  for (const d of crew) for (const k of Object.keys(d.known.skills)) d.known.skills[k] = true;
  for (const st of visibleStages(s.job)) {
    for (const ap of st.options) {
      if (!approachAvailable(s, s.job, ap).ok) continue;
      const id = E.bestDogFor(s, st.id, ap);
      if (!id) continue;
      const p = odds(s, s.job, st, ap, s.dogs[id]).p;
      for (const d of crew) if (d.id !== id && !APPROACHES[ap].size) assert.ok(odds(s, s.job, st, ap, d).p <= p + 1e-9, `${ap}: ${d.id} beats ${id}`);
    }
  }
});

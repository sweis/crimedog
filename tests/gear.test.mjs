// Kit: new gear that eases a whole kind of step, the lock-up, and kit that breaks
// or ends up in an evidence bag.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { KIT, APPROACHES, SKILLS } from '../src/data.js';
import { genDog } from '../src/dogs.js';
import { genJob, visibleStages } from '../src/heists.js';
import { odds, simulate, KIT_BREAK } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const NEW = ['goggles', 'gloves', 'crowbar', 'disguisekit', 'plates', 'walkies', 'chocs'];

test('the new gear is on sale, and each piece eases its kind of step', () => {
  for (const id of NEW) {
    const k = KIT[id];
    assert.ok(k && k.price > 0 && !k.special && k.effect && k.blurb, id);
    if (!k.consumable) assert.ok(k.breaks, `${id} says how it breaks`);
  }
  // Every bought piece that isn't used up can break, and says how.
  for (const [id, k] of Object.entries(KIT)) if (!k.special && !k.consumable && k.price) assert.ok(k.breaks, id);
  const s = E.newGame(3);
  const job = genJob(s, makeRng({ s: 3 }), { type: 'breakin', tier: 2 });
  s.job = job;
  const d = genDog(s, E.rngOf(s), {});
  for (const k of SKILLS) d.skills[k] = 1; // well clear of the 95% ceiling
  d.talents = [];
  const pairs = visibleStages(job).flatMap((st) => st.options.map((ap) => [st, ap]));
  const sneak = pairs.find(([, ap]) => APPROACHES[ap].skill === 'sneak' && !APPROACHES[ap].needKit && !APPROACHES[ap].needInsider && !APPROACHES[ap].needIntel);
  assert.ok(sneak);
  const before = odds(s, job, sneak[0], sneak[1], d, { crew: [d] }).p;
  s.kit.goggles = 1;
  assert.ok(odds(s, job, sneak[0], sneak[1], d, { crew: [d] }).p > before);
  const exit = visibleStages(job).find((st) => st.kind === 'exit');
  const out = odds(s, job, exit, exit.options[0], d, { crew: [d] }).p;
  s.kit.walkies = 1;
  assert.ok(odds(s, job, exit, exit.options[0], d, { crew: [d] }).p > out);
});

// A crew of three on a break-in, kitted out.
function kitted(seed, kit) {
  const s = E.newGame(seed);
  s.offers[0].job = genJob(s, makeRng({ s: seed }), { type: 'breakin', tier: 2 });
  E.acceptOffer(s, s.offers[0].id);
  s.cash = 10000;
  Object.assign(s.kit, kit);
  for (const id of s.pub.slice(0, 3)) E.hire(s, id);
  E.autoPlan(s);
  return s;
}

test('kit breaks when a step it\'s used on goes wrong, and the Old Bill bag what the collared were carrying', () => {
  let broke = 0;
  let evidence = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = kitted(seed, { lockpicks: 1, laptop: 1, goggles: 1, crowbar: 1, gloves: 1, keycard: 3, detector: 1 });
    const r = simulate(s, s.job, makeRng({ s: seed }));
    for (const x of r.kitLost) {
      assert.ok(!KIT[x.kit].special && !KIT[x.kit].consumable, `${x.kit}: won kit and used-up kit don't break`);
      if (x.why === 'broke') {
        broke++;
        const b = r.beats.find((y) => y.kind === 'chaos' && y.text.includes(KIT[x.kit].breaks));
        assert.ok(b, `seed ${seed}: the heist says the ${x.kit} broke`);
        const i = r.beats.indexOf(b);
        assert.equal(r.beats[i - 1].kind, 'fail', 'right after a fumbled step');
      } else {
        evidence++;
        assert.ok(r.captured.length, 'only when someone is collared');
      }
      assert.equal(r.kitUsed[x.kit] >= 1, true);
    }
    // Nothing is lost twice.
    assert.equal(new Set(r.kitLost.map((x) => x.kit)).size, r.kitLost.length);
  }
  assert.ok(broke > 20 && evidence > 10, `${broke} broken, ${evidence} bagged`);
  assert.ok(KIT_BREAK > 0 && KIT_BREAK < 0.5);
});

test('what\'s lost on the job is gone from the lock-up afterwards, and the aftermath says so', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = kitted(seed, { lockpicks: 1, laptop: 1, goggles: 1, crowbar: 1 });
    E.pullJob(s);
    if (!s.result.kitLost.length) continue;
    const lost = s.result.kitLost.map((x) => x.kit);
    E.resolveHeist(s);
    for (const k of lost) assert.equal(s.kit[k], 0, k);
    return;
  }
  assert.fail('nothing was ever lost');
});

test('a box of chocolates is eaten on the first charm step it helps', () => {
  let eaten = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = kitted(seed, { chocs: 2 });
    const r = simulate(s, s.job, makeRng({ s: seed }));
    const charms = r.beats.filter((b) => b.approach && APPROACHES[b.approach].skill === 'charm' && ['ok', 'fail'].includes(b.kind)).length;
    assert.equal(r.kitUsed.chocs || 0, Math.min(2, charms), `seed ${seed}`);
    eaten += r.kitUsed.chocs || 0;
  }
  assert.ok(eaten > 5);
});

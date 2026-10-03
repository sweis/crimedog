// Four-star jobs: the money of a lifetime, and three master steps nobody short of 8 can do.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { SKILLS, MASTER_MIN } from '../src/data.js';
import { genJob, totalLootValue, ownOffer, GRAND_TIER, GRAND_TYPES, grandReady } from '../src/heists.js';
import { genDog, skillOf } from '../src/dogs.js';
import { simulate, odds } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { genOffers, rerollOwnLeads } from '../src/groups.js';

const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
const masters = (job) => job.stages.filter((st) => st.master);

// A game far enough along for four-star jobs, on one.
function onGrand(seed) {
  const s = E.newGame(seed);
  Object.assign(s, { rep: 60, cash: 50000 });
  s.stats.jobs = 10;
  const job = genJob(s, makeRng({ s: seed }), { tier: GRAND_TIER, owner: null });
  s.offers.unshift(ownOffer(job));
  E.acceptOffer(s, job.id);
  return s;
}
// A dog with exactly this much of every skill, all known.
function dogAt(s, level, rng = E.rngOf(s)) {
  const d = genDog(s, rng, {});
  d.talents = [];
  for (const k of SKILLS) { d.skills[k] = level; d.known.skills[k] = true; }
  Object.assign(d, { met: true, relation: 20 });
  s.dogs[d.id] = d;
  return d;
}

test('a four-star job: three master steps in different skills, 8+, before the goods, and no ordinary specialist', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const s = E.newGame(seed);
    const job = genJob(s, makeRng({ s: seed }), { tier: GRAND_TIER });
    const ms = masters(job);
    assert.ok(GRAND_TYPES.includes(job.type), job.type);
    assert.equal(ms.length, 3, `seed ${seed}`);
    assert.equal(new Set(ms.map((st) => st.needs.skill)).size, 3, 'three different skills');
    assert.ok(ms.every((st) => st.needs.min === MASTER_MIN && !st.hidden && st.options.length === 2));
    const ids = job.stages.map((st) => st.id);
    assert.ok(ms.every((st) => ids.indexOf(st.id) < ids.indexOf('vault')), 'masters come before the goods');
    assert.ok(!ids.includes('specialist'));
  }
});

test('they pay like nothing else: well over twice a three-star job', () => {
  const s = E.newGame(3);
  const loot = (tier) => median(Array.from({ length: 200 }, (_, i) => totalLootValue(genJob(s, makeRng({ s: i + 1 }), { tier }))));
  assert.ok(loot(GRAND_TIER) > 2 * loot(3), `${loot(GRAND_TIER)} vs ${loot(3)}`);
});

test('short of 8 on a master step it\'s a fluke or nothing, whatever the bonuses; a master has a real chance', () => {
  const s = onGrand(4);
  const st = masters(s.job)[0];
  const ap = st.options[0];
  const lead = dogAt(s, 3);
  lead.role = { kind: 'leader', level: 5 };
  const seven = dogAt(s, MASTER_MIN - 1);
  const eight = dogAt(s, MASTER_MIN);
  const crew = [lead, seven, eight];
  assert.equal(odds(s, s.job, st, ap, seven, { crew, bonus: 0.5 }).p, 0.03);
  assert.ok(odds(s, s.job, st, ap, eight, { crew }).p >= 0.6, `${odds(s, s.job, st, ap, eight, { crew }).p}`);
});

test('without a master, the job\'s off at that step: the crew don\'t barge through', () => {
  let secured = 0;
  let runs = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = onGrand(seed);
    // Good at everything except the first master step's skill.
    const missing = masters(s.job)[0].needs.skill;
    const rng = makeRng({ s: seed + 99 });
    for (let i = 0; i < 4; i++) {
      const d = dogAt(s, 9, rng);
      d.skills[missing] = 3;
      E.hire(s, d.id);
    }
    E.autoPlan(s);
    const r = simulate(s, s.job, makeRng({ s: seed }));
    runs++;
    if (r.secured.length) secured++;
    const offBeat = r.beats.find((b) => b.kind === 'fail' && /The job's off/.test(b.text));
    if (!r.secured.length && offBeat) assert.equal(r.outcome, 'aborted');
    assert.ok(!r.beats.some((b) => b.stage === masters(s.job)[0].id && /barge straight through/.test(b.text)), `seed ${seed}`);
  }
  assert.ok(secured / runs < 0.1, `${secured}/${runs} got away with it`);
});

test('the job brings one master to the pub, known for it, and they fill a gap in your book', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = E.newGame(seed);
    Object.assign(s, { rep: 60, cash: 50000 });
    s.stats.jobs = 10;
    const job = genJob(s, makeRng({ s: seed }), { tier: GRAND_TIER, owner: null });
    // You already know a master of the first step's skill.
    const have = masters(job)[0].needs.skill;
    const mine = dogAt(s, 3);
    mine.skills[have] = 9;
    mine.status = 'free';
    s.offers.unshift(ownOffer(job));
    E.acceptOffer(s, job.id);
    const star = s.dogs[s.job.masterStar];
    assert.ok(star && s.pub.includes(star.id), `seed ${seed}: the star is in the pub`);
    const theirs = masters(s.job).map((st) => st.needs.skill).filter((k) => skillOf(star, k) >= MASTER_MIN && star.known.skills[k]);
    assert.ok(theirs.length, `seed ${seed}: a known master of one of the steps`);
    assert.ok(theirs.some((k) => k !== have), `seed ${seed}: not just the one you've already got`);
    assert.equal(E.hireProblem(s, star), null);
  }
});

test('asking around: now and then a master turns up for a step nobody\'s covering, and never otherwise', () => {
  let turned = 0;
  let asks = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = onGrand(seed);
    for (let k = 0; k < 3 && s.job.daysLeft > 0; k++) {
      const r = E.askAround(s);
      asks++;
      if (!/turns up/.test(r.msg)) continue;
      turned++;
      const d = s.dogs[s.pub[0]]; // they come straight in
      const others = [...E.crewDogs(s), ...s.pub.slice(1).map((id) => s.dogs[id])];
      assert.ok(E.mastersMissing(s, others).some((sk) => skillOf(d, sk) >= MASTER_MIN && d.known.skills[sk]), `seed ${seed}: a master for a step nobody else covers`);
    }
  }
  assert.ok(turned >= 5 && turned < asks * 0.5, `${turned} masters in ${asks} asks`);
  // An ordinary job never brings one.
  const s = E.newGame(2);
  E.acceptOffer(s, s.offers[0].id);
  assert.deepEqual(E.mastersMissing(s, []), []);
});

test('the job board: no four-star jobs until you\'ve a name, then now and then, and fresh leads don\'t chase it off', () => {
  const count = (s) => s.offers.filter((o) => o.job.tier >= GRAND_TIER).length;
  let early = 0;
  let later = 0;
  let kept = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const s = E.newGame(seed);
    assert.ok(!grandReady(s));
    genOffers(s, makeRng({ s: seed }));
    early += count(s);
    Object.assign(s, { rep: 60 });
    s.stats.jobs = 10;
    genOffers(s, makeRng({ s: seed }));
    later += count(s);
    if (count(s)) {
      rerollOwnLeads(s, makeRng({ s: seed + 1 }));
      kept += count(s);
    }
  }
  assert.equal(early, 0);
  assert.ok(later >= 10 && later <= 40, `${later}/80 boards`);
  assert.equal(kept, later);
});

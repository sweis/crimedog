// How the crew get on: bonds that grow on good jobs and sour on bad ones,
// going back for a collared mate, and what it all does to the odds.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { bondOf, addBond, chemistry, cohesion, settleBonds, GOOD, BAD } from '../src/bonds.js';
import { genDog } from '../src/dogs.js';
import { genJob, visibleStages } from '../src/heists.js';
import { simulate, odds, blankResult } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { career } from '../tools/balance.mjs';

// A game with a few dogs of chosen outfits.
function town(factions) {
  const s = E.newGame(5);
  const rng = E.rngOf(s);
  const dogs = factions.map((f) => {
    const d = genDog(s, rng, {});
    Object.assign(d, { faction: f, met: true });
    s.dogs[d.id] = d;
    return d;
  });
  return { s, dogs };
}

test('outfits set the starting point: the same outfit rubs along, rival outfits don\'t', () => {
  const { s, dogs: [firm1, firm2, poodle, indie] } = town(['firm', 'firm', 'poodle', 'indie']);
  assert.ok(bondOf(s, firm1.id, firm2.id) > 0);
  assert.ok(bondOf(s, firm1.id, poodle.id) < 0, 'the Firm and the Poodle Set are rivals');
  assert.equal(bondOf(s, firm1.id, indie.id), 0);
  assert.equal(bondOf(s, firm1.id, firm2.id), bondOf(s, firm2.id, firm1.id), 'a bond is the same both ways');
});

test('a job done right brings the crew closer; a bust with bungled steps drives them apart', () => {
  const { s, dogs: [a, b] } = town(['indie', 'indie']);
  const step = (dog, kind) => ({ kind, dog: dog.id, stage: 'x', approach: 'e_pick' });
  settleBonds(s, blankResult([a.id, b.id], { outcome: 'clean', beats: [step(a, 'ok'), step(b, 'ok')] }));
  const afterGood = bondOf(s, a.id, b.id);
  assert.ok(afterGood > 0, `${afterGood}`);
  settleBonds(s, blankResult([a.id, b.id], { outcome: 'bust', beats: [step(a, 'fail'), step(b, 'fail'), step(a, 'fail')] }));
  assert.ok(bondOf(s, a.id, b.id) < afterGood);
});

test('grassing on your mates or running off with the goods ends a friendship', () => {
  const { s, dogs: [a, b] } = town(['indie', 'indie']);
  addBond(s, a.id, b.id, 50);
  settleBonds(s, blankResult([a.id, b.id], { outcome: 'messy', captured: [{ id: a.id, talked: true, sentence: 2 }] }));
  assert.ok(bondOf(s, a.id, b.id) <= 15);
});

test('going back for a mate binds them, even when it doesn\'t work', () => {
  const { s, dogs: [a, b] } = town(['indie', 'indie']);
  const news = settleBonds(s, blankResult([a.id, b.id], { outcome: 'messy', rescues: [{ by: a.id, of: b.id, ok: false }] }));
  assert.ok(bondOf(s, a.id, b.id) >= GOOD, `${bondOf(s, a.id, b.id)}`);
  assert.ok(news.some((t) => /went back for them/.test(t)));
});

test('friends lift each other\'s odds, people who can\'t stand each other drag them down, a leader softens it', () => {
  const { s, dogs: [a, b, c] } = town(['indie', 'indie', 'indie']);
  addBond(s, a.id, b.id, 80);
  assert.ok(chemistry(s, a, [a, b]) > 0);
  addBond(s, a.id, c.id, -80);
  const sour = chemistry(s, a, [a, c]);
  assert.ok(sour < 0);
  c.role = { kind: 'leader', level: 4 };
  assert.ok(chemistry(s, a, [a, c]) > sour && chemistry(s, a, [a, c]) < 0, 'steadier, still not good');
  const coh = cohesion(s, [a, b, c]);
  assert.equal(coh.good.length, 1);
  assert.equal(coh.bad.length, 1);
  assert.ok(BAD < 0 && GOOD > 0);
});

test('the step odds include it: the same dog does better beside friends than beside enemies', () => {
  const s = E.newGame(9);
  const job = genJob(s, makeRng({ s: 9 }), { type: 'breakin', tier: 1 });
  s.job = job;
  const rng = E.rngOf(s);
  const [a, b] = [genDog(s, rng, {}), genDog(s, rng, {})];
  for (const d of [a, b]) { d.faction = 'indie'; s.dogs[d.id] = d; }
  const st = visibleStages(job)[0];
  const ap = st.options[0];
  addBond(s, a.id, b.id, 80);
  const friends = odds(s, job, st, ap, a, { crew: [a, b] }).p;
  addBond(s, a.id, b.id, -160);
  const enemies = odds(s, job, st, ap, a, { crew: [a, b] }).p;
  assert.ok(friends > enemies, `${friends} vs ${enemies}`);
});

test('on real jobs, collared crew are sometimes rescued, and nobody is caught twice', () => {
  let tries = 0;
  let saved = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = E.newGame(seed);
    E.acceptOffer(s, s.offers[0].id);
    s.cash = 9000;
    for (const id of s.pub.slice(0, 4)) E.hire(s, id);
    // A tight crew, with a brave one in it.
    for (const x of s.crew) for (const y of s.crew) if (x < y) addBond(s, x, y, 60);
    s.dogs[s.crew[0]].nerve = 90;
    E.autoPlan(s);
    const r = simulate(s, s.job, makeRng({ s: seed }));
    const ids = r.captured.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `seed ${seed}: caught twice`);
    for (const x of r.rescues) {
      tries++;
      if (x.ok) {
        saved++;
        // Dragged out of the van, they're running: not caught again in the same scramble
        // (a later step can still catch them).
        const at = r.beats.findIndex((b) => b.kind === 'rescue' && /drags them out/.test(b.text) && b.dog === x.by);
        assert.ok(at >= 0, `seed ${seed}`);
        const name = r.beats[at].text.match(/doubles back for (.+?), yanks/)[1];
        assert.ok(!r.beats.slice(at + 1).some((b) => b.kind === 'caught' && b.stage === r.beats[at].stage && b.text.startsWith(`${name} is collared`)), `seed ${seed}: rescued, then caught in the same step`);
      }
    }
  }
  assert.ok(tries > 10 && saved > 0 && saved < tries, `${saved}/${tries} rescues worked`);
});

test('bonds build up over a real career', () => {
  let pairs = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { s } = career(seed, 'smart', 10);
    pairs += Object.keys(s.bonds || {}).length;
  }
  assert.ok(pairs > 20, `${pairs} pairs have a history`);
});

test('the recruit list only offers dogs you can actually hire', () => {
  const s = E.newGame(2);
  E.acceptOffer(s, s.offers[0].id);
  const d = s.dogs[s.pub[0]];
  assert.equal(E.hireProblem(s, d), null);
  d.undercover = true;
  d.known.undercover = true;
  assert.match(E.hireProblem(s, d), /works for the Inspector/);
  assert.equal(E.hire(s, d.id).ok, false, 'hire() says the same');
});

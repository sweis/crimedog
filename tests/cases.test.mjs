// The Inspector's open cases: jobs the crew got away from, followed up between jobs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { openCase, pinchChance, investigate, flipChance, COLD } from '../src/cases.js';
import { blankResult, simulate } from '../src/sim.js';
import { genJob, ownOffer } from '../src/heists.js';
import { makeRng } from '../src/rng.js';
import { takeJob, fakeHeist } from './helpers.mjs';

// A game with a job just done: the crew got away, leaving `clues`, with `seen` sightings of the first.
function afterJob(seed, { clues = 6, seen = 1, heat = 30 } = {}) {
  const s = E.newGame(seed);
  takeJob(s);
  s.cash = 5000;
  for (const id of s.pub.slice(0, 2)) E.hire(s, id);
  const [a, b] = s.crew;
  fakeHeist(s, { crew: s.crew.slice(), escaped: s.crew.slice(), clues, seen: seen ? { [a]: seen } : {} });
  s.heat = heat;
  for (const id of [a, b]) s.dogs[id].status = 'free'; // back in the pub, as after the next job's turnover
  return { s, a: s.dogs[a], b: s.dogs[b], c: s.cases?.at(-1) };
}

test('getting away leaves a file: clues and sightings open a case; a clean job doesn\'t', () => {
  const { s, a, c } = afterJob(3);
  assert.ok(c, 'a case');
  assert.equal(c.clues, 6);
  assert.equal(c.seen[a.id], 1);
  assert.match(s.after.caseFile ? 'file' : '', /file/);
  const clean = afterJob(4, { clues: 0, seen: 0 });
  assert.equal(clean.c, undefined, 'nothing to go on');
  // Coppers on the crew aren't on his list.
  const s2 = E.newGame(5);
  takeJob(s2);
  const job = s2.job;
  const r = blankResult(['x', 'y'], { clues: 3, tipped: ['y'] });
  s2.dogs.x = { id: 'x' }; s2.dogs.y = { id: 'y', undercover: true };
  const c2 = openCase(s2, job, r);
  assert.deepEqual(c2.dogs, ['x']);
});

test('more clues, more sightings, more heat: likelier; every job that goes by, less likely', () => {
  const { s, a, b, c } = afterJob(6);
  const seenP = pinchChance(s, c, a);
  const unseenP = pinchChance(s, c, b);
  assert.ok(seenP > unseenP, `seen ${seenP} vs not ${unseenP}`);
  c.clues += 6;
  assert.ok(pinchChance(s, c, b) > unseenP, 'more clues');
  s.heat = 80;
  assert.ok(pinchChance(s, c, b) > unseenP, 'more heat');
  const now = pinchChance(s, c, a);
  c.age += 2;
  assert.ok(Math.abs(pinchChance(s, c, a) - now * COLD ** 2) < 1e-9, 'the trail goes cold');
  c.fakeIds = true;
  assert.ok(pinchChance(s, c, a) < now * COLD ** 2, 'fake IDs help');
  a.status = 'pound';
  assert.equal(pinchChance(s, c, a), 0, 'already inside');
});

test('the trail goes cold: cases close, and lying low cools them faster', () => {
  const { s, c } = afterJob(7, { clues: 2, seen: 0 });
  for (let k = 0; k < 8; k++) investigate(s, makeRng({ s: 1000 + k }));
  assert.ok(!(s.cases || []).includes(c), 'in a drawer');
  const t = afterJob(8);
  E.nextJob(t.s);
  takeJob(t.s);
  const before = t.c.age;
  assert.ok(E.layLow(t.s).ok);
  assert.equal(t.c.age, before + 1);
});

test('a knock on the door: the pound (talking or not) or "released without charge"; the loyal never flip', () => {
  const tally = { pound: 0, flipped: 0, thin: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const { s, a, c } = afterJob(seed, { clues: 10, seen: 4, heat: 100 });
    a.quirks = [];
    s.story = [];
    const note = investigate(s, makeRng({ s: seed }));
    if (!note) continue;
    const st = s.story.at(-1);
    const d = s.dogs[st.dog];
    assert.equal(st.type, 'pinch');
    assert.ok(st.text.includes(c.name));
    if (/arrested/.test(note)) {
      tally.pound++;
      assert.equal(d.status, 'pound');
      assert.ok(s.stats.pinched >= 1);
    } else if (d.undercover) {
      tally.flipped++;
      assert.equal(d.known.undercover, false, 'you don\'t know yet');
      assert.match(st.text, /without charge/);
    } else {
      tally.thin++;
      assert.match(st.text, /without charge/);
    }
  }
  assert.ok(tally.pound > 20 && tally.flipped > 5, JSON.stringify(tally));
  const loyal = { quirks: ['nevergrass'], loyalty: 10, relation: 0, nerve: 0 };
  assert.equal(flipChance(loyal), 0);
  assert.ok(flipChance({ quirks: [], loyalty: 20, relation: 0, nerve: 20 }) > flipChance({ quirks: [], loyalty: 90, relation: 60, nerve: 80 }));
});

test('the heist notes who was seen: spotted, or chased and got away', () => {
  let seen = 0;
  for (let k = 1; k <= 60; k++) {
    const s = E.newGame(k);
    const job = genJob(s, makeRng({ s: k }), { type: 'breakin', tier: 2 });
    s.offers.unshift(ownOffer(job));
    E.acceptOffer(s, job.id);
    s.cash = 5000;
    for (const id of s.pub.slice(0, 2)) E.hire(s, id);
    E.autoPlan(s);
    const r = simulate(s, s.job, makeRng({ s: k }));
    const sightings = r.beats.filter((b) => /has been spotted!|gives them the slip/.test(b.text)).length;
    assert.equal(Object.values(r.seen).reduce((x, y) => x + y, 0), sightings, `seed ${k}`);
    seen += sightings;
  }
  assert.ok(seen > 10, `${seen} sightings in 60 jobs`);
});

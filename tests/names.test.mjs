// Names: nobody in town shares a nickname, the pools are big and clean, and the
// film-nod quirks do what they say.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { NAMES, SURNAMES, NICKNAMES, QUIRKS, ARCHETYPES, VOICES, CHAOS, WILD, VERDICTS, CODENAMES, SKILLS, APPROACHES } from '../src/data.js';
import { genDog, shortName, promote } from '../src/dogs.js';
import { genJob, visibleStages } from '../src/heists.js';
import { odds } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { pickBy } from '../src/util.js';

const town = (seed, n, opts = {}) => {
  const s = E.newGame(seed);
  const rng = E.rngOf(s);
  for (let i = 0; i < n; i++) {
    const d = genDog(s, rng, opts);
    s.dogs[d.id] = d;
  }
  return s;
};
const living = (s) => Object.values(s.dogs).filter((d) => !['farm', 'gone'].includes(d.status));

test('no two dogs about town answer to the same name', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = town(seed, 40);
    const seen = new Map();
    for (const d of living(s)) {
      const n = shortName(d);
      assert.ok(!seen.has(n), `seed ${seed}: two dogs called ${n}`);
      seen.set(n, d.id);
    }
  }
});

test('legends with the same signature are told apart: the sequel', () => {
  const s = town(3, 0);
  const rng = E.rngOf(s);
  const nicks = [];
  for (let i = 0; i < 3; i++) {
    const d = genDog(s, rng, { rarity: 'legendary', signature: true, primary: 'locks' });
    s.dogs[d.id] = d;
    nicks.push(d.nick);
  }
  assert.equal(new Set(nicks).size, 3, nicks.join(' / '));
  assert.ok(nicks.some((n) => / II$/.test(n)), nicks.join(' / '));
});

test('a promoted legend takes a free name too', () => {
  const s = town(5, 0);
  const rng = E.rngOf(s);
  const a = genDog(s, rng, { rarity: 'legendary', signature: true, primary: 'muscle' });
  s.dogs[a.id] = a;
  const b = genDog(s, rng, { primary: 'muscle', quality: 3 });
  s.dogs[b.id] = b;
  b.rarity = 'rare';
  promote(b, s);
  assert.equal(b.rarity, 'legendary');
  assert.notEqual(b.nick, a.nick);
});

test('the name pools are big and have no repeats', () => {
  assert.ok(NICKNAMES.length >= 100);
  assert.equal(new Set(NICKNAMES).size, NICKNAMES.length);
  for (const pool of [NAMES, SURNAMES]) {
    for (const [voice, list] of Object.entries(pool)) {
      assert.ok(list.length >= 12, `${voice}: ${list.length}`);
      assert.equal(new Set(list).size, list.length, voice);
    }
  }
});

test('no real nationalities or places in the flavour text', () => {
  const text = JSON.stringify({ NAMES, SURNAMES, NICKNAMES, QUIRKS, ARCHETYPES, VOICES, CHAOS, WILD, VERDICTS, CODENAMES });
  for (const w of ['Italian', 'German', 'Japanese', 'English', 'British', 'Spanish', 'French', 'London', 'Glengarry', 'Bellagio', 'Vegas', 'Sicil', 'Turkish', 'Irish', 'Gypsy', 'Pikey', ' dog ', ' dogs ']) {
    assert.ok(!text.includes(w), `found "${w}"`);
  }
});

test('every grade has a verdict, and it stays put for a job', () => {
  for (const g of ['S', 'A', 'B', 'C', 'D', 'F']) assert.ok(VERDICTS[g]?.length >= 2, g);
  assert.equal(pickBy('job_7B', VERDICTS.B), pickBy('job_7B', VERDICTS.B));
});

// The quirks from the films change the odds.
function setup() {
  const s = E.newGame(11);
  const job = genJob(s, makeRng({ s: 12 }), { type: 'breakin', tier: 1 });
  s.job = job;
  const d = genDog(s, E.rngOf(s), {});
  for (const k of SKILLS) d.skills[k] = 3;
  d.quirks = [];
  s.dogs[d.id] = d;
  const stages = visibleStages(job);
  return { s, job, d, stages };
}
const p = (s, job, st, ap, d, quirks) => { d.quirks = quirks; return odds(s, job, st, ap, d, { crew: [d] }).p; };

test('a closer is sharper at the vault', () => {
  const { s, job, d, stages } = setup();
  const vault = stages.find((st) => st.kind === 'vault');
  const ap = vault.options.find((a) => !APPROACHES[a].needKit) || vault.options[0];
  assert.ok(p(s, job, vault, ap, d, ['closer']) > p(s, job, vault, ap, d, []));
});

test('a tell costs you on charm and disguise; heavy is strong but slow', () => {
  const { s, job, d, stages } = setup();
  const st = stages[0];
  for (const ap of st.options) {
    const sk = APPROACHES[ap].skill;
    const base = p(s, job, st, ap, d, []);
    if (['charm', 'disguise'].includes(sk)) assert.ok(p(s, job, st, ap, d, ['tell']) < base, ap);
    if (sk === 'muscle') assert.ok(p(s, job, st, ap, d, ['heavy']) > base, ap);
    if (sk === 'agility') assert.ok(p(s, job, st, ap, d, ['heavy']) < base, ap);
  }
});

test('the new quirks never clash with their opposites', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const d of Object.values(town(seed, 30).dogs)) {
      assert.ok(!(d.quirks.includes('nopink') && d.quirks.includes('greedy')));
      assert.ok(!(d.quirks.includes('tell') && d.quirks.includes('closer')));
      for (const q of d.quirks) assert.ok(QUIRKS[q], q);
    }
  }
});

test('some nights the crew go by colours, and somebody is always Mr Pink', async () => {
  const { simulate } = await import('../src/sim.js');
  let named = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = E.newGame(seed);
    s.cash = 9000;
    E.acceptOffer(s, s.offers[0].id);
    for (const id of s.pub.slice(0, 3)) E.hire(s, id);
    E.autoPlan(s);
    const intro = simulate(s, s.job, makeRng({ s: seed })).beats[0].text;
    assert.match(intro, /The crew is in position\./);
    if (!/Code names/.test(intro)) continue;
    named++;
    assert.equal(intro.match(/Mr Pink/g).length, 1, intro);
    assert.doesNotMatch(intro, /undefined/);
  }
  assert.ok(named >= 3 && named <= 15, `${named}/20`);
});

test('loot reads properly mid-sentence: "did a runner with a solid gold roulette ball"', async () => {
  const { inSentence } = await import('../src/util.js');
  const { newRunner } = await import('../src/runners.js');
  assert.equal(inSentence('A solid gold roulette ball'), 'a solid gold roulette ball');
  assert.equal(inSentence('The Duchess\'s Diamond Collar'), 'the Duchess\'s Diamond Collar');
  assert.equal(inSentence('"Water Lilies with Stick"'), '"Water Lilies with Stick"');
  assert.equal(inSentence('£300 of yours'), '£300 of yours');
  const s = E.newGame(4);
  const rng = E.rngOf(s);
  const d = genDog(s, rng, {});
  s.dogs[d.id] = d;
  const st = newRunner(s, d, 'A solid gold roulette ball', 900, rng);
  assert.match(st.text, /did a runner with a solid gold roulette ball\./);
});

test('the endings never have anyone admit to being a dog', () => {
  for (const [k, t] of Object.entries(E.GAME_OVER_TEXT)) assert.doesNotMatch(`${t.title} ${t.text}`.replace(/Dog & Duck/g, 'the pub'), /\bdogs?\b/i, k); // the pub's name is fine
});

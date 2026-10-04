// Crew drama arcs and promotions from the ranks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { ARCS, startArc, sceneChoices, advanceArcs } from '../src/drama.js';
import { earnedPromotion, promote } from '../src/dogs.js';
import { odds, simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { visibleStages } from '../src/heists.js';
import { takeJob, fakeHeist, finish } from './helpers.mjs';
import { dramaStats } from '../tools/drama.mjs';

// A fresh game at the job board with a known dog to hang a story on.
function withMate(seed = 5) {
  const s = E.newGame(seed);
  s.cash = 5000;
  const d = Object.values(s.dogs).find((x) => x.met);
  d.jobs = 3;
  return { s, d };
}
// Jump an arc to a scene, as if its time had come.
function goTo(s, arc, node) {
  s.story = s.story.filter((x) => x.arc !== arc.id);
  arc.node = node;
  arc.shown = false;
  arc.wait = 0;
  advanceArcs(s, E.rngOf(s));
  return s.story.find((x) => x.arc === arc.id);
}
// Answer every scene on the board with its free (last) option.
function shrug(s) {
  while (s.story.length) (s.story[0].type === 'drama' ? E.chooseDrama(s, sceneChoices(s, s.story[0]).length - 1) : E.dismissStory(s));
}

test('arc content: every next resolves to a scene, and every last choice is free', () => {
  for (const [kind, A] of Object.entries(ARCS)) {
    assert.ok(A.nodes[A.start], kind);
    for (const [id, n] of Object.entries(A.nodes)) {
      assert.ok(n.text && n.choices?.length, `${kind}.${id}`);
      assert.ok(!n.choices.at(-1).cost, `${kind}.${id}: last choice is free`);
      for (const c of n.choices) {
        const targets = typeof c.next === 'string' ? [c.next] : Array.isArray(c.next) ? c.next.map(([x]) => x) : [];
        for (const t of targets) assert.ok(A.nodes[t], `${kind}.${id} -> ${t}`);
        if (typeof c.next === 'function') for (let k = 0; k < 20; k++) assert.ok(A.nodes[c.next({ loyalty: 50, relation: 0 }, makeRng({ s: k }))], `${kind}.${id} fn`);
      }
    }
  }
});

test('stories start between jobs, one per dog, at most two at once', () => {
  let started = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = E.newGame(seed);
    for (let j = 0; j < 6; j++) {
      takeJob(s);
      fakeHeist(s);
      finish(s);
      E.nextJob(s);
      const arcs = s.arcs || [];
      assert.ok(arcs.length <= 2, `seed ${seed}`);
      assert.equal(new Set(arcs.map((a) => a.dog)).size, arcs.length);
      started += s.story.filter((x) => x.type === 'drama').length;
      shrug(s); // answer with the free option so play goes on
    }
  }
  assert.ok(started > 40, `scenes over 60 short careers: ${started}`);
});

test('helping out costs money, lifts the dog and sharpens them for the next job', () => {
  const { s, d } = withMate();
  const arc = startArc(s, 'debt', d.id, E.rngOf(s));
  const before = { cash: s.cash, relation: d.relation, loyalty: d.loyalty };
  const r = E.chooseDrama(s, 0); // pay it
  assert.ok(r.ok, r.msg);
  assert.equal(s.cash, before.cash - arc.vars.amt);
  assert.ok(d.relation > before.relation && d.loyalty > before.loyalty);
  assert.equal(d.drama.edge, 1);
  takeJob(s);
  E.hire(s, d.id);
  const st = visibleStages(s.job)[0];
  const ap = st.options[0];
  const withEdge = odds(s, s.job, st, ap, d).p;
  delete d.drama;
  assert.ok(withEdge > odds(s, s.job, st, ap, d).p);
});

test('you cannot pay for help you cannot afford', () => {
  const { s, d } = withMate();
  startArc(s, 'debt', d.id, E.rngOf(s));
  s.cash = 10;
  assert.equal(sceneChoices(s, s.story[0])[0].ok, false);
  assert.equal(E.chooseDrama(s, 0).ok, false);
  assert.equal(s.story[0].type, 'drama', 'scene stays up');
});

test('a story can make a regular rare, then legendary, with a signature move', () => {
  const { s, d } = withMate();
  const arc = startArc(s, 'mentor', d.id, E.rngOf(s));
  E.chooseDrama(s, 0); // pay for the lessons
  assert.ok(d.drama.away);
  takeJob(s);
  assert.equal(E.hire(s, d.id).ok, false, 'away at the lessons');
  const scene = goTo(s, arc, 'graduated');
  assert.equal(d.rarity, 'rare');
  assert.ok(d.signature && d.homegrown);
  assert.match(scene.text, /rare now/);
  // One of yours: not an out-of-town visitor.
  shrug(s);
  E.nextJob(s);
  takeJob(s);
  assert.ok(E.hire(s, d.id).ok);
  assert.equal(promote(d), 'legendary');
  assert.equal(promote(d), null);
});

test('stories can end with the dog in the pound, doing a runner, or grassing', () => {
  const ends = {};
  for (const node of ['nicked', 'runner', 'grass']) {
    const { s, d } = withMate();
    const arc = startArc(s, 'debt', d.id, E.rngOf(s));
    const cash = s.cash;
    const heat = s.heat;
    goTo(s, arc, node);
    ends[node] = { status: d.status, cash: cash - s.cash, heat: s.heat - heat };
  }
  assert.equal(ends.nicked.status, 'pound');
  assert.equal(ends.runner.status, 'gone');
  assert.ok(ends.runner.cash > 0, 'runner takes cash');
  assert.equal(ends.grass.status, 'gone');
  assert.ok(ends.grass.heat >= 20, 'grass brings heat');
});

test('trouble follows a dog to work: it turns up in the heist and leaves clues', () => {
  let seen = 0;
  let clues = 0;
  let base = 0;
  const N = 120;
  for (let k = 1; k <= N; k++) {
    const { s, d } = withMate(k);
    takeJob(s);
    E.hire(s, d.id);
    E.autoPlan(s);
    d.drama = { trouble: { kind: 'tail', text: 'The unmarked car is back.' } };
    const r = simulate(s, s.job, makeRng({ s: k }));
    if (r.beats.some((b) => b.text === 'The unmarked car is back.')) seen++;
    clues += r.clues;
    delete d.drama;
    base += simulate(s, s.job, makeRng({ s: k })).clues;
  }
  assert.ok(seen >= 0.4 * N, `trouble showed up in ${seen}/${N}`); // not when the job stops short of its step (about 57% do)
  assert.ok(clues > base, `clues with trouble ${clues} vs ${base}`);
});

test('drama effects last one job, and unanswered scenes take the free option', () => {
  const { s, d } = withMate();
  const arc = startArc(s, 'family', d.id, E.rngOf(s));
  E.chooseDrama(s, 0); // cover the bills: fired up for the next job
  assert.equal(d.drama.edge, 1);
  takeJob(s);
  fakeHeist(s);
  finish(s);
  E.nextJob(s);
  assert.ok(!d.drama, 'wore off after the job');
  // The next scene is up. Leave it unanswered through a whole job.
  const node = arc.node;
  assert.ok(s.story.some((x) => x.arc === arc.id));
  takeJob(s);
  fakeHeist(s);
  finish(s);
  const cash = s.cash;
  E.nextJob(s);
  assert.ok(!s.arcs.includes(arc) || arc.node !== node, 'the story moved on');
  assert.ok(s.cash >= cash, 'nothing spent on the unanswered scene');
});

test('regulars level up on the job: rare, then legendary', () => {
  const { s, d } = withMate();
  for (const k of Object.keys(d.skills)) d.skills[k] = 1;
  d.skills.locks = 5;
  d.jobs = 4;
  d.relation = 30;
  assert.ok(earnedPromotion(d));
  takeJob(s);
  E.hire(s, d.id);
  fakeHeist(s, { escaped: [d.id], crew: [d.id] });
  assert.equal(d.rarity, 'rare');
  assert.equal(d.signature, 'whisper');
  assert.deepEqual(s.after.promoted, [{ id: d.id, to: 'rare' }]);
  // Legendary takes a long record, real trust and a second strong skill.
  d.jobs = 8; d.relation = 50; d.skills.tech = 3;
  assert.ok(earnedPromotion(d));
  d.skills.tech = 1;
  assert.ok(!earnedPromotion(d));
});

test('over careful careers, some regulars make it big and stories reach every kind of ending', () => {
  const st = dramaStats(120, 12, 'smart');
  assert.ok(st.arcsPerJob > 0.2 && st.arcsPerJob < 0.6, `arcs per job ${st.arcsPerJob}`);
  assert.ok(st.homegrownPerCareer.rare > 0.3, `home-grown rares ${st.homegrownPerCareer.rare}`);
  assert.ok(st.homegrownPerCareer.legendary > 0, 'someone goes legendary');
  const reckless = dramaStats(120, 12, 'reckless');
  const seen = { ...st.scenes, ...reckless.scenes };
  for (const end of ['debt.grateful', 'debt.nicked', 'debt.runner', 'debt.grass', 'mentor.graduated', 'family.mended']) assert.ok(seen[end], end);
});

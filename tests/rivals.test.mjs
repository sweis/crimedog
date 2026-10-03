// Rival crews: saboteurs, a show-off competitor, and a mystery thief who can join you.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { genJob } from '../src/heists.js';
import { rivalsBetweenJobs, rivalsAfterJob, rivalsOf, ghostScene } from '../src/rivals.js';
import { simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { isVisitor } from '../src/dogs.js';
import { takeJob, fakeHeist, finish } from './helpers.mjs';
import { career } from '../tools/balance.mjs';

const force = (s, move) => rivalsBetweenJobs(s, E.rngOf(s), { genJob, force: move });
const fresh = (seed = 3) => {
  const s = E.newGame(seed);
  s.cash = 5000;
  const R = rivalsOf(s);
  R.jacks.met = true;
  R.dan.met = true;
  return { s, R };
};
// Pick the choice whose effect is `effect` on the scene on top.
const choose = (s, effect) => E.chooseRival(s, s.story[0].choices.findIndex((c) => c.effect === effect));

test('the rivals turn up early in a career, and keep making trouble', () => {
  const seen = { jacks: 0, dan: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const { s } = career(seed, 'smart', 10);
    const R = rivalsOf(s);
    if (R.jacks.met) seen.jacks++;
    if (R.dan.met) seen.dan++;
  }
  assert.ok(seen.jacks >= 50 && seen.dan >= 45, JSON.stringify(seen));
});

test('the Jack Russells: mischief, then rat them out (it costs rep), and they come back', () => {
  const { s, R } = fresh();
  for (let k = 0; k < 10; k++) { force(s, 'jacksMischief'); E.dismissStory(s); }
  assert.ok(R.jacks.beef >= 5, 'letting it go builds a grudge');
  force(s, 'jacksMischief');
  const rep = s.rep;
  assert.ok(choose(s, 'ratout').ok);
  assert.equal(s.rep, rep - 6);
  assert.equal(R.jacks.status, 'away');
  // Out after four jobs, and angrier.
  const beef = R.jacks.beef;
  for (let k = 0; k < 4; k++) rivalsBetweenJobs(s, E.rngOf(s), { genJob });
  assert.equal(R.jacks.status, 'active');
  assert.equal(R.jacks.beef, beef + 2);
});

test('setting them up: usually they go down; when it fails they come for your next job', () => {
  let down = 0;
  let back = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, R } = fresh(seed);
    force(s, 'jacksMischief');
    s.gatecrash = null;
    const cash = s.cash;
    choose(s, 'setup');
    assert.equal(s.cash, cash - 250);
    if (R.jacks.status === 'away') down++;
    else { back++; assert.equal(s.gatecrash, 'jacks'); }
  }
  assert.ok(down > 15 && back > 5, `down ${down}, back ${back}`);
});

test('a gatecrash puts the rival crew on your next job as a step to deal with', () => {
  const { s } = fresh();
  s.gatecrash = 'jacks';
  s.offers[0].job = genJob(s, makeRng({ s: 1 }), { type: 'breakin', twist: null });
  takeJob(s);
  const st = s.job.stages.find((x) => x.id === 'obs_rivals');
  assert.ok(st && st.label === 'The Jack Russell Gang');
  assert.equal(s.job.rivalCrew, 'jacks');
  assert.equal(s.gatecrash, null);
});

test('robbing a rival: their place goes on the board, stays there, and a win sees them off', () => {
  const { s, R } = fresh();
  s.kit.lockpicks = 1;
  R.jacks.stolen = ['lockpicks'];
  force(s, 'jacksMischief');
  choose(s, 'rob');
  const o = s.offers.find((x) => x.job.rivalHit === 'jacks');
  assert.ok(o);
  // Still there after a fresh board.
  E.digLeads(s);
  assert.ok(s.offers.some((x) => x.job.rivalHit === 'jacks'));
  E.acceptOffer(s, o.id);
  assert.equal(R.jacks.board, null);
  fakeHeist(s);
  const kit = s.kit.lockpicks || 0;
  finish(s);
  assert.equal(R.jacks.status, 'done');
  assert.equal(R.jacks.ended, 'robbed');
  assert.equal(s.kit.lockpicks, kit + 1, 'your stolen kit comes back');
  assert.ok(s.after.rivals.some((t) => t.includes('You robbed')));
});

test('Dandy Dan: notes, then a wager; an A wins it and he leaves town', () => {
  const { s, R } = fresh();
  for (let k = 0; k < 3; k++) { force(s, 'danNote'); choose(s, 'letgo'); }
  force(s, 'danWager');
  const amt = R.dan.wagerAmt;
  choose(s, 'wager');
  const o = s.offers.find((x) => x.job.wager);
  assert.equal(o.job.wager, amt);
  E.acceptOffer(s, o.id);
  fakeHeist(s, { alarmMax: 0, clues: 0 });
  const cash = s.cash;
  finish(s, 'hal', 30);
  if (['S', 'A'].includes(s.after.grade.letter)) {
    assert.equal(R.dan.status, 'done');
    assert.equal(R.dan.ended, 'wager');
  } else assert.equal(R.dan.status, 'active');
  assert.ok(s.cash !== cash);
});

test('walking away from Dan\'s wager costs rep', () => {
  const { s, R } = fresh();
  R.dan.notes = 3;
  force(s, 'danWager');
  choose(s, 'wager');
  E.acceptOffer(s, s.offers.find((x) => x.job.wager).id);
  const rep = s.rep;
  E.nextJob(s);
  assert.ok(s.rep <= rep - 6, 'walked away (-3) and bottled the wager (-3)');
  assert.equal(R.dan.wager, null);
});

test('the Grey Ghost: calling cards and clean work win them over; a clean audition and they join', () => {
  const s = E.newGame(8);
  const g = rivalsOf(s).ghost;
  // How a job went, as far as the Ghost cares.
  // rang: the alarm went off (the meter can twitch without it ringing).
  let said = [];
  const job = (grade, callingCard, alarmMax = 0, rang = alarmMax >= 6) => {
    s.job = { callingCard };
    s.after = { grade: { letter: grade }, securedValue: 1000 };
    s.result = { alarmMax, beats: rang ? [{ kind: 'alarm', text: 'BRRRRING!' }] : [] };
    said = rivalsAfterJob(s, E.rngOf(s));
  };
  job('C', false);
  assert.equal(g.interest, 0, 'an ordinary job: nothing');
  job('B', true);
  job('B', true);
  assert.ok(g.met, 'calling cards on good jobs get noticed');
  job('A', true);
  job('B', false);
  assert.ok(g.gift, 'a gift');
  job('A', true);
  assert.ok(g.test, 'an audition');
  job('A', false, 6);
  assert.ok(!g.test && g.interest === 5, 'an alarm: not good enough');
  assert.match(said.join(' '), /alarm went off/, 'and you are told why');
  job('A', true);
  assert.ok(g.test, 'a second audition');
  job('B', false, 0);
  assert.ok(!g.test && g.interest === 5, 'a B: not good enough');
  assert.match(said.join(' '), /A B\. The Ghost wanted an A or better/);
  job('A', true);
  assert.ok(g.test, 'a third audition');
  job('S', false, 3);
  assert.ok(!g.test, 'the meter twitched but the alarm never went off: that counts');
  const st = s.story.find((x) => x.type === 'rival' && x.move === 'join');
  assert.ok(st, 'the meeting');
  s.story = [st];
  E.chooseRival(s, 0);
  assert.equal(g.status, 'joined');
  const d = s.dogs[g.dog];
  assert.equal(d.rarity, 'legendary');
  assert.ok(!isVisitor(d), 'one of yours, not a visitor');
  assert.equal(d.nick, 'The Grey Ghost');
  assert.deepEqual(s.story.filter((x) => x.type === 'rival').map((x) => x.move), [], 'no more Ghost scenes');
});

test('a calling card leaves a clue on the job', () => {
  let more = 0;
  for (let k = 1; k <= 20; k++) {
    const s = E.newGame(k);
    s.cash = 9000;
    takeJob(s);
    for (const id of s.pub.slice(0, 3)) E.hire(s, id);
    E.autoPlan(s);
    const plain = simulate(s, s.job, makeRng({ s: k }));
    E.toggleCallingCard(s);
    const card = simulate(s, s.job, makeRng({ s: k }));
    if (card.beats.some((b) => b.text.includes('calling card'))) { more++; assert.equal(card.clues, plain.clues + 1); }
  }
  assert.ok(more >= 5);
});

test('ratting out a rival puts the Ghost off you', () => {
  const { s, R } = fresh();
  R.ghost.met = true;
  R.ghost.interest = 4;
  force(s, 'jacksMischief');
  choose(s, 'ratout');
  assert.equal(R.ghost.interest, 2);
  ghostScene(s, E.rngOf(s));
});

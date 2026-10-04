// Bugs found by playing: each one, pinned.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { inSentence, withArticle, dots } from '../src/util.js';
import { rivalsOf } from '../src/rivals.js';
import { pickOffer, answerStories } from '../tools/balance.mjs';
import { blankResult } from '../src/sim.js';
import { takeJob } from './helpers.mjs';

test('a scene that takes rep to nothing ends the game there, not a job later', () => {
  const s = E.newGame(4);
  s.rep = 2;
  s.story = [{ type: 'rival', rival: 'dan', move: 'danWager', title: 'x', text: 'x', choices: [{ label: 'Not interested', cost: 0, effect: 'letgo' }] }];
  rivalsOf(s).dan.met = true;
  // Any choice that costs rep: force the hit and answer.
  s.rep = 0;
  E.chooseStory(s, 0);
  assert.equal(s.phase, 'over');
  assert.equal(s.over.reason, 'nobody');
});

test('nobody left to pay: no money goes out, and nobody counts as stiffed', () => {
  const s = E.newGame(5);
  takeJob(s);
  E.hire(s, s.pub[0]);
  s.result = blankResult(s.crew, { secured: s.job.loot.slice(1).map((l) => l.id), escaped: [], runners: s.crew.map((id) => ({ id, lootId: s.job.loot[0].id })) });
  s.phase = 'heist';
  E.resolveHeist(s);
  if (s.after.step === 'fence') E.fence(s, 'hal');
  assert.ok(s.after.received > 0);
  assert.deepEqual(E.owedCrew(s.result), []);
  const cash = s.cash;
  const r = E.payCrew(s, 45);
  assert.ok(r.ok);
  assert.equal(s.cash, cash, 'kept the lot');
  assert.equal(s.after.grade.parts.pay, 5);
});

test('lying low with no heat: refused, and it costs nothing', () => {
  const s = E.newGame(6);
  takeJob(s);
  s.heat = 0;
  const { cash } = s;
  const days = s.job.daysLeft;
  assert.equal(E.layLow(s).ok, false);
  assert.equal(s.cash, cash);
  assert.equal(s.job.daysLeft, days);
});

test('names keep their capitals mid-sentence; articles and list-item words lose theirs', () => {
  assert.equal(inSentence('Brick Bone\'s cash box'), 'Brick Bone\'s cash box');
  assert.equal(inSentence('A solid gold roulette ball'), 'a solid gold roulette ball');
  assert.equal(inSentence('The Duchess\'s Diamond Collar'), 'the Duchess\'s Diamond Collar');
  assert.equal(inSentence('Crack the Wi-Fi'), 'crack the Wi-Fi');
  assert.equal(withArticle('The Little Black Ledger'), 'The Little Black Ledger');
  assert.equal(withArticle('Skeleton Key'), 'a Skeleton Key');
  assert.equal(withArticle('Oil Lamp'), 'an Oil Lamp');
  assert.ok(!/<span class="bit">·/.test(dots('Saluki', 'Sneak', 'Solid')), 'no piece starts with the dot');
});

test('ratting out a rival calls off the Ghost\'s audition', () => {
  const s = E.newGame(7);
  const R = rivalsOf(s);
  Object.assign(R.ghost, { met: true, status: 'active', test: true, interest: 8 });
  Object.assign(R.jacks, { met: true, status: 'active' });
  s.story = [{ type: 'rival', rival: 'jacks', title: 'x', text: 'x', choices: [{ label: 'Rat', cost: 0, effect: 'ratout' }] }];
  E.chooseStory(s, 0);
  assert.equal(R.ghost.test, false);
});

test('a dog a story sends away or down leaves the pub too', () => {
  // Seed 8's reckless career used to leave a dog who'd been poached standing in the pub.
  const s = E.newGame(8);
  for (let j = 0; j < 20 && !s.over; j++) {
    answerStories(s, 'reckless');
    for (const id of s.pub) assert.equal(s.dogs[id].status, 'free', `job ${j}: ${s.dogs[id].status} in the pub`);
    pickOffer(s, 'reckless');
    if (s.pub.length && s.dogs[s.pub[0]].fee <= s.cash) E.hire(s, s.pub[0]);
    if (!s.crew.length) { E.nextJob(s); continue; }
    E.pullJob(s);
    E.resolveHeist(s);
    if (s.after.step === 'deliver') E.deliver(s);
    if (s.after.step === 'fence') E.fence(s, 'hal');
    E.payCrew(s, 0);
    E.nextJob(s);
  }
});

// Making amends with an outfit you've crossed: pay up, or a hard job for nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { amendsCost, canMakeAmends } from '../src/groups.js';
import { fakeHeist, finish } from './helpers.mjs';

const crossed = (gid = 'firm', standing = -60, seed = 3) => {
  const s = E.newGame(seed);
  s.cash = 20000;
  s.rep = 70;
  s.groups[gid].standing = standing;
  return s;
};

test('amends are on offer once an outfit has turned on you', () => {
  assert.equal(canMakeAmends(crossed('firm', 0), 'firm'), false);
  assert.equal(canMakeAmends(crossed('firm', -25), 'firm'), true);
  assert.equal(E.makeAmends(crossed('firm', 0), 'firm', 'pay').ok, false);
});

test('paying up: the debt plus interest, and something for the trouble; then they\'re neutral', () => {
  const s = crossed('family', -60);
  s.groups.family.debt = { amount: 1000, patience: 1 };
  const cost = amendsCost(s, 'family');
  assert.equal(cost, 1250 + 1200);
  const cash = s.cash;
  assert.ok(E.makeAmends(s, 'family', 'pay').ok);
  assert.equal(s.cash, cash - cost);
  assert.equal(s.groups.family.standing, 0);
  assert.equal(s.groups.family.debt, null);
});

test('a hard job for nothing: it goes on the board, stays there, and doing it puts things right', () => {
  const s = crossed('firm', -70);
  assert.ok(E.makeAmends(s, 'firm', 'job').ok);
  const o = s.offers.find((x) => x.job.patron?.deal === 'amends');
  assert.ok(o && o.source === 'firm');
  assert.equal(o.job.tier, 3);
  assert.equal(o.job.patron.fee, 0);
  assert.equal(E.makeAmends(s, 'firm', 'job').ok, false, 'one at a time');
  E.digLeads(s);
  assert.ok(s.offers.some((x) => x.id === o.id), 'fresh leads don\'t push it off');
  E.acceptOffer(s, o.id);
  assert.equal(s.groups.firm.amends, null);
  fakeHeist(s);
  if (s.after.step === 'deliver') E.deliver(s);
  finish(s);
  assert.equal(s.groups.firm.standing, 15);
  assert.ok(s.after.relations.some((l) => /Amends made/.test(l.why)));
});

test('an amends job you haven\'t taken survives a new board between jobs', async () => {
  const { genOffers } = await import('../src/groups.js');
  const s = crossed('poodle', -80);
  E.makeAmends(s, 'poodle', 'job');
  const id = s.groups.poodle.amends.id;
  genOffers(s, E.rngOf(s));
  assert.ok(s.offers.some((o) => o.id === id));
});

test('botching the amends job makes it worse, not a new debt', () => {
  const s = crossed('family', -50);
  E.makeAmends(s, 'family', 'job');
  const o = s.offers.find((x) => x.job.patron?.deal === 'amends');
  E.acceptOffer(s, o.id);
  fakeHeist(s, { secured: [] });
  finish(s);
  assert.ok(s.groups.family.standing < -50);
  assert.equal(s.groups.family.debt ?? null, null);
});

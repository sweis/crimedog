import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { GROUPS } from '../src/data.js';
import { betweenJobs, genOffers, standingLabel } from '../src/groups.js';

// Force a heist result without running the dice, then resolve it.
function fake(s, { secured, outcome = 'clean', clues = 0, alarmMax = 0 }) {
  E.hire(s, s.pub.find((id) => s.dogs[id].fee <= s.cash) ?? s.pub[0]);
  s.result = {
    beats: [], outcome, secured, dropped: [], alarmMax, clues, coppers: false, pearShaped: false, aborted: false, swap: false,
    captured: [], runners: [], exposed: [], tipped: [], escaped: s.crew.slice(), crew: s.crew.slice(), kitUsed: {}, learned: {}, practised: {}, heatGain: 0,
  };
  s.phase = 'heist';
  E.resolveHeist(s);
}
function finish(s) {
  if (s.after.step === 'deliver') assert.ok(E.deliver(s).ok);
  if (s.after.step === 'fence') assert.ok(E.fence(s, 'hal').ok);
  assert.ok(E.payCrew(s, 30).ok);
}
function boardWith(gid, deal, seedBase = 1) {
  for (let seed = seedBase; seed < seedBase + 400; seed++) {
    const s = E.newGame(seed);
    s.rep = 80;
    s.cash = 5000;
    genOffers(s, E.rngOf(s));
    const o = s.offers.find((x) => x.source === gid && (!deal || x.kind === deal));
    if (o) return { s, o };
  }
  throw new Error(`no ${gid} ${deal} offer found`);
}

test('new careers start with only your own small leads', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = E.newGame(seed);
    assert.equal(s.phase, 'select');
    assert.ok(s.offers.length >= 2);
    assert.ok(s.offers.every((o) => o.source === 'own'), `seed ${seed}`);
  }
});

test('groups only come calling once your rep clears their bar', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const s = E.newGame(seed);
    s.rep = 42; // above Firm/Ze/Poodle, below Family/Syndicate
    genOffers(s, E.rngOf(s));
    for (const o of s.offers) if (o.source !== 'own') seen.add(o.source);
  }
  assert.ok(seen.has('firm') && seen.has('ze') && seen.has('poodle'));
  assert.ok(!seen.has('family') && !seen.has('syndicate'));
});

test('first contact queues a story scene', () => {
  const { s, o } = boardWith('family');
  assert.ok(s.groups.family.met);
  assert.ok(s.story.some((st) => st.gid === 'family' && st.kind === 'intro'));
  assert.ok(o.pitch);
});

test('commission: the patron pays directly for the item and warms to you', () => {
  const { s, o } = boardWith('poodle', 'commission');
  assert.ok(E.acceptOffer(s, o.id).ok);
  const p = s.job.patron;
  fake(s, { secured: s.job.loot.map((l) => l.id) });
  assert.equal(s.after.step, 'deliver');
  const before = s.cash;
  assert.ok(E.deliver(s).ok);
  assert.equal(s.cash, before + p.fee, 'paid the fee directly');
  assert.ok(p.fee > s.job.loot.find((l) => l.id === p.want).value, 'pays over the odds for what they want');
  assert.equal(s.after.delivered, p.want);
  assert.ok(!E.toFence(s).includes(p.want), 'the delivered item is not fenced again');
  if (s.after.step === 'fence') E.fence(s, 'hal');
  E.payCrew(s, 30);
  assert.ok(s.groups.poodle.standing > 0);
  assert.ok(s.after.relations.some((r) => r.gid === 'poodle' && r.delta > 0));
});

test('cut: the patron takes their percentage of what the fence pays', () => {
  const { s, o } = boardWith('firm', 'cut');
  E.acceptOffer(s, o.id);
  assert.ok(Object.values(s.job.intel).some(Boolean), 'a tip-off comes with some intel');
  fake(s, { secured: s.job.loot.map((l) => l.id) });
  const gross = E.fenceRate(s, 'hal');
  E.fence(s, 'hal');
  assert.equal(s.after.patronCut, Math.round((gross * s.job.patron.cut) / 100));
  assert.equal(s.after.received, gross - s.after.patronCut);
});

test('robbing a rival outfit makes an enemy of the target', () => {
  const { s, o } = boardWith('family', 'cut');
  // point this job at a Syndicate venue
  E.acceptOffer(s, o.id);
  s.job.owner = 'syndicate';
  fake(s, { secured: s.job.loot.map((l) => l.id), outcome: 'messy', clues: 4, alarmMax: 7 });
  finish(s);
  assert.ok(s.groups.syndicate.standing <= -25, `syndicate ${s.groups.syndicate.standing}`);
  assert.ok(s.groups.family.standing > 0);
});

test('failing the Family puts you in debt; they call it in, then lean on you', () => {
  const { s, o } = boardWith('family', 'commission');
  E.acceptOffer(s, o.id);
  fake(s, { secured: [], outcome: 'bust' });
  finish(s);
  const owed = s.groups.family.debt?.amount;
  assert.ok(owed > 0, 'in debt');
  assert.ok(s.story.some((st) => st.kind === 'debt'));
  // Next board: a marker job from the Family is always on it.
  E.nextJob(s);
  const marker = s.offers.find((x) => x.source === 'family' && x.kind === 'marker');
  assert.ok(marker, 'marker job offered');
  // Ignore it for long enough and they tip off the Inspector.
  const heat = s.heat;
  s.groups.family.debt.patience = 0;
  betweenJobs(s, E.rngOf(s));
  assert.ok(s.heat >= heat + 15, `heat ${heat} -> ${s.heat}`);
  assert.ok(s.groups.family.debt.amount > owed, 'debt grows');
});

test('doing the marker job clears the debt', () => {
  const { s, o } = boardWith('syndicate', 'commission');
  E.acceptOffer(s, o.id);
  fake(s, { secured: [], outcome: 'bust' });
  finish(s);
  E.nextJob(s);
  const marker = s.offers.find((x) => x.source === 'syndicate' && x.kind === 'marker');
  E.acceptOffer(s, marker.id);
  fake(s, { secured: s.job.loot.map((l) => l.id) });
  finish(s);
  assert.equal(s.groups.syndicate.debt, null);
});

test('paying a debt off clears it', () => {
  const s = E.newGame(4);
  s.groups.family.debt = { amount: 500, patience: 2 };
  s.cash = 400;
  assert.equal(E.payDebt(s, 'family').ok, false);
  s.cash = 900;
  assert.ok(E.payDebt(s, 'family').ok);
  assert.equal(s.groups.family.debt, null);
  assert.equal(s.cash, 400);
});

test('enemies strike between jobs and their members refuse to work for you', () => {
  const s = E.newGame(9);
  for (const g of Object.keys(GROUPS)) s.groups[g].standing = -80;
  let hits = 0;
  for (let i = 0; i < 20; i++) { s.story = []; betweenJobs(s, E.rngOf(s)); hits += s.story.filter((x) => x.kind === 'hostile').length; }
  assert.ok(hits > 0, 'hostile moves happen');
  E.acceptOffer(s, s.offers[0].id);
  const shiba = Object.values(s.dogs).find((d) => d.faction === 'syndicate') || (() => {
    E.refreshPub(s); return Object.values(s.dogs).find((d) => d.faction === 'syndicate');
  })();
  if (shiba) {
    shiba.status = 'free';
    assert.equal(E.hire(s, shiba.id).ok, false);
  }
  assert.equal(standingLabel(-80), 'Enemy');
});

test('walking away from a fronted job hands the money back', () => {
  for (let seed = 1; seed < 400; seed++) {
    const s = E.newGame(seed);
    s.rep = 80;
    genOffers(s, E.rngOf(s));
    const o = s.offers.find((x) => x.job.patron?.front);
    if (!o) continue;
    const before = s.cash;
    E.acceptOffer(s, o.id);
    assert.equal(s.cash, before + o.job.patron.front);
    E.nextJob(s); // walk away
    assert.equal(s.cash, before);
    assert.ok(s.groups[o.source].standing < 0);
    return;
  }
  assert.fail('no fronted offer found');
});

test('when skint, the Family lends; skint only ends the game once they stop', () => {
  const s = E.newGame(8);
  s.cash = 10;
  assert.equal(E.checkGameOver(s), null, 'a loan is still possible');
  assert.ok(E.borrow(s).ok);
  assert.equal(s.cash, 510);
  assert.equal(s.groups.family.debt.amount, 600);
  s.cash = 10;
  E.borrow(s); s.cash = 10; E.borrow(s); // 1200, 1800
  assert.equal(s.groups.family.debt.amount, 1800);
  s.cash = 10;
  assert.equal(E.borrow(s).ok, false, 'capped');
  assert.equal(E.checkGameOver(s)?.reason, 'broke');
});

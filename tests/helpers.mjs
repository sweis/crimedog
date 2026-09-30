// Shared test helpers: stage heist outcomes and find specific job offers.
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { genOffers } from '../src/groups.js';
import { blankResult } from '../src/sim.js';

// Take the first offer on the board (or a group's, for 'smart').
export function takeJob(s, mode = 'reckless') {
  if (s.phase !== 'select') return;
  const pick = mode === 'smart' ? (s.offers.find((o) => o.source !== 'own') || s.offers[0]) : s.offers[0];
  const r = E.acceptOffer(s, pick.id);
  assert.ok(r.ok, r.msg);
}

// Resolve the current job with a staged result (everything secured unless overridden).
export function fakeHeist(s, extra = {}) {
  if (!s.crew.length) E.hire(s, s.pub.find((id) => s.dogs[id].fee <= s.cash) ?? s.pub[0]);
  s.result = blankResult(s.crew, { secured: s.job.loot.map((l) => l.id), ...extra });
  s.phase = 'heist';
  E.resolveHeist(s);
}

// Walk the aftermath to the grade: deliver, fence, pay.
export function finish(s, fence = 'hal', pct = 30) {
  if (s.after.step === 'deliver') assert.ok(E.deliver(s).ok);
  if (s.after.step === 'fence') assert.ok(E.fence(s, fence).ok);
  assert.ok(E.payCrew(s, s.after.received ? pct : 0).ok);
}

// A fresh game (rep and cash high) whose board has an offer from `gid` of `kind`.
export function boardWith(gid, kind) {
  for (let seed = 1; seed < 500; seed++) {
    const s = E.newGame(seed);
    s.rep = 80;
    s.cash = 5000;
    genOffers(s, E.rngOf(s));
    const o = s.offers.find((x) => x.source === gid && (!kind || x.kind === kind));
    if (o) return { s, o };
  }
  throw new Error(`no ${gid} ${kind} offer found`);
}

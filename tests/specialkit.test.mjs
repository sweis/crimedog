// Special kit: never for sale, won on particular jobs, and useful on later ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { KIT, APPROACHES } from '../src/data.js';
import { genJob } from '../src/heists.js';
import { difficulty } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { takeJob, fakeHeist, finish } from './helpers.mjs';

const SPECIALS = Object.keys(KIT).filter((k) => KIT[k].special);

test('special kit is not for sale', () => {
  const s = E.newGame(1);
  takeJob(s);
  s.cash = 99999;
  for (const k of SPECIALS) assert.equal(E.buy(s, k).ok, false, k);
});

test('some jobs carry a piece worth keeping, only from the right places, never one you have', () => {
  let withPrize = 0;
  let n = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = E.newGame(seed);
    if (seed % 2) s.kit.detector = 1;
    const job = genJob(s, makeRng({ s: seed }), {});
    n++;
    if (!job.prize) continue;
    withPrize++;
    const from = KIT[job.prize].from;
    assert.ok(from.includes(job.type) || from.includes(job.venueType), `${job.prize} from ${job.type}/${job.venueType}`);
    assert.ok(!(s.kit[job.prize] > 0), 'never one you already have');
  }
  assert.ok(withPrize / n > 0.2 && withPrize / n < 0.5, `prize share ${withPrize}/${n}`);
});

test('you keep it if the crew gets into the goods, not if they come away empty', () => {
  for (const secured of [true, false]) {
    const s = E.newGame(3);
    s.offers[0].job = genJob(s, makeRng({ s: 3 }), { type: 'breakin', venueType: 'museum' });
    s.offers[0].job.prize = 'detector';
    takeJob(s);
    fakeHeist(s, secured ? {} : { secured: [] });
    assert.equal(s.kit.detector > 0, secured, `secured=${secured}`);
    if (secured) assert.equal(s.after.prize, 'detector');
    finish(s);
  }
});

test('each piece makes its kind of step easier', () => {
  const s = E.newGame(5);
  const job = genJob(s, makeRng({ s: 5 }), { type: 'breakin' });
  const lasers = { id: 'obs_lasers', kind: 'obstacle' };
  const getaway = { id: 'getaway', kind: 'getaway' };
  const cat = { id: 'haz_cat', kind: 'obstacle' };
  const cases = [
    ['detector', lasers, 'o_limbo', -2],
    ['scanner', getaway, 'g_walk', -1],
    ['skeleton', { id: 'entry', kind: 'entry' }, 'e_pick', -1],
    ['catnip', cat, 'o_tiptoe', -3],
  ];
  for (const [k, stage, ap, want] of cases) {
    const base = difficulty(s, job, stage, ap, {});
    assert.equal(difficulty(s, job, stage, ap, { [k]: 1 }) - base, want, k);
  }
  const con = genJob(s, makeRng({ s: 6 }), { type: 'con' });
  assert.equal(difficulty(s, con, con.stages[0], con.stages[0].options[0], { ledger: 1 }) - difficulty(s, con, con.stages[0], con.stages[0].options[0], {}), -1, 'ledger on a con');
});

test('the master key card opens a way into later break-ins, three swipes', () => {
  const s = E.newGame(7);
  s.kit.keycard = 3;
  const job = genJob(s, makeRng({ s: 7 }), { type: 'breakin' });
  assert.ok(job.stages[0].options.includes('e_keycard'));
  assert.equal(APPROACHES.e_keycard.needKit, 'keycard');
  assert.ok(KIT.keycard.consumable && KIT.keycard.uses === 3);
  const con = genJob(s, makeRng({ s: 8 }), { type: 'con' });
  assert.ok(!con.stages[0].options.includes('e_keycard'), 'no doors on a con');
});

// The long game: save up, retire, and see where everyone ended up.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { RETIRE, canRetire } from '../src/retire.js';
import { genDog } from '../src/dogs.js';
import { rivalsOf } from '../src/rivals.js';
import { career } from '../tools/balance.mjs';

// A finished career with one of everything: a close mate, a runner, one on the farm, a star.
function veteran(seed = 4) {
  const s = E.newGame(seed);
  const rng = E.rngOf(s);
  const make = (extra, opts = {}) => {
    const d = genDog(s, rng, { quality: 2, ...opts });
    Object.assign(d, { met: true, jobs: 4, ...extra });
    s.dogs[d.id] = d;
    return d;
  };
  const close = make({ relation: 70 });
  const runner = make({ status: 'gone', left: 'runner', ranWith: 'The Golden Bone', relation: -100 });
  const farmed = make({ status: 'farm', farmedBy: 'you' });
  const star = make({ jobs: 1 }, { rarity: 'legendary', signature: true });
  s.history = [{ name: 'The Kibble Job', grade: 'A', crew: [{ id: close.id }] }];
  return { s, close, runner, farmed, star };
}

test('the nest egg is a long way off: no careful career gets there in a dozen jobs', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const { s } = career(seed, 'smart', 12);
    assert.ok(s.cash < RETIRE.goal, `seed ${seed}: ${s.cash}`);
  }
});

test('you can retire only from the job board, and only with the money put away', () => {
  const { s } = veteran();
  assert.equal(canRetire(s), false);
  assert.equal(E.retireNow(s).ok, false);
  s.cash = RETIRE.goal;
  assert.equal(canRetire(s), true);
  const r = E.retireNow(s);
  assert.ok(r.ok, r.msg);
  assert.equal(s.phase, 'over');
  assert.equal(s.over.reason, 'retired');
});

test('the epilogues: a close mate, a runner tracked down, a star, then rivals and the Inspector', () => {
  const { s, close, runner, star } = veteran();
  rivalsOf(s).ghost.status = 'joined';
  s.cash = RETIRE.goal;
  E.retireNow(s);
  const eps = s.over.epilogues;
  const kinds = eps.map((e) => e.kind);
  assert.deepEqual(kinds.slice(0, 3), ['close', 'runner', 'star']);
  assert.equal(eps[0].dog, close.id);
  assert.match(eps[0].text, /The Kibble Job/, 'remembers the best job together');
  assert.equal(eps[1].dog, runner.id);
  assert.match(eps[1].text, /The Golden Bone/);
  assert.equal(eps[2].dog, star.id);
  assert.ok(kinds.includes('rival') && kinds.at(-1) === 'inspector');
  for (const e of eps) assert.doesNotMatch(e.text, /\{|undefined/);
});

test('with no runner, someone on the farm gets a visit', () => {
  const { s, runner, farmed } = veteran(6);
  delete s.dogs[runner.id];
  s.cash = RETIRE.goal;
  E.retireNow(s);
  const farm = s.over.epilogues.find((e) => e.kind === 'farm');
  assert.equal(farm.dog, farmed.id);
  assert.match(farm.text, /walks to the far end of the field/, 'they remember who sent them');
});

test('epilogues read cleanly for real careers', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { s } = career(seed, 'smart', 15);
    if (s.over) continue;
    while (s.story.length) E.dismissStory(s);
    s.cash = RETIRE.goal;
    assert.ok(E.retireNow(s).ok);
    const eps = s.over.epilogues;
    assert.ok(eps.length >= 2 && eps.length <= 5, `seed ${seed}: ${eps.length}`);
    for (const e of eps) {
      assert.ok(e.title && e.text && e.icon, `seed ${seed}`);
      assert.doesNotMatch(e.text, /\{|undefined|NaN/, `seed ${seed}: ${e.text}`);
      if (e.dog) assert.ok(s.dogs[e.dog]);
    }
  }
});

// Rare and legendary crew: availability, price, known skills and secret options.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { APPROACHES, SIGNATURES, SKILLS } from '../src/data.js';
import { genDog, feeFor } from '../src/dogs.js';
import { visibleStages } from '../src/heists.js';
import { stageOptions, approachAvailable, signatureFits, simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { takeJob } from './helpers.mjs';

const stars = (s) => s.pub.map((id) => s.dogs[id]).filter((d) => d.rarity);

test('the first job always has one rare star in the pub, with a move that fits the job', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    const st = stars(s);
    assert.equal(st.length, 1, `seed ${seed}`);
    const d = st[0];
    assert.equal(d.rarity, 'rare');
    assert.ok(d.signature, `seed ${seed}: teaser has a signature`);
    assert.ok(visibleStages(s.job).some((stage) => signatureFits(d.signature, stage)), `seed ${seed}: signature fits`);
    // Their reputation precedes them.
    for (const sk of SKILLS) assert.ok(d.known.skills[sk], `${sk} known`);
    assert.equal(d.skills[SIGNATURES[d.signature].skill], 5);
    // Asking around keeps them in town for this job.
    s.job.daysLeft = 5;
    E.askAround(s);
    assert.ok(s.pub.includes(d.id), `seed ${seed}: still in town after asking around`);
  }
});

test('stars cost well above a common dog of the same ability', () => {
  const s = E.newGame(3);
  takeJob(s);
  for (const rarity of ['rare', 'legendary']) {
    const d = genDog(s, makeRng({ s: 9 }), { rarity, quality: 2 });
    const plain = { ...d, rarity: null };
    assert.ok(d.fee >= feeFor(plain) * 2, `${rarity}: ${d.fee} vs ${feeFor(plain)}`);
  }
});

test('stars turn up more often with a higher reputation', () => {
  const rate = (rep) => {
    let seen = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const s = E.newGame(seed);
      s.teased = true; // past the first-job teaser
      s.rep = rep;
      takeJob(s);
      if (stars(s).length) seen++;
    }
    return seen / n;
  };
  const low = rate(20);
  const high = rate(90);
  assert.ok(low > 0.1 && low < 0.3, `low rep ${low}`);
  assert.ok(high > low + 0.15, `high rep ${high} vs low ${low}`);
});

test('legendary stars need a reputation, and only appear once you have one', () => {
  let legends = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = E.newGame(seed);
    s.teased = true;
    s.rep = 90;
    takeJob(s);
    for (const d of stars(s)) if (d.rarity === 'legendary') {
      legends++;
      assert.ok(d.signature && d.nick === SIGNATURES[d.signature].name);
      assert.ok(d.minRep >= 30);
    }
  }
  assert.ok(legends > 20, `legends at rep 90: ${legends}`);
});

test('a secret option only shows once its owner is hired, and they do it on the night', () => {
  const s = E.newGame(11);
  takeJob(s);
  s.cash = 10000;
  const star = stars(s)[0];
  const sig = SIGNATURES[star.signature];
  const stage = visibleStages(s.job).find((st) => signatureFits(star.signature, st));
  // Before hiring: not on the menu, and can't be planned.
  assert.ok(!stageOptions(stage, E.crewDogs(s)).includes(sig.approach));
  const mate = Object.values(s.dogs).find((d) => d.met && !d.rarity);
  assert.ok(E.hire(s, mate.id).ok);
  assert.equal(E.setPlan(s, stage.id, { approach: sig.approach, dog: mate.id }).ok, false);
  assert.equal(approachAvailable(s, s.job, sig.approach).ok, false);
  // Hired: it appears, and picking it hands the step to the star.
  const r = E.hire(s, star.id);
  assert.ok(r.ok && /New option/.test(r.msg), r.msg);
  assert.ok(stageOptions(stage, E.crewDogs(s)).includes(sig.approach));
  assert.ok(E.setPlan(s, stage.id, { approach: sig.approach, dog: mate.id }).ok);
  assert.equal(s.job.plan[stage.id].dog, star.id);
  // Someone else can't be put on it.
  assert.equal(E.setPlan(s, stage.id, { dog: mate.id }).ok, false);
  // The heist plays it (unless the job stops short of that step).
  let played = 0;
  for (let k = 1; k <= 30; k++) {
    const res = simulate(s, s.job, makeRng({ s: k }));
    for (const b of res.beats.filter((x) => x.approach === sig.approach)) {
      assert.equal(b.dog, star.id);
      played++;
    }
  }
  assert.ok(played > 0);
});

test('stars leave after the job and can only be hired while in town', () => {
  const seen = { gone: 0, back: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const s = E.newGame(seed);
    takeJob(s);
    const star = stars(s)[0];
    s.cash = 10000;
    assert.ok(E.hire(s, star.id).ok);
    E.dismiss(s, star.id);
    E.nextJob(s);
    takeJob(s);
    const r = E.hire(s, star.id);
    if (s.pub.includes(star.id) || r.ok) {
      // Came back on a new visit: hireable while in town.
      assert.ok(r.ok, r.msg);
      seen.back++;
    } else {
      assert.match(r.msg, /out of town/);
      seen.gone++;
    }
    // A star is never a regular: they only come back through a new visit.
    for (let i = 0; i < 5; i++) { s.job.daysLeft = 5; E.askAround(s); }
    assert.ok(stars(s).length <= 1);
  }
  assert.ok(seen.gone > 10, `stars that left: ${seen.gone}/40`);
});

test('every signature move is a real approach that fits at least one stage type', () => {
  for (const [id, sg] of Object.entries(SIGNATURES)) {
    const a = APPROACHES[sg.approach];
    assert.ok(a && a.signature === id && a.skill === sg.skill, id);
  }
  assert.deepEqual(Object.values(SIGNATURES).map((sg) => sg.skill).sort(), SKILLS.slice().sort());
});

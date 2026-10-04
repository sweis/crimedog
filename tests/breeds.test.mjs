// Breeds and sizes: what a breed leans towards, what it can never be, and steps
// that want someone small enough to fit or big enough to weigh something down.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { BREEDS, BREED_GROUPS, SIZES, SKILLS, NEUTRAL_SKILLS, SIZE_STEPS, APPROACHES, TALENTS } from '../src/data.js';
import { genDog, skillOf, capOf, sizeOf, topSkills } from '../src/dogs.js';
import { genJob, visibleStages, ownOffer } from '../src/heists.js';
import { odds, canDo, simulate } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const many = (n = 4000, opts = {}) => {
  const s = E.newGame(1);
  const rng = E.rngOf(s);
  return Array.from({ length: n }, () => genDog(s, rng, { quality: 2, ...opts }));
};

test('every breed has a kennel-club group, a size and a line about it; every group and size is used', () => {
  for (const [id, b] of Object.entries(BREEDS)) {
    assert.ok(BREED_GROUPS[b.group], `${id}: group`);
    assert.ok(SIZES[b.size], `${id}: size`);
    assert.ok(b.note && b.note.length > 10, `${id}: note`);
    assert.ok(b.bias.every((sk) => !NEUTRAL_SKILLS.includes(sk)), `${id}: leans only towards the skills that come with the body`);
  }
  for (const g of Object.keys(BREED_GROUPS)) assert.ok(Object.values(BREEDS).filter((b) => b.group === g).length >= 2, g);
  for (const z of Object.keys(SIZES)) assert.ok(Object.values(BREEDS).filter((b) => b.size === z).length >= 5, z);
});

test('the small are never strong, the big are never sneaky, and a Dalmatian is never in disguise, talents or no', () => {
  const dogs = many();
  for (const d of dogs) {
    if (sizeOf(d) === 'small') assert.ok(skillOf(d, 'muscle') <= 2, `${d.breed} muscle ${skillOf(d, 'muscle')}`);
    if (sizeOf(d) === 'large') assert.ok(skillOf(d, 'sneak') <= 3, `${d.breed} sneak ${skillOf(d, 'sneak')}`);
    if (d.breed === 'dalmatian') assert.ok(skillOf(d, 'disguise') <= 1);
  }
  const chi = dogs.find((d) => d.breed === 'chihuahua');
  chi.skills.muscle = 5;
  chi.talents = [Object.values(TALENTS).find((t) => t.skill === 'muscle' && t.bonus === 2).id];
  assert.equal(skillOf(chi, 'muscle'), 2, 'not even with a talent');
  // ...but a Chihuahua can be a fine hacker.
  assert.equal(capOf('chihuahua', 'tech'), Infinity);
});

test('breeds lean the way you\'d expect; aim, tech, wheels and locks are anybody\'s', () => {
  const dogs = many(8000);
  const topBy = (filter, sk) => { const xs = dogs.filter(filter); return xs.filter((d) => topSkills(d, 1)[0][0] === sk).length / xs.length; };
  const all = (sk) => topBy(() => true, sk);
  assert.ok(topBy((d) => ['beagle', 'basset', 'bloodhound', 'dachshund'].includes(d.breed), 'nose') > 2 * all('nose'), 'scent hounds have the noses');
  assert.ok(topBy((d) => ['labrador', 'golden', 'spaniel', 'cocker'].includes(d.breed), 'charm') > 1.5 * all('charm'), 'retrievers and spaniels the charm');
  assert.ok(topBy((d) => ['greyhound', 'whippet'].includes(d.breed), 'agility') > 2 * all('agility'), 'the quick ones the agility');
  assert.equal(topBy((d) => sizeOf(d) === 'small', 'muscle'), 0, 'no small heavies');
  for (const sk of NEUTRAL_SKILLS) {
    const breeds = new Set(dogs.filter((d) => topSkills(d, 1)[0][0] === sk).map((d) => d.breed));
    assert.ok(breeds.size >= Object.keys(BREEDS).length - 3, `${sk}: ${breeds.size} breeds`);
  }
  for (const sk of SKILLS) assert.ok(all(sk) > 0.03, `${sk} turns up (${all(sk).toFixed(3)})`);
});

test('someone asked for as good at a skill is of a breed that can be', () => {
  for (const sk of SKILLS) {
    for (const d of many(300, { primary: sk })) assert.ok(capOf(d.breed, sk) >= 4, `${sk}: ${d.breed}`);
  }
  for (const d of many(200, { size: 'small' })) assert.equal(sizeOf(d), 'small');
});

// A job with a size step on it, taken, with plenty of cash.
function sizedJob(size, seed = 3) {
  for (let k = seed; k < seed + 400; k++) {
    const s = E.newGame(k);
    const job = genJob(s, makeRng({ s: k }), { type: 'breakin', tier: 2 });
    const st = job.stages.find((x) => x.needsSize === size);
    if (!st) continue;
    s.offers.unshift(ownOffer(job));
    E.acceptOffer(s, job.id);
    s.cash = 20000;
    return { s, st: s.job.stages.find((x) => x.id === st.id) };
  }
  throw new Error('no sized job');
}

test('size steps turn up now and then, need someone the right size, and the odds don\'t care about skill', () => {
  let n = 0;
  for (let k = 1; k <= 300; k++) {
    const job = genJob(E.newGame(k), makeRng({ s: k }), { type: 'breakin', tier: 2 });
    const st = job.stages.find((x) => x.needsSize);
    if (!st) continue;
    n++;
    assert.ok(st.options.every((ap) => APPROACHES[ap].size === st.needsSize));
    assert.ok(st.kind === 'obstacle' && !st.hidden);
  }
  assert.ok(n > 40 && n < 150, `${n}/300`);
  for (const size of ['small', 'large']) {
    const { s, st } = sizedJob(size);
    const ap = st.options[0];
    const right = genDog(s, E.rngOf(s), { size });
    const wrong = genDog(s, E.rngOf(s), { size: size === 'small' ? 'large' : 'small' });
    assert.ok(canDo(right, ap) && !canDo(wrong, ap));
    for (const k of SKILLS) right.skills[k] = 0;
    const weak = odds(s, s.job, st, ap, right, { crew: [right] }).p;
    for (const k of SKILLS) right.skills[k] = 5;
    assert.equal(odds(s, s.job, st, ap, right, { crew: [right] }).p, weak, 'regardless of skill');
    assert.ok(weak > 0.6);
    assert.equal(odds(s, s.job, st, ap, wrong, { crew: [wrong] }).p, 0.03);
  }
});

test('the pub always has someone the right size; the plan puts them on it; nobody the right size and they barge through', () => {
  for (const size of ['small', 'large']) {
    const { s, st } = sizedJob(size, 11);
    assert.ok(s.pub.some((id) => sizeOf(s.dogs[id]) === size), `${size}: someone in the pub`);
    // Hire only the wrong size: the step can't be planned for them.
    for (const id of s.pub.filter((x) => sizeOf(s.dogs[x]) !== size).slice(0, 2)) E.hire(s, id);
    assert.equal(E.setPlan(s, st.id, { approach: st.options[0], dog: s.crew[0] }).ok, false, 'not the wrong size');
    E.autoPlan(s);
    assert.ok(!s.job.plan[st.id]?.dog, 'nobody to put on it');
    const r = simulate(s, s.job, makeRng({ s: 4 }));
    if (r.beats.some((b) => b.stage === st.id)) assert.ok(r.beats.some((b) => b.stage === st.id && /barge straight through/.test(b.text)), 'barged through');
    // Hire the right size: the plan puts them on it.
    E.hire(s, s.pub.find((x) => sizeOf(s.dogs[x]) === size));
    E.autoPlan(s);
    assert.equal(sizeOf(s.dogs[s.job.plan[st.id].dog]), size);
  }
});

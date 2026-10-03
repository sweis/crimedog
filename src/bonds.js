// How the crew get on with each other. Every pair of crew has a bond, -100 to
// 100. It starts where their outfits put it (the same outfit rubs along; rival
// outfits don't) and moves with every job they pull together: a clean job and a
// step done right bring them closer, a bungled step or a bust strains it, and
// going back for a mate who's been collared binds them for good.
//
// On a job, each crew member's odds shift with how they get on with the rest of
// that crew. A leader takes the edge off the bad blood.
import { GROUPS } from './data.js';
import { clamp } from './util.js';
import { roleLevel, shortName } from './dogs.js';

const bondsOf = (state) => (state.bonds ||= {});
const keyOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Before they've worked together: what their outfits make of each other.
function startingBond(da, db) {
  if (!da || !db) return 0;
  if (da.faction === db.faction && GROUPS[da.faction]) return 15;
  if (GROUPS[da.faction]?.rivals.includes(db.faction)) return -30;
  return 0;
}

export function bondOf(state, a, b) {
  if (a === b) return 0;
  const v = bondsOf(state)[keyOf(a, b)];
  return v ?? startingBond(state.dogs[a], state.dogs[b]);
}

export function addBond(state, a, b, n) {
  if (a === b || !n) return;
  bondsOf(state)[keyOf(a, b)] = clamp(bondOf(state, a, b) + n, -100, 100);
}

export const GOOD = 25;
export const BAD = -20;
export function bondLabel(v) {
  if (v >= 60) return 'Thick as thieves';
  if (v >= GOOD) return 'Get on well';
  if (v > BAD) return 'Rub along';
  if (v > -55) return 'Don\'t get on';
  return 'Can\'t stand each other';
}
export const bondIcon = (v) => (v >= GOOD ? '💚' : v <= BAD ? '💢' : '');

// Every pair on a crew, with their bond.
export function pairs(state, crew) {
  const out = [];
  for (let i = 0; i < crew.length; i++) {
    for (let j = i + 1; j < crew.length; j++) out.push({ a: crew[i], b: crew[j], bond: bondOf(state, crew[i].id, crew[j].id) });
  }
  return out;
}

// What a dog's mates on this crew do to their odds: up to +0.08 among friends,
// down to -0.10 among people they can't stand. A leader softens the bad side,
// 15% a level (a level-5 leader takes three quarters of it away).
export function chemistry(state, dog, crew) {
  const mates = crew.filter((d) => d.id !== dog.id);
  if (!mates.length) return 0;
  const avg = mates.reduce((sum, d) => sum + bondOf(state, dog.id, d.id), 0) / mates.length;
  if (avg >= 0) return 0.08 * (avg / 100);
  const steady = 1 - 0.15 * roleLevel(crew, 'leader');
  return 0.1 * (avg / 100) * steady;
}

// The crew as a whole, for the plan: average bond, and the pairs worth knowing about.
export function cohesion(state, crew) {
  const ps = pairs(state, crew);
  const avg = ps.length ? ps.reduce((s, p) => s + p.bond, 0) / ps.length : 0;
  return {
    avg,
    label: !ps.length ? '' : avg >= GOOD ? 'A tight crew' : avg <= BAD ? 'A crew at each other\'s throats' : avg < 0 ? 'Some friction' : 'They\'ll work together',
    good: ps.filter((p) => p.bond >= GOOD).sort((x, y) => y.bond - x.bond),
    bad: ps.filter((p) => p.bond <= BAD).sort((x, y) => x.bond - y.bond),
    leader: roleLevel(crew, 'leader'),
  };
}

// After a job: every pair who worked it together moves closer or further apart.
// Returns the news worth telling (pairs that crossed into friends or enemies).
export function settleBonds(state, result) {
  const crew = result.crew.map((id) => state.dogs[id]).filter(Boolean);
  const steps = {};
  for (const b of result.beats) {
    if (!b.dog || (b.kind !== 'ok' && b.kind !== 'fail')) continue;
    const s = (steps[b.dog] ||= { ok: 0, fail: 0 });
    s[b.kind === 'ok' ? 'ok' : 'fail'] += 1;
  }
  const outcome = { clean: 8, tidy: 6, messy: 1, bust: -6, aborted: -4 }[result.outcome] ?? 0;
  const snitches = new Set([...result.captured.filter((c) => c.talked).map((c) => c.id), ...result.runners.map((r) => r.id)]);
  const news = [];
  for (const { a, b } of pairs(state, crew)) {
    const before = bondOf(state, a.id, b.id);
    const sa = steps[a.id] || { ok: 0, fail: 0 };
    const sb = steps[b.id] || { ok: 0, fail: 0 };
    let delta = clamp(outcome + 2 * (sa.ok + sb.ok) - 3 * (sa.fail + sb.fail), -15, 15);
    // Grassing or doing a runner on your mates: that's the end of that.
    if (snitches.has(a.id) || snitches.has(b.id)) delta = -35;
    addBond(state, a.id, b.id, delta);
    const after = bondOf(state, a.id, b.id);
    if (before < GOOD && after >= GOOD) news.push(`💚 ${shortName(a)} and ${shortName(b)} get on well now. Good for the next job.`);
    if (before > BAD && after <= BAD) news.push(`💢 ${shortName(a)} and ${shortName(b)} aren't speaking. Think twice before you put them on the same job.`);
  }
  // Going back for someone binds you, whether or not it worked.
  for (const r of result.rescues || []) {
    addBond(state, r.by, r.of, r.ok ? 30 : 25);
    news.push(`🦸 ${shortName(state.dogs[r.of])} won't forget that ${shortName(state.dogs[r.by])} went back for them.`);
  }
  return news;
}

// Your crew-mates and how they feel about this dog, best first then worst: for the profile.
export function bondsWith(state, dog, others) {
  return others.filter((d) => d.id !== dog.id).map((d) => ({ dog: d, bond: bondOf(state, dog.id, d.id) }))
    .filter((x) => x.bond >= GOOD || x.bond <= BAD).sort((x, y) => y.bond - x.bond);
}

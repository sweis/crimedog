// The mastermind's career at a glance, for the career card (ui.careerHTML) and
// its shareable picture: the nest egg, reputation, the Inspector, the record,
// best and worst jobs, the closest mate and the biggest enemy.
import { GROUPS } from './data.js';
import { RETIRE, nestEggPct } from './retire.js';
import { RIVALS, rivalsOf } from './rivals.js';
import { runnersList, loose } from './runners.js';
import { displayName, shortName, relationLabel, closestMates } from './dogs.js';
import { standingLabel } from './groups.js';
import { inSentence } from './util.js';
import { memorableLastJob, lastJobStory } from './lastjob.js';
import { GRADE_ORDER } from './recap.js';


// Counted as they happen (engine.resolveHeist); older saves fall back to the
// rap sheet, which only remembers the last few dozen jobs.
const FATE_OF = { arrests: 'nicked', runners: 'ran', lost: 'farm', hospital: 'hospital' };
function tally(state, key) {
  if (state.stats[key] != null) return state.stats[key];
  return (state.history || []).reduce((n, h) => n + (h.crew || []).filter((c) => c.fate === FATE_OF[key]).length, 0);
}

// Count something that happened to the crew (seeding older saves from the rap sheet).
export function bump(state, key, n) {
  if (n) state.stats[key] = tally(state, key) + n;
}

// Best: highest grade, then the bigger take. Worst: the other way round.
function bestAndWorst(history) {
  if (!history.length) return { best: null, worst: null };
  const rank = (h) => GRADE_ORDER.indexOf(h.grade) * 1e7 - (h.take || 0);
  const sorted = history.slice().sort((a, b) => rank(a) - rank(b));
  const best = sorted[0];
  const worst = sorted.at(-1);
  return { best, worst: worst !== best && rank(worst) !== rank(best) ? worst : null };
}

// The crew member who likes you most (and has worked with you).
function closestMate(state) {
  const d = closestMates(state)[0];
  return d ? { dog: d.id, name: displayName(d), relation: relationLabel(d), jobs: d.jobs } : null;
}

// Whoever has it in for you most: an outfit you've crossed, a crew member who
// ran off with the goods, or a rival with a grudge.
function biggestEnemy(state) {
  const out = [];
  for (const [gid, g] of Object.entries(state.groups || {})) {
    if (g.standing > -20) continue;
    out.push({ kind: 'group', id: gid, score: -g.standing + (g.debt ? 20 : 0), name: GROUPS[gid].name, emblem: GROUPS[gid].emblem,
      why: `${standingLabel(g.standing)}${g.debt ? `, and you owe them £${g.debt.amount.toLocaleString('en-GB')}` : ''}` });
  }
  for (const r of runnersList(state)) {
    const d = state.dogs[r.dog];
    if (!d || !loose(r)) continue;
    out.push({ kind: 'runner', id: d.id, score: 55, name: displayName(d), emblem: '💨', why: `Did a runner with ${inSentence(r.took)}` });
  }
  const R = rivalsOf(state);
  for (const id of ['jacks', 'dan']) {
    const r = R[id];
    if (!r.met || r.status === 'done') continue;
    out.push({ kind: 'rival', id, score: 30 + 10 * (r.beef || 0), name: RIVALS[id].name, emblem: RIVALS[id].emblem,
      why: r.status === 'away' ? 'In the pound, and they know who put them there' : r.beef >= 2 ? 'A proper grudge' : id === 'dan' ? 'Won\'t stop sending notes' : 'Think this is their manor' });
  }
  return out.sort((a, b) => b.score - a.score)[0] || null;
}

// The one last job worth remembering, good or bad.
function lastJobMemory(state) {
  const d = memorableLastJob(state);
  return d ? { dog: d.id, name: displayName(d), text: lastJobStory(d, shortName(d)), good: ['away', 'ran'].includes(d.lastJobDone.fate) } : null;
}

export function careerOf(state) {
  const s = state;
  const jobs = s.stats.jobs;
  const { best, worst } = bestAndWorst(s.history || []);
  return {
    day: s.day,
    status: s.over ? { retired: 'Retired', inspector: 'Banged up', nobody: 'Washed up', broke: 'Skint' }[s.over.reason] || 'Out' : 'Still at large',
    nest: { cash: s.cash, goal: RETIRE.goal, pct: nestEggPct(s.cash) },
    rep: s.rep,
    heat: s.heat,
    record: {
      jobs,
      success: jobs - s.stats.busts,
      failed: s.stats.busts,
      perfect: s.stats.perfect,
      earned: s.stats.earned,
      arrests: tally(s, 'arrests'),
      runners: tally(s, 'runners'),
      lost: tally(s, 'lost'),
      hospital: tally(s, 'hospital'),
      farmed: s.stats.farmed,
    },
    best,
    worst,
    closest: closestMate(s),
    lastJob: lastJobMemory(s),
    enemy: biggestEnemy(s),
  };
}

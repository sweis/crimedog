// Crew who hang it up, and the ones you talk into one last job.
//
// A regular retires more often the more jobs they've done, and most of all after a
// stretch in the pound. A retired dog can be brought back once, for one last job:
// dearer than a normal hire and riskier (the sim leans on them: likelier to be
// collared, hurt, or sent to the farm). If one goes wrong, word gets round, and the
// next one costs more. After it, retirement is for good.
import { pushScene } from './story.js';
import { displayName, shortName, isVisitor } from './dogs.js';
import { roundTo, pickBy, money, count, fillIn, fail, done, book } from './util.js';

export const LAST_JOB_LINE = 'Just when I thought I was out, they pull me back in.';
export const LAST_JOB_FATES = ['nicked', 'hospital', 'farm'];
const MAX_CREW = 6;

const stretches = (n) => (n === 1 ? 'One stretch' : `${n} stretches`);

// Who might retire: your own regulars, free and with nothing else going on.
function eligible(state, d) {
  return d.met && d.status === 'free' && !d.retired && !isVisitor(d) && !d.undercover && !d.ghost
    && !(state.arcs || []).some((a) => a.dog === d.id);
}

// The chance a regular calls it a day between jobs: more jobs, more likely, and the
// pound counts for a lot.
export const retireChance = (d) => (d.jobs < 5 ? 0 : Math.min(0.12, 0.004 * (d.jobs - 4) + 0.015 * (d.stints || 0)));
// Walking out of the pound, the thought is never far away, and less far each time.
export const releaseChance = (d) => (d.jobs < 2 ? 0 : Math.min(0.4, 0.08 * (d.stints || 0) + 0.01 * d.jobs));

const AGE = [
  '{d} has had enough. {jobs}, and the knees aren\'t what they were. A caravan by the sea, a bit of fishing. "Don\'t call me. I mean it."',
  '{d} is hanging up the gloves after {jobs}. "I\'m getting too old for this." Opening a little café. Biscuits, mostly.',
  '{d} turns up at the Dog & Duck in a cardigan. {jobs}, and that\'s enough. "An allotment. Marrows. Peace and quiet."',
];
const POUND = [
  '{d} came out of the pound and said that\'s it. {stints} inside is plenty. Going straight: a market stall, early nights.',
  '{d} walked out of the pound and kept walking. "{stints}. Never again." A job at a garden centre. Honest work. Terrible pay.',
];

function retire(state, d, why) {
  d.status = 'retired';
  d.retired = { day: state.day, why, jobs: d.jobs };
  state.pub = state.pub.filter((id) => id !== d.id);
  const text = fillIn(pickBy(d.id, why === 'pound' ? POUND : AGE), { d: shortName(d), jobs: count(d.jobs, 'job'), stints: stretches(d.stints || 1) });
  pushScene(state, 'retire', { dog: d.id, title: why === 'pound' ? 'Going Straight' : 'Hanging It Up', text, choices: [{ label: 'Raise a glass' }] });
  return `🎣 ${displayName(d)} has retired.`;
}

// Between jobs: at most one regular retires. Anyone just out of the pound is asked first.
export function crewRetirements(state, rng, released = []) {
  for (const d of released) if (eligible(state, d) && releaseChance(d) && rng.chance(releaseChance(d))) return retire(state, d, 'pound');
  for (const d of Object.values(state.dogs)) if (eligible(state, d) && retireChance(d) && rng.chance(retireChance(d))) return retire(state, d, 'age');
  return null;
}

// Back from a job, the pound or the hospital: retired crew go back to retirement.
export const restOrFree = (d) => { d.status = d.retired ? 'retired' : 'free'; };

// What it takes to bring someone back. Every last job that's gone wrong puts it up.
export const lastJobCost = (state, d) => roundTo(Math.max(d.fee, 150) * (2 + 0.75 * Math.min(4, state.lastJobFear || 0)));

export function lastJobProblem(state, d) {
  if (!d || d.status !== 'retired') return `${d ? shortName(d) : 'They'} isn't retired.`;
  if (state.phase !== 'plan') return 'Pick a job first.';
  if (d.lastJobDone) return `${shortName(d)} did their last job. They meant it.`;
  if (d.relation <= -30) return `${shortName(d)} won't come out of retirement for you.`;
  if (state.crew.length >= MAX_CREW) return 'Crew\'s full. Six is plenty.';
  return null;
}

export function oneLastJob(state, id) {
  const d = state.dogs[id];
  const problem = lastJobProblem(state, d);
  if (problem) return fail(problem);
  const cost = lastJobCost(state, d);
  if (state.cash < cost) return fail(`${shortName(d)} wants ${money(cost)} to come back.`);
  book(state, 'crew', -cost);
  d.status = 'crew';
  d.lastJob = state.job.id;
  state.crew.push(id);
  return done(`"${LAST_JOB_LINE}" ${shortName(d)} is in for one last job. (${money(cost)})`);
}

// Walked away before the job: back to the allotment, and the offer still stands.
export function lastJobOff(d) {
  if (d.lastJob) d.lastJob = null;
}

// After the job: how it went for anyone on their last one. A bad end scares the rest.
export function settleLastJobs(state, job, r) {
  const out = [];
  for (const id of r.crew) {
    const d = state.dogs[id];
    if (!d || d.lastJob !== job.id) continue;
    const fate = r.captured.some((c) => c.id === id) ? 'nicked' : (r.hurt || []).some((h) => h.id === id) ? 'hospital'
      : (r.lost || []).some((l) => l.id === id) ? 'farm' : r.runners.some((x) => x.id === id) ? 'ran' : 'away';
    d.lastJob = null;
    d.lastJobDone = { job: job.name, jobId: job.id, day: state.day, fate, grade: null, bust: !r.secured.length };
    if (LAST_JOB_FATES.includes(fate)) state.lastJobFear = (state.lastJobFear || 0) + 1;
    out.push({ id, fate, bust: !r.secured.length });
  }
  return out;
}

// Once the job is graded, it goes on their last-job story.
export function gradeLastJobs(state, job, grade) {
  for (const d of Object.values(state.dogs)) if (d.lastJobDone?.jobId === job.id) d.lastJobDone.grade = grade;
}

// One line for the aftermath.
export function lastJobNote(d, fate, bust = false) {
  const n = shortName(d);
  return {
    away: bust ? `🎬 ${n}'s one last job: home in one piece, empty-pawed. Retired for good, a bit sheepish.` : `🎬 ${n}'s one last job: away clean. Retired for good, and smiling.`,
    nicked: `🎬 ${n}'s one last job ended in the back of a van. Word gets round: bringing anyone else back will cost more.`,
    hospital: `🎬 ${n}'s one last job ended in hospital. Word gets round: bringing anyone else back will cost more.`,
    farm: `🎬 ${n} came back for one last job and never came home. Word gets round: bringing anyone else back will cost more.`,
    ran: `🎬 ${n} did one last job, and a runner. Retirement, funded.`,
  }[fate];
}

// The last job worth remembering at the end: the worst, then the best.
const RANK = { farm: 5, nicked: 4, hospital: 3, ran: 2, away: 1 };
export function memorableLastJob(state) {
  const all = Object.values(state.dogs).filter((d) => d.lastJobDone && !d.undercover);
  const score = (d) => RANK[d.lastJobDone.fate] * 10 + (['S', 'A'].includes(d.lastJobDone.grade) ? 6 : 0) - (d.lastJobDone.bust ? 5 : 0);
  return all.sort((a, b) => score(b) - score(a))[0] || null;
}

// How their last job is remembered, for the career card and the epilogues.
export function lastJobStory(d, n = displayName(d)) {
  const L = d.lastJobDone;
  const graded = L.grade ? ` ${['S', 'A', 'F'].includes(L.grade) ? 'An' : 'A'} ${L.grade}${['S', 'A'].includes(L.grade) ? ', no less' : ''}.` : '';
  return {
    away: L.bust || ['D', 'F'].includes(L.grade)
      ? `${n} came out of retirement for one last job, ${L.job}, and came home with nothing but the story.${graded} "Should've stayed on the allotment." Tells it anyway, every Christmas.`
      : `${n} came out of retirement for one last job, ${L.job}, and walked away clean.${graded} "Just when I thought I was out..." Still tells it, every Christmas.`,
    nicked: `${n} came back for one last job, ${L.job}, and got collared. Did the time, then went straight for good. Never says your name.`,
    hospital: `${n}'s one last job, ${L.job}, ended in hospital. The limp's a story now, told badly and often.`,
    farm: `${n} came back for one last job, ${L.job}, and never came home. They were out. You pulled them back in.`,
    ran: `${n}'s one last job, ${L.job}: they ran with the takings. Retirement, funded.`,
  }[L.fate];
}

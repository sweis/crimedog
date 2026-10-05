// The Inspector's open cases: jobs the crew got away from, but not clean.
//
// Every job that leaves clues, or where someone was seen (spotted, chased, seen
// casing the joint), goes in his file. Between jobs he works the file: each crew
// member on a case may get a knock on the door. The more clues and the more often
// they were seen, the likelier; the hotter he is on you, the harder he works it;
// and every job that goes by the trail goes colder, until he puts it in a drawer.
// Picked up, they go down (and may talk), or come back "without charge": either
// genuinely, or because they've been turned and are working for him now.
import { pushScene } from './story.js';
import { displayName, shortName, loyaltyOf } from './dogs.js';
import { clamp, count, addHeat, addRelation, pickBy } from './util.js';
import { sentenceFor, sendDown } from './justice.js';
import { INSPECTOR, flipDog } from './inspector.js';

export const COLD = 0.65; // each job that goes by, a lead is worth this much of what it was
const MAX_AGE = 6; // after this many jobs the case goes in a drawer
const PICKABLE = ['free', 'retired'];

// Open a case on a job the crew got away from, if he's got anything to go on.
export function openCase(state, job, r) {
  const seen = { ...(r.seen || {}) };
  for (const [id, n] of Object.entries(job.seenCasing || {})) seen[id] = (seen[id] || 0) + n;
  const dogs = r.escaped.filter((id) => !r.tipped.includes(id) && !state.dogs[id]?.undercover);
  if (!dogs.length || (!r.clues && !dogs.some((id) => seen[id]))) return null;
  const c = { id: job.id, name: job.name, day: state.day, clues: r.clues, seen: Object.fromEntries(dogs.map((id) => [id, seen[id] || 0])), dogs, age: 0, fakeIds: !!job.fakeIds };
  (state.cases ||= []).push(c);
  return c;
}

// The chance he comes for this dog over this case, this time round.
export function pinchChance(state, c, d) {
  if (!c.dogs.includes(d.id) || !PICKABLE.includes(d.status) || d.undercover) return 0;
  const lead = 0.006 * c.clues + 0.05 * (c.seen[d.id] || 0);
  const effort = 0.6 + (state.heat || 0) / 100; // the hotter he is on you, the harder he works it
  return Math.min(0.25, lead * effort * COLD ** c.age * (c.fakeIds ? 0.6 : 1));
}

// How warm the trail is, in words.
export const warmth = (p) => (p >= 0.08 ? 'hot' : p >= 0.03 ? 'warm' : 'going cold');

// The biggest chance any open case gives of a knock on this dog's door.
export const wantedFor = (state, d) => Math.max(0, ...(state.cases || []).map((c) => pinchChance(state, c, d)));

// Between jobs: every case gets a job older, he follows up at most one lead, and
// cases with nothing left in them are closed.
export function investigate(state, rng) {
  const cases = state.cases || [];
  for (const c of cases) c.age += 1;
  let note = null;
  for (const c of cases) {
    if (note) break;
    for (const id of c.dogs) {
      const d = state.dogs[id];
      if (!d || !rng.chance(pinchChance(state, c, d))) continue;
      note = pinch(state, c, d, rng);
      break;
    }
  }
  state.cases = cases.filter((c) => c.age < MAX_AGE && c.dogs.some((id) => state.dogs[id] && pinchChance(state, c, state.dogs[id]) >= 0.005));
  return note;
}

// Turned in the interview room: likelier for the disloyal and the jumpy, never for
// the ones who'd sooner die than grass.
export const flipChance = (d) => (d.quirks.includes('nevergrass') || d.quirks.includes('goodboy') ? 0 : clamp(0.35 + (55 - loyaltyOf(d)) / 300 + (50 - d.nerve) / 250, 0.05, 0.65));

// Someone gets the knock.
function pinch(state, c, d, rng) {
  c.dogs = c.dogs.filter((x) => x !== d.id);
  const n = shortName(d);
  const seen = c.seen[d.id] || 0;
  const what = `${count(c.clues, 'clue')}${seen ? `, and a witness who got a good look at ${n}` : ''}`;
  const opening = `${INSPECTOR.name} never closed the file on ${c.name}: ${what}. This morning he knocks on ${displayName(d)}'s door.`;
  // A thin file, and a dog who keeps their head: nothing sticks.
  const thin = seen === 0 && rng.chance(0.3);
  const flipOdds = flipChance(d);
  if (thin || rng.chance(flipOdds)) {
    // Back by teatime either way. Only one of them is what it looks like.
    if (!thin) { flipDog(d); d.flippedOn = c.name; }
    else addRelation(d, 3);
    // The same words either way: tail them if you want to know which.
    const after = pickBy(`${d.id}|${c.id}`, ['He had nothing, apparently.', 'Funny, that.', `Not a mark on ${n}.`, `${n}'s buying rounds all of a sudden.`, `${n} won't say what they talked about.`]);
    scene(state, d, 'Helping With Enquiries', `${opening} By teatime ${n} is ${d.retired ? 'back on the allotment' : 'back at the bar'}. Released without charge, they say. ${after}`);
    return `🕵️ ${displayName(d)} was pulled in over ${c.name}, and released without charge.`;
  }
  const sentence = sentenceFor(d, rng);
  let pTalk = clamp((75 - loyaltyOf(d) * 0.5 - d.nerve * 0.3) / 100, 0.03, 0.9);
  if (d.quirks.includes('looselips')) pTalk += 0.3;
  if (d.quirks.includes('nevergrass')) pTalk = 0;
  const talked = rng.chance(clamp(pTalk, 0, 0.95));
  sendDown(d, sentence);
  d.talked = talked;
  d.pinchedOn = c.name;
  state.stats.pinched = (state.stats.pinched || 0) + 1; // picked up later, not on the job
  if (talked) {
    addHeat(state, 8);
    addRelation(d, -5);
  } else addRelation(d, 8);
  scene(state, d, 'The Trail Leads Back', `${opening} ${n} goes down for ${count(sentence, 'job')}${talked ? ', and talks. Your name comes up more than once. (+8 heat)' : ', and doesn\'t say a word. Not one.'}`);
  return `🕵️ ${displayName(d)} was arrested over ${c.name}: ${count(sentence, 'job')} in the pound.`;
}

function scene(state, d, title, text) {
  pushScene(state, 'pinch', { dog: d.id, title, text, choices: [{ label: 'Right.' }] });
}

// Lying low: every trail goes a job colder.
export function coolCases(state) {
  for (const c of state.cases || []) c.age += 1;
}

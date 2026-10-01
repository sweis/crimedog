// Doing time and getting hurt. Every dog carries a criminal record: the longer
// it is, the longer they go down for. A brief can cut a sentence, but never by
// more than half. Crew hurt on a job usually go to hospital rather than the farm:
// out for a few jobs, sometimes for good with a lasting injury. Paying the bill
// keeps them loyal; leaving them with it doesn't.
import { fail, done, money, clamp, addRelation, book } from './util.js';
import { shortName } from './dogs.js';
import { addGenerosity, addHardness } from './repute.js';

// ------------------------------------------------------------------ the record
// Previous convictions a dog starts with: most have one or two, a few are clean, a few are notorious.
// Taken from the dog's look seed so it doesn't disturb the game's dice.
const RECORDS = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 7];
export function startingRecord(seed, opts = {}) {
  const base = RECORDS[Math.abs(seed | 0) % RECORDS.length];
  if (opts.undercover) return 1 + (base % 3); // a cover story
  return base + (opts.rarity === 'legendary' ? 2 : opts.rarity === 'rare' ? 1 : 0);
}
export const recordOf = (d) => d.record ?? 0;
export function recordLabel(d) {
  const n = recordOf(d);
  return n === 0 ? 'Clean record' : n <= 2 ? `${n} previous` : n <= 4 ? `${n} previous: known to police` : `${n} previous: a career criminal`;
}

// How long they go down for: a job or two, one more per previous (up to four), one more if the police were there.
export function sentenceFor(d, rng, { coppers = false, talked = false } = {}) {
  const s = rng.int(1, 2) + Math.min(4, recordOf(d)) + (coppers ? 1 : 0) - (talked ? 1 : 0);
  return Math.max(1, s);
}

// Off to the pound: the conviction goes on their record.
export function sendDown(d, sentence) {
  d.status = 'pound';
  d.sentence = sentence;
  d.sentenceStart = sentence;
  d.record = recordOf(d) + 1;
}

// A brief cuts a job off at a time, but they always serve at least half.
export const minSentence = (d) => Math.max(1, Math.ceil((d.sentenceStart || d.sentence) / 2));
export const briefCost = (d) => 150 + 50 * Math.min(6, recordOf(d));

export function hireBrief(state, d) {
  if (!d || d.status !== 'pound') return fail('Not in the pound.');
  if (d.sentence <= minSentence(d)) return fail(`No brief can get ${shortName(d)} out any sooner. They'll serve ${d.sentence} more.`);
  const cost = briefCost(d);
  if (state.cash < cost) return fail(`A brief for someone with ${recordOf(d)} previous costs ${money(cost)}.`);
  book(state, 'pound', -cost);
  d.sentence -= 1;
  addRelation(d, 8);
  addGenerosity(state, 2);
  addHardness(state, -2);
  return done(`${shortName(d)}'s sentence is cut to ${d.sentence} job${d.sentence > 1 ? 's' : ''}. That's as far as the law will bend${d.sentence > minSentence(d) ? ' for now' : ''}. They won't forget it.`);
}

// ------------------------------------------------------------------ hospital
// What a bad fall leaves behind, by what they were doing when it happened.
export const INJURIES = {
  agility: 'A bad knee', muscle: 'Cracked ribs', wheels: 'Whiplash', sneak: 'A limp', locks: 'A broken paw', tech: 'A shaky paw',
  aim: 'A dodgy eye', nose: 'A broken nose', charm: 'A nasty scar', disguise: 'A face nobody forgets',
};

// Decided in the heist (so the playback can say it): how long, and whether it lasts.
export function rollInjury(rng, skill) {
  const lasting = rng.chance(0.35);
  return { jobs: rng.int(2, 4), skill: lasting && INJURIES[skill] ? skill : null };
}

export function admit(d, hurt, jobId) {
  const bill = 120 * hurt.jobs + (hurt.skill ? 100 : 0);
  d.status = 'hospital';
  d.hospital = { jobs: hurt.jobs, bill, paid: false, since: jobId };
  if (hurt.skill) {
    d.skills[hurt.skill] = Math.max(0, (d.skills[hurt.skill] || 0) - 1);
    (d.injuries ||= []).push({ skill: hurt.skill, text: INJURIES[hurt.skill] });
    d.known.skills[hurt.skill] = true;
  }
  return bill;
}

export function payHospital(state, d) {
  if (!d || d.status !== 'hospital') return fail('Not in hospital.');
  if (d.hospital.paid) return fail('Already paid.');
  if (state.cash < d.hospital.bill) return fail(`The bill is ${money(d.hospital.bill)}.`);
  book(state, 'hospital', -d.hospital.bill);
  d.hospital.paid = true;
  addRelation(d, 12);
  d.loyalty = clamp(d.loyalty + 5, 0, 100);
  addGenerosity(state, 2);
  addHardness(state, -1);
  return done(`You settle ${shortName(d)}'s hospital bill. Grapes, flowers, the lot. They won't forget it.`);
}

// Between jobs: a job's worth of recovery. Returns news lines.
export function recover(state, d, jobId) {
  const h = d.hospital;
  if (h.since === jobId) { h.since = null; return null; }
  h.jobs -= 1;
  if (h.jobs > 0) return null;
  d.status = 'free';
  d.hospital = null;
  if (!h.paid) {
    addRelation(d, -15);
    d.loyalty = clamp(d.loyalty - 8, 0, 100);
    return `${shortName(d)} is out of hospital, and still paying off the bill you left them with. They're not happy.`;
  }
  return `${shortName(d)} is out of hospital${d.injuries?.length ? ` (${d.injuries.at(-1).text.toLowerCase()}, for good)` : ''} and back at the bar.`;
}

// The long game: put away enough to retire, then walk away for good. Retiring
// ends the game with a few epilogues: who came with you, who you visited on the
// farm, who you tracked down after they did a runner, and the stars who drop in.
import { SIGNATURES, SKILLS } from './data.js';
import { fail, done, money, inSentence, fillIn } from './util.js';
import { displayName, shortName, closestMates } from './dogs.js';
import { rivalsOf, RIVALS } from './rivals.js';
import { INSPECTOR } from './inspector.js';
import { GRADE_ORDER } from './recap.js';

export const RETIRE = { goal: 100000, place: 'the Costa del Bone' };

export const canRetire = (state) => state.phase === 'select' && state.cash >= RETIRE.goal;
// How full the nest egg is, 0–100.
export const nestEggPct = (cash) => Math.min(100, Math.floor((100 * Math.max(0, cash)) / RETIRE.goal));

export function retire(state, rng) {
  if (state.phase !== 'select') return fail('Finish the job first.');
  if (state.cash < RETIRE.goal) return fail(`You need ${money(RETIRE.goal)} put away first.`);
  state.over = { reason: 'retired', day: state.day, jobs: state.stats.jobs, cash: state.cash, epilogues: epilogues(state, rng) };
  state.phase = 'over';
  return done(`You're out. ${RETIRE.place[0].toUpperCase() + RETIRE.place.slice(1)}, here you come.`);
}

// The best job a dog pulled with you, from the rap sheet.
function bestJob(state, d) {
  return (state.history || []).filter((h) => h.crew?.some((c) => c.id === d.id)).sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade))[0] || null;
}
const bestSkill = (d) => SKILLS.slice().sort((a, b) => (d.skills[b] || 0) - (d.skills[a] || 0))[0];

// What a close mate does in retirement, by what they're best at.
const CLOSE = {
  wheels: '{d} drives you to the airport in the old getaway van and then just keeps driving you. Chauffeur now. Says the hours are better.',
  charm: '{d} runs the beach bar at the villa. Everybody\'s best friend by Tuesday, and nobody\'s paid for a drink since.',
  locks: '{d} came along to "mind the safe". There is no safe. {d} built one anyway, just to have something to open.',
  muscle: '{d} is head of security at the villa. The villa has never been safer. The postman has never been more nervous.',
  tech: '{d} rigged the villa with more cameras than the bank you robbed. Mostly pointed at the sea.',
  sneak: '{d} came too, probably. You see them at breakfast now and then. Nobody hears them arrive.',
  disguise: '{d} came too, as a retired colonel, a famous painter and, once, your aunt. The neighbours adore all of them.',
  agility: '{d} is on the roof again. There\'s nothing up there to steal. It\'s just where {d} is happiest.',
  aim: '{d} spends the afternoons knocking coconuts off trees from the terrace. Never misses.',
  nose: '{d} found the best fish restaurant on the coast in four minutes flat. You go every Friday.',
};
const fill = (t, d, extra = {}) => fillIn(t, { ...extra, d: shortName(d) }, null);

function closeLine(state, d) {
  const job = bestJob(state, d);
  const memory = job ? ` Every evening on the terrace, ${shortName(d)} tells the story of ${job.name} again, and it gets better every time.` : '';
  return { kind: 'close', icon: '🏝️', dog: d.id, title: `${displayName(d)} came too`, text: fill(CLOSE[bestSkill(d)], d) + memory };
}

function farmLine(state, d) {
  if (d.farmedBy === 'you') {
    return { kind: 'farm', icon: '🚜', dog: d.id, title: `A visit to the farm`, text: `On the way to the airport you stop at the farm. ${displayName(d)} sees you coming, turns round and walks to the far end of the field. Fair enough. You leave a bone at the gate anyway.` };
  }
  const where = d.lostOn ? `It's been a long time since ${d.lostOn}.` : '';
  return { kind: 'farm', icon: '🌾', dog: d.id, title: 'Paying your respects', text: `You drive out to the farm to pay your respects. ${displayName(d)} is in the top field, chasing something nobody else can see. They don't look up. ${where} You leave their favourite ball at the gate and don't say anything for a while.` };
}

function runnerLine(state, d, rng) {
  const took = d.ranWith ? inSentence(d.ranWith) : 'your biscuit tin';
  const endings = [
    `You buy a pint of whelks and say nothing. They know. You know. You're retired.`,
    `"Guv'nor! I was going to pay you back!" You take the stall's takings and call it even.`,
    `They offer you a job. You laugh for a very long time.`,
  ];
  return { kind: 'runner', icon: '💨', dog: d.id, title: `You found ${displayName(d)}`, text: `It takes a month, but you track down ${displayName(d)}, who did a runner with ${took}. They're selling whelks at the seaside under a false moustache. ${rng.pick(endings)}` };
}

function starLine(state, d) {
  const sig = d.signature ? SIGNATURES[d.signature].name : null;
  return { kind: 'star', icon: d.rarity === 'legendary' ? '🌟' : '⭐', dog: d.id, title: `${displayName(d)} drops in`, text: `${displayName(d)} turns up at your leaving do uninvited${sig ? `, does ${sig} on the drinks cabinet just to show they still can,` : ','} and leaves before the speeches. Nobody saw them go.` };
}

const poundLine = (state, d) => ({ kind: 'pound', icon: '⚖️', dog: d.id, title: `${displayName(d)} is still inside`, text: `${displayName(d)} is still in the pound. You send a cake with a file in it. Old habits. They'll be out by summer, and there's a sun lounger with their name on it.` });
const grassLine = (state, d) => ({ kind: 'grass', icon: '🐀', dog: d.id, title: 'A bungalow in Snufflebury', text: `${displayName(d)} is in witness protection, which means a bungalow in Snufflebury and a new moustache. You send a postcard of the villa. No return address.` });

function rivalLine(state) {
  const R = rivalsOf(state);
  if (R.ghost.status === 'joined') return { kind: 'rival', icon: RIVALS.ghost.emblem, rival: 'ghost', title: 'The Grey Ghost', text: 'The Grey Ghost leaves with you. Or ahead of you. Or behind. There\'s a grey feather on your pillow every morning, so they\'re around somewhere.' };
  if (R.dan.met && R.dan.ended === 'wager') return { kind: 'rival', icon: RIVALS.dan.emblem, rival: 'dan', title: 'Dandy Dan', text: 'A cream card under the villa door: "Enjoy retirement. I\'ll be robbing it next week. — D." He never does. You keep the card on the fridge.' };
  if (R.jacks.met && R.jacks.ended === 'robbed') return { kind: 'rival', icon: RIVALS.jacks.emblem, rival: 'jacks', title: 'The Jack Russells', text: 'Nipper runs the Dog & Duck now. Your old corner table has a little brass plaque. Nobody sits there.' };
  if (R.jacks.met && R.jacks.ratted) return { kind: 'rival', icon: RIVALS.jacks.emblem, rival: 'jacks', title: 'The Jack Russells', text: 'The Jack Russells are out, and they\'d like a word about who grassed. You\'re very glad you\'re a long way away.' };
  if (R.dan.met) return { kind: 'rival', icon: RIVALS.dan.emblem, rival: 'dan', title: 'Dandy Dan', text: '"Retired? Already? Lightweight. — D." He sends the note recorded delivery, just to make you sign for it.' };
  return null;
}

// Three crew stories (a close mate, someone who went wrong, a star if any),
// then a word about your rivals and a last one about the Inspector.
export function epilogues(state, rng) {
  const dogs = Object.values(state.dogs).filter((d) => d.met && !d.ghost);
  const out = [];
  const used = new Set();
  const add = (d, fn) => { if (d && fn && !used.has(d.id)) { used.add(d.id); out.push(fn(state, d, rng)); } };
  // Ranked as on the career card (it's drawn once the game is over, so hidden coppers are out of both).
  const mates = closestMates(state).filter((d) => !d.undercover);
  const close = mates.filter((d) => !d.ghost && d.status !== 'pound' && d.relation >= 25);
  const runners = dogs.filter((d) => d.status === 'gone' && d.left === 'runner');
  const farmed = dogs.filter((d) => d.status === 'farm' && !d.undercover && d.jobs >= 1);
  const grasses = dogs.filter((d) => d.status === 'gone' && d.left === 'grass');
  const stars = dogs.filter((d) => d.rarity && d.jobs >= 1 && d !== mates[0]).sort((a, b) => (b.rarity === 'legendary') - (a.rarity === 'legendary') || b.jobs - a.jobs);
  const pound = dogs.filter((d) => d.status === 'pound');
  // The closest mate gets the first word: they came too, or they're still inside.
  // (The Grey Ghost's goodbye comes with the rivals.)
  const top = mates[0];
  if (top && !top.ghost) add(top, top.status === 'pound' ? poundLine : close.includes(top) ? closeLine : null);
  add(runners[0] || farmed[0] || grasses[0], runners[0] ? runnerLine : farmed[0] ? farmLine : grassLine);
  add(stars[0], starLine);
  // Fill up to three from whoever's left.
  for (const [pool, fn] of [[farmed, farmLine], [runners, runnerLine], [close, closeLine], [pound, poundLine], [grasses, grassLine]]) {
    for (const d of pool) if (out.length < 3) add(d, fn);
  }
  const rival = rivalLine(state);
  if (rival) out.push(rival);
  out.push({ kind: 'inspector', icon: '🕵️', title: INSPECTOR.name, text: state.heat >= 60 ? `${INSPECTOR.name} closes your file, unsolved. He keeps a copy in his desk, and a postcard of ${RETIRE.place} pinned above it.` : `${INSPECTOR.name} never did work out who you were. He still wonders, some nights.` });
  return out;
}

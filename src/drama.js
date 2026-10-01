// Crew drama: short personal story arcs for dogs in your little black book.
// An arc is a few scenes on the job board, usually a job apart. Your choices cost
// money and change the dog (loyalty, a promotion, the pound, a betrayal), and some
// spill into the next job: a dog fired up or distracted (edge), sitting it out
// (away), or bringing trouble that turns up on the night (see sim.js).
import { GROUPS, SIGNATURES, SKILL_INFO, SKILLS, RARITY } from './data.js';
import { shortName, displayName, genDog, promote } from './dogs.js';
import { clamp, money, fail, done, addHeat, addRelation, book } from './util.js';
import { adjust } from './groups.js';
import { makeRng } from './rng.js';
import { addGenerosity, addHardness } from './repute.js';
import { newRunner } from './runners.js';

const MAX_ARCS = 2;
const START_CHANCE = 0.4;

const PARTNERS = ['Fingers Malone', 'Two-Bowls Terry', 'Slippy Sid', 'Mad Maxine', 'Lucky Lou', 'Knuckles O\'Hare'];
const MASTERS = ['Old Man Biscuit', 'The Duchess', 'Grandad Growler', 'Silent Sal'];
const RELATIVES = ['old mum', 'little brother', 'nan', 'kid sister'];

const bestSkill = (d) => SKILLS.slice().sort((a, b) => d.skills[b] - d.skills[a])[0];
const loyalOdds = (d) => clamp((d.loyalty + d.relation * 0.5) / 100, 0.1, 0.9);
const round10 = (n) => Math.round(n / 10) * 10;

// Arcs. `nodes` are scenes: `fx` applies when the scene comes up, `choices` are the
// buttons. A choice's `next` is a scene id, weighted [[id, w], ...], or a function;
// it comes up after `wait` jobs (default 1; 0 = straight away). No `next` ends the arc.
// Text fills {d} (the dog), {G} {boss} (a group) and the arc's own vars.
export const ARCS = {
  debt: {
    title: 'Borrowed Time',
    eligible: (d) => d.jobs >= 1,
    vars: (d, rng) => {
      const g = GROUPS[d.faction] ? d.faction : rng.pick(['family', 'syndicate', 'firm']);
      const amt = 150 + 50 * rng.int(1, 4) + (d.rarity ? 200 : 0);
      return { g, amt, amt2: round10(amt * 1.5) };
    },
    start: 'start',
    nodes: {
      start: {
        text: '{d} owes {G} {amt}. {boss} wants it by the end of the next job.',
        choices: [
          { label: 'Pay it', cost: 'amt', fx: { relation: 15, loyalty: 10, standing: 3, edge: 1 }, say: 'A weight off. {d} is sharp as a tack.', next: [['grateful', 0.35], ['thanks', 0.35], ['more', 0.3]] },
          { label: 'Their problem', fx: { relation: -5, edge: -1, trouble: 'heavies' }, say: '{d} keeps looking over their shoulder.', next: [['nicked', 0.45], ['desperate', 0.55]] },
        ],
      },
      more: {
        text: 'Turns out it wasn\'t {amt}. With interest, {G} want another {amt2}. {d} can\'t look you in the eye.',
        choices: [
          { label: 'Pay the rest', cost: 'amt2', fx: { relation: 10, standing: 3 }, say: '{d} is square with {G}. And owes you everything.', next: [['grateful', 0.5], ['thanks', 0.5]] },
          { label: 'That\'s your lot', fx: { relation: -10, loyalty: -10, trouble: 'heavies' }, next: [['nicked', 0.45], ['desperate', 0.55]] },
        ],
      },
      grateful: {
        fx: { promote: true, relation: 10 },
        text: '{d} hasn\'t forgotten. Every night since, they\'ve been practising. Word\'s getting round: {d} is {rank} now.',
        maxed: '{d} hasn\'t forgotten. They\'d take a bullet for you now. Or at least a very firm tennis ball.',
        choices: [{ label: 'Good.' }],
      },
      thanks: {
        fx: { loyalty: 10, skill: 1 },
        text: '{d} turns up with a bottle of the good stuff and a new trick they\'ve been practising. "For the Guv\'nor."',
        choices: [{ label: 'Cheers.' }],
      },
      nicked: {
        fx: { pound: 2 },
        text: 'The heavies from {G} caught up with {d} outside the Dog & Duck. The Old Bill broke it up and nicked the lot of them. {d} is in the pound.',
        choices: [{ label: 'Right.' }],
      },
      desperate: {
        text: '{d} is desperate. {G} want {amt2}, and they\'ve stopped asking nicely.',
        choices: [
          { label: 'Pay it', cost: 'amt2', fx: { relation: 10, standing: 3 }, say: '{d} breathes again.' },
          { label: 'No', next: [['runner', 0.5], ['grass', 0.5]], wait: 0 },
        ],
      },
      runner: {
        fx: { leave: 'runner' },
        text: '{d} emptied the biscuit tin on the way out. {taken} of yours, gone. Last seen heading for the docks.',
        choices: [{ label: 'Typical.' }],
      },
      grass: {
        fx: { leave: 'grass' },
        text: '{d} cut a deal: the Inspector keeps {G} off their back, {d} tells the Inspector all about you.',
        choices: [{ label: 'Rat.' }],
      },
    },
  },

  family: {
    title: 'Family Matters',
    eligible: (d) => d.jobs >= 1,
    vars: (d, rng) => ({ who: rng.pick(RELATIVES), amt: 150 + 50 * rng.int(0, 3) }),
    start: 'start',
    nodes: {
      start: {
        text: '{d}\'s {who} is poorly. The vet bills are piling up, and {d}\'s head isn\'t in the game.',
        choices: [
          { label: 'Cover the bills', cost: 'amt', fx: { relation: 15, loyalty: 15, edge: 1 }, say: '{d} goes very quiet, then hugs you. Awkward.', next: [['mended', 0.75], ['tagalong', 0.25]] },
          { label: 'Give them time off', fx: { relation: 8, away: true }, say: '{d} sits the next job out.', next: [['mended', 0.5], ['tagalong', 0.5]] },
          { label: 'Work is work', fx: { relation: -8, edge: -1 }, say: '{d}\'s mind is elsewhere.', next: 'tagalong' },
        ],
      },
      mended: {
        fx: { loyalty: 15, relation: 10 },
        text: '{d}\'s {who} is on the mend and sent you a tin of biscuits. {d} would walk through fire for you now.',
        choices: [{ label: 'Lovely.' }],
      },
      tagalong: {
        text: '{d}\'s {who} took a turn. {d} wants to bring them on the next job, "to keep an eye on them".',
        choices: [
          { label: 'Fine, bring them', fx: { relation: 10, trouble: 'relative' }, say: 'Nothing can possibly go wrong.', next: [['talent', 0.4], ['blabbed', 0.6]] },
          { label: 'Absolutely not', fx: { relation: -5, away: true }, say: '{d} stays home with their {who}.' },
        ],
      },
      talent: {
        fx: { recruit: true, relation: 5 },
        text: 'Turns out {d}\'s {who} was a proper face back in the day, and wants back in. {kin} is in your little black book.',
        choices: [{ label: 'Welcome aboard.' }],
      },
      blabbed: {
        fx: { heat: 12, loyalty: 5 },
        text: '{d}\'s {who} told the whole vet\'s waiting room about "our little job". One of the Inspector\'s lot was in the waiting room.',
        choices: [{ label: 'Marvellous.' }],
      },
    },
  },

  partner: {
    title: 'The Old Crew',
    eligible: (d) => d.jobs >= 2,
    vars: (d, rng) => ({ x: rng.pick(PARTNERS), g: rng.pick(Object.keys(GROUPS)), amt: 200 + 50 * rng.int(0, 4) }),
    start: 'start',
    nodes: {
      start: {
        text: '{d}\'s old partner {x} is back in town, offering {d} steady work with {G}. Better money than yours.',
        choices: [
          { label: 'Match it', cost: 'amt', fx: { relation: 10, loyalty: 10, greed: -10, edge: 1 }, say: '{d} stays. For now.' },
          { label: 'Have {x} followed', cost: 80, next: [['plant', 0.4], ['clean', 0.6]], wait: 0 },
          { label: 'Let {d} choose', next: (d, rng) => (rng.chance(loyalOdds(d)) ? 'stays' : 'goes'), wait: 0 },
        ],
      },
      stays: {
        fx: { loyalty: 20, relation: 20, promote: true },
        text: '{d} tells {x} where to stick it: "I\'m with the Guv\'nor." Loyalty like that gets noticed. {d} is {rank} now.',
        maxed: '{d} tells {x} where to stick it: "I\'m with the Guv\'nor." You may have got something in your eye.',
        choices: [{ label: 'Good dog.' }],
      },
      goes: {
        fx: { leave: 'poached' },
        text: '{d} took {x}\'s offer. No hard feelings. Some hard feelings.',
        choices: [{ label: 'Their loss.' }],
      },
      plant: {
        fx: { loyalty: 15, relation: 15, heat: -8 },
        text: '{x} met a man in a raincoat twice this week. {x} is working for the Inspector. {d} is shaken, and very grateful.',
        choices: [{ label: 'Told you.' }],
      },
      clean: {
        fx: { relation: -10 },
        text: '{x} is clean. And {d} found out you had their old mate followed.',
        choices: [{ label: 'Let {d} choose', next: (d, rng) => (rng.chance(loyalOdds(d)) ? 'stays' : 'goes'), wait: 0 }],
      },
    },
  },

  mentor: {
    title: 'The Big Break',
    eligible: (d) => d.jobs >= 2 && d.rarity !== 'legendary' && d.skills[bestSkill(d)] >= 3,
    vars: (d, rng) => ({ m: rng.pick(MASTERS), skill: SKILL_INFO[bestSkill(d)].label, amt: d.rarity ? 700 : 350 }),
    start: 'start',
    nodes: {
      start: {
        text: '{m}, the best there ever was at {skill}, is taking one last apprentice. {d} is desperate for it. It\'s {amt}, and {d} misses the next job.',
        choices: [
          { label: 'Pay for the lessons', cost: 'amt', fx: { relation: 10, away: true }, say: '{d} is off to {m}\'s.', next: [['graduated', 0.6], ['washout', 0.25], ['kept', 0.15]] },
          { label: 'Not now', fx: { relation: -3 }, say: '{d} shrugs. Maybe next year.' },
        ],
      },
      graduated: {
        fx: { promote: true },
        text: '{d} is back from {m}\'s, and they\'re different. Word\'s out: {d} is {rank} now.',
        maxed: '{d} is back from {m}\'s with a new hat and an old swagger.',
        choices: [{ label: 'Worth every penny.' }],
      },
      washout: {
        fx: { edge: -1, relation: -5 },
        text: '{d} came back from {m}\'s with a sore head and no new tricks. They\'re sulking.',
        choices: [{ label: 'Oh dear.' }],
      },
      kept: {
        fx: { leave: 'poached' },
        text: '{m} liked {d} so much they kept them. {d} sends a postcard. It just says "sorry".',
        choices: [{ label: 'Charming.' }],
      },
    },
  },

  watched: {
    title: 'Heat on the Street',
    eligible: (d, state) => d.jobs >= 1 && state.heat >= 15,
    vars: () => ({}),
    start: 'start',
    nodes: {
      start: {
        text: 'The Inspector\'s lot have been asking about {d} down the pub. {d} wants to disappear for a bit.',
        choices: [
          { label: 'New papers', cost: 200, fx: { relation: 10, heat: -5 }, say: '{d} is now called something else. Mostly.' },
          { label: 'Keep working them', fx: { trouble: 'tail' }, say: 'An unmarked car follows {d} everywhere.', next: (d, rng) => (rng.chance(0.5) ? 'slipped' : rng.chance(loyalOdds(d)) ? 'quiet' : 'talked') },
          { label: 'Let them lie low', fx: { relation: 5, away: true }, say: '{d} lies low.' },
        ],
      },
      quiet: {
        fx: { pound: 2, relation: 10, loyalty: 10 },
        text: 'The Old Bill pulled {d} in. Six hours under the lamp, not a word. They\'re doing a stretch in the pound for it.',
        choices: [{ label: 'Proud of them.' }],
      },
      talked: {
        fx: { pound: 1, heat: 15 },
        text: 'The Old Bill pulled {d} in, and {d} talked. The Inspector\'s corkboard just got bigger.',
        choices: [{ label: 'Blast.' }],
      },
      slipped: {
        fx: { relation: 5 },
        text: 'The Old Bill lost interest in {d}. For now.',
        choices: [{ label: 'Phew.' }],
      },
    },
  },
};

// What trouble looks like on the night (sim.js plays it).
const TROUBLE_TEXT = {
  heavies: 'Two heavies from {G} turn up outside, asking for {d} by name. It gets loud.',
  relative: '{d}\'s {who} came along "to help". Flash photography. So much flash photography.',
  tail: 'The unmarked car that\'s followed {d} all week is parked across the road.',
};

function fill(text, arc, d) {
  const v = arc.vars;
  const G = v.g ? GROUPS[v.g] : null;
  const map = {
    d: shortName(d), G: G?.short ?? '', boss: G?.boss ?? '',
    ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' && /amt|taken/.test(k) ? money(x) : x])),
  };
  return text.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? '');
}

const arcDog = (state, arc) => state.dogs[arc.dog];
const cost = (arc, c) => (typeof c === 'string' ? arc.vars[c] : c || 0);

function pickNext(next, d, rng) {
  if (!next) return null;
  if (typeof next === 'function') return next(d, rng);
  if (Array.isArray(next)) return rng.weighted(next);
  return next;
}

// Apply a scene's or a choice's effects to the dog (and you).
function applyFx(state, arc, fx = {}, rng) {
  const d = arcDog(state, arc);
  const note = [];
  if (fx.relation) addRelation(d, fx.relation);
  if (fx.loyalty) d.loyalty = clamp(d.loyalty + fx.loyalty, 0, 100);
  if (fx.greed) d.greed = clamp(d.greed + fx.greed, 0, 100);
  if (fx.standing && arc.vars.g) adjust(state, arc.vars.g, fx.standing);
  if (fx.heat) addHeat(state, fx.heat);
  if (fx.skill) {
    const sk = bestSkill(d);
    d.skills[sk] = Math.min(5, d.skills[sk] + fx.skill);
    d.known.skills[sk] = true;
  }
  // Next-job effects.
  if (fx.edge || fx.trouble || fx.away) {
    d.drama ||= {};
    if (fx.edge) d.drama.edge = fx.edge;
    if (fx.away) d.drama.away = true;
    if (fx.trouble) d.drama.trouble = { kind: fx.trouble, text: fill(TROUBLE_TEXT[fx.trouble], arc, d) };
  }
  if (fx.promote) {
    const to = promote(d);
    arc.vars.rank = to ? RARITY[to].label.toLowerCase() : null;
    if (to) note.push(`${displayName(d)} is ${RARITY[to].label}: ✨ ${SIGNATURES[d.signature].name}.`);
  }
  if (fx.pound) {
    d.status = 'pound';
    d.sentence = fx.pound;
  }
  if (fx.leave) {
    d.status = 'gone';
    d.left = fx.leave;
    d.relation = fx.leave === 'poached' ? d.relation : -100;
    if (fx.leave === 'runner') {
      const taken = Math.min(state.cash, round10(Math.max(100, state.cash * 0.15)));
      book(state, 'drama', -taken);
      arc.vars.taken = taken;
      d.ranWith = `${money(taken)} of yours`;
      newRunner(state, d, d.ranWith, taken, rng);
    }
    if (fx.leave === 'grass') addHeat(state, 20);
  }
  if (fx.recruit) {
    const kin = genDog(state, rng, { quality: 2, breed: d.breed });
    kin.last = d.last;
    kin.met = true;
    kin.relation = 20;
    kin.fee = Math.round(kin.fee * 0.8 / 10) * 10;
    state.dogs[kin.id] = kin;
    arc.vars.kin = displayName(kin);
  }
  return note;
}

// Queue an arc's current scene for the job board.
function showScene(state, arc, rng, now = false) {
  const node = ARCS[arc.kind].nodes[arc.node];
  const d = arcDog(state, arc);
  const notes = applyFx(state, arc, node.fx, rng);
  const text = fill(node.fx?.promote && !arc.vars.rank && node.maxed ? node.maxed : node.text, arc, d);
  arc.shown = true;
  const key = `${arc.kind}.${arc.node}`;
  state.stats.scenes ||= {};
  state.stats.scenes[key] = (state.stats.scenes[key] || 0) + 1;
  const scene = { type: 'drama', arc: arc.id, dog: d.id, title: ARCS[arc.kind].title, text, notes };
  if (now) state.story.unshift(scene);
  else state.story.push(scene);
}

export function startArc(state, kind, dogId, rng) {
  const d = state.dogs[dogId];
  const A = ARCS[kind];
  state.arcs ||= [];
  const arc = { id: `a${state.nextId++}`, kind, dog: dogId, node: A.start, wait: 0, vars: A.vars(d, rng), shown: false };
  state.arcs.push(arc);
  showScene(state, arc, rng);
  return arc;
}

// Who can have drama: people you know who are around.
const castable = (d) => d.met && d.status === 'free' && !d.undercover && d.relation > -30;

// Between jobs: last job's drama effects wear off, unanswered scenes take the last
// (do-nothing) choice, arcs move on, and maybe someone new has a problem.
export function advanceArcs(state, rng) {
  state.arcs ||= [];
  for (const d of Object.values(state.dogs)) delete d.drama;
  const answered = new Set();
  for (const st of state.story.filter((x) => x.type === 'drama')) {
    const arc = state.arcs.find((a) => a.id === st.arc);
    if (!arc) continue;
    resolve(state, arc, ARCS[arc.kind].nodes[arc.node].choices.length - 1, rng);
    answered.add(arc);
  }
  state.story = state.story.filter((x) => x.type !== 'drama');
  for (const arc of state.arcs.slice()) {
    const d = arcDog(state, arc);
    if (!d || ['gone', 'farm'].includes(d.status)) { endArc(state, arc); continue; }
    if (arc.shown || answered.has(arc)) continue;
    if (arc.wait > 0) { arc.wait--; continue; }
    if (d.status === 'pound') continue; // it'll keep
    showScene(state, arc, rng);
  }
  if (state.arcs.length >= MAX_ARCS || !rng.chance(START_CHANCE)) return;
  const busy = new Set(state.arcs.map((a) => a.dog));
  const cast = Object.values(state.dogs).filter((d) => castable(d) && !busy.has(d.id));
  if (!cast.length) return;
  const d = rng.pick(cast);
  const kinds = Object.keys(ARCS).filter((k) => ARCS[k].eligible(d, state));
  if (kinds.length) startArc(state, rng.pick(kinds), d.id, rng);
}

function endArc(state, arc) {
  state.arcs = state.arcs.filter((a) => a !== arc);
}

// Every scene's last choice is free: it's the one taken if a scene goes unanswered.
function resolve(state, arc, i, rng) {
  const c = ARCS[arc.kind].nodes[arc.node].choices[i];
  const d = arcDog(state, arc);
  // Putting your hand in your pocket for the crew: generous, and a little soft.
  if (cost(arc, c.cost)) {
    book(state, 'drama', -cost(arc, c.cost));
    addGenerosity(state, 2);
    addHardness(state, -2);
  }
  const notes = applyFx(state, arc, c.fx, rng);
  const nextId = pickNext(c.next, d, rng);
  if (!nextId) endArc(state, arc);
  else {
    arc.node = nextId;
    arc.shown = false;
    arc.wait = Math.max(0, (c.wait ?? 1) - 1); // the next between-jobs counts as one
    if (c.wait === 0) showScene(state, arc, rng, true);
  }
  return done([c.say ? fill(c.say, arc, d) : '', ...notes].filter(Boolean).join(' '));
}

// The player answers the scene at the front of the queue.
export function chooseDrama(state, i) {
  const st = state.story[0];
  if (!st || st.type !== 'drama') return fail('Nothing to decide.');
  const arc = (state.arcs || []).find((a) => a.id === st.arc);
  if (!arc) { state.story.shift(); return done(''); }
  const c = ARCS[arc.kind].nodes[arc.node].choices[i];
  if (!c) return fail('No such choice.');
  if (cost(arc, c.cost) > state.cash) return fail('You can\'t afford it.');
  state.story.shift();
  return resolve(state, arc, i, makeRng(state.rng));
}

// For the scene modal: each choice's label, price and whether you can pay.
export function sceneChoices(state, st) {
  const arc = (state.arcs || []).find((a) => a.id === st.arc);
  if (!arc) return [{ label: 'Right.', cost: 0, ok: true }];
  const d = arcDog(state, arc);
  return ARCS[arc.kind].nodes[arc.node].choices.map((c) => {
    const price = cost(arc, c.cost);
    return { label: fill(c.label, arc, d), cost: price, ok: price <= state.cash };
  });
}

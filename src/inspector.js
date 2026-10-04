// The Inspector: the nemesis. Between jobs he makes a move (planting coppers,
// turning your regulars, staking out jobs, setting up stings, raids), told as a
// scene on the job board. He also keeps a file on how you work: tricks you
// lean on get harder, because security has been briefed on them.
import { APPROACHES, KIT } from './data.js';
import { money, clamp, addHeat, addRelation, book, roundTo, addSabotage } from './util.js';
import { pushScene, answerScene } from './story.js';
import { displayName, shortName, skillOf } from './dogs.js';
import { addBond } from './bonds.js';
import { ownOffer } from './heists.js';

export const INSPECTOR = {
  name: 'Inspector Hound',
  dog: { id: 'inspector', first: 'Inspector', last: 'Hound', breed: 'bloodhound', faction: 'hounds', talents: [], quirks: [], look: { coat: '#7a4424', hat: 'trilby', eyes: 'none', neck: 'none', outfit: '#a8916a', brow: 'stern', seed: 77 } },
};

const insp = (state) => (state.inspector ||= { met: false, moves: [], plant: false });

// ------------------------------------------------------------------ his file on your methods
// Every trick he sees used on a job goes in the file; the file fades as he
// sees other things. Use a trick again and again and security is ready for it.
const MO_FADE = 0.6;
export function recordMO(state, result) {
  const mo = (state.mo ||= {});
  for (const k of Object.keys(mo)) {
    mo[k] = Math.round(mo[k] * MO_FADE * 100) / 100;
    if (mo[k] < 0.3) delete mo[k];
  }
  // A job nobody noticed leaves him nothing to study.
  if (result.outcome === 'clean' && result.clues < 2) return [];
  const seen = new Set(result.beats.filter((b) => b.approach && !APPROACHES[b.approach].signature).map((b) => b.approach));
  for (const ap of seen) mo[ap] = (mo[ap] || 0) + 1;
  return [...seen].filter((ap) => moPenalty(state, ap) > 0);
}
// +1 the second time running he sees a trick, +2 by the third.
export function moPenalty(state, approachId) {
  const v = state.mo?.[approachId] || 0;
  return v >= 1.9 ? 2 : v >= 1.4 ? 1 : 0;
}
export function moFile(state) {
  return Object.keys(state.mo || {}).map((ap) => ({ ap, pen: moPenalty(state, ap) })).filter((x) => x.pen > 0).sort((a, b) => b.pen - a.pen);
}

// What the heat pane says he's been up to (stings stay secret).
export const MOVE_LABELS = {
  plant: '👮 Planted a copper in the pub', stakeout: '🚓 Staked out a job', warn: '📢 Warned security across town',
  tail: '🚶 Had one of your crew followed', questioning: '💡 Pulled one of your crew in', flip: '🐀 Turned one of your regulars', raid: '🚪 Raided your back room',
  lineup: '🧍 Put your regulars in a line-up', strip: '🔧 Took your getaway van apart',
};

// ------------------------------------------------------------------ moves between jobs
// Each move: when it's on the cards, and what it does. `run` returns the scene
// (or null if it can't happen now). Scenes offer choices; the last is free.
const regulars = (state) => Object.values(state.dogs).filter((d) => d.met && d.status === 'free' && !d.undercover && !d.rarity && d.jobs > 0);

const MOVES = {
  plant: {
    heat: 0,
    weight: 3,
    run(state) {
      insp(state).plant = true;
      return {
        title: 'A New Face',
        text: 'Word from behind the bar: there\'s a newcomer at the Dog & Duck. Very keen. Very good. Asks a lot of questions about you. Somebody in the pub this time isn\'t who they say they are. Anybody could be anybody.',
        choices: [{ label: 'Noted. Nobody gets hired without a look.' }],
      };
    },
  },
  stakeout: {
    heat: 12,
    weight: 3,
    run(state, rng) {
      const o = rng.pick(state.offers.filter((x) => !x.job.hazards.stakeout));
      if (!o) return null;
      const job = o.job;
      job.hazards.stakeout = true;
      job.intel.hz_stakeout = true;
      job.watched = true;
      return {
        title: 'The Unmarked Car',
        text: `There's a car parked across from ${job.venueName}. Same car, same two blokes, same flask of tea, stamping their feet in the cold while the manager eats a four-course dinner in the window. The Inspector's watching it, ${job.stakeoutTime === 'night' ? 'nights' : 'days'} especially.`,
        choices: [{ label: 'Keep it in mind.' }],
      };
    },
  },
  warn: {
    heat: 20,
    weight: 2,
    run(state) {
      addSabotage(state);
      return {
        title: 'Word to the Wise',
        text: 'The Inspector has been round every security firm in town with a slideshow. "Be on your guard," he says. They are. He ends every talk with "Here endeth the lesson." Your next job starts on alert.',
        choices: [{ label: 'Typical.' }],
      };
    },
  },
  tail: {
    heat: 20,
    weight: 2,
    run(state, rng) {
      const d = rng.pick(regulars(state).filter((x) => !x.drama));
      if (!d) return null;
      return {
        title: 'Followed',
        dog: d.id,
        text: `${displayName(d)} says a man in a mac has followed them home three nights running. "Probably nothing, Guv." It isn't nothing.`,
        choices: [{ label: `Put ${shortName(d)} up somewhere quiet`, cost: 150, effect: 'hideout' }, { label: 'Lead him a merry dance', effect: 'slip' }, { label: 'They\'ll shake him off', effect: 'tailed' }],
      };
    },
  },
  questioning: {
    heat: 30,
    weight: 2,
    run(state, rng) {
      const d = rng.pick(regulars(state));
      if (!d) return null;
      return {
        title: 'Helping With Enquiries',
        dog: d.id,
        text: `The Inspector has pulled ${displayName(d)} in "to help with enquiries". Bright lamp. Bad tea. He wants to know who they work for, and he keeps asking about someone called Keyser Collie.`,
        choices: [{ label: 'Send a good brief', cost: 150, effect: 'brief' }, { label: 'Leave them to it', effect: 'grilled' }],
      };
    },
  },
  sting: {
    heat: 25,
    weight: 2,
    run(state, rng, ctx) {
      // A juicy tip from a stranger. It's a setup, unless you find out first. No scene: that's the point.
      const i = state.offers.findIndex((o) => o.source === 'own');
      if (i < 0 || !ctx.genJob) return null;
      const job = ctx.genJob(state, rng, { lootMult: 1.4 });
      makeTip(job, true);
      state.offers[i] = ownOffer(job);
      return null;
    },
  },
  flip: {
    heat: 35,
    weight: 2,
    run(state, rng) {
      const d = rng.pick(regulars(state).filter((x) => x.loyalty < 65 && !x.quirks.includes('nevergrass') && !x.quirks.includes('goodboy')));
      if (!d) return null;
      d.undercover = true;
      d.flipped = true;
      d.cleared = false;
      d.known.undercover = false;
      return {
        title: 'A Grass in the Pub',
        flipped: d.id,
        text: 'One of your regulars was seen getting out of an unmarked car round the back of the station. Nobody saw which one. The Inspector has someone on the inside now.',
        choices: [{ label: 'Find out who', cost: 200, effect: 'unmask' }, { label: 'Keep your eyes open' }],
      };
    },
  },
  // The usual suspects: five of your regulars, one line-up, one long night in the same cell.
  lineup: {
    heat: 15,
    weight: 2,
    run(state, rng) {
      const ds = rng.sample(regulars(state), 5);
      if (ds.length < 3) return null;
      for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) addBond(state, ds[i].id, ds[j].id, 15);
      const names = ds.map((d) => shortName(d));
      return {
        title: 'The Usual Suspects',
        dogs: ds.map((d) => d.id),
        text: `The Inspector has hauled in the usual suspects: ${names.slice(0, -1).join(', ')} and ${names.at(-1)}. A line-up. One at a time they step forward and say "Hand over the keys, you dozy mutt." Not one of them gets through it without laughing. He's got nothing on them, and they've spent a night in the same cell. They're thick as thieves now.`,
        choices: [{ label: 'Stand them a round', cost: 60, effect: 'round' }, { label: 'Good.' }],
      };
    },
  },
  // Your getaway van, taken apart to the last bolt in the police garage.
  strip: {
    heat: 25,
    weight: 2,
    run(state) {
      if (!(state.kit.van > 0)) return null;
      return {
        title: 'Down to the Last Bolt',
        text: 'The Inspector\'s lads have towed your getaway van to the police garage and taken it apart looking for the swag. Seats out, panels off, the tyres in a pile, a constable inside the petrol tank. They found nothing. They haven\'t put it back together.',
        choices: [{ label: 'Pay a mechanic to rebuild it', cost: 250, effect: 'rebuild' }, { label: 'Scrap it', effect: 'scrapped' }],
      };
    },
  },
  raid: {
    heat: 45,
    weight: 2,
    run(state) {
      const bung = Math.max(100, roundTo(state.cash * 0.1));
      return {
        title: 'Search Warrant',
        text: 'Six o\'clock in the morning. Boots on the stairs. The Inspector has a warrant for your back room and a very thorough constable.',
        choices: [{ label: 'Slip the desk sergeant something', cost: bung, effect: 'bung' }, { label: 'Let them look', effect: 'searched' }],
      };
    },
  },
};

// What each choice does. All data lives on the scene, so it survives a save.
const EFFECTS = {
  hideout(state, st) {
    const d = state.dogs[st.dog];
    addRelation(d, 6);
    return `${shortName(d)} lies low in a B&B in Snufflebury. The tail loses interest.`;
  },
  // On and off the train until the doors close on him.
  slip(state, st, rng) {
    const d = state.dogs[st.dog];
    if (rng.chance(clamp(0.35 + 0.08 * skillOf(d, 'sneak'), 0.35, 0.85))) {
      addRelation(d, 3);
      addHeat(state, -3);
      return `${shortName(d)} gets on the train. The man in the mac gets on. ${shortName(d)} gets off. He gets off. ${shortName(d)} hops back on as the doors close, and waves goodbye through the window.`;
    }
    return `${shortName(d)} leads him all over town. He's still there at the end of it, eating a hot dog. ${EFFECTS.tailed(state, st)}`;
  },
  round(state, st) {
    for (const id of st.dogs || []) if (state.dogs[id]) addRelation(state.dogs[id], 5);
    return 'They drink to the Inspector\'s health. Loudly.';
  },
  rebuild() {
    return 'The mechanic puts it back together. There are three bolts left over. It\'s probably fine.';
  },
  scrapped(state) {
    state.kit.van = 0;
    return 'Your getaway van is a pile of bits in the police garage. You\'ll need a new one.';
  },
  tailed(state, st) {
    const d = state.dogs[st.dog];
    if (!d.drama) d.drama = { trouble: { kind: 'tail', text: `That man in the mac is here. He followed ${shortName(d)}.` } };
    return `If ${shortName(d)} works the next job, the tail comes too.`;
  },
  brief(state, st) {
    const d = state.dogs[st.dog];
    addRelation(d, 10);
    return `The brief does the talking. ${shortName(d)} walks out with a grin.`;
  },
  grilled(state, st, rng) {
    const d = state.dogs[st.dog];
    let pTalk = clamp((75 - d.loyalty * 0.6 - d.nerve * 0.3) / 100, 0.05, 0.8);
    if (d.quirks.includes('looselips')) pTalk += 0.3;
    if (d.quirks.includes('nevergrass')) pTalk = 0;
    d.known.loyalty = true;
    if (rng.chance(pTalk)) {
      addHeat(state, 10);
      addRelation(d, -5);
      return `${shortName(d)} cracks after an hour. The Inspector's file gets thicker. (+10 heat)`;
    }
    addRelation(d, 8);
    if (rng.chance(0.4)) return `${shortName(d)} spins the Inspector a yarn for six hours about a fearsome boss called Keyser Collie, every name in it lifted off the noticeboard behind his head. They walk out with a limp. By the corner, the limp's gone.`;
    return `${shortName(d)} says nothing for six hours, then asks for a biscuit. Solid.`;
  },
  unmask(state, st, rng) {
    const d = state.dogs[st.flipped];
    if (d && rng.chance(0.7)) {
      d.known.undercover = true;
      return `It's ${displayName(d)}. They've been feeding him everything. They won't be working for you again.`;
    }
    return 'Your man asks around and comes back with nothing. Whoever it is, they\'re careful.';
  },
  bung() {
    return 'The warrant goes missing in the post. Funny, that.';
  },
  searched(state) {
    const take = roundTo(state.cash * 0.2);
    if (take) book(state, 'raids', -take);
    const gone = Object.keys(state.kit).filter((k) => state.kit[k] > 0 && KIT[k] && !KIT[k].special).slice(0, 2);
    for (const k of gone) state.kit[k] = 0;
    return `They take ${money(take)} in "evidence"${gone.length ? ` and your ${gone.map((k) => KIT[k].name.toLowerCase()).join(' and ')}` : ''}.`;
  },
};

// Turn a job into a stranger's tip-off. Stings are setups; real tips are just juicy.
export function makeTip(job, sting) {
  job.tip = true;
  job.sting = sting;
  job.intel = { tipster: false, ...job.intel };
}

// Between jobs: does the Inspector make a move, and which?
export function inspectorMoves(state, rng, ctx = {}) {
  const I = insp(state);
  let id = ctx.force || null;
  // His first move comes early: a copper in the pub, to say hello.
  if (id) { /* forced (dev hook) */ } else if (!I.met && (state.stats.jobs >= 2 || state.heat >= 12)) id = 'plant';
  else if (I.met && rng.chance(clamp(0.2 + state.heat / 70, 0, 0.85))) {
    const opts = Object.entries(MOVES).filter(([, m]) => state.heat >= m.heat).map(([k, m]) => [k, m.weight]);
    id = rng.weighted(opts);
  }
  if (!id) return null;
  const scene = MOVES[id].run(state, rng, ctx);
  I.moves.unshift({ day: state.day, move: id });
  I.moves = I.moves.slice(0, 12);
  if (!scene) return null;
  if (!I.met) {
    I.met = true;
    scene.title = 'The Inspector';
    scene.text = `${INSPECTOR.name} has opened a file on you. Thin, for now. ${scene.text}`;
  }
  return pushScene(state, 'inspector', { move: id, ...scene });
}

// Answer the scene on top of the board.
export const chooseInspector = (state, i, rng) => answerScene(state, 'inspector', i, (st, effect) => EFFECTS[effect](state, st, rng), 'fixer');

// The setup springs at the vault: nothing there but floodlights.
export const SETUP_TEXT = 'The vault\'s empty. Floodlights snap on. A loudhailer: "Evening, all." It was never a tip. It was a SETUP!';

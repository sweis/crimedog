// Rival crews and thieves. Each has a plotline told in scenes between jobs:
//  - The Jack Russell Gang (saboteurs): tip off security, nick your kit, lean on
//    your crew, and turn up on your jobs at the wrong moment.
//  - Dandy Dan (a show-off competitor): leaves taunting notes, beats you to jobs,
//    and sooner or later bets you can't pull one off.
//  - The Grey Ghost (a mystery): watches your work. Leave calling cards and pull
//    clean jobs, and the Ghost may come round, and in the end join the crew.
// Deal with the first two by ratting them out (it costs rep), setting them up, or
// robbing them. All scene data lives on the scene, so it survives a save.
import { KIT, SKILLS } from './data.js';
import { fail, done, money, addHeat, addRep, addRelation, book } from './util.js';
import { genDog, shortName, displayName, feeFor } from './dogs.js';
import { addHardness } from './repute.js';

export const RIVALS = {
  jacks: {
    kind: 'saboteur', name: 'The Jack Russell Gang', short: 'the Jack Russells', boss: 'Nipper', emblem: '🧨', fromJob: 2,
    blurb: 'Small, scrappy and everywhere. They think this is their manor.',
    dog: { breed: 'jackrussell', look: { coat: '#f5f1ea', hat: 'flatcap', eyes: 'none', neck: 'bandana', outfit: '#4a4a2b', brow: 'stern', seed: 41 } },
    hit: { type: 'breakin', venueType: 'butcher', name: 'Turning the Tables', lair: 'The Jack Russells\' lock-up, behind the cold store' },
  },
  dan: {
    kind: 'taunter', name: 'Dandy Dan', short: 'Dandy Dan', boss: 'Dandy Dan', emblem: '💌', fromJob: 3,
    blurb: 'The flashiest thief in town, and he wants you to know it.',
    dog: { breed: 'dalmatian', look: { coat: '#fbfbf8', hat: 'tophat', eyes: 'monocle', neck: 'bowtie', outfit: '#5a2b3a', brow: 'raised', seed: 42 } },
    hit: { type: 'roof', venueType: 'mansion', name: 'The Dandy Dan Job', lair: 'Dandy Dan\'s penthouse, Pawcaster Square' },
  },
  ghost: {
    kind: 'mystery', name: 'The Grey Ghost', short: 'the Ghost', boss: 'The Grey Ghost', emblem: '👻',
    blurb: 'Nobody has seen their face. Everybody has heard the stories.',
    dog: { breed: 'whippet', look: { coat: '#9aa0a8', hat: 'trilby', eyes: 'sunglasses', neck: 'scarf', outfit: '#2a2d38', brow: 'neutral', seed: 43 } },
  },
};

// A rival's face, for portraits (the Ghost stays in shadow until they join).
export const rivalDog = (id) => ({ id: `rival-${id}`, first: RIVALS[id].boss, last: '', faction: 'indie', talents: [], quirks: [], ...RIVALS[id].dog });

export function rivalsOf(state) {
  state.rivals ||= {};
  for (const id of Object.keys(RIVALS)) state.rivals[id] ||= { met: false, beef: 0, notes: 0, interest: 0, status: 'active', away: 0, ended: null };
  return state.rivals;
}
const active = (r) => r.met && r.status === 'active';

// ------------------------------------------------------------------ between jobs
// At most one rival scene between jobs. ctx.genJob builds jobs (rival hits, wagers).
export function rivalsBetweenJobs(state, rng, ctx = {}) {
  const R = rivalsOf(state);
  // A rival job you haven't taken yet stays on the board.
  for (const r of Object.values(R)) if (r.board && !state.offers.some((o) => o.id === r.board.id)) state.offers.unshift({ id: r.board.id, source: 'own', kind: 'own', job: r.board });
  // Rivals doing time come back, and they know who grassed.
  for (const [id, r] of Object.entries(R)) {
    if (r.status !== 'away') continue;
    r.away -= 1;
    if (r.away <= 0) {
      r.status = 'active';
      if (r.ended === 'ratted') r.beef += 2;
      r.ended = null;
      return scene(state, id, 'back', { text: `${RIVALS[id].name} ${id === 'dan' ? 'is' : 'are'} out of the pound${r.beef >= 2 ? ', and they know exactly who put them there' : ''}.`, choices: [{ label: 'Here we go again.' }] });
    }
  }
  if (ctx.force) return MOVES[ctx.force](state, rng, ctx);
  const candidates = [];
  const jobs = state.stats.jobs;
  if (!R.jacks.met && jobs >= RIVALS.jacks.fromJob) candidates.push(['jacksIntro', 10]);
  else if (active(R.jacks) && rng.chance(Math.min(0.5, 0.25 + 0.05 * R.jacks.beef))) candidates.push(['jacksMischief', 1]);
  if (!R.dan.met && jobs >= RIVALS.dan.fromJob) candidates.push(['danIntro', 8]);
  else if (active(R.dan)) {
    if (R.dan.notes >= 3 && !R.dan.wager && rng.chance(0.6)) candidates.push(['danWager', 2]);
    else if (rng.chance(0.4)) candidates.push(['danNote', 1]);
  }
  if (!candidates.length) return null;
  return MOVES[rng.weighted(candidates)](state, rng, ctx);
}

function scene(state, rival, move, s) {
  const st = { type: 'rival', rival, move, title: s.title || RIVALS[rival].name, ...s, choices: s.choices.map((c) => ({ label: c.label, cost: c.cost || 0, effect: c.effect || null })) };
  state.story.push(st);
  return st;
}

// How to deal with a troublesome rival. The last choice is always free.
function dealWith(state, id, setupCost) {
  const onBoard = state.offers?.some((o) => o.job.rivalHit === id);
  return [
    { label: 'Rat them out to the Inspector', effect: 'ratout' },
    { label: 'Set them up', cost: setupCost, effect: 'setup' },
    ...(onBoard ? [] : [{ label: `Rob ${id === 'dan' ? 'his penthouse' : 'their lock-up'}`, effect: 'rob' }]),
    { label: id === 'dan' ? 'Write back something cutting' : 'Let it go', effect: 'letgo' },
  ];
}

const MOVES = {
  jacksIntro(state) {
    rivalsOf(state).jacks.met = true;
    return scene(state, 'jacks', 'intro', {
      title: 'This Is Our Manor',
      text: 'Nipper and the Jack Russell Gang turn up at the Dog & Duck, six of them, all yap. "This is our manor. You want to work round here, you ask us first." They don\'t leave until the landlord gets the hose out.',
      choices: [{ label: 'Buy them a round to keep the peace', cost: 100, effect: 'peace' }, { label: 'Tell them where to go', effect: 'snub' }],
    });
  },
  jacksMischief(state, rng) {
    const r = rivalsOf(state).jacks;
    const kit = Object.keys(state.kit).filter((k) => state.kit[k] > 0 && KIT[k] && !KIT[k].special);
    const crew = Object.values(state.dogs).filter((d) => d.met && d.status === 'free' && !d.undercover && d.jobs > 0);
    const kinds = [['tipoff', 3], ['gatecrash', 3], ['nick', kit.length ? 2 : 0], ['scare', crew.length ? 2 : 0]];
    const kind = rng.weighted(kinds);
    let text;
    if (kind === 'tipoff') {
      state.sabotage = (state.sabotage || 0) + 1;
      text = 'The Jack Russells have been telling every security guard in town you\'re coming. Your next job starts on alert.';
    } else if (kind === 'gatecrash') {
      state.gatecrash = 'jacks';
      text = 'Word in the pub: the Jack Russells are hitting your next target too. Same night. Same vault. They\'ll be in the way.';
    } else if (kind === 'nick') {
      const k = rng.pick(kit);
      state.kit[k] -= 1;
      (r.stolen ||= []).push(k);
      text = `Somebody's been in your back room. Your ${KIT[k].name.toLowerCase()} is gone, and there's a chewed flat cap on the floor.`;
    } else {
      const d = rng.pick(crew);
      addRelation(d, -10);
      text = `Nipper's lads cornered ${displayName(d)} behind the Dog & Duck. ${shortName(d)} is shaken, and wondering if you're worth the trouble.`;
    }
    return scene(state, 'jacks', kind, { title: 'The Jack Russells Again', text, choices: dealWith(state, 'jacks', 250) });
  },
  danIntro(state) {
    const r = rivalsOf(state).dan;
    r.met = true;
    r.notes = 1;
    return scene(state, 'dan', 'intro', {
      title: 'A Calling Card',
      text: 'A card on your desk, on thick cream paper, smelling of cologne: "Saw your little job in the papers. Sweet. I did three that night. Do keep up. — Dandy Dan." There\'s a spotted handkerchief folded inside.',
      choices: [{ label: 'Who does he think he is?', effect: 'letgo' }],
    });
  },
  danNote(state, rng, ctx) {
    const r = rivalsOf(state).dan;
    r.notes += 1;
    const last = state.history?.[0]?.grade;
    let text;
    // Sometimes he beats you to a job on the board.
    const own = (state.offers || []).filter((o) => o.source === 'own' && !o.job.rivalHit && !o.job.wager);
    if (own.length > 1 && rng.chance(0.35)) {
      const o = own.sort((a, b) => b.job.loot.reduce((s, l) => s + l.value, 0) - a.job.loot.reduce((s, l) => s + l.value, 0))[0];
      state.offers = state.offers.filter((x) => x !== o);
      text = `${o.job.venueName} was robbed last night. There's a spotted handkerchief on the doorstep and a note for you: "Too slow, Guv'nor. — D."`;
    } else if (['S', 'A'].includes(last)) {
      text = '"Not bad, Guv\'nor. Almost as good as my Tuesday. — D." It\'s the first time he hasn\'t been rude. Nearly.';
    } else if (['D', 'F'].includes(last)) {
      addRep(state, -2);
      text = '"Saw the papers. HA! You were only supposed to blow the bloody doors off. — D." He\'s been showing the note round the Dog & Duck. (-2 rep)';
    } else {
      text = state.day % 2 ? '"Steady work, Guv\'nor. Steady. Like a milkman. — D." There\'s a pint of milk on the doorstep. He\'s very pleased with himself.' : '"You know what they call a mastermind who plays it safe? A milkman. Are you in or out, Guv\'nor? — D." There\'s a set of steak knives with it. Second prize.';
    }
    return scene(state, 'dan', 'note', { title: 'Another Note from Dan', text, choices: dealWith(state, 'dan', 300) });
  },
  danWager(state, rng, ctx) {
    const r = rivalsOf(state).dan;
    const amt = 1000 + 500 * Math.min(4, Math.floor(state.stats.jobs / 4));
    r.wagerAmt = amt;
    return scene(state, 'dan', 'wager', {
      title: 'Dan\'s Wager',
      text: `"${money(amt)} says you can't pull a proper job with an A. I'll even pick it for you. Put up or shut up. — D." A job is pinned to the note.`,
      choices: [{ label: 'You\'re on', effect: 'wager' }, { label: 'Not interested (-3 rep)', effect: 'nowager' }],
    });
  },
};

// ------------------------------------------------------------------ choices
export function rivalChoices(state, st) {
  return st.choices.map((c) => ({ ...c, ok: c.cost <= state.cash }));
}

export function chooseRival(state, i, rng, ctx = {}) {
  const st = state.story[0];
  if (!st || st.type !== 'rival') return fail('Nothing to answer.');
  const c = st.choices[i];
  if (!c) return fail('No such choice.');
  if (c.cost > state.cash) return fail('You can\'t afford that.');
  if (c.cost) book(state, 'fixer', -c.cost);
  state.story.shift();
  return done(c.effect ? EFFECTS[c.effect](state, st.rival, rng, ctx) : '');
}

const EFFECTS = {
  peace(state, id) {
    addHardness(state, -2);
    rivalsOf(state)[id].beef = Math.max(0, rivalsOf(state)[id].beef - 1);
    return 'Nipper drinks your beer and calls you "alright, for a newcomer". It won\'t last.';
  },
  snub(state, id) {
    addHardness(state, 2);
    rivalsOf(state)[id].beef += 1;
    return 'They leave. Slowly. Nipper doesn\'t take his eyes off you.';
  },
  letgo(state, id) {
    rivalsOf(state)[id].beef += 1;
    return id === 'dan' ? 'You send back a postcard of a very small trophy. He\'ll hate that.' : 'You let it go. They take that as a yes.';
  },
  // Grassing: it works, but the underworld doesn't forget, and nor does the Ghost.
  ratout(state, id) {
    const R = rivalsOf(state);
    const r = R[id];
    r.status = 'away';
    r.away = 4;
    r.ended = 'ratted';
    r.ratted = (r.ratted || 0) + 1;
    addRep(state, -6);
    addHeat(state, -3);
    if (R.ghost.met) R.ghost.interest = Math.max(0, R.ghost.interest - 2);
    return `A quiet word with the Inspector. ${RIVALS[id].name} ${id === 'dan' ? 'is' : 'are'} lifted at dawn. Nobody at the Dog & Duck will look you in the eye. (-6 rep)`;
  },
  setup(state, id, rng) {
    addHardness(state, 3);
    const r = rivalsOf(state)[id];
    if (rng.chance(0.6)) {
      r.status = 'away';
      r.away = 6;
      r.ended = 'setup';
      addRep(state, 4);
      return `A fake tip about a soft target. ${RIVALS[id].name} walk${id === 'dan' ? 's' : ''} straight into the Old Bill. Nobody knows it was you, but everyone suspects. (+4 rep)`;
    }
    r.beef += 2;
    state.gatecrash = id;
    return `${RIVALS[id].short[0].toUpperCase() + RIVALS[id].short.slice(1)} smelled it a mile off. Now ${id === 'dan' ? 'he\'s' : 'they\'re'} coming for your next job.`;
  },
  rob(state, id, rng, ctx) {
    const H = RIVALS[id].hit;
    const job = ctx.genJob(state, rng, { type: H.type, venueType: H.venueType, owner: null, lootMult: 1.2, twist: null });
    job.name = H.name;
    job.venueName = H.lair;
    job.rivalHit = id;
    rivalsOf(state)[id].board = job;
    state.offers.unshift({ id: job.id, source: 'own', kind: 'own', job });
    return `${id === 'dan' ? 'His penthouse' : 'Their lock-up'} is on the job board. Let's see how ${id === 'dan' ? 'he likes it' : 'they like it'}.`;
  },
  wager(state, id, rng, ctx) {
    const r = rivalsOf(state)[id];
    const job = ctx.genJob(state, rng, { tier: 3, lootMult: 1.2 });
    job.wager = r.wagerAmt;
    job.name = `Dan's Wager: ${job.name}`;
    r.wager = job.id;
    r.board = job;
    state.offers.unshift({ id: job.id, source: 'own', kind: 'own', job });
    return `The bet's on: ${money(r.wagerAmt)}, and it takes an A. The job is on the board.`;
  },
  nowager(state, id) {
    const r = rivalsOf(state)[id];
    r.notes = 0;
    addRep(state, -3);
    return 'Dan tells everyone you bottled it. (-3 rep)';
  },
  ghostjoin(state, id, rng) {
    const r = rivalsOf(state).ghost;
    r.status = 'joined';
    r.ended = 'joined';
    const d = genDog(state, rng, { quality: 2, rarity: 'legendary', primary: 'sneak', signature: true });
    Object.assign(d, { first: 'Grey', last: 'Ghost', nick: 'The Grey Ghost', breed: 'whippet', faction: 'indie', look: { ...RIVALS.ghost.dog.look }, signature: 'phantom', homegrown: true, met: true, relation: 40, loyalty: 90, ghost: true });
    d.known.loyalty = d.known.nerve = d.known.greed = true;
    for (const sk of SKILLS) d.known.skills[sk] = true;
    d.fee = feeFor(d);
    state.dogs[d.id] = d;
    r.dog = d.id;
    return 'The Grey Ghost takes off the hat. "I\'ve watched you long enough. Let\'s see what we can do together." The Ghost is in your little black book.';
  },
};

// ------------------------------------------------------------------ after a job
// Called once the job is graded. Rival hits and wagers settle; the Ghost takes note.
export function rivalsAfterJob(state, rng) {
  const R = rivalsOf(state);
  const job = state.job;
  const a = state.after;
  const grade = a.grade?.letter;
  const ok = (a.securedValue || 0) > 0;
  const log = [];
  if (job.rivalHit) {
    const r = R[job.rivalHit];
    if (ok) {
      r.status = 'done';
      r.ended = 'robbed';
      addRep(state, 6);
      for (const k of r.stolen || []) state.kit[k] = (state.kit[k] || 0) + 1;
      log.push(`${RIVALS[job.rivalHit].emblem} You robbed ${RIVALS[job.rivalHit].name}. ${job.rivalHit === 'dan' ? 'He\'s left town in a borrowed coat.' : 'They\'ve scattered. Your manor now.'} (+6 rep)`);
    } else {
      r.beef += 2;
      log.push(`${RIVALS[job.rivalHit].emblem} ${RIVALS[job.rivalHit].name} know you came for them.`);
    }
  }
  if (job.wager) {
    const r = R.dan;
    r.wager = null;
    if (['S', 'A'].includes(grade)) {
      book(state, 'wager', job.wager);
      addRep(state, 8);
      r.status = 'done';
      r.ended = 'wager';
      log.push(`💌 Dan pays up: ${money(job.wager)}, and leaves town before anyone can laugh at him. (+8 rep)`);
    } else {
      const pay = Math.min(state.cash, job.wager);
      book(state, 'wager', -pay);
      addRep(state, -4);
      r.notes = 0;
      log.push(`💌 You lost Dan's wager. ${money(pay)}, and he's telling everyone. (-4 rep)`);
    }
  }
  // The Ghost notices style: clean work, and calling cards.
  const g = R.ghost;
  if (g.status === 'active') {
    let gain = { S: 2, A: 1 }[grade] || 0;
    if (job.callingCard) gain += { S: 2, A: 2, B: 1 }[grade] || 0;
    if (g.test) {
      g.test = false;
      if (['S', 'A'].includes(grade) && state.result.alarmMax === 0) {
        g.ready = true;
        log.push('👻 Somewhere in the dark, someone is applauding. Quietly.');
      } else {
        g.interest = 5;
        log.push('👻 A grey feather on your desk, snapped in two. The Ghost wanted better than that.');
      }
    } else if (gain) {
      g.interest += gain;
      if (!g.met) log.push('👻 A grey feather on the vault floor that wasn\'t yours. Someone was watching.');
    }
    ghostScene(state, rng);
  }
  return log;
}

// The Ghost's plotline, by how interested they are.
export function ghostScene(state, rng) {
  const g = rivalsOf(state).ghost;
  if (g.ready) {
    g.ready = false;
    return scene(state, 'ghost', 'join', {
      title: 'The Grey Ghost',
      text: 'Midnight, the old cemetery. A grey coat, a trilby, sunglasses at night. "No alarms. Not one. And that calling card... you\'ve got style, Guv\'nor." A gloved paw comes out of the shadows.',
      choices: [{ label: 'Shake it', effect: 'ghostjoin' }],
    });
  }
  if (!g.met && g.interest >= 2) {
    g.met = true;
    return scene(state, 'ghost', 'intro', {
      title: 'A Grey Feather',
      text: 'On your desk, where nobody could have put it: a single grey feather and a note in silver ink. "Elegant. — G." The door was locked. The windows were locked. You check them twice.',
      choices: [{ label: 'Who\'s there?' }],
    });
  }
  if (g.met && !g.gift && g.interest >= 5) {
    g.gift = true;
    const prize = Object.keys(KIT).filter((k) => KIT[k].special && !(state.kit[k] > 0));
    const k = prize.length ? rng.pick(prize) : null;
    if (k) state.kit[k] = KIT[k].uses || 1;
    else book(state, 'wager', 500);
    return scene(state, 'ghost', 'gift', {
      title: 'A Gift',
      text: `A parcel in grey paper on the doorstep. Inside: ${k ? `a ${KIT[k].name}` : money(500)}, and a note. "For the collection. Keep leaving your card. — G."`,
      choices: [{ label: 'Leave a card on the next one' }],
    });
  }
  if (g.met && g.gift && !g.test && g.interest >= 8) {
    g.test = true;
    return scene(state, 'ghost', 'test', {
      title: 'An Audition',
      text: '"I want to see you work. Your next job: an A or better, and not a single alarm. Do that, and we\'ll talk. — G."',
      choices: [{ label: 'Challenge accepted' }],
    });
  }
  return null;
}

// Someone's on the job at the wrong time: name the crew in the way.
export function gatecrash(state, job) {
  const R = rivalsOf(state);
  let id = state.gatecrash;
  state.gatecrash = null;
  if (!id && job.twist === 'rivals') id = Object.keys(R).find((k) => k !== 'ghost' && active(R[k])) || null;
  if (!id || !active(R[id]) || ['con', 'fix', 'hack', 'fraud', 'smash'].includes(job.type)) return null;
  let st = job.stages.find((x) => x.id === 'obs_rivals');
  if (!st) {
    const at = job.stages.findIndex((x) => x.kind === 'vault');
    st = { id: 'obs_rivals', kind: 'obstacle', label: '', icon: '🦹', options: ['o_rivalfight', 'o_rivaldeal', 'o_rivalwait', 'o_rivalgrass'] };
    job.stages.splice(at, 0, st);
  }
  st.label = RIVALS[id].name;
  st.icon = RIVALS[id].emblem;
  job.rivalCrew = id;
  return id;
}

// Taking (or walking away from) a rival's job takes it off the board.
export function tookRivalJob(state, job, walkedAway) {
  const id = job.rivalHit || (job.wager ? 'dan' : null);
  if (!id) return null;
  const r = rivalsOf(state)[id];
  r.board = null;
  if (walkedAway && job.wager) {
    r.wager = null;
    r.notes = 0;
    addRep(state, -3);
    return 'You walked away from Dan\'s wager. He\'s telling everyone you bottled it. (-3 rep)';
  }
  return null;
}

// For the job board: where each rival stands.
export function rivalStatus(r, id) {
  if (r.status === 'joined') return 'On your crew';
  if (r.status === 'away') return `In the pound (${r.away} more)`;
  if (r.status === 'done') return { robbed: 'Robbed and run off', wager: 'Paid up and left town' }[r.ended] || 'Gone';
  if (id === 'ghost') return r.test ? 'Watching your next job' : 'Watching';
  if (id === 'dan') return r.wager ? 'A wager on the board' : `${r.notes} note${r.notes === 1 ? '' : 's'}`;
  return r.beef >= 3 ? 'At war with you' : r.beef >= 1 ? 'A grudge' : 'Keeping their distance';
}

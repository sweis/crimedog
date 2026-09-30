// Game state and player actions. Pure logic (no DOM) so it runs under node --test.
// Every action returns { ok, msg } and mutates state in place.
import { makeRng, seedHolder } from './rng.js';
import { KIT, FENCES, CUTS, INTEL, APPROACHES, SKILLS, QUIRKS } from './data.js';
import { genDog, skillOf, hasSpecial, feeFor, shortName, displayName } from './dogs.js';
import { visibleStages, totalLootValue, revealIntel } from './heists.js';
import { GROUPS } from './data.js';
import { initGroups, genOffers, rerollOwnLeads, settleGroups, betweenJobs, payDebt as payGroupDebt, hireBlocked, hireCost, adjust } from './groups.js';
import { simulate, approachAvailable, odds, baseOdds, crewOf } from './sim.js';

export const MAX_CREW = 6;
export const START_CASH = 1000;

export function rngOf(state) {
  return makeRng(state.rng);
}

export function newGame(seed = Date.now() % 1e9, name = 'The Guv\'nor') {
  const state = {
    version: 2,
    seed,
    rng: seedHolder(seed),
    day: 1,
    phase: 'select', // select | plan | heist | aftermath | over
    mastermind: name,
    cash: START_CASH,
    rep: 25,
    heat: 0,
    dogs: {},
    pub: [],
    crew: [],
    kit: { squeaky: 1 },
    stats: { jobs: 0, perfect: 0, earned: 0, busts: 0, farmed: 0 },
    history: [],
    news: [],
    nextId: 1,
    job: null,
    result: null,
    after: null,
    over: null,
    groups: initGroups(),
    offers: [],
    story: [],
    sabotage: 0,
  };
  const rng = rngOf(state);
  // An old mate to get you started: known, fairly loyal.
  const mate = genDog(state, rng, { quality: 1 });
  mate.relation = 30;
  mate.loyalty = Math.max(mate.loyalty, 60);
  mate.met = true;
  mate.jobs = 1;
  for (const s of SKILLS) if (mate.skills[s] >= 2) mate.known.skills[s] = true;
  mate.known.talents = mate.talents.slice(0, 1);
  mate.fee = feeFor(mate);
  state.dogs[mate.id] = mate;
  genOffers(state, rng);
  news(state, `You set up shop in a back room above the Dog & Duck. Your old mate ${displayName(mate)} is propping up the bar.`);
  return state;
}

export function news(state, text) {
  state.news.unshift({ day: state.day, text });
  state.news = state.news.slice(0, 30);
}

export function refreshPub(state, rng = rngOf(state)) {
  const quality = Math.floor(state.rep / 30) + (state.job ? state.job.tier - 1 : 0);
  const n = Math.min(6, 4 + Math.floor(state.rep / 35));
  const pub = [];
  // Some regulars come back.
  const regulars = Object.values(state.dogs).filter((d) => d.status === 'free' && !state.crew.includes(d.id));
  for (const d of rng.shuffle(regulars)) {
    if (pub.length >= Math.floor(n / 2)) break;
    if (d.met || rng.chance(0.3)) pub.push(d.id);
  }
  let copperPlanted = false;
  while (pub.length < n) {
    const undercover = !copperPlanted && state.heat >= 25 && rng.chance((state.heat - 15) / 150);
    if (undercover) copperPlanted = true;
    const d = genDog(state, rng, { quality, undercover });
    state.dogs[d.id] = d;
    pub.push(d.id);
  }
  // There's always some wide-eyed rookie who'll work for peanuts.
  if (!pub.some((id) => state.dogs[id].fee <= 60)) {
    const r = genDog(state, rng, { quality: 0 });
    r.archetype = 'rookie';
    r.catchphrase = 'Is this... is this a real heist? Like, a proper one?';
    r.fee = 40;
    r.minRep = 0;
    state.dogs[r.id] = r;
    pub[pub.length - 1] = r.id;
  }
  state.pub = pub;
}

// ------------------------------------------------------------------ helpers
export function crewDogs(state) {
  return state.crew.map((id) => state.dogs[id]);
}
export function bookDogs(state) {
  return Object.values(state.dogs).filter((d) => d.met);
}
function spend(state, amount) {
  if (state.cash < amount) return false;
  state.cash -= amount;
  return true;
}
function useDay(state) {
  if (state.job.daysLeft <= 0) return false;
  state.job.daysLeft -= 1;
  state.day += 1;
  return true;
}
const fail = (msg) => ({ ok: false, msg });
const done = (msg, extra) => ({ ok: true, msg, ...extra });

export function inspectorLabel(heat) {
  if (heat >= 100) return 'Knock knock.';
  if (heat >= 80) return 'Closing in';
  if (heat >= 60) return 'Pinning photos to a corkboard';
  if (heat >= 40) return 'Has a file on you';
  if (heat >= 20) return 'Heard whispers';
  return 'Doesn\'t know you exist';
}
export function repLabel(rep) {
  if (rep >= 80) return 'Legend';
  if (rep >= 60) return 'Top Dog';
  if (rep >= 40) return 'Respected';
  if (rep >= 20) return 'Up-and-comer';
  if (rep >= 10) return 'Small-timer';
  return 'Nobody';
}

// ------------------------------------------------------------------ recruiting
export function hire(state, id) {
  const d = state.dogs[id];
  if (!d) return fail('No such dog.');
  if (state.phase !== 'plan') return fail('Not now.');
  if (state.crew.includes(id)) return fail('Already on the crew.');
  if (d.status !== 'free') return fail(`${shortName(d)} isn't available.`);
  if (state.crew.length >= MAX_CREW) return fail('Crew\'s full. Six is plenty.');
  if (state.rep < d.minRep && d.relation < 30) return fail(`"I don't work with amateurs." (${shortName(d)} wants rep ${d.minRep}+)`);
  if (d.relation <= -30) return fail(`${shortName(d)} won't work for you. Not after last time.`);
  if (hireBlocked(state, d)) return fail(`"Nothing personal. ${GROUPS[d.faction].name} say no." ${shortName(d)} won't work for you.`);
  const cost = hireCost(state, d);
  if (!spend(state, cost)) return fail('You can\'t afford the retainer.');
  d.status = 'crew';
  d.met = true;
  state.crew.push(id);
  state.pub = state.pub.filter((x) => x !== id);
  return done(`${shortName(d)} is in. (£${cost} retainer)`);
}

export function dismiss(state, id) {
  const d = state.dogs[id];
  if (!state.crew.includes(id) || state.phase !== 'plan') return fail('Not on the crew.');
  state.crew = state.crew.filter((x) => x !== id);
  d.status = 'free';
  d.relation -= 3;
  for (const [k, p] of Object.entries(state.job.plan)) if (p && p.dog === id) delete state.job.plan[k];
  if (state.job.insider === id) state.job.insider = null;
  return done(`${shortName(d)} is off the job. The retainer's not coming back.`);
}

export function askAround(state) {
  if (!useDay(state)) return fail('No days left before the job.');
  const rng = rngOf(state);
  refreshPub(state, rng);
  const gossip = crewDogs(state).find((d) => hasSpecial(d, 'gossip'));
  if (gossip) {
    for (const id of state.pub) {
      const d = state.dogs[id];
      const s = rng.pick(SKILLS);
      d.known.skills[s] = true;
    }
    return done(`New faces at the pub. ${shortName(gossip)} has the gossip on all of them.`);
  }
  return done('You spend the day at the pub. New faces drift in.');
}

// ------------------------------------------------------------------ job selection
export function acceptOffer(state, offerId) {
  if (state.phase !== 'select') return fail('Not now.');
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail('That offer\'s gone.');
  state.job = offer.job;
  const p = state.job.patron;
  if (p?.front) state.cash += p.front;
  if (state.sabotage) {
    state.job.alert += state.sabotage;
    state.sabotage = 0;
  }
  state.offers = [];
  state.phase = 'plan';
  refreshPub(state);
  const who = p ? GROUPS[p.group].name : 'your own lead';
  news(state, `You took ${state.job.name} (${who}).`);
  return done(p?.front ? `${state.job.name}: you're on. ${GROUPS[p.group].short} fronted you £${p.front}.` : `${state.job.name}: you're on.`);
}

export function digLeads(state) {
  if (state.phase !== 'select') return fail('Not now.');
  if (!spend(state, 40)) return fail('A round of drinks for tips costs £40.');
  rerollOwnLeads(state, rngOf(state));
  return done('You buy a round and listen. Two fresh leads.');
}

export function payDebt(state, gid) {
  return payGroupDebt(state, gid);
}

export function dismissStory(state) {
  state.story.shift();
  return done('');
}

export { hireCost };

// ------------------------------------------------------------------ prep
export function buy(state, kitId) {
  const k = KIT[kitId];
  if (!k) return fail('No such kit.');
  if (!k.consumable && state.kit[kitId] > 0) return fail('You already have one.');
  if (!spend(state, k.price)) return fail('Can\'t afford it.');
  state.kit[kitId] = (state.kit[kitId] || 0) + 1;
  return done(`Bought ${k.name}.`);
}

export function caseJoint(state, who) {
  const job = state.job;
  const unknown = Object.keys(job.intel).filter((k) => !job.intel[k]);
  if (!unknown.length) return fail('You know everything there is to know.');
  const rng = rngOf(state);
  if (who === 'tipster') {
    if (state.cash < 120) return fail('The tipster wants £120.');
    if (!useDay(state)) return fail('No days left before the job.');
    spend(state, 120);
    const k = rng.pick(unknown);
    revealIntel(job, k);
    return done(`A tipster sells you: ${INTEL[k].label}.`, { revealed: [k] });
  }
  const d = state.dogs[who];
  if (!d || !state.crew.includes(who)) return fail('Send someone from the crew.');
  if (state.cash < 40) return fail('Expenses are £40.');
  if (!useDay(state)) return fail('No days left before the job.');
  spend(state, 40);
  d.known.skills.nose = true;
  d.known.skills.sneak = true;
  let n = 1 + Math.floor(skillOf(d, 'nose') / 2) + (hasSpecial(d, 'intel') ? 1 : 0);
  if (hasSpecial(d, 'intel')) {
    const t = d.talents.find((x) => ['radio', 'bloodhound', 'casing'].includes(x));
    if (t && !d.known.talents.includes(t)) d.known.talents.push(t);
  }
  const got = rng.sample(unknown, Math.min(n, unknown.length));
  for (const k of got) revealIntel(job, k);
  let msg = `🔎 ${got.map((k) => INTEL[k].label.replace('Hazard: ', '⚠️ ')).join(', ')}`;
  const spotted = rng.chance(Math.max(0.03, 0.35 - 0.08 * skillOf(d, 'sneak')));
  if (spotted) {
    job.alert += 1;
    msg += ` · 👀 ${shortName(d)} was spotted: +1 difficulty`;
  }
  return done(msg, { revealed: got, spotted });
}


export function surveil(state, id) {
  const d = state.dogs[id];
  if (!d) return fail('No such dog.');
  if (d.known.loyalty && d.known.undercover) return fail(`You already know all about ${shortName(d)}.`);
  if (state.cash < 80) return fail('Surveillance costs £80.');
  if (!useDay(state)) return fail('No days left before the job.');
  spend(state, 80);
  const rng = rngOf(state);
  d.met = true;
  d.known.loyalty = d.known.nerve = d.known.greed = true;
  d.known.quirks = d.quirks.slice();
  for (const [s] of SKILLS.map((s) => [s, skillOf(d, s)]).sort((a, b) => b[1] - a[1]).slice(0, 3)) d.known.skills[s] = true;
  let msg = `🕵️ ${shortName(d)}:`;
  if (d.undercover) {
    if (rng.chance(0.85)) {
      d.known.undercover = true;
      msg += ' 👮 UNDERCOVER COPPER!';
    } else {
      d.cleared = true;
      msg += ' seems legit.';
    }
  } else {
    d.cleared = true;
    msg += ' seems legit.';
  }
  return done(msg);
}

export function plantInsider(state, id) {
  const d = state.dogs[id];
  const job = state.job;
  if (!state.crew.includes(id)) return fail('Pick someone from the crew.');
  if (job.insider) return fail('You already have someone inside.');
  if (state.cash < 100) return fail('Costs £100 for a fake reference.');
  if (!useDay(state)) return fail('No days left before the job.');
  spend(state, 100);
  const rng = rngOf(state);
  const s = Math.max(skillOf(d, 'disguise'), skillOf(d, 'charm'));
  d.known.skills[skillOf(d, 'disguise') >= skillOf(d, 'charm') ? 'disguise' : 'charm'] = true;
  if (rng.chance(baseOdds(s, job.base - 1))) {
    job.insider = id;
    return done(`${shortName(d)} gets a job at ${job.venueName} as a cleaner. They're on the inside.`);
  }
  job.alert += 1;
  return done(`${shortName(d)}'s interview goes badly. Security's been told to look out for "a suspicious applicant".`);
}

export function bribeGuard(state) {
  const job = state.job;
  if (!job.stages.some((s) => s.id === 'obs_guards')) return fail('There are no guards to bribe.');
  if (job.bribed) return fail('Already bribed.');
  const cost = 150 * job.tier;
  if (!spend(state, cost)) return fail(`The guard wants £${cost}.`);
  const rng = rngOf(state);
  if (rng.chance(0.75)) {
    job.bribed = true;
    return done(`A night guard pockets £${cost} and agrees to look the other way.`);
  }
  state.heat = Math.min(100, state.heat + 6);
  return done(`The guard takes your £${cost}... and tells his sergeant. (+6 heat)`);
}

export function buySafehouse(state) {
  if (state.job.safehouse) return fail('Already sorted.');
  if (!spend(state, 250)) return fail('A safehouse costs £250.');
  state.job.safehouse = true;
  return done('A lock-up behind the launderette. Somewhere to lie low after the job.');
}
export function buyFakeIds(state) {
  if (state.job.fakeIds) return fail('Already sorted.');
  if (!spend(state, 200)) return fail('Fake IDs cost £200.');
  state.job.fakeIds = true;
  return done('Fresh papers for everyone. Captured crew will be harder to trace.');
}
export function lineUpBuyer(state) {
  if (state.job.buyer) return fail('The Collector is already waiting.');
  if (state.cash < 150) return fail('Costs £150 to get a meeting.');
  if (!useDay(state)) return fail('No days left before the job.');
  spend(state, 150);
  state.job.buyer = true;
  return done('The Collector agrees to buy the lot — at full value.');
}
export function vetFence(state) {
  if (state.job.fenceVetted) return fail('Already looked into her.');
  if (!spend(state, 60)) return fail('Costs £60.');
  state.job.fenceVetted = true;
  return done(state.job.stingFence ? 'Fancy Francesca drives a police-issue car. She\'s a STING.' : 'Fancy Francesca checks out. Just flashy.');
}
export function layLow(state) {
  if (state.cash < 100) return fail('Lying low costs £100.');
  if (!useDay(state)) return fail('No days left before the job.');
  spend(state, 100);
  const before = state.heat;
  state.heat = Math.max(0, state.heat - 8);
  return done(`You keep your head down. The Inspector's trail goes cold (-${before - state.heat} heat).`);
}

// ------------------------------------------------------------------ planning
export function setTime(state, time) {
  if (!['night', 'day'].includes(time)) return fail('Night or day.');
  state.job.time = time;
  state.job.hour = time === 'night' ? 2 : 14;
  return done(time === 'night' ? 'Dead of night it is.' : 'Broad daylight. Bold.');
}

export function setPlan(state, stageId, patch) {
  const stage = state.job.stages.find((s) => s.id === stageId);
  if (!stage || stage.hidden) return fail('No such stage.');
  const cur = state.job.plan[stageId] || {};
  const next = { ...cur, ...patch };
  if (next.approach && !stage.options.includes(next.approach)) return fail('Not an option here.');
  if (next.dog && !state.crew.includes(next.dog)) return fail('Not on the crew.');
  state.job.plan[stageId] = next;
  return done('Plan updated.');
}

// Put a crew member on a step. Keeps the step's chosen approach; if none is
// chosen yet (or it's unavailable), picks the one this dog looks best at.
export function assignToStage(state, stageId, dogId) {
  const job = state.job;
  const stage = job.stages.find((s) => s.id === stageId);
  const d = state.dogs[dogId];
  if (!stage || stage.hidden || !d) return fail('No such step.');
  if (!state.crew.includes(dogId)) return fail('Not on the crew.');
  let approach = job.plan[stageId]?.approach;
  if (!approach || !approachAvailable(state, job, approach).ok) {
    let best = null;
    for (const ap of stage.options) {
      if (!approachAvailable(state, job, ap).ok) continue;
      const known = d.known.skills[APPROACHES[ap].skill];
      const o = odds(state, job, stage, ap, d);
      const score = known ? o.p : o.p * 0.5 + 0.1;
      if (!best || score > best.score) best = { ap, score };
    }
    approach = best?.ap;
  }
  job.plan[stageId] = { approach, dog: dogId };
  return done(`${shortName(d)} is on ${stage.label}.`);
}

// Fill any gaps in the plan with the best-looking choice using *known* info,
// falling back to anyone for unknowns.
export function autoPlan(state) {
  const job = state.job;
  const crew = crewDogs(state);
  if (!crew.length) return fail('Hire a crew first.');
  for (const stage of visibleStages(job)) {
    const cur = job.plan[stage.id] || {};
    if (cur.approach && cur.dog && approachAvailable(state, job, cur.approach).ok && state.crew.includes(cur.dog)) continue;
    let best = null;
    for (const ap of stage.options) {
      if (!approachAvailable(state, job, ap).ok) continue;
      for (const d of crew) {
        const known = d.known.skills[APPROACHES[ap].skill];
        const o = odds(state, job, stage, ap, d, { crew });
        const score = known ? o.p : o.p * 0.5 + 0.1;
        if (!best || score > best.score) best = { ap, d, score };
      }
    }
    if (best) job.plan[stage.id] = { approach: best.ap, dog: best.d.id };
  }
  return done('The crew pencils in a plan.');
}

export function planProblems(state) {
  const job = state.job;
  const probs = [];
  if (!state.crew.length) probs.push('No crew.');
  const need = {};
  for (const stage of visibleStages(job)) {
    const p = job.plan[stage.id];
    if (!p || !p.approach || !p.dog) { probs.push(`${stage.label}: nothing planned.`); continue; }
    const av = approachAvailable(state, job, p.approach);
    if (!av.ok) probs.push(`${stage.label}: ${av.reason}.`);
    const nk = APPROACHES[p.approach].needKit;
    if (nk && KIT[nk].consumable) need[nk] = (need[nk] || 0) + 1;
  }
  for (const [k, n] of Object.entries(need)) if ((state.kit[k] || 0) < n) probs.push(`Plan uses ${n}× ${KIT[k].name}, you have ${state.kit[k] || 0}.`);
  return probs;
}

export function pullJob(state, opts = {}) {
  if (state.phase !== 'plan') return fail('Not now.');
  if (!state.crew.length) return fail('You need at least one dog.');
  if (!opts.force) autoPlan(state);
  for (const id of state.crew) state.dogs[id].status = 'crew';
  const rng = rngOf(state);
  state.result = simulate(state, state.job, rng);
  state.phase = 'heist';
  return done('Go go go!');
}

// Apply the heist's consequences. Called once playback ends.
export function resolveHeist(state) {
  if (state.phase !== 'heist') return fail('No heist to resolve.');
  const r = state.result;
  const job = state.job;
  for (const [k, n] of Object.entries(r.kitUsed)) state.kit[k] = Math.max(0, (state.kit[k] || 0) - n);
  for (const id of r.crew) {
    const d = state.dogs[id];
    d.jobs += 1;
    d.met = true;
    const L = r.learned[id];
    if (L) {
      for (const s of L.skills) d.known.skills[s] = true;
      for (const t of L.talents) if (t && !d.known.talents.includes(t)) d.known.talents.push(t);
      for (const q of L.quirks) if (!d.known.quirks.includes(q)) d.known.quirks.push(q);
      if (L.loyalty) d.known.loyalty = true;
      if (L.undercover) d.known.undercover = true;
    }
  }
  const rng = rngOf(state);
  const improved = [];
  for (const [id, skills] of Object.entries(r.practised || {})) {
    const d = state.dogs[id];
    for (const sk of new Set(skills)) {
      if (d.skills[sk] < 5 && rng.chance(0.35)) {
        d.skills[sk] += 1;
        d.known.skills[sk] = true;
        improved.push({ id, skill: sk });
      }
    }
  }
  for (const c of r.captured) {
    const d = state.dogs[c.id];
    d.status = 'pound';
    d.sentence = c.sentence;
    d.talked = c.talked;
    if (c.talked) d.relation -= 10; else d.relation += 10;
    state.crew = state.crew.filter((x) => x !== c.id);
  }
  for (const l of r.lost || []) {
    const d = state.dogs[l.id];
    d.status = 'farm';
    state.crew = state.crew.filter((x) => x !== l.id);
    news(state, `${displayName(d)} went to live on a farm after ${job.name}.`);
  }
  for (const run of r.runners) {
    const d = state.dogs[run.id];
    d.status = 'gone';
    d.relation = -100;
    state.crew = state.crew.filter((x) => x !== run.id);
    news(state, `${displayName(d)} did a runner with ${job.loot.find((l) => l.id === run.lootId).name}.`);
  }
  for (const id of [...r.exposed, ...r.tipped]) {
    const d = state.dogs[id];
    d.status = 'gone';
    d.known.undercover = true;
    state.crew = state.crew.filter((x) => x !== id);
  }
  state.heat = Math.min(100, state.heat + r.heatGain);
  const securedValue = r.secured.reduce((s, id) => s + job.loot.find((l) => l.id === id).value, 0);
  const want = job.patron?.want;
  const step = want && r.secured.includes(want) ? 'deliver' : r.secured.length ? 'fence' : 'pay';
  state.after = { step, securedValue, received: 0, gross: 0, fence: null, sting: false, cut: null, grade: null, repDelta: 0, delivered: null, patronCut: 0, relations: [] };
  state.after.headline = headline(state);
  state.after.improved = improved;
  state.phase = 'aftermath';
  return done('The dust settles.');
}

// Loot left to sell once anything the patron wanted has been handed over.
export function toFence(state) {
  return state.result.secured.filter((id) => id !== state.after?.delivered);
}

// Hand the item a patron asked for straight to them; they pay directly.
export function deliver(state) {
  const a = state.after;
  const p = state.job.patron;
  if (!a || a.step !== 'deliver' || !p?.want) return fail('Nothing to deliver.');
  a.delivered = p.want;
  a.received += p.fee;
  a.gross += p.fee;
  state.cash += p.fee;
  state.stats.earned += p.fee;
  a.step = toFence(state).length ? 'fence' : 'pay';
  const G = GROUPS[p.group];
  const item = state.job.loot.find((l) => l.id === p.want).name;
  if (p.deal === 'marker') return done(`${G.boss} takes ${item}. Your debt is squared.`);
  return done(`${G.boss} takes ${item} and pays £${p.fee.toLocaleString('en-GB')}.`);
}

export function fenceRate(state, fenceId) {
  const job = state.job;
  const f = FENCES[fenceId];
  const bonus = crewDogs(state).some((d) => hasSpecial(d, 'fence')) ? 0.1 : 0;
  let total = 0;
  for (const id of toFence(state)) {
    const l = job.loot.find((x) => x.id === id);
    total += l.value * Math.min(1, f.rates[l.kind] + (fenceId === 'collector' ? 0 : bonus));
  }
  return Math.round(total / 10) * 10;
}

export function fence(state, fenceId) {
  const a = state.after;
  if (!a || a.step !== 'fence') return fail('Nothing to fence.');
  if (!FENCES[fenceId]) return fail('No such fence.');
  if (fenceId === 'collector' && !state.job.buyer) return fail('The Collector only deals by appointment. You didn\'t line him up.');
  a.fence = fenceId;
  if (fenceId === 'francesca' && state.job.stingFence) {
    a.sting = true;
    a.received = 0;
    state.heat = Math.min(100, state.heat + 20);
    news(state, 'Fancy Francesca was a police sting. The loot is gone, and the Inspector has photos.');
    a.step = 'pay';
    return done('It\'s a STING! Francesca flashes a warrant card. You barely get out the back door. (+20 heat)');
  }
  const got = fenceRate(state, fenceId);
  a.gross += got;
  const p = state.job.patron;
  let msg = `${FENCES[fenceId].name} pays £${got.toLocaleString()}.`;
  let net = got;
  if (p?.cut) {
    a.patronCut = Math.round((got * p.cut) / 100);
    net -= a.patronCut;
    msg += ` ${GROUPS[p.group].name} take their ${p.cut}%: £${a.patronCut.toLocaleString()}.`;
  }
  a.received += net;
  state.cash += net;
  state.stats.earned += net;
  a.step = 'pay';
  return done(msg);
}

export function payCrew(state, pct) {
  const a = state.after;
  if (!a || a.step !== 'pay') return fail('Not now.');
  const cut = CUTS.find((c) => c.pct === pct);
  if (!cut) return fail('Pick a cut.');
  const r = state.result;
  const owed = r.crew.filter((id) => r.escaped.includes(id) || r.captured.some((c) => c.id === id));
  const share = Math.round((a.received * pct) / 100);
  if (share > state.cash) return fail('You can\'t cover that.');
  state.cash -= share;
  a.cut = pct;
  a.paid = share;
  for (const id of owed) {
    const d = state.dogs[id];
    let delta = a.received > 0 ? cut.rel : pct > 0 ? cut.rel : -2;
    if (d.quirks.includes('greedy') && pct < 45) { delta -= 8; if (!d.known.quirks.includes('greedy')) d.known.quirks.push('greedy'); }
    if (r.outcome !== 'bust' && r.outcome !== 'aborted') { d.wins += 1; delta += 5; }
    d.relation = Math.max(-100, Math.min(100, d.relation + delta));
  }
  finishGrade(state);
  a.step = 'grade';
  if (!a.received) return done('');
  return done(share ? `Paid the crew £${share.toLocaleString()}.` : 'The crew gets nothing. They\'ll remember that.');
}

export function gradeJob(state) {
  const r = state.result;
  const a = state.after;
  const job = state.job;
  const total = totalLootValue(job);
  const parts = {};
  parts.loot = Math.round((35 * a.securedValue) / total);
  parts.fence = a.securedValue ? Math.min(15, Math.round((15 * (a.gross ?? a.received)) / a.securedValue)) : 0;
  parts.stealth = r.alarmMax === 0 ? 20 : r.alarmMax < 3 ? 14 : r.alarmMax < 6 ? 8 : r.alarmMax < 9 ? 3 : 0;
  // Loyal crew doing time count for half; grasses and the lost count for nothing.
  const stayedQuiet = r.captured.filter((c) => !c.talked).length;
  parts.crew = r.crew.length ? Math.round((15 * (r.escaped.length + 0.5 * stayedQuiet)) / r.crew.length) : 0;
  parts.clues = Math.max(0, 10 - r.clues);
  parts.pay = (a.cut ?? 0) >= 30 ? 5 : (a.cut ?? 0) >= 15 ? 2 : 0;
  if (!a.securedValue) { parts.stealth = Math.min(parts.stealth, 5); parts.pay = 0; }
  const score = Object.values(parts).reduce((s, v) => s + v, 0);
  const letter = score >= 93 ? 'S' : score >= 78 ? 'A' : score >= 62 ? 'B' : score >= 45 ? 'C' : score >= 28 ? 'D' : 'F';
  return { score, letter, parts };
}

const REP_FOR = { S: 14, A: 9, B: 6, C: 3, D: -1, F: -4 };
function finishGrade(state) {
  const a = state.after;
  const g = gradeJob(state);
  a.grade = g;
  let rep = REP_FOR[g.letter];
  if (a.cut === 0 && a.received > 0) rep -= 4;
  if (state.result.runners.length) rep -= 2;
  a.repDelta = rep;
  state.rep = Math.max(0, Math.min(100, state.rep + rep));
  a.relations = settleGroups(state);
  state.stats.jobs += 1;
  if (g.letter === 'S') state.stats.perfect += 1;
  if (!a.securedValue) state.stats.busts += 1;
  a.headline = headline(state);
  state.history.unshift({ name: state.job.name, venue: state.job.venueName, grade: g.letter, score: g.score, take: a.received, day: state.day });
  news(state, `${state.job.name}: grade ${g.letter}. ${a.headline}`);
}

function headline(state) {
  const r = state.result;
  const v = state.job.venueName.toUpperCase();
  if (r.outcome === 'clean' && r.swap) return `"QUIET NIGHT AT ${v}," SAYS MANAGER`;
  if (r.outcome === 'clean') return `MYSTERY AT ${v}: POLICE BAFFLED`;
  if (r.outcome === 'tidy') return `DARING RAID ON ${v}`;
  if (r.outcome === 'messy') return `CHAOS AT ${v} AS GANG FLEES WITH LOOT`;
  if (r.outcome === 'aborted') return `ATTEMPTED BREAK-IN AT ${v} FOILED`;
  return `BUNGLING GANG LEAVES ${v} EMPTY-PAWED`;
}

// ------------------------------------------------------------------ aftermath extras
export function lawyer(state, id) {
  const d = state.dogs[id];
  if (!d || d.status !== 'pound') return fail('Not in the pound.');
  const cost = 150;
  if (!spend(state, cost)) return fail(`A brief costs £${cost}.`);
  d.sentence -= 1;
  d.relation = Math.min(100, d.relation + 8);
  if (d.sentence <= 0) {
    d.status = 'free';
    d.sentence = 0;
    d.relation = Math.min(100, d.relation + 10);
    return done(`Your brief gets ${shortName(d)} out on a technicality. Grateful doesn't cover it.`);
  }
  return done(`${shortName(d)}'s sentence is cut to ${d.sentence} job${d.sentence > 1 ? 's' : ''}. They won't forget it.`);
}

export function farm(state, id) {
  const d = state.dogs[id];
  if (!d || ['farm', 'gone'].includes(d.status)) return fail('Can\'t do that.');
  if (state.phase === 'heist') return fail('Not now.');
  const wasPound = d.status === 'pound';
  d.status = 'farm';
  state.crew = state.crew.filter((x) => x !== id);
  state.pub = state.pub.filter((x) => x !== id);
  state.stats.farmed += 1;
  if (d.undercover) {
    // Word gets round that you dealt with a copper. The underworld approves.
    d.known.undercover = true;
    state.rep = Math.min(100, state.rep + 6);
    for (const o of Object.values(state.dogs)) if (o.met && o.id !== id) o.relation = Math.min(100, o.relation + 3);
    news(state, `${displayName(d)} was a copper. Was. They've gone to live on a farm.`);
    return done(`A copper on the farm. Respect. (+6 rep)`);
  }
  state.rep = Math.max(0, state.rep - 8);
  for (const o of Object.values(state.dogs)) if (o.met && o.id !== id) o.relation = Math.max(-100, o.relation - 8);
  if (wasPound && d.talked === false) state.heat = Math.max(0, state.heat - 5);
  news(state, `${displayName(d)} has gone to live on a farm. Everyone's gone very quiet.`);
  return done(`${shortName(d)} has gone to the farm. (-8 rep; the crew are nervous)`);
}

export function nextJob(state) {
  if (state.phase === 'aftermath' && state.after.step !== 'grade') return fail('Finish up first.');
  const rng = rngOf(state);
  for (const id of state.crew) state.dogs[id].status = 'free';
  state.crew = [];
  for (const d of Object.values(state.dogs)) {
    if (d.status === 'pound') {
      d.sentence -= 1;
      if (d.sentence <= 0) {
        d.status = 'free';
        d.sentence = 0;
        news(state, `${displayName(d)} is out of the pound${d.talked ? '. Nobody buys them a drink.' : ' and back at the bar.'}`);
      }
    }
  }
  if (state.phase === 'plan') {
    // Walked away.
    state.rep = Math.max(0, state.rep - 3);
    news(state, `You walked away from ${state.job.name}. People talk.`);
    const p = state.job.patron;
    if (p) {
      const G = GROUPS[p.group];
      adjust(state, p.group, -10);
      if (p.front) {
        const g = state.groups[p.group];
        const back = Math.min(state.cash, p.front);
        state.cash -= back;
        if (back < p.front) g.debt = { amount: (g.debt?.amount || 0) + (p.front - back), patience: 2 };
      }
      news(state, `${G.boss} heard you walked away. Not a good look.`);
    }
  }
  state.heat = Math.max(0, state.heat - 4);
  state.day += 1;
  state.job = null;
  state.result = null;
  state.after = null;
  for (const e of betweenJobs(state, rng)) news(state, e.replace(/\{\w+\}/g, '').trim());
  genOffers(state, rng);
  state.phase = 'select';
  checkGameOver(state);
  return done('Back to the job board.');
}

export function checkGameOver(state) {
  if (state.over) return state.over;
  let reason = null;
  if (state.heat >= 100) reason = 'inspector';
  else if (state.rep <= 0) reason = 'nobody';
  else {
    const avail = Object.values(state.dogs).filter((d) => d.status === 'free' || d.status === 'crew');
    const cheapest = Math.min(...avail.map((d) => d.fee), Infinity);
    if (['plan', 'select'].includes(state.phase) && !state.crew.length && state.cash < Math.min(cheapest, 40)) reason = 'broke';
  }
  if (reason) {
    state.over = { reason, day: state.day, jobs: state.stats.jobs };
    state.phase = 'over';
  }
  return state.over;
}

export const GAME_OVER_TEXT = {
  inspector: { title: 'Knock Knock', text: 'The Inspector is at the door with a warrant, a smug grin and a very large file with your face on it. It\'s the pound for you, Guv\'nor.' },
  nobody: { title: 'Nobody Will Work For You', text: 'Your name is mud. The pub goes quiet when you walk in. Even the Rookie won\'t return your calls.' },
  broke: { title: 'Skint', text: 'Not a penny to your name and not a dog to your name either. Time to get a proper job.' },
};

// Make sure crew/status bookkeeping is consistent (used by tests).
export function invariants(state) {
  const errs = [];
  for (const id of state.crew) if (state.dogs[id]?.status !== 'crew') errs.push(`crew ${id} status ${state.dogs[id]?.status}`);
  if (state.cash < 0) errs.push('negative cash');
  if (state.heat < 0 || state.heat > 100) errs.push('heat out of range');
  if (state.rep < 0 || state.rep > 100) errs.push('rep out of range');
  for (const d of Object.values(state.dogs)) if (d.status === 'crew' && !state.crew.includes(d.id) && state.phase === 'plan') errs.push(`dog ${d.id} crew but not listed`);
  return errs;
}

export { crewOf, QUIRKS };

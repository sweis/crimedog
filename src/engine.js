// Game state and player actions. Pure logic (no DOM) so it runs under node --test.
// Every action returns { ok, msg } and mutates state in place.
import { makeRng, seedHolder } from './rng.js';
import { fail, done, money, clamp, addHeat, addRep, repNote, addRelation, book, pickBy, inSentence, roundTo } from './util.js';
import { KIT, FENCES, CUTS, INTEL, APPROACHES, SKILLS, GROUPS, SIGNATURES, BREEDS, MASTER_MIN, SKILL_INFO, PRICES, FIXER } from './data.js';
import { genDog, skillOf, hasSpecial, feeFor, shortName, displayName, isVisitor, promote, earnedPromotion, specialty, sizeOf } from './dogs.js';
import { visibleStages, totalLootValue, revealIntel, lootItem, genJob, intelLabel, jobTier } from './heists.js';
import { inspectorMoves, recordMO, chooseInspector as answerInspector } from './inspector.js';
import { retire } from './retire.js';
import { bump } from './career.js';
import { settleBonds } from './bonds.js';
import { rivalsBetweenJobs, rivalsAfterJob, chooseRival as answerRival, gatecrash, tookRivalJob } from './rivals.js';
import { makeAmends as amendsWith, canBorrow, borrow as borrowFromFamily, initGroups, genOffers, rerollOwnLeads, settleGroups, betweenJobs, hireBlocked, hireCost, adjust } from './groups.js';
import { advanceArcs, chooseDrama, sceneChoices as dramaChoices } from './drama.js';
import { affordable } from './story.js';
import { buildRecap, HISTORY_MAX } from './recap.js';
import { addGenerosity, addHardness, crewFeeling, CUT_REPUTE } from './repute.js';
import { sendDown, hireBrief, admit, recover, payHospital } from './justice.js';
import { newRunner, runnersBetweenJobs, runnersAfterJob, chooseRunner as answerRunner, runnerAction as actOnRunner, tookRunnerJob } from './runners.js';
import { simulate, approachAvailable, baseOdds, stageOptions, canDo, signatureFits, bestAssignment, planScore } from './sim.js';

export const MAX_CREW = 6;
const START_CASH = 2500;

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
    stats: { jobs: 0, perfect: 0, earned: 0, busts: 0, farmed: 0, arrests: 0, runners: 0, lost: 0, hospital: 0 },
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
  refreshPub(state, rng);
  timelinePoint(state, 'Start');
  news(state, `You set up shop in a back room above the Dog & Duck. Your old mate ${displayName(mate)} is propping up the bar.`);
  return state;
}

function news(state, text) {
  state.news.unshift({ day: state.day, text });
  state.news = state.news.slice(0, 30);
}

function leaveCrew(state, id) {
  state.crew = state.crew.filter((x) => x !== id);
}

// Strangers you never hired or looked into drift away, so saves don't grow forever.
function pruneStrangers(state, keep) {
  const strangers = Object.values(state.dogs).filter((d) => !d.met && d.status === 'free' && !keep.includes(d.id) && !state.crew.includes(d.id));
  for (const d of strangers.slice(0, Math.max(0, strangers.length - 12))) delete state.dogs[d.id];
}

// Who's in the pub. On the job board it's whoever's about town (so you can see
// the talent before picking a job); once you're on a job, asking around refreshes it.
// `townKey` marks this visit: stars in town for it can be hired.
export function refreshPub(state, rng = rngOf(state)) {
  state.townKey = state.job ? state.job.id : `board-${state.stats.jobs}-${state.day}`;
  const quality = pubQuality(state, state.job ? state.job.tier : jobTier(state));
  const n = Math.min(6, 5 + Math.floor(state.rep / 40));
  const pub = [];
  // Some regulars come back.
  const regulars = Object.values(state.dogs).filter((d) => d.status === 'free' && !isVisitor(d) && !state.crew.includes(d.id) && !(d.undercover && d.known.undercover));
  for (const d of rng.shuffle(regulars)) {
    if (pub.length >= Math.floor(n / 2)) break;
    if (d.met || rng.chance(0.3)) pub.push(d.id);
  }
  // New faces spread across the skills: each leans towards a speciality nobody
  // around you has yet (and ones this job can use), so every kind turns up.
  // Counts what you've been shown lately: known specialities of everyone still about.
  const have = {};
  for (const d of Object.values(state.dogs)) {
    const sk = ['free', 'crew'].includes(d.status) && specialty(d);
    if (sk) have[sk] = (have[sk] || 0) + 1;
  }
  const need = new Set(state.job ? visibleStages(state.job).flatMap((st) => st.options.map((ap) => APPROACHES[ap].skill)) : []);
  // Over the whole game, specialities you've seen least come round first.
  state.faces ||= {};
  const least = Math.min(...SKILLS.map((sk) => state.faces[sk] || 0));
  const newFace = () => {
    const primary = rng.weighted(SKILLS.map((sk) => [sk, (need.has(sk) ? 1.5 : 1) / ((1 + 4 * (have[sk] || 0)) ** 2 * (1 + 2 * ((state.faces[sk] || 0) - least)))]));
    have[primary] = (have[primary] || 0) + 1;
    state.faces[primary] = (state.faces[primary] || 0) + 1;
    // Usually a breed known for it (poodles and pugs for disguise, hounds for noses...),
    // and never one that can't do it. Aim, tech, wheels and locks are anybody's.
    const known = Object.keys(BREEDS).filter((b) => BREEDS[b].bias.includes(primary));
    const breed = known.length && rng.chance(0.7) ? rng.pick(known) : undefined;
    return { primary, breed };
  };
  // The Inspector plants coppers once he's heard of you; after his first move, one is guaranteed.
  const I = state.inspector;
  let copperPlanted = false;
  while (pub.length < n) {
    const undercover = !copperPlanted && (I?.plant || (state.heat >= 12 && rng.chance((state.heat - 5) / 120)));
    if (undercover) {
      copperPlanted = true;
      if (I) I.plant = false;
    }
    const d = genDog(state, rng, { quality, undercover, ...newFace() });
    state.dogs[d.id] = d;
    pub.push(d.id);
  }
  // There's always some wide-eyed rookie who'll work for peanuts.
  if (!pub.some((id) => state.dogs[id].fee <= 60)) {
    const r = genDog(state, rng, { quality: 0, ...newFace() });
    r.archetype = 'rookie';
    r.catchphrase = 'Is this... is this a real heist? Like, a proper one?';
    r.fee = 40;
    r.minRep = 0;
    state.dogs[r.id] = r;
    pub[pub.length - 1] = r.id;
  }
  state.pub = pub;
  jobArrivals(state, rng, quality);
}

// How good the faces in the pub are. A four-star job draws no better a crowd than a three-star one.
const pubQuality = (state, tier) => Math.floor(state.rep / 30) + Math.min(3, tier) - 1;

// Once you've picked a job, word gets round: whoever the job needs turns up too.
function jobArrivals(state, rng, quality) {
  const pub = state.pub;
  masterArrives(state, rng);
  // A step that wants someone small (or big): there's always someone that size about.
  const sized = state.job?.stages.find((st) => st.needsSize);
  if (sized && ![...pub, ...state.crew].some((id) => sizeOf(state.dogs[id]) === sized.needsSize)) {
    const d = genDog(state, rng, { quality, size: sized.needsSize });
    state.dogs[d.id] = d;
    pub.push(d.id);
  }
  // A job with a specialist step always has someone in the pub who's up to it (at a price).
  const sp = state.job?.stages.find((st) => st.needs && !st.master);
  if (sp && !pub.some((id) => skillOf(state.dogs[id], sp.needs.skill) >= sp.needs.min)) {
    const d = genDog(state, rng, { quality, primary: sp.needs.skill });
    d.skills[sp.needs.skill] = Math.max(d.skills[sp.needs.skill], sp.needs.min);
    d.fee = feeFor(d);
    state.dogs[d.id] = d;
    pub.push(d.id);
  }
  // One of the Inspector's coppers, if he's planted one since the pub was last drawn.
  if (state.inspector?.plant) {
    const d = genDog(state, rng, { quality, undercover: true });
    state.dogs[d.id] = d;
    pub.push(d.id);
    state.inspector.plant = false;
  }
  const star = starVisit(state, rng);
  if (star && !pub.includes(star.id)) pub.unshift(star.id);
  // The four-star job's master is in the pub for as long as they're in town.
  const ms = state.dogs[state.job?.masterStar];
  if (ms && ms.status === 'free' && ms.inTown === state.townKey && !pub.includes(ms.id)) pub.unshift(ms.id);
  pruneStrangers(state, pub);
}

// Taking a job: the faces you saw from the job board are still there.
function pubForJob(state, rng = rngOf(state)) {
  const was = state.townKey;
  state.townKey = state.job.id;
  if (state.starRolled === was) state.starRolled = state.job.id; // one chance of a star per job
  for (const id of state.pub) {
    const d = state.dogs[id];
    if (isVisitor(d) && d.inTown === was) d.inTown = state.job.id;
  }
  state.pub = state.pub.filter((id) => state.dogs[id]?.status === 'free' && !state.crew.includes(id));
  if (!state.pub.length) return refreshPub(state, rng);
  jobArrivals(state, rng, pubQuality(state, state.job.tier));
}

// A four-star job brings one star to town, a master of one of its master steps. Only
// one: the other masters you'll have to find yourself.
function masterArrives(state, rng) {
  const job = state.job;
  if (!job?.stages.some((st) => st.master) || job.masterStar) return;
  // They fill a gap if there is one: a master you don't already know.
  const known = bookDogs(state).filter((d) => d.status === 'free' || state.crew.includes(d.id));
  const gaps = mastersMissing(state, known);
  const sk = rng.pick(gaps.length ? gaps : job.stages.filter((st) => st.master).map((st) => st.needs.skill));
  const d = master(state, rng, sk, { rarity: rng.chance(legendShare(state.rep)) ? 'legendary' : 'rare' });
  d.inTown = state.townKey;
  job.masterStar = d.id;
  state.starRolled = state.townKey; // the job's star, instead of a chance one
}

// Chance a master answers when you ask around for a four-star job: a quarter at 50
// rep (when those jobs start), rising to a half at the top.
export const masterChance = (rep) => 0.25 + Math.max(0, rep - 50) / 200;

// The job's master steps nobody among these dogs is known to be up to.
export function mastersMissing(state, dogs) {
  return (state.job?.stages || []).filter((st) => st.master)
    .map((st) => st.needs.skill)
    .filter((sk) => !dogs.some((d) => d.known.skills[sk] && skillOf(d, sk) >= MASTER_MIN));
}

// Someone who's a master of one skill, and known for it. They know what they're worth.
function master(state, rng, sk, opts = {}) {
  const d = genDog(state, rng, { quality: 2, primary: sk, ...opts });
  while (skillOf(d, sk) < MASTER_MIN) d.skills[sk] += 1;
  d.known.skills[sk] = true;
  d.fee = feeFor(d) * (opts.rarity ? 1 : 3);
  state.dogs[d.id] = d;
  return d;
}

// Chance a rare or legendary dog is in town for a job, and how often that star is legendary.
export const starChance = (rep) => 0.12 + rep / 250;
const legendShare = (rep) => clamp((rep - 20) / 120, 0.05, 0.5);

// Stars drift into town for one job at a time. The first job always gets one,
// with a signature move that fits it, as a taste of what's out there.
function starVisit(state, rng) {
  const job = state.job;
  const key = state.townKey;
  const here = Object.values(state.dogs).find((d) => isVisitor(d) && d.inTown === key && d.status === 'free');
  if (here || state.starRolled === key) return here || null;
  const teaser = !state.teased;
  // The first-job teaser waits until there's a job, so its move fits it.
  if (teaser && !job) return null;
  state.starRolled = key;
  if (!teaser && !rng.chance(starChance(state.rep))) return null;
  state.teased = true;
  const returning = Object.values(state.dogs).filter((d) => isVisitor(d) && d.met && d.status === 'free');
  let d;
  if (!teaser && returning.length && rng.chance(0.5)) d = rng.pick(returning);
  else {
    const rarity = !teaser && rng.chance(legendShare(state.rep)) ? 'legendary' : 'rare';
    const fitting = job ? Object.keys(SIGNATURES).filter((id) => visibleStages(job).some((st) => signatureFits(id, st))) : [];
    const primary = teaser && fitting.length ? SIGNATURES[rng.pick(fitting)].skill : undefined;
    d = genDog(state, rng, { quality: 2, rarity, primary, signature: teaser });
    state.dogs[d.id] = d;
  }
  d.inTown = key;
  return d;
}

// ------------------------------------------------------------------ helpers
export function crewDogs(state) {
  return state.crew.map((id) => state.dogs[id]);
}
export function bookDogs(state) {
  return Object.values(state.dogs).filter((d) => d.met);
}
function spend(state, amount, cat) {
  if (state.cash < amount) return false;
  book(state, cat, -amount);
  return true;
}
function useDay(state) {
  if (state.job.daysLeft <= 0) return false;
  state.job.daysLeft -= 1;
  state.day += 1;
  return true;
}
// Pay for something that takes a day of the job's window. Checks both before
// spending either; returns a failure to hand back, or null once it's paid for.
function payForDay(state, cost, cat, tooDear) {
  if (state.cash < cost) return fail(tooDear);
  if (!useDay(state)) return fail('No days left before the job.');
  book(state, cat, -cost);
  return null;
}

export function inspectorLabel(heat) {
  if (heat >= 100) return 'Knock knock.';
  if (heat >= 80) return 'Closing in';
  if (heat >= 60) return 'Pinning photos to a corkboard';
  if (heat >= 40) return 'Has a file on you';
  if (heat >= 20) return 'Heard whispers';
  return 'Doesn\'t know you exist';
}

// ------------------------------------------------------------------ recruiting
// Why this dog can't be hired right now (anything but the money), or null if they can.
export function hireProblem(state, d) {
  if (!d) return 'No such dog.';
  if (state.phase !== 'plan') return 'Not now.';
  if (state.crew.includes(d.id)) return 'Already on the crew.';
  if (d.status === 'hospital') return `${shortName(d)} is in hospital for ${d.hospital.jobs} more job${d.hospital.jobs > 1 ? 's' : ''}.`;
  if (d.status !== 'free') return `${shortName(d)} isn't available.`;
  if (state.crew.length >= MAX_CREW) return 'Crew\'s full. Six is plenty.';
  if (state.rep < d.minRep && d.relation < 30) return `"I don't work with amateurs." (${shortName(d)} wants rep ${d.minRep}+)`;
  if (d.relation <= -30) return `${shortName(d)} won't work for you. Not after last time.`;
  if (hireBlocked(state, d)) return `"Nothing personal. ${GROUPS[d.faction].name} say no." ${shortName(d)} won't work for you.`;
  if (d.drama?.away) return `${shortName(d)} is sitting this one out.`;
  if (isVisitor(d) && d.inTown !== state.job.id) return `${shortName(d)} is out of town. Stars come and go.`;
  if (d.undercover && d.known.undercover) return `${shortName(d)} works for the Inspector. Not a chance.`;
  return null;
}

export function hire(state, id) {
  const d = state.dogs[id];
  const problem = hireProblem(state, d);
  if (problem) return fail(problem);
  const cost = hireCost(state, d);
  if (!spend(state, cost, 'crew')) return fail('You can\'t afford the retainer.');
  d.status = 'crew';
  d.met = true;
  state.crew.push(id);
  state.pub = state.pub.filter((x) => x !== id);
  const opens = d.signature ? visibleStages(state.job).filter((st) => signatureFits(d.signature, st)) : [];
  return done(`${shortName(d)} is in. (£${cost} retainer)${opens.length ? ` ✨ New option: ${opens.map((st) => st.label).join(', ')}.` : ''}`);
}

export function dismiss(state, id) {
  const d = state.dogs[id];
  if (!state.crew.includes(id) || state.phase !== 'plan') return fail('Not on the crew.');
  leaveCrew(state, id);
  d.status = 'free';
  addRelation(d, -3);
  for (const [k, p] of Object.entries(state.job.plan)) if (p && p.dog === id) delete state.job.plan[k];
  if (state.job.insider === id) state.job.insider = null;
  return done(`${shortName(d)} is off the job. The retainer's not coming back.`);
}

export function askAround(state) {
  if (!useDay(state)) return fail('No days left before the job.');
  const rng = rngOf(state);
  refreshPub(state, rng);
  // Word of a four-star job gets round: now and then a master turns up for a step nobody's covering.
  const gaps = mastersMissing(state, [...crewDogs(state), ...state.pub.map((id) => state.dogs[id])]);
  let heard = '';
  if (gaps.length && rng.chance(masterChance(state.rep))) {
    const sk = rng.pick(gaps);
    const d = master(state, rng, sk);
    state.pub.unshift(d.id);
    heard = `Word's got round about the job, and ${shortName(d)} turns up. They say ${shortName(d)} ${SKILL_INFO[sk].rumour}.`;
  }
  const gossip = crewDogs(state).find((d) => hasSpecial(d, 'gossip'));
  if (gossip) {
    for (const id of state.pub) {
      const d = state.dogs[id];
      const s = rng.pick(SKILLS);
      d.known.skills[s] = true;
    }
    return done(`New faces at the pub. ${shortName(gossip)} has the gossip on all of them.${heard ? ` ${heard}` : ''}`);
  }
  return done(heard || 'You spend the day at the pub. New faces drift in.');
}

// ------------------------------------------------------------------ job selection
export function acceptOffer(state, offerId) {
  if (state.phase !== 'select') return fail('Not now.');
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail('That offer\'s gone.');
  state.job = offer.job;
  const p = state.job.patron;
  if (p?.front) book(state, 'front', p.front);
  if (state.sabotage) {
    raiseAlert(state.job, 'Someone tipped off security', state.sabotage);
    state.sabotage = 0;
  }
  state.offers = [];
  state.phase = 'plan';
  tookRivalJob(state, state.job, false);
  tookRunnerJob(state, state.job);
  if (p?.deal === 'amends') state.groups[p.group].amends = null;
  gatecrash(state, state.job);
  pubForJob(state);
  const who = p ? GROUPS[p.group].name : 'your own lead';
  news(state, `You took ${state.job.name} (${who}).`);
  return done(p?.front ? `${state.job.name}: you're on. ${GROUPS[p.group].short} fronted you £${p.front}.` : `${state.job.name}: you're on.`);
}

export function digLeads(state) {
  if (state.phase !== 'select') return fail('Not now.');
  if (!spend(state, PRICES.leads, 'intel')) return fail(`A round of drinks for tips costs £${PRICES.leads}.`);
  rerollOwnLeads(state, rngOf(state));
  return done('You buy a round and listen. Two fresh leads.');
}

export function borrow(state) {
  if (state.phase !== 'select') return fail('Not now.');
  return borrowFromFamily(state);
}

export { payDebt } from './groups.js';
export { chooseDrama };

export const chooseInspector = (state, i) => answerInspector(state, i, rngOf(state));
export const retireNow = (state) => retire(state, rngOf(state));
export const makeAmends = (state, gid, how) => amendsWith(state, rngOf(state), gid, how);
export const chooseRunner = (state, i) => answerRunner(state, i, rngOf(state), { genJob });
export const runnerAction = (state, dogId, effect) => actOnRunner(state, dogId, effect, rngOf(state), { genJob });
export const chooseRival = (state, i) => answerRival(state, i, rngOf(state), { genJob });

// The scene at the front of the queue, answered by whoever's story it is.
// Outfits' scenes (no type) just have an "OK".
const ANSWER = { inspector: chooseInspector, rival: chooseRival, runner: chooseRunner, drama: chooseDrama };
export function chooseStory(state, i) {
  const answer = ANSWER[state.story[0]?.type];
  if (answer) return answer(state, i);
  state.story.shift();
  return done('');
}
export const storyChoices = (state, st) => (st.type === 'drama' ? dramaChoices(state, st) : affordable(state, st.choices || []));

// Waved away: take the last (free) choice. A drama scene just goes.
export function dismissStory(state) {
  const st = state.story[0];
  if (st && st.type !== 'drama' && ANSWER[st.type]) return chooseStory(state, st.choices.length - 1);
  state.story.shift();
  return done('');
}

// ------------------------------------------------------------------ prep
export function buy(state, kitId) {
  const k = KIT[kitId];
  if (!k) return fail('No such kit.');
  if (k.special) return fail('Not for sale. You\'ll have to find one on a job.');
  if (!k.consumable && state.kit[kitId] > 0) return fail('You already have one.');
  if (!spend(state, k.price, 'kit')) return fail('Can\'t afford it.');
  state.kit[kitId] = (state.kit[kitId] || 0) + 1;
  return done(`Bought ${k.name}.`);
}

// Security on alert makes every step harder. Each rise remembers why.
function raiseAlert(job, why, n = 1) {
  job.alert += n;
  (job.alertWhy ||= []).push(why);
}

// How a dog would do casing this job: the chance of turning up each unknown piece
// of intel (by the skill that finds it best) and of being spotted doing it.
export function caseOdds(state, d) {
  const job = state.job;
  const intelBoost = hasSpecial(d, 'intel') ? 0.15 : 0;
  const finds = Object.keys(job.intel).filter((k) => !job.intel[k])
    .map((k) => ({ k, p: Math.min(0.9, 0.1 + 0.16 * skillOf(d, INTEL[k].skill) + intelBoost) }));
  const cover = Math.max(skillOf(d, 'sneak'), skillOf(d, 'disguise'));
  return { finds, expected: finds.reduce((a, f) => a + f.p, 0), spotted: Math.max(0.03, 0.35 - 0.08 * cover) };
}

const CASE_MAX = 3;
export function caseJoint(state, who) {
  const job = state.job;
  const unknown = Object.keys(job.intel).filter((k) => !job.intel[k]);
  if (!unknown.length) return fail('You know everything there is to know.');
  const rng = rngOf(state);
  if (who === 'tipster') {
    const unpaid = payForDay(state, PRICES.tipster, 'intel', `The tipster wants £${PRICES.tipster}.`);
    if (unpaid) return unpaid;
    const k = rng.pick(unknown);
    revealIntel(job, k);
    return done(`A tipster sells you: ${intelLabel(job, k)}.`, { revealed: [k] });
  }
  const d = state.dogs[who];
  if (!d || !state.crew.includes(who)) return fail('Send someone from the crew.');
  const unpaid = payForDay(state, PRICES.case, 'intel', `Expenses are £${PRICES.case}.`);
  if (unpaid) return unpaid;
  const odds = caseOdds(state, d);
  if (hasSpecial(d, 'intel')) {
    const t = d.talents.find((x) => ['radio', 'bloodhound', 'casing'].includes(x));
    if (t && !d.known.talents.includes(t)) d.known.talents.push(t);
  }
  // Each piece of intel turns up on its own roll; the best bet always does.
  let got = rng.shuffle(odds.finds).filter((f) => rng.chance(f.p)).map((f) => f.k).slice(0, CASE_MAX);
  if (!got.length) got = [odds.finds.slice().sort((a, b) => b.p - a.p)[0].k];
  for (const k of got) {
    revealIntel(job, k);
    d.known.skills[INTEL[k].skill] = true;
  }
  let msg = `🔎 ${got.map((k) => intelLabel(job, k)).join(', ')}`;
  const spotted = rng.chance(odds.spotted);
  const cover = skillOf(d, 'sneak') >= skillOf(d, 'disguise') ? 'sneak' : 'disguise';
  d.known.skills[cover] = true;
  if (spotted) {
    raiseAlert(job, `${shortName(d)} was spotted casing the joint`);
    msg += ` · 👀 ${shortName(d)} was spotted! Security's on alert: every step +1 harder`;
  }
  return done(msg, { revealed: got, spotted });
}

// A tipster who knows the one thing you're after. Dearer than pot luck.
export function tipFor(state, k) {
  const job = state.job;
  if (!(k in job.intel)) return fail('Nobody knows anything about that here.');
  if (job.intel[k]) return fail('You already know that.');
  const unpaid = payForDay(state, PRICES.tipFor, 'intel', `The tipster wants £${PRICES.tipFor}.`);
  if (unpaid) return unpaid;
  revealIntel(job, k);
  return done(`A tipster sells you: ${intelLabel(job, k)}.`, { revealed: [k] });
}

export function surveil(state, id) {
  const d = state.dogs[id];
  if (!d) return fail('No such dog.');
  if (d.known.loyalty && (d.known.undercover || d.cleared)) return fail(`You already know all about ${shortName(d)}.`);
  const unpaid = payForDay(state, PRICES.surveil, 'intel', `Surveillance costs £${PRICES.surveil}.`);
  if (unpaid) return unpaid;
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
  if (job.noInsider) return fail('No way to get anyone inside on this one.');
  if (!state.crew.includes(id)) return fail('Pick someone from the crew.');
  if (job.insider) return fail('You already have someone inside.');
  const unpaid = payForDay(state, PRICES.insider, 'fixer', `Costs £${PRICES.insider} for a fake reference.`);
  if (unpaid) return unpaid;
  const rng = rngOf(state);
  const s = Math.max(skillOf(d, 'disguise'), skillOf(d, 'charm'));
  d.known.skills[skillOf(d, 'disguise') >= skillOf(d, 'charm') ? 'disguise' : 'charm'] = true;
  if (rng.chance(baseOdds(s, job.base - 1))) {
    job.insider = id;
    return done(`${shortName(d)} gets a job at ${job.venueName} as a cleaner. They're on the inside.`);
  }
  raiseAlert(job, `${shortName(d)} flunked a job interview there`);
  return done(`${shortName(d)}'s interview goes badly. Security's been told to look out for "a suspicious applicant".`);
}

export function bribeGuard(state) {
  const job = state.job;
  if (!job.stages.some((s) => s.id === 'obs_guards')) return fail('There are no guards to bribe.');
  if (job.bribed) return fail('Already bribed.');
  const cost = PRICES.bribe * job.tier;
  if (!spend(state, cost, 'fixer')) return fail(`The guard wants £${cost}.`);
  const rng = rngOf(state);
  if (rng.chance(0.75)) {
    job.bribed = true;
    return done(`A night guard pockets £${cost} and agrees to look the other way.`);
  }
  addHeat(state, 6);
  return done(`The guard takes your £${cost}... and tells his sergeant. (+6 heat)`);
}

// The fixer's simple services (data.js FIXER): pay, and it's sorted.
function fixerService(state, id) {
  const f = FIXER[id];
  const job = state.job;
  if (job[f.flag]) return fail(f.already);
  if (f.day) {
    const unpaid = payForDay(state, f.price, 'fixer', f.tooDear);
    if (unpaid) return unpaid;
  } else if (!spend(state, f.price, 'fixer')) return fail(f.tooDear);
  job[f.flag] = true;
  return done(f.msg(job));
}
export const buySafehouse = (state) => fixerService(state, 'safehouse');
export const buyFakeIds = (state) => fixerService(state, 'fakeids');
export const lineUpBuyer = (state) => fixerService(state, 'buyer');
export const vetFence = (state) => fixerService(state, 'vet');
export function layLow(state) {
  const unpaid = payForDay(state, PRICES.layLow, 'fixer', `Lying low costs £${PRICES.layLow}.`);
  if (unpaid) return unpaid;
  const before = state.heat;
  addHeat(state, -8);
  return done(`You keep your head down. The Inspector's trail goes cold (-${before - state.heat} heat).`);
}

// ------------------------------------------------------------------ planning
// Your calling card on the job: one more clue for the Inspector, but some people notice style.
export function toggleCallingCard(state) {
  if (state.phase !== 'plan') return fail('Not now.');
  state.job.callingCard = !state.job.callingCard;
  return done(state.job.callingCard ? '🃏 The crew will leave your calling card: a monogrammed biscuit.' : 'No calling card this time.');
}

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
  const crew = crewDogs(state);
  if (next.approach && !stageOptions(stage, crew).includes(next.approach)) return fail('Not an option here.');
  if (next.dog && !state.crew.includes(next.dog)) return fail('Not on the crew.');
  // A signature move goes to its owner.
  if (next.approach && next.dog && !canDo(state.dogs[next.dog], next.approach)) {
    const a = APPROACHES[next.approach];
    if (!patch.approach) return fail(a.size ? `That needs someone ${a.size === 'small' ? 'small' : 'big'}.` : `Only ${SIGNATURES[a.signature].name} can pull that off.`);
    const who = crew.find((d) => canDo(d, next.approach));
    if (!who) return fail(a.size ? `Nobody on the crew is ${a.size === 'small' ? 'small enough' : 'big enough'}.` : 'Nobody on the crew can.');
    next.dog = who.id;
  }
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
  if (!approach || !approachAvailable(state, job, approach).ok || !canDo(d, approach)) {
    approach = bestAssignment(state, job, stage, { crew: [d], approaches: stageOptions(stage, crewDogs(state)), score: planScore })?.ap;
  }
  job.plan[stageId] = { approach, dog: dogId };
  return done(`${shortName(d)} is on ${stage.label}.`);
}

// Who on the crew looks best for an approach, on what you know of them
// (an unknown skill counts for half).
export function bestDogFor(state, stageId, ap) {
  const job = state.job;
  const stage = job.stages.find((s) => s.id === stageId);
  const crew = crewDogs(state);
  return bestAssignment(state, job, stage, { crew, approaches: [ap], available: () => true, ctx: { crew }, score: planScore })?.d.id || null;
}

// Fill any gaps in the plan with the best-looking choice using *known* info,
// falling back to anyone for unknowns.
export function autoPlan(state) {
  const job = state.job;
  const crew = crewDogs(state);
  if (!crew.length) return fail('Hire a crew first.');
  for (const stage of visibleStages(job)) {
    const cur = job.plan[stage.id] || {};
    if (cur.approach && cur.dog && approachAvailable(state, job, cur.approach).ok && state.crew.includes(cur.dog) && canDo(state.dogs[cur.dog], cur.approach)) continue;
    const best = bestAssignment(state, job, stage, { crew, ctx: { crew }, score: planScore });
    if (best) job.plan[stage.id] = { approach: best.ap, dog: best.d.id };
  }
  return done('The crew pencils in a plan.');
}

export function planProblems(state) {
  const job = state.job;
  const probs = [];
  if (!state.crew.length) probs.push('No crew.');
  for (const stage of visibleStages(job)) {
    const p = job.plan[stage.id];
    if (!p || !p.approach || !p.dog) { probs.push(`${stage.label}: nothing planned.`); continue; }
    const av = approachAvailable(state, job, p.approach);
    if (!av.ok) probs.push(`${stage.label}: ${av.reason}.`);
  }
  for (const [k, n] of Object.entries(kitShort(state))) probs.push(`Plan uses ${n + (state.kit[k] || 0)}× ${KIT[k].name}, you have ${state.kit[k] || 0}.`);
  return probs;
}

// Consumables the plan uses more of than you've got: { kitId: how many more }.
export function kitShort(state) {
  const need = {};
  for (const stage of visibleStages(state.job)) {
    const nk = APPROACHES[state.job.plan[stage.id]?.approach]?.needKit;
    if (nk && KIT[nk].consumable) need[nk] = (need[nk] || 0) + 1;
  }
  const short = {};
  for (const [k, n] of Object.entries(need)) if ((state.kit[k] || 0) < n) short[k] = n - (state.kit[k] || 0);
  return short;
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
      if (L.nerve) d.known.nerve = true;
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
  // Leaders and wildcards grow into it on jobs they get away from.
  for (const id of r.escaped) {
    const d = state.dogs[id];
    if (d.role && d.role.level < 5 && rng.chance(0.25)) {
      d.role.level += 1;
      improved.push({ id, role: d.role.kind });
    }
  }
  bump(state, 'arrests', r.captured.length);
  bump(state, 'runners', r.runners.length);
  bump(state, 'lost', (r.lost || []).length);
  bump(state, 'hospital', (r.hurt || []).length);
  for (const c of r.captured) {
    const d = state.dogs[c.id];
    sendDown(d, c.sentence);
    d.talked = c.talked;
    d.caughtJob = job.id;
    addRelation(d, c.talked ? -10 : 10);
    leaveCrew(state, c.id);
  }
  for (const h of r.hurt || []) {
    const d = state.dogs[h.id];
    const bill = admit(d, h, job.id);
    leaveCrew(state, h.id);
    news(state, `${displayName(d)} is in hospital after ${job.name}. The bill: ${money(bill)}.`);
  }
  for (const l of r.lost || []) {
    const d = state.dogs[l.id];
    d.status = 'farm';
    d.lostOn = job.name;
    leaveCrew(state, l.id);
    news(state, `${displayName(d)} went to live on a farm after ${job.name}.`);
  }
  for (const run of r.runners) {
    const d = state.dogs[run.id];
    d.status = 'gone';
    d.relation = -100;
    d.left = 'runner';
    d.ranWith = lootItem(job, run.lootId).name;
    leaveCrew(state, run.id);
    // They don't just vanish: they become someone to hunt down.
    newRunner(state, d, d.ranWith, lootItem(job, run.lootId).value, rng);
    news(state, `${displayName(d)} did a runner with ${inSentence(lootItem(job, run.lootId).name)}.`);
  }
  for (const id of [...r.exposed, ...r.tipped]) {
    const d = state.dogs[id];
    d.status = 'gone';
    d.known.undercover = true;
    leaveCrew(state, id);
  }
  // Crew who've made a name for themselves move up: rare, then legendary.
  const promoted = [];
  for (const id of r.escaped) {
    const d = state.dogs[id];
    if (!earnedPromotion(d)) continue;
    promoted.push({ id, to: promote(d, state) });
    state.stats.promoted = (state.stats.promoted || 0) + 1;
    news(state, `${displayName(d)} has made a name for themselves: ${d.rarity}, ✨ ${SIGNATURES[d.signature].name}.`);
  }
  // Special kit found on the job is yours to keep, if they got into the goods.
  const prize = job.prize && r.secured.length ? job.prize : null;
  if (prize) {
    state.kit[prize] = KIT[prize].uses || 1;
    news(state, `You kept the ${KIT[prize].name} from ${job.name}.`);
  }
  addHeat(state, r.heatGain);
  // Who the crew are to each other now: closer after a job done right, strained after a botch.
  const bondNews = settleBonds(state, r);
  const noted = recordMO(state, r);
  const securedValue = r.secured.reduce((s, id) => s + lootItem(job, id).value, 0);
  const want = job.patron?.want;
  const step = want && r.secured.includes(want) ? 'deliver' : r.secured.length ? 'fence' : 'pay';
  state.after = { step, securedValue, received: 0, gross: 0, fence: null, sting: false, cut: null, grade: null, repDelta: 0, delivered: null, patronCut: 0, relations: [] };
  state.after.headline = headline(state);
  state.after.bonds = bondNews;
  state.after.improved = improved;
  state.after.promoted = promoted;
  state.after.prize = prize;
  state.after.noted = noted;
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
  // Front money was an advance against the fee. A marker clears the debt instead.
  const pay = Math.max(0, p.fee - (p.front || 0));
  a.received += pay;
  a.gross += p.deal === 'marker' ? p.debtClear : p.fee;
  book(state, 'commission', pay);
  state.stats.earned += pay;
  a.step = toFence(state).length ? 'fence' : 'pay';
  const G = GROUPS[p.group];
  const item = inSentence(lootItem(state.job, p.want).name);
  if (p.deal === 'marker') return done(`${G.boss} takes ${item}. Your debt is squared.`);
  return done(`${G.boss} takes ${item} and pays ${money(pay)}${p.front ? ` (${money(p.fee)} less the £${p.front} advance)` : ''}.`);
}

export function fenceRate(state, fenceId) {
  const job = state.job;
  const f = FENCES[fenceId];
  const bonus = crewDogs(state).some((d) => hasSpecial(d, 'fence')) ? 0.1 : 0;
  let total = 0;
  for (const id of toFence(state)) {
    const l = lootItem(job, id);
    total += l.value * Math.min(1, f.rates[l.kind] + (fenceId === 'collector' ? 0 : bonus));
  }
  return roundTo(total);
}

export function fence(state, fenceId) {
  const a = state.after;
  if (!a || a.step !== 'fence') return fail('Nothing to fence.');
  if (!FENCES[fenceId]) return fail('No such fence.');
  if (fenceId === 'collector' && !state.job.buyer) return fail('The Collector only deals by appointment. You didn\'t line him up.');
  a.fence = fenceId;
  if (fenceId === 'francesca' && state.job.stingFence) {
    a.sting = true;
    addHeat(state, 20);
    news(state, 'Fancy Francesca was a police sting. The loot is gone, and the Inspector has photos.');
    a.step = 'pay';
    return done('It\'s a STING! Francesca flashes a warrant card. You barely get out the back door. (+20 heat)');
  }
  const got = fenceRate(state, fenceId);
  a.gross += got;
  const p = state.job.patron;
  let msg = `${FENCES[fenceId].name} pays ${money(got)}.`;
  let net = got;
  if (p?.cut) {
    a.patronCut = Math.min(got, Math.round((got * p.cut) / 100) + (p.front || 0)); // their cut, plus the advance back
    net -= a.patronCut;
    msg += ` ${GROUPS[p.group].name} take their ${p.cut}%: ${money(a.patronCut)}.`;
  }
  a.received += net;
  book(state, 'fence', net);
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
  book(state, 'pay', -share);
  a.cut = pct;
  a.paid = share;
  // What you pay is what you're known for: generous or tight, soft or hard.
  if (a.received > 0) {
    const [gen, hard] = CUT_REPUTE[pct];
    addGenerosity(state, gen);
    addHardness(state, hard);
  }
  const warmth = Math.round(crewFeeling(state).warmth);
  for (const id of owed) {
    const d = state.dogs[id];
    let delta = a.received > 0 ? cut.rel : pct > 0 ? cut.rel : -2;
    if (d.quirks.includes('greedy') && pct < 45) { delta -= 8; if (!d.known.quirks.includes('greedy')) d.known.quirks.push('greedy'); }
    // Doesn't tip, doesn't want tipping: the size of the cut barely registers.
    if (d.quirks.includes('nopink') && pct !== 30) { delta = Math.max(-3, Math.min(3, delta)); if (!d.known.quirks.includes('nopink')) d.known.quirks.push('nopink'); }
    if (r.outcome !== 'bust' && r.outcome !== 'aborted') { d.wins += 1; delta += 5; }
    addRelation(d, delta + warmth);
  }
  finishGrade(state);
  a.step = 'grade';
  if (!a.received) return done('');
  return done(share ? `Paid the crew ${money(share)}.` : 'The crew gets nothing. They\'ll remember that.');
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
  const realCrew = r.crew.filter((id) => !r.exposed.includes(id) && !r.tipped.includes(id)).length;
  parts.crew = realCrew ? Math.round((15 * (r.escaped.length + 0.5 * stayedQuiet)) / realCrew) : 0;
  parts.clues = Math.max(0, 10 - r.clues);
  parts.pay = (a.cut ?? 0) >= 30 ? 5 : (a.cut ?? 0) >= 15 ? 2 : 0;
  if (!a.securedValue) { parts.stealth = Math.min(parts.stealth, 5); parts.pay = 0; }
  const score = Object.values(parts).reduce((s, v) => s + v, 0);
  const letter = score >= 93 ? 'S' : score >= 78 ? 'A' : score >= 62 ? 'B' : score >= 45 ? 'C' : score >= 28 ? 'D' : 'F';
  return { score, letter, parts };
}

const REP_FOR = { S: 14, A: 9, B: 6, C: 3, D: -1, F: -4 };
// A big name brings expectations: from 50, every job is marked down a point, from 70 two,
// from 85 three. A legend who turns in a C job loses face.
export const repExpected = (rep) => (rep >= 85 ? 3 : rep >= 70 ? 2 : rep >= 50 ? 1 : 0);
function finishGrade(state) {
  const a = state.after;
  const g = gradeJob(state);
  a.grade = g;
  a.expected = repExpected(state.rep);
  let rep = REP_FOR[g.letter] - a.expected;
  if (state.result.runners.length) rep -= 2;
  if (state.job.tier >= 4 && a.securedValue) rep += 6; // the whole town hears about a four-star job
  a.repDelta = addRep(state, rep);
  a.relations = settleGroups(state);
  state.stats.jobs += 1;
  if (g.letter === 'S') state.stats.perfect += 1;
  if (!a.securedValue) state.stats.busts += 1;
  a.headline = headline(state);
  a.rivals = [...rivalsAfterJob(state, rngOf(state)), ...runnersAfterJob(state)];
  closeBooks(state, state.job.name, g.letter);
  state.history.unshift(buildRecap(state));
  state.history.length = Math.min(state.history.length, HISTORY_MAX);
  news(state, `${state.job.name}: grade ${g.letter}. ${a.headline}`);
}

// Close the books on a job: what came in and went out since the last one, and
// where cash, rep and heat stood afterwards (for the top bar's panes).
const BOOKS_MAX = 30;
function closeBooks(state, label, grade) {
  const b = (state.books ||= { open: {}, jobs: [] });
  const net = Object.values(b.open).reduce((sum, v) => sum + v, 0);
  b.jobs.unshift({ label, grade, day: state.day, items: b.open, net });
  b.jobs.length = Math.min(b.jobs.length, BOOKS_MAX);
  b.open = {};
  timelinePoint(state, label);
}
function timelinePoint(state, label) {
  (state.timeline ||= []).push({ day: state.day, label, cash: state.cash, rep: state.rep, heat: state.heat });
  if (state.timeline.length > BOOKS_MAX + 1) state.timeline.shift();
}

function headline(state) {
  const r = state.result;
  const v = state.job.venueName.toUpperCase();
  const pick = (list) => pickBy(`${state.job.id}|${state.job.venueName}`, list);
  if (r.setup) return `STING AT ${v}: "ANYBODY COULD BE ANYBODY," SAYS INSPECTOR`;
  if (r.outcome === 'clean' && r.swap) return pick([`"QUIET NIGHT AT ${v}," SAYS MANAGER`, `NOTHING TO SEE AT ${v}. OR IS THERE?`]);
  if (state.job.tier >= 4 && ['clean', 'tidy'].includes(r.outcome)) return pick([`THE JOB OF THE CENTURY AT ${v}`, `${v}: "IT CAN'T BE DONE," THEY SAID`, `${v} RAID: INSPECTOR "IMPRESSED, FRANKLY"`]);
  if (r.outcome === 'clean') return pick([`MYSTERY AT ${v}: POLICE BAFFLED`, `${v} RAID: YARD ROUNDS UP THE USUAL SUSPECTS`, `"LIKE THEY WERE NEVER THERE," SAYS ${v} GUARD`]);
  if (r.outcome === 'tidy') return pick([`DARING RAID ON ${v}`, `${v} HIT IN THIRTY SECONDS FLAT`, `"IT WAS LIKE A FILM," SAYS ${v} NIGHT WATCHMAN`]);
  if (r.outcome === 'messy') return pick([`CHAOS AT ${v} AS GANG FLEES WITH LOOT`, `"THEY BLEW THE BLOODY DOORS OFF," SAYS ${v} STAFF`, `SNATCH! GANG GRABS WHAT IT CAN AT ${v}`]);
  if (r.outcome === 'aborted') return pick([`ATTEMPTED BREAK-IN AT ${v} FOILED`, `GANG GOES HOME EARLY FROM ${v}`]);
  return pick([`BUNGLING GANG LEAVES ${v} EMPTY-PAWED`, `LOCK, STOCK AND NO LOOT AT ${v}`, `${v} RAID: "NEVER UNDERESTIMATE THE PREDICTABILITY OF STUPIDITY"`]);
}

// ------------------------------------------------------------------ aftermath extras
export const payHospitalBill = (state, id) => payHospital(state, state.dogs[id]);

// A brief cuts a sentence, never by more than half (see justice.js).
export const lawyer = (state, id) => hireBrief(state, state.dogs[id]);

// Word travels: every dog you know feels a little better or worse about you.
function nudgeKnownDogs(state, delta, exceptId) {
  for (const o of Object.values(state.dogs)) if (o.met && o.id !== exceptId) addRelation(o, delta);
}

export function farm(state, id) {
  const d = state.dogs[id];
  if (!d || ['farm', 'gone'].includes(d.status)) return fail('Can\'t do that.');
  if (state.phase === 'heist') return fail('Not now.');
  const wasPound = d.status === 'pound';
  d.status = 'farm';
  d.farmedBy = 'you';
  leaveCrew(state, id);
  if (state.phase === 'plan' && state.job) {
    for (const [k, p] of Object.entries(state.job.plan)) if (p && p.dog === id) delete state.job.plan[k].dog;
    if (state.job.insider === id) state.job.insider = null;
  }
  state.pub = state.pub.filter((x) => x !== id);
  state.stats.farmed += 1;
  addHardness(state, d.undercover ? 5 : 15);
  if (d.undercover) {
    // Word gets round that you dealt with a copper. The underworld approves.
    d.known.undercover = true;
    const up = addRep(state, 6);
    nudgeKnownDogs(state, 3, id);
    news(state, `${displayName(d)} was a copper. Was. They've gone to live on a farm.`);
    return done(`A copper on the farm. Respect.${repNote(up)}`);
  }
  addRep(state, -8);
  nudgeKnownDogs(state, -8, id);
  if (wasPound && d.talked) addHeat(state, -5); // one less witness
  news(state, `${displayName(d)} has gone to live on a farm. Everyone's gone very quiet.`);
  return done(`${shortName(d)} has gone to the farm. (-8 rep; the crew are nervous)`);
}

export function nextJob(state) {
  if (!['plan', 'aftermath'].includes(state.phase)) return fail('Not now.');
  if (state.phase === 'aftermath' && state.after.step !== 'grade') return fail('Finish up first.');
  // A full file on you ends it here, before anything has a chance to cool off.
  if (state.heat >= 100 && checkGameOver(state)) return done('Knock knock.');
  const walkedAway = state.phase === 'plan';
  const rng = rngOf(state);
  for (const id of state.crew) state.dogs[id].status = 'free';
  state.crew = [];
  for (const d of Object.values(state.dogs)) {
    if (d.status === 'pound' && !walkedAway) {
      if (d.caughtJob === state.job?.id) { d.caughtJob = null; continue; }
      d.sentence -= 1;
      if (d.sentence <= 0) {
        d.status = 'free';
        d.sentence = 0;
        news(state, `${displayName(d)} is out of the pound${d.talked ? '. Nobody buys them a drink.' : ' and back at the bar.'}`);
      }
    }
    if (d.status === 'hospital' && !walkedAway) {
      const out = recover(state, d, state.job?.id);
      if (out) news(state, out);
    }
  }
  if (state.phase === 'plan') {
    // Walked away. Smelling a setup and walking is just good sense.
    const wager = tookRivalJob(state, state.job, true);
    if (wager) news(state, wager);
    if (state.job.sting && state.job.intel.tipster) news(state, `You smelled a rat and left ${state.job.name} well alone. The Inspector is furious.`);
    else {
      addRep(state, -3);
      news(state, `You walked away from ${state.job.name}. People talk.`);
    }
    closeBooks(state, `${state.job.name} (walked away)`, null);
    const p = state.job.patron;
    if (p) {
      const G = GROUPS[p.group];
      adjust(state, p.group, -10);
      if (p.front) {
        const g = state.groups[p.group];
        const back = Math.min(state.cash, p.front);
        book(state, 'debts', -back);
        if (back < p.front) g.debt = { amount: (g.debt?.amount || 0) + (p.front - back), patience: 2 };
      }
      news(state, `${G.boss} heard you walked away. Not a good look.`);
    }
  }
  if (!walkedAway) addHeat(state, -6);
  state.day += 1;
  state.job = null;
  state.result = null;
  state.after = null;
  for (const e of betweenJobs(state, rng)) news(state, e.replace(/\{\w+\}/g, '').trim());
  advanceArcs(state, rng);
  genOffers(state, rng);
  const move = inspectorMoves(state, rng, { genJob });
  if (move) news(state, `🕵️ ${move.title}.`);
  const rival = rivalsBetweenJobs(state, rng, { genJob });
  if (rival) news(state, `${rival.title}.`);
  for (const e of runnersBetweenJobs(state, rng)) news(state, `💨 ${e}`);
  refreshPub(state, rng);
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
    // Skint means skint: no crew, no cash, and not even the Family will lend.
    if (['plan', 'select'].includes(state.phase) && !state.crew.length && state.cash < Math.min(cheapest, 40) && !canBorrow(state)) reason = 'broke';
  }
  if (reason) {
    state.over = { reason, day: state.day, jobs: state.stats.jobs };
    state.phase = 'over';
  }
  return state.over;
}

export const GAME_OVER_TEXT = {
  inspector: { title: 'Knock Knock', text: 'The Inspector is at the door with a warrant, a smug grin and a very large file with your face on it. It\'s the pound for you, Guv\'nor.' },
  nobody: { title: 'Nobody Will Work For You', text: 'Your name is mud. The pub goes quiet when you walk in. Even the Rookie won\'t return your calls. Kibble is for closers, and you\'re not getting any.' },
  retired: { title: 'Out of the Game', text: 'You did it. A villa on the Costa del Bone, a sun lounger, and nobody knocking at six in the morning. The Dog & Duck will tell stories about you for years.' },
  broke: { title: 'Skint', text: 'Not a penny to your name and not a soul to your name either. Time to get a proper job. Everybody needs money. That\'s why they call it money.' },
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


// The city's outfits: standing, job offers, deals, debts and grudges. Pure
// logic over game state (no DOM), driven by engine.js.
import { GROUPS, VENUE_OWNERS, VENUES } from './data.js';
import { clamp, fail, done, money, addHeat, addRep, addRelation, book, roundTo, fillIn, addSabotage } from './util.js';
import { genJob, jobTier, revealIntel, totalLootValue, ownOffer, GRAND_TIER, grandReady, unknownIntel } from './heists.js';
import { makeTip } from './inspector.js';

export const GROUP_IDS = Object.keys(GROUPS);
const OWN_PITCHES = [
  'A bloke in the pub swears the back door never locks.',
  'You walked past it twice. Looked soft both times.',
  'Your old mate heard a whisper about this place.',
  'The night guard sleeps. A lot. You timed it.',
  'A cleaner owes you a favour and knows the layout.',
];

export function initGroups() {
  return Object.fromEntries(GROUP_IDS.map((g) => [g, { standing: 0, met: false, debt: null, jobs: 0 }]));
}

export function standingLabel(v) {
  if (v >= 50) return 'Trusted';
  if (v >= 20) return 'Friendly';
  if (v > -20) return 'Neutral';
  if (v > -50) return 'Hostile';
  return 'Enemy';
}

export function adjust(state, gid, delta, why, log) {
  const g = state.groups[gid];
  g.standing = clamp(g.standing + delta, -100, 100);
  if (log) log.push({ gid, delta, why, now: g.standing });
}

// Will this group put work your way?
function canDeal(state, gid) {
  return state.rep >= GROUPS[gid].minRep && state.groups[gid].standing > -50;
}

// Members of a group won't work for you if you've crossed it; friends get mates' rates.
export function hireBlocked(state, dog) {
  const g = state.groups?.[dog.faction];
  return !!g && g.standing <= -40;
}
export function hireCost(state, dog) {
  const g = state.groups?.[dog.faction];
  return g && g.standing >= 50 ? Math.max(30, roundTo(dog.fee * 0.8)) : dog.fee;
}

function ownedBy(gid) {
  return Object.entries(VENUE_OWNERS).filter(([, o]) => o.includes(gid)).map(([v]) => v);
}

function queueStory(state, gid, kind, vars = {}) {
  const G = GROUPS[gid];
  const fill = (t) => fillIn(t, vars);
  const byKind = {
    intro: { title: G.boss, text: G.intro },
    debt: { title: `You owe ${G.short}`, text: fill(G.debtText || '') },
    pressure: { title: `${G.name} lose patience`, text: G.pressure || '' },
    hostile: { title: `${G.name} strike back`, text: fill(G.hostile.text) },
    cleared: { title: 'Debt settled', text: `${G.boss} considers the matter closed. For now.` },
  };
  state.story.push({ gid, kind, ...byKind[kind] });
}

function ownLead(state, rng) {
  const tier = Math.max(1, jobTier(state) - 1);
  // Now and then a stranger slips you a juicy tip. Once the Inspector's about, some are his.
  const tip = state.stats.jobs >= 2 && rng.chance(0.15);
  const job = genJob(state, rng, { tier, lootMult: tip ? 1.4 : 0.75 });
  if (tip) makeTip(job, false);
  return ownOffer(job, { pitch: rng.pick(OWN_PITCHES) });
}

function groupOffer(state, rng, gid, forced) {
  const G = GROUPS[gid];
  const g = state.groups[gid];
  const tier = jobTier(state);
  let deal = forced || rng.weighted([['commission', 4], ['cut', 3], ['rival', G.rivals.length ? 3 : 0]]);
  let venueType;
  let owner = null;
  const mine = ownedBy(gid);
  if (deal === 'rival' || (forced === 'marker' && G.rivals.length && rng.chance(0.5))) {
    owner = rng.pick(G.rivals);
    venueType = rng.pick(ownedBy(owner));
    if (deal === 'rival') deal = rng.chance(0.5) ? 'commission' : 'cut';
  } else {
    venueType = rng.pick(Object.keys(VENUES).filter((v) => !mine.includes(v)));
    const others = (VENUE_OWNERS[venueType] || []).filter((o) => o !== gid);
    owner = others.length && rng.chance(0.35) ? rng.pick(others) : null;
  }
  // Making amends takes a proper job: their hardest, for nothing.
  const amends = deal === 'amends';
  const job = genJob(state, rng, { tier: amends ? 3 : tier, venueType, owner, lootMult: amends ? 1.2 : 1 });
  if (amends) {
    job.base += 1;
    job.name = `Making Amends: ${job.name}`;
  }
  const patron = { group: gid, deal, cut: 0, fee: 0, want: null, front: 0, debtClear: 0, rivalHit: owner && G.rivals.includes(owner) ? owner : null };
  if (deal === 'commission' || deal === 'marker' || amends) {
    const wanted = job.loot.filter((l) => G.wants.includes(l.kind));
    const item = (wanted.length ? wanted : job.loot)[0];
    patron.want = item.id;
    patron.fee = deal === 'marker' || amends ? 0 : roundTo(item.value * (1.25 + Math.max(0, g.standing) / 200), 50);
    if (deal === 'marker' || amends) patron.debtClear = g.debt?.amount || 0;
  } else {
    patron.cut = g.standing >= 50 ? 20 : g.standing >= 20 ? 25 : 30;
    // A tip-off comes with some of their intel.
    const unknown = unknownIntel(job);
    for (const k of rng.sample(unknown, 2)) revealIntel(job, k);
  }
  if (G.serious && deal !== 'marker' && !amends && rng.chance(0.5)) patron.front = 100 * tier + 100;
  job.patron = patron;
  return { id: job.id, source: gid, kind: deal, job, pitch: rng.pick(G.pitch) };
}

// Fill the job board: your own small leads, any debts being called in, and
// offers from outfits that rate you.
export function genOffers(state, rng) {
  const offers = [ownLead(state, rng), ownLead(state, rng)];
  for (const gid of GROUP_IDS) if (state.groups[gid].debt) offers.push(groupOffer(state, rng, gid, 'marker'));
  const eligible = rng.shuffle(GROUP_IDS.filter((g) => canDeal(state, g) && !state.groups[g].debt));
  for (const gid of eligible) {
    if (offers.filter((o) => o.source !== 'own').length >= 3) break;
    if (rng.chance(0.55 + state.groups[gid].standing / 200)) offers.push(groupOffer(state, rng, gid));
  }
  for (const o of offers) {
    if (o.source !== 'own' && !state.groups[o.source].met) {
      state.groups[o.source].met = true;
      queueStory(state, o.source, 'intro');
    }
  }
  // Once you've a name, now and then word gets round of a four-star job.
  if (grandReady(state) && rng.chance(0.3)) offers.push(ownOffer(genJob(state, rng, { tier: GRAND_TIER, owner: null })));
  // An amends job you haven't done yet stays on the board.
  for (const gid of GROUP_IDS) if (state.groups[gid].amends && !offers.includes(state.groups[gid].amends)) offers.unshift(state.groups[gid].amends);
  state.offers = offers;
}

// ------------------------------------------------------------------ making amends
// Once an outfit has turned on you, you can make it right: pay up (any debt plus
// interest, and something for the trouble), or do them a hard job for nothing.
const AMENDS_AT = -20;
export const canMakeAmends = (state, gid) => state.groups[gid].standing <= AMENDS_AT;
export function amendsCost(state, gid) {
  const g = state.groups[gid];
  const debt = g.debt ? roundTo(g.debt.amount * 1.25) : 0;
  return debt + Math.max(0, -g.standing) * 20;
}
export function makeAmends(state, rng, gid, how) {
  const G = GROUPS[gid];
  const g = state.groups[gid];
  if (state.phase !== 'select') return fail('Between jobs.');
  if (!canMakeAmends(state, gid)) return fail(`You're not on bad enough terms with ${G.name} to need to.`);
  if (how === 'pay') {
    const cost = amendsCost(state, gid);
    if (state.cash < cost) return fail(`${G.boss} wants ${money(cost)}.`);
    book(state, 'debts', -cost);
    g.debt = null;
    adjust(state, gid, -g.standing, 'Paid for the trouble');
    g.amends = null;
    state.offers = state.offers.filter((o) => !(o.job.patron?.deal === 'amends' && o.source === gid));
    return done(`${G.boss} counts it twice. "Consider the matter closed." (${money(cost)})`);
  }
  if (g.amends) return fail('Their job is already on the board.');
  const o = groupOffer(state, rng, gid, 'amends');
  g.amends = o;
  state.offers.unshift(o);
  return done(`${G.boss} has a job for you. A hard one. Do it, and all is forgiven.`);
}

export function rerollOwnLeads(state, rng) {
  state.offers = state.offers.filter((o) => o.source !== 'own' || o.job.rivalHit || o.job.wager || o.job.runnerHit || o.job.tier >= GRAND_TIER);
  state.offers.unshift(ownLead(state, rng), ownLead(state, rng));
}

// After grading: what the outfits make of it. Returns log lines for the aftermath.
export function settleGroups(state) {
  const job = state.job;
  const r = state.result;
  const a = state.after;
  const p = job.patron;
  const log = [];
  const identified = r.outcome !== 'clean' || r.clues >= 3 || r.captured.some((c) => c.talked) || r.tipped.length > 0;
  if (p) {
    const G = GROUPS[p.group];
    const g = state.groups[p.group];
    g.jobs += 1;
    const success = p.want ? !!a.delivered : a.securedValue > 0 && !a.sting;
    if (success) {
      adjust(state, p.group, ['S', 'A'].includes(a.grade?.letter) ? 18 : 12, 'Job done', log);
      log[log.length - 1].quote = G.thanks[state.stats.jobs % G.thanks.length];
      if (p.deal === 'amends') {
        g.debt = null;
        g.amends = null;
        const lift = Math.max(0, 15 - g.standing);
        adjust(state, p.group, lift, 'Amends made: water under the bridge', log);
      } else if (p.deal === 'marker' && g.debt) {
        g.debt = null;
        log.push({ gid: p.group, delta: 0, why: 'Debt cleared', now: g.standing });
        queueStory(state, p.group, 'cleared');
      }
      for (const rival of G.rivals) adjust(state, rival, -5, `Working for ${G.short}`, log);
    } else {
      adjust(state, p.group, -15, 'Job botched', log);
      log[log.length - 1].quote = G.angry[state.stats.jobs % G.angry.length];
      if (p.deal === 'amends') g.amends = null;
      if (G.serious && p.deal !== 'amends' && !(p.deal === 'marker' && !g.debt)) {
        const penalty = p.deal === 'marker' ? Math.round((g.debt?.amount || 0) * 0.5) : Math.round((p.fee || totalLootValue(job) * 0.15) * 0.5);
        const owed = (p.front || 0) + penalty;
        if (owed > 0) g.debt = { amount: (g.debt?.amount || 0) + owed, patience: p.deal === 'marker' ? 1 : 2 };
        if (g.debt) log.push({ gid: p.group, delta: 0, why: `You now owe them ${money(g.debt.amount)}`, now: g.standing, debt: true });
        if (g.debt) queueStory(state, p.group, 'debt', { amount: `${money(g.debt.amount)}` });
      }
    }
  }
  if (job.owner && job.owner !== p?.group && (a.securedValue > 0 || r.alarmMax > 0)) {
    adjust(state, job.owner, identified ? -25 : -8, identified ? 'You robbed them, and they know it' : 'You robbed them; they suspect you', log);
  }
  return log;
}

export function payDebt(state, gid) {
  const g = state.groups[gid];
  if (!g?.debt) return fail('You don\'t owe them anything.');
  if (state.cash < g.debt.amount) return fail(`You need ${money(g.debt.amount)}.`);
  book(state, 'debts', -g.debt.amount);
  g.debt = null;
  state.offers = state.offers.filter((o) => !(o.source === gid && o.kind === 'marker'));
  adjust(state, gid, 3, 'Paid in full');
  return done(`Paid off ${GROUPS[gid].short}. ${GROUPS[gid].boss} nods, once.`);
}

// Between jobs: debts come due and enemies make their moves.
export function betweenJobs(state, rng) {
  const events = [];
  for (const gid of GROUP_IDS) {
    const G = GROUPS[gid];
    const g = state.groups[gid];
    if (g.debt) {
      g.debt.patience -= 1;
      if (g.debt.patience < 0) {
        if (gid === 'syndicate') {
          const take = Math.min(state.cash, Math.round(g.debt.amount / 2));
          book(state, 'debts', -take);
          g.debt.amount -= take;
          addHeat(state, (take < g.debt.amount ? 10 : 5));
        } else {
          addHeat(state, 15);
        }
        g.debt.amount = roundTo(g.debt.amount * 1.2);
        g.debt.patience = 2;
        queueStory(state, gid, 'pressure');
        events.push(G.pressure);
      }
    } else if (g.standing <= -40 && rng.chance(0.35)) {
      const e = G.hostile.effect;
      const vars = {};
      if (e === 'heat') addHeat(state, 10);
      else if (e === 'cash') {
        const take = Math.round(state.cash * 0.15);
        book(state, 'raids', -take);
        vars.amount = `${money(take)}`;
      } else if (e === 'alert') addSabotage(state);
      else if (e === 'rep') addRep(state, -5);
      else if (e === 'crew') {
        const pool = Object.values(state.dogs).filter((d) => d.met && d.status === 'free');
        if (!pool.length) continue;
        const d = rng.pick(pool);
        addRelation(d, -25);
        vars.dog = d.nick || d.first;
      }
      queueStory(state, gid, 'hostile', vars);
      events.push(G.hostile.text);
    }
  }
  return events;
}

// When you're skint, the Family will always lend. At a price.
export const LOAN = { amount: 500, owe: 600, cap: 1800 };
export function canBorrow(state) {
  const g = state.groups.family;
  return g.standing > -50 && (g.debt?.amount || 0) + LOAN.owe <= LOAN.cap;
}
export function borrow(state) {
  if (state.cash >= 200) return fail('The Don only lends to the desperate.');
  if (!canBorrow(state)) return fail('The Family won\'t lend you another penny.');
  const g = state.groups.family;
  book(state, 'loan', LOAN.amount);
  g.debt = { amount: (g.debt?.amount || 0) + LOAN.owe, patience: Math.max(g.debt?.patience ?? 0, 3) };
  return done(`The Family lends you ${money(LOAN.amount)}. You owe them ${money(LOAN.owe)}.`);
}

// Balance probe: plays whole careers with a few scripted policies and prints
// grade distributions. `node tools/balance.mjs [careers]`
import * as E from '../src/engine.js';
import { APPROACHES, KIT } from '../src/data.js';
import { visibleStages } from '../src/heists.js';
import { skillOf, topSkills } from '../src/dogs.js';
import { sceneChoices } from '../src/drama.js';

export function pickOffer(s, policy) {
  if (s.phase !== 'select') return;
  // Careful players prefer a patron's deal and steer clear of angering big outfits.
  const offers = s.offers;
  const pick = policy === 'smart'
    ? offers.find((o) => o.source !== 'own' && !o.job.owner) || offers.find((o) => !o.job.owner) || offers[0]
    : offers[0];
  E.acceptOffer(s, pick.id);
}

export function smartJob(s) {
  const job = s.job;
  // Old friends first
  for (const d of E.bookDogs(s)) if (d.status === 'free' && d.relation >= 0 && !(d.known.undercover && d.undercover) && s.crew.length < 3) E.hire(s, d.id);
  const needed = () => {
    const covered = new Set(E.crewDogs(s).flatMap((d) => Object.keys(d.known.skills).filter((k) => skillOf(d, k) >= 3)));
    const miss = [];
    for (const st of visibleStages(job)) {
      const skills = st.options.filter((ap) => { const a = APPROACHES[ap]; return !a.needIntel && !a.needInsider && !a.needBribe && (!a.needKit || s.cash > KIT[a.needKit].price + 300); }).map((ap) => APPROACHES[ap].skill);
      if (!skills.some((k) => covered.has(k))) miss.push(skills);
    }
    return miss;
  };
  for (let guard = 0; guard < 4 && s.crew.length < 4; guard++) {
    const miss = needed();
    if (!miss.length) break;
    const want = new Set(miss.flat());
    const cand = s.pub.map((id) => s.dogs[id]).filter((d) => d.status === 'free' && d.fee < s.cash - 250 && (d.minRep <= s.rep) && want.has(topSkills(d, 1)[0][0]));
    if (!cand.length) break;
    E.hire(s, cand[0].id);
  }
  if (!s.crew.length) { const c = s.pub.map((id) => s.dogs[id]).filter((d) => d.fee <= s.cash).sort((a, b) => a.fee - b.fee)[0]; if (c) E.hire(s, c.id); }
  if (!s.crew.length) return;
  // Check out strangers when heat is up
  if (s.heat >= 25) for (const d of E.crewDogs(s)) if (d.jobs === 0 && s.cash > 200) { E.surveil(s, d.id); if (d.known.undercover && d.undercover) E.dismiss(s, d.id); }
  const caser = E.crewDogs(s).sort((a, b) => E.caseOdds(s, b).expected - E.caseOdds(s, a).expected)[0];
  for (let k = 0; k < 2 && s.cash > 250 && job.daysLeft > 1; k++) E.caseJoint(s, caser?.id);
  // Kit the plan wants
  E.autoPlan(s);
  for (const p of Object.values(job.plan)) { const a = APPROACHES[p.approach]; if (a.kitBonus && !s.kit[a.kitBonus] && s.cash > KIT[a.kitBonus].price + 300) E.buy(s, a.kitBonus); }
  // Kit a step can't be done without, when someone on the crew could use it.
  const known = (sk) => E.crewDogs(s).some((d) => d.known.skills[sk] && skillOf(d, sk) >= 3);
  for (const st of visibleStages(job)) {
    const want = st.options.map((ap) => APPROACHES[ap]).find((a) => a.needKit && !s.kit[a.needKit] && known(a.skill));
    if (want && s.cash > KIT[want.needKit].price + 300) E.buy(s, want.needKit);
  }
  if (s.cash > 800) E.buy(s, 'bags');
  if (s.cash > 1500 && job.daysLeft) E.lineUpBuyer(s);
  if (s.cash > 1500 && s.heat > 20) E.buySafehouse(s);
  if (job.hazards.stakeout && job.intel.hz_stakeout && job.stakeoutTime === 'night') E.setTime(s, 'day');
  for (const k of Object.keys(job.plan)) delete job.plan[k];
  E.autoPlan(s);
}

// Read the job board's scenes: careful players help out when they can spare the
// money; reckless ones stay out of it (the last choice).
export function answerStories(s, policy) {
  for (let guard = 0; guard < 20 && s.story.length; guard++) {
    const st = s.story[0];
    if (st.type !== 'drama') { E.dismissStory(s); continue; }
    const ch = sceneChoices(s, st);
    E.chooseDrama(s, policy === 'smart' && ch[0].ok && s.cash - ch[0].cost > 800 ? 0 : ch.length - 1);
  }
}

export function career(seed, policy, maxJobs = 10, onResult = null) {
  const s = E.newGame(seed);
  const grades = [];
  for (let j = 0; j < maxJobs && !s.over; j++) {
    for (const gid of Object.keys(s.groups)) if (s.groups[gid].debt && s.cash > s.groups[gid].debt.amount + 500) E.payDebt(s, gid);
    answerStories(s, policy);
    pickOffer(s, policy);
    if (policy === 'smart') smartJob(s);
    else if (s.pub.length) { const d = s.dogs[s.pub[0]]; if (d.fee <= s.cash) E.hire(s, d.id); }
    if (!s.crew.length) { E.nextJob(s); continue; }
    E.pullJob(s);
    if (onResult) onResult(s);
    E.resolveHeist(s);
    if (s.after.step === 'deliver') E.deliver(s);
    if (s.after.step === 'fence') E.fence(s, s.job.buyer ? 'collector' : 'hal');
    E.payCrew(s, policy === 'smart' && s.cash >= s.after.received * 0.3 ? 30 : 0);
    grades.push(s.after.grade.letter);
    E.nextJob(s);
  }
  return { s, grades };
}

if (process.argv[1].endsWith('balance.mjs')) {
  const n = Number(process.argv[2]) || 150;
  for (const policy of ['smart', 'reckless']) {
    const dist = {}; let overs = {}; let jobs = 0; let cash = 0;
    for (let seed = 1; seed <= n; seed++) {
      const { s, grades } = career(seed, policy);
      for (const g of grades) dist[g] = (dist[g] || 0) + 1;
      jobs += grades.length; cash += s.cash;
      if (s.over) overs[s.over.reason] = (overs[s.over.reason] || 0) + 1;
    }
    const pct = Object.fromEntries('SABCDF'.split('').map((g) => [g, ((100 * (dist[g] || 0)) / jobs).toFixed(0) + '%']));
    console.log(policy, { jobsPerCareer: (jobs / n).toFixed(1), grades: pct, gameOvers: overs, avgEndCash: Math.round(cash / n) });
  }
}

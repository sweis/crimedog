// Chaos probe: how often heists go wrong, and what that costs the crew.
// `node tools/chaos.mjs [careers]`
import { career } from './balance.mjs';
import * as E from '../src/engine.js';

export function chaosStats(n = 120, maxJobs = 10) {
  const t = { jobs: 0, pear: 0, pearWithLoss: 0, captured: 0, lost: 0, withCat: 0, surprise: 0, hazards: 0 };
  for (let seed = 1; seed <= n; seed++) {
    const s = E.newGame(seed);
    // Reuse the careful career policy, sampling each job's result as it resolves.
    const orig = E.resolveHeist;
    career(seed, 'smart', maxJobs, (st) => {
      const r = st.result;
      t.jobs++;
      const lost = (r.lost || []).length;
      t.captured += r.captured.length;
      t.lost += lost;
      if (r.pearShaped) { t.pear++; if (r.captured.length + lost > 0) t.pearWithLoss++; }
      if (st.job.hazards.cat) t.withCat++;
      if (Object.keys(st.job.hazards).length) t.hazards++;
      if (r.beats.some((b) => b.kind === 'surprise')) t.surprise++;
    });
  }
  return {
    jobs: t.jobs,
    pearShaped: (t.pear / t.jobs).toFixed(2),
    lossWhenPearShaped: (t.pearWithLoss / t.pear).toFixed(2),
    arrestsPerJob: (t.captured / t.jobs).toFixed(2),
    farmPerJob: (t.lost / t.jobs).toFixed(2),
    jobsWithHazard: (t.hazards / t.jobs).toFixed(2),
    jobsWithCat: (t.withCat / t.jobs).toFixed(2),
    surprises: (t.surprise / t.jobs).toFixed(2),
  };
}

if (process.argv[1].endsWith('chaos.mjs')) {
  const n = Number(process.argv[2]) || 120;
  console.log('first 5 jobs', chaosStats(n, 5));
  console.log('10-job careers', chaosStats(n, 10));
}

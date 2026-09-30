// Drama probe: how often crew stories start, where they lead, and how many
// regulars level up to rare or legendary. `node tools/drama.mjs [careers]`
import { career } from './balance.mjs';

export function dramaStats(n = 150, maxJobs = 12, policy = 'smart') {
  const scenes = {};
  let jobs = 0;
  let levelUps = 0;
  const stars = { rare: 0, legendary: 0 };
  for (let seed = 1; seed <= n; seed++) {
    const { s, grades } = career(seed, policy, maxJobs);
    jobs += grades.length;
    levelUps += s.stats.promoted || 0;
    for (const d of Object.values(s.dogs).filter((x) => x.homegrown)) stars[d.rarity]++;
    for (const [k, v] of Object.entries(s.stats.scenes || {})) scenes[k] = (scenes[k] || 0) + v;
  }
  const starts = Object.entries(scenes).filter(([k]) => k.endsWith('.start')).reduce((a, [, v]) => a + v, 0);
  return { careers: n, jobs, arcsPerJob: +(starts / jobs).toFixed(2), levelUpsPerCareer: +(levelUps / n).toFixed(2), homegrownPerCareer: { rare: +(stars.rare / n).toFixed(2), legendary: +(stars.legendary / n).toFixed(2) }, scenes };
}

if (process.argv[1].endsWith('drama.mjs')) {
  const n = Number(process.argv[2]) || 150;
  for (const policy of ['smart', 'reckless']) console.log(policy, dramaStats(n, 12, policy));
}

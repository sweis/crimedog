// Heist (job) generation. A job is a venue with ordered stages; each stage has
// several approaches so there are multiple ways through.
import { VENUES, VENUE_LABELS, DISTRICTS, JOB_CODEWORDS, OBSTACLES, VAULTS, ENTRY_POOL, EXIT_POOL, GETAWAY_POOL, APPROACHES } from './data.js';

const JOB_WORDS = {
  bank: ['Kibble', 'Bone Bank', 'Fiver', 'Piggy Bank'],
  museum: ['Gallery', 'Fossil', 'Masterpiece', 'Old Bones'],
  jeweller: ['Sparkler', 'Diamond Collar', 'Bling', 'Glitter'],
  mansion: ['Silver Spoon', 'Posh Nosh', 'Tiara', 'Country House'],
  casino: ['Snake Eyes', 'Jackpot', 'Lucky Paw', 'High Roller'],
  butcher: ['Sausage', 'Pork Pie', 'Mutton', 'Cold Cuts'],
  show: ['Rosette', 'Best in Show', 'Blue Ribbon', 'Crufty'],
  auction: ['Gavel', 'Going Going Gone', 'Lot 86', 'Bonehenge'],
};

function jobName(rng, venueType, star) {
  const w = rng.pick(JOB_WORDS[venueType]);
  const starName = star.name.replace(/"/g, '').replace(/^(The|A|An) /, '');
  const patterns = [
    () => `The ${w} Job`,
    () => `The Case of the ${starName}`,
    () => `Operation ${rng.pick(JOB_CODEWORDS)}`,
    () => `The Great ${VENUE_LABELS[venueType]} Caper`,
    () => `The ${w} Caper`,
    () => `Lock, Stock and Two Smoking ${rng.pick(['Bones', 'Sausages', 'Biscuits', 'Squeakies'])}`,
  ];
  const weights = [3, star.kind !== 'cash' && starName.split(' ').length <= 5 ? 3 : 0, 2, 1, 2, 0.5];
  return rng.weighted(patterns.map((p, i) => [p, weights[i]]))();
}

export function jobTier(state) {
  return Math.min(3, 1 + Math.floor(state.stats.jobs / 2) + (state.rep >= 60 ? 1 : 0));
}

export function genJob(state, rng) {
  const tier = jobTier(state);
  const venueType = rng.pick(Object.keys(VENUES));
  const V = VENUES[venueType];
  const base = 1 + tier;
  const mult = 1 + (tier - 1) * 0.7;

  // Loot
  const nLoot = rng.int(2, Math.min(4, V.loot.length));
  const loot = rng.sample(V.loot, nLoot).map(([name, kind, bulk, worth], i) => ({
    id: `l${i}`,
    name,
    kind,
    bulk,
    value: Math.round((worth * 450 * mult * rng.float(0.75, 1.3)) / 50) * 50,
  }));
  loot.sort((a, b) => b.value - a.value);
  const star = loot[0];

  // Obstacles & hazards
  const nObs = tier === 1 ? 1 : tier === 2 ? rng.int(1, 2) : 2;
  const obstacles = rng.sample(V.obstacles, Math.min(nObs, V.obstacles.length));
  const hazards = {};
  const hazardPool = ['cat', 'plates', 'silent', 'stakeout'];
  const nHaz = Math.min(hazardPool.length, rng.int(tier === 1 ? 0 : 1, tier));
  for (const h of rng.sample(hazardPool, nHaz)) hazards[h] = true;
  const stakeoutTime = rng.pick(['night', 'day']);
  const vaultType = rng.pick(V.vaults);

  // Stages
  const stages = [];
  const entry = rng.sample(ENTRY_POOL.filter((e) => e !== 'e_insider'), 3);
  if (!entry.some((e) => isUngated(e))) entry[0] = rng.pick(['e_pick', 'e_charm', 'e_delivery']);
  entry.push('e_insider');
  stages.push({ id: 'entry', kind: 'entry', label: 'Getting In', icon: '🚪', options: entry });
  for (const o of obstacles) {
    stages.push({ id: `obs_${o}`, kind: 'obstacle', label: OBSTACLES[o].label, icon: OBSTACLES[o].icon, options: OBSTACLES[o].options.slice() });
  }
  if (hazards.cat) stages.push({ id: 'haz_cat', kind: 'obstacle', label: OBSTACLES.cat.label, icon: OBSTACLES.cat.icon, options: OBSTACLES.cat.options.slice(), hidden: true, hazard: 'cat' });
  if (hazards.plates) stages.push({ id: 'haz_plates', kind: 'obstacle', label: OBSTACLES.plates.label, icon: OBSTACLES.plates.icon, options: OBSTACLES.plates.options.slice(), hidden: true, hazard: 'plates' });
  stages.push({ id: 'vault', kind: 'vault', label: VAULTS[vaultType].label, icon: VAULTS[vaultType].icon, options: VAULTS[vaultType].options.slice(), vaultType });
  const exit = rng.sample(EXIT_POOL.filter((e) => e !== 'x_same'), 2);
  exit.unshift('x_same');
  stages.push({ id: 'exit', kind: 'exit', label: 'Getting Out', icon: '🏃', options: exit });
  const getaway = rng.sample(GETAWAY_POOL, 4);
  if (!getaway.some((g) => isUngated(g))) getaway[0] = rng.pick(['g_hotwire', 'g_walk', 'g_crowd']);
  stages.push({ id: 'getaway', kind: 'getaway', label: 'The Getaway', icon: '🚗', options: getaway });

  // Intel available to discover
  const intel = {};
  if (obstacles.includes('guards')) intel.guard_rota = false;
  if (obstacles.includes('cameras')) intel.camera_map = false;
  intel.blueprints = false;
  if (vaultType !== 'case') intel.combo = false;
  if (hazards.plates) intel.plate_map = false;
  intel.loot_value = false;
  intel.escape_routes = false;
  for (const h of Object.keys(hazards)) intel[`hz_${h}`] = false;

  const heat = state.heat;
  return {
    id: `j${state.stats.jobs + 1}-${rng.int(100, 999)}`,
    name: jobName(rng, venueType, star),
    venueType,
    venueName: rng.pick(V.names),
    district: rng.pick(DISTRICTS),
    tier,
    base,
    loot,
    stages,
    intel,
    hazards,
    stakeoutTime,
    alert: 0,
    daysLeft: 5,
    insider: null,
    bribed: false,
    buyer: false,
    fenceVetted: false,
    stingFence: heat >= 40 && rng.chance(0.3 + (heat - 40) / 100),
    safehouse: false,
    fakeIds: false,
    time: 'night',
    hour: 2,
    plan: {},
  };
}

export function isUngated(approachId) {
  const a = APPROACHES[approachId];
  return !a.needKit && !a.needIntel && !a.needInsider && !a.needBribe;
}

export function visibleStages(job) {
  return job.stages.filter((s) => !s.hidden);
}

export function totalLootValue(job) {
  return job.loot.reduce((s, l) => s + l.value, 0);
}

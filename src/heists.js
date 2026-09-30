// Heist (job) generation. A job is a venue with ordered stages; each stage has
// several approaches so there are multiple ways through.
import { INTEL, VENUE_OWNERS, VENUES, VENUE_LABELS, DISTRICTS, JOB_CODEWORDS, OBSTACLES, VAULTS, ENTRY_POOL, EXIT_POOL, GETAWAY_POOL, APPROACHES, JOB_TYPES, SPECIALISTS, MARKS } from './data.js';

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

// Names that tell you what kind of job it is.
const TYPE_NAMES = {
  con: (w) => [`The ${w} Sting`, 'The Long Con', 'The Big Store', 'The Duke of Nowhere'],
  swap: (w, star) => [`The ${w} Switch`, 'The Old Switcheroo', `The Other ${star}`],
  smash: (w, star, venue) => [`Smash & Grab at the ${venue}`, `The ${w} Smash`],
  van: (w) => [`The ${w} Van Job`, 'The Armoured Car Job', `The ${w} Snatch`],
};

function jobName(rng, venueType, star, type) {
  const w = rng.pick(JOB_WORDS[venueType]);
  const small = new Set(['of', 'the', 'a', 'an', 'and', 'with', 'at', 'in']);
  const starName = star.name.replace(/"/g, '').replace(/^(The|A|An) /, '')
    .split(' ').map((w, i) => (i && small.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
  const patterns = [
    () => `The ${w} Job`,
    () => `The Case of the ${starName}`,
    () => `Operation ${rng.pick(JOB_CODEWORDS)}`,
    () => `The Great ${VENUE_LABELS[venueType]} Caper`,
    () => `The ${w} Caper`,
    () => `Lock, Stock and Two Smoking ${rng.pick(['Bones', 'Sausages', 'Biscuits', 'Squeakies'])}`,
  ];
  const weights = [3, star.kind !== 'cash' && starName.split(' ').length <= 5 ? 3 : 0, 2, 1, 2, 0.5];
  if (TYPE_NAMES[type] && rng.chance(0.75)) return rng.pick(TYPE_NAMES[type](w, starName, VENUE_LABELS[venueType]));
  return rng.weighted(patterns.map((p, i) => [p, weights[i]]))();
}

export function jobTier(state) {
  return Math.min(3, 1 + Math.floor(state.stats.jobs / 3) + (state.rep >= 60 ? 1 : 0));
}

// Hidden surprises by kind of job: [hazard, weight]. The obstacle-type ones are hidden steps.
const HAZARDS = {
  breakin: [['cat', 3], ['plates', 2], ['silent', 2], ['stakeout', 1]],
  swap: [['cat', 3], ['plates', 2], ['silent', 2], ['stakeout', 1]],
  con: [['butler', 3], ['cat', 2], ['stakeout', 0.5]],
  smash: [['hero', 3], ['cat', 2], ['stakeout', 0.5]],
  van: [['escort', 3], ['stakeout', 0.5]],
};
// Specialist steps that make sense for each kind of job.
const SPECIALS = {
  breakin: ['oldvault', 'biometric', 'wall', 'kennel', 'atrium', 'blastdoor', 'creaky'],
  swap: ['biometric', 'wall', 'kennel', 'atrium', 'creaky'],
  con: ['doorman', 'ball'],
  smash: [],
  van: ['carpark'],
};

function pickType(rng, venueType) {
  const fits = Object.entries(JOB_TYPES).filter(([, T]) => !venueType || T.venues.includes(venueType));
  return rng.weighted(fits.map(([id, T]) => [id, T.weight]));
}

// Pick n options from a pool, making sure at least one needs no kit, intel or insider.
function options(rng, pool, n, fallback) {
  const o = rng.sample(pool, Math.min(n, pool.length));
  if (!o.some(isUngated)) o[0] = rng.pick(fallback || pool.filter(isUngated));
  return o;
}

const obstacle = (id, o, extra) => ({ id, kind: 'obstacle', label: OBSTACLES[o].label, icon: OBSTACLES[o].icon, options: OBSTACLES[o].options.slice(), ...extra });
const hiddenHazards = (hazards) => Object.keys(hazards).filter((h) => OBSTACLES[h]).map((h) => obstacle(`haz_${h}`, h, { hidden: true, hazard: h }));
const vault = (vaultType, opts, extra) => ({ id: 'vault', kind: 'vault', label: VAULTS[vaultType].label, icon: VAULTS[vaultType].icon, options: opts || VAULTS[vaultType].options.slice(), vaultType, ...extra });
const exit = (rng) => ({ id: 'exit', kind: 'exit', label: 'Getting Out', icon: '🏃', options: ['x_same', ...rng.sample(EXIT_POOL.filter((e) => e !== 'x_same'), 2)] });
const getaway = (rng) => ({ id: 'getaway', kind: 'getaway', label: 'The Getaway', icon: '🚗', options: options(rng, GETAWAY_POOL, 4, ['g_hotwire', 'g_walk', 'g_crowd']) });

// Each kind of job lays out its own steps. `noSig` steps don't take signature moves
// (a phantom appearing inside is no use when there's no inside).
const LAYOUTS = {
  breakin({ rng, V, obstacles, hazards, insider }) {
    const entry = options(rng, ENTRY_POOL.filter((e) => e !== 'e_insider'), 3, ['e_pick', 'e_charm', 'e_delivery']);
    if (insider) entry.push('e_insider');
    return [
      { id: 'entry', kind: 'entry', label: 'Getting In', icon: '🚪', options: entry },
      ...obstacles.map((o) => obstacle(`obs_${o}`, o)),
      ...hiddenHazards(hazards),
      vault(rng.pick(V.vaults)),
      exit(rng),
      getaway(rng),
    ];
  },
  swap(ctx) {
    // A break-in where the goods are swapped for a decoy (most swaps need a replica).
    const stages = LAYOUTS.breakin(ctx);
    const opts = [...ctx.rng.sample(VAULTS.switch.options.filter((o) => o !== 'w_cutout'), 3), 'w_cutout'];
    stages[stages.findIndex((st) => st.id === 'vault')] = vault('switch', opts);
    return stages;
  },
  con({ rng, hazards }) {
    return [
      { id: 'entry', kind: 'entry', label: 'The Introduction', icon: '🤝', noSig: true, options: options(rng, ['c_club', 'c_charity', 'c_haunts', 'c_party'], 3) },
      { id: 'obs_pitch', kind: 'obstacle', label: 'The Pitch', icon: '🗣️', noSig: true, options: ['c_invest', 'c_duke', 'c_papers'] },
      { id: 'obs_convincer', kind: 'obstacle', label: 'The Convincer', icon: '🃏', noSig: true, options: options(rng, ['c_cards', 'c_ticket', 'c_raid', 'c_shill'], 3) },
      ...hiddenHazards(hazards),
      vault('mark', null, { noSig: true }),
      { id: 'exit', kind: 'exit', label: 'The Blow-off', icon: '👋', options: ['c_vanish', 'c_arrested', 'c_happy'] },
    ];
  },
  smash({ rng, hazards }) {
    return [
      { id: 'entry', kind: 'entry', label: 'Hit the Shop', icon: '🔨', noSig: true, options: options(rng, ['s_bin', 's_moped', 's_brick', 'e_ram'], 3) },
      ...hiddenHazards(hazards),
      vault('counter'),
      getaway(rng),
    ];
  },
  van({ rng, hazards }) {
    return [
      { id: 'entry', kind: 'entry', label: 'Stop the Van', icon: '🚦', noSig: true, options: options(rng, ['t_box', 't_roadworks', 't_granny', 't_tyres'], 3) },
      ...hiddenHazards(hazards),
      obstacle('obs_guards', 'guards'),
      vault('van'),
      getaway(rng),
    ];
  },
};

// opts: tier, venueType, owner (group id or null), lootMult (small jobs < 1), type
export function genJob(state, rng, opts = {}) {
  const tier = opts.tier ?? jobTier(state);
  const type = opts.type ?? pickType(rng, opts.venueType);
  const T = JOB_TYPES[type];
  const venueType = opts.venueType ?? rng.pick(T.venues);
  const V = VENUES[venueType];
  const base = 1 + tier;
  const mult = (1 + (tier - 1) * 0.7) * (opts.lootMult ?? 1);
  const owners = VENUE_OWNERS[venueType] || [];
  const owner = opts.owner !== undefined ? opts.owner : owners.length && rng.chance(0.45) ? rng.pick(owners) : null;

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

  // Obstacles & hazards: every job hides at least one nasty surprise.
  const nObs = tier === 1 ? 1 : tier === 2 ? rng.int(1, 2) : 2;
  const obstacles = rng.sample(V.obstacles, Math.min(nObs, V.obstacles.length));
  const hazards = {};
  const pool = HAZARDS[type].slice();
  const nHaz = tier === 1 ? 1 : tier === 2 ? rng.int(1, 2) : rng.int(2, 3);
  for (let k = 0; k < nHaz && pool.length; k++) {
    const h = rng.weighted(pool);
    hazards[h] = true;
    pool.splice(pool.findIndex(([x]) => x === h), 1);
  }
  const stakeoutTime = rng.pick(['night', 'day']);
  // Some places won't take on new staff: no inside dog.
  const insider = T.insider && !(type === 'breakin' && rng.chance(0.2));

  const stages = LAYOUTS[type]({ rng, V, obstacles, hazards, insider });
  // Sometimes one step takes a real specialist.
  const specials = SPECIALS[type];
  if (specials.length && rng.chance(tier === 1 ? 0.3 : 0.45)) {
    const sp = SPECIALISTS[rng.pick(specials)];
    const at = stages.findIndex((st) => st.kind === 'vault');
    stages.splice(at, 0, { id: 'specialist', kind: 'obstacle', label: sp.label, icon: sp.icon, options: sp.options.slice(), needs: { skill: sp.skill, min: sp.min } });
  }

  // Intel available to discover
  const has = (id) => stages.some((st) => st.id === id);
  const intel = {};
  if (has('obs_guards')) intel.guard_rota = false;
  if (has('obs_cameras')) intel.camera_map = false;
  if (['breakin', 'swap'].includes(type)) intel.blueprints = false;
  if (stages.some((st) => st.options.includes('v_combo'))) intel.combo = false;
  if (hazards.plates) intel.plate_map = false;
  if (type === 'con') intel.mark_file = false;
  if (type === 'van') intel.van_route = false;
  intel.loot_value = false;
  if (has('getaway')) intel.escape_routes = false;
  for (const h of Object.keys(hazards)) intel[`hz_${h}`] = false;

  const mark = type === 'con' ? rng.pick(MARKS) : null;
  // Brick Bone's own vault only turns up when his Firm owns the place.
  const place = rng.pick(V.names.filter((n) => owner === 'firm' || !n.includes('Brick Bone')));
  const venueName = mark ? `${mark}, at ${place}` : type === 'van' ? `${place} cash van` : place;
  const heat = state.heat;
  return {
    id: `j${state.stats.jobs + 1}-${state.nextId++}`,
    name: jobName(rng, venueType, star, type),
    type,
    venueType,
    venueName,
    mark,
    district: rng.pick(DISTRICTS),
    tier,
    base,
    owner,
    patron: null,
    loot,
    stages,
    intel,
    hazards,
    stakeoutTime,
    noInsider: !insider,
    alert: 0,
    daysLeft: 5,
    insider: null,
    bribed: false,
    buyer: false,
    fenceVetted: false,
    stingFence: heat >= 40 && rng.chance(0.3 + (heat - 40) / 100),
    safehouse: false,
    fakeIds: false,
    // A con is a daytime job: that's when marks are about.
    time: type === 'con' ? 'day' : 'night',
    hour: type === 'con' ? 14 : 2,
    plan: {},
  };
}

function isUngated(approachId) {
  const a = APPROACHES[approachId];
  return !a.needKit && !a.needIntel && !a.needInsider && !a.needBribe;
}

export function visibleStages(job) {
  return job.stages.filter((s) => !s.hidden);
}

export const lootItem = (job, id) => job.loot.find((l) => l.id === id);

export function totalLootValue(job) {
  return job.loot.reduce((s, l) => s + l.value, 0);
}

export function revealIntel(job, k) {
  job.intel[k] = true;
  const h = INTEL[k]?.hazard;
  if (h) {
    const st = job.stages.find((s) => s.hazard === h);
    if (st) st.hidden = false;
  }
}

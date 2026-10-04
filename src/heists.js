// Heist (job) generation. A job is a venue with ordered stages; each stage has
// several approaches so there are multiple ways through.
import { TWISTS, INTEL, VENUE_OWNERS, VENUES, VENUE_LABELS, DISTRICTS, JOB_CODEWORDS, OBSTACLES, VAULTS, ENTRY_POOL, EXIT_POOL, GETAWAY_POOL, APPROACHES, JOB_TYPES, SPECIALISTS, MASTERS, MASTER_MIN, MARKS, KIT } from './data.js';

const JOB_WORDS = {
  bank: ['Kibble', 'Bone Bank', 'Fiver', 'Piggy Bank', 'Bank Job', 'Heat'],
  museum: ['Gallery', 'Fossil', 'Masterpiece', 'Old Bones'],
  jeweller: ['Sparkler', 'Diamond Collar', 'Bling', 'Glitter'],
  mansion: ['Silver Spoon', 'Posh Nosh', 'Tiara', 'Country House'],
  casino: ['Snake Eyes', 'Jackpot', 'Lucky Paw', 'High Roller', 'Eleven', 'Full House'],
  butcher: ['Sausage', 'Pork Pie', 'Mutton', 'Cold Cuts'],
  show: ['Rosette', 'Best in Show', 'Blue Ribbon', 'Crufty'],
  auction: ['Gavel', 'Going Going Gone', 'Lot 86', 'Bonehenge'],
  ring: ['Knockout', 'Third Round', 'Glass Jaw', 'Southpaw', 'Fourth Round', 'One Punch'],
  train: ['Night Mail', 'Mail Bag', 'Sleeper', 'Signal Box'],
};

// Names that tell you what kind of job it is.
const TYPE_NAMES = {
  con: (w) => [`The ${w} Sting`, 'The Long Con', 'The Big Store', 'The Duke of Nowhere', 'House of Games', 'The Poodle Prisoner', 'The Tell', 'The Usual Suspects', 'Keyser Collie'],
  swap: (w, star) => [`The ${w} Switch`, 'The Old Switcheroo', `The Other ${star}`, 'The Thomas Crown Affair', 'The Real McCoy'],
  smash: (w, star, venue) => [`Smash & Grab at the ${venue}`, `The ${w} Smash`, 'Snatch', 'Gone in Sixty Seconds'],
  van: (w) => [`The ${w} Van Job`, 'The Armoured Car Job', `The ${w} Snatch`, 'Heat', 'The Wrath of the Van', 'Blow the Bloody Doors Off', 'The Self-Preservation Society'],
  hack: (w) => [`The ${w} Hack`, 'The Wire Job', 'Operation Firewall', 'The Bone-Coin Caper', 'Too Many Secrets', 'Setec Astronomy', 'The Conversation'],
  fraud: (w) => ['The Paper Trail', `The ${w} Fiddle`, 'Cooking the Books', 'The Long Lunch', 'Kibble Is for Closers', 'Always Be Closing'],
  tunnel: (w) => [`The ${w} Tunnel`, 'The Long Dig', 'The Bank Holiday Job', 'Down Under'],
  roof: (w) => [`The ${w} Rooftop Job`, 'To Catch a Thief', 'Over the Top', 'The Cat Burglar Caper', 'Entrapment'],
  fix: (w) => ['The Fix', `The ${w} Fix`, 'Take a Dive', 'Bent as a Nine Bob Note', 'Down in the Fourth', 'One Punch Mickey'],
  train: (w) => ['The Great Mail Robbery', `The ${w} Job`, 'The Night Mail', 'Last Stop', 'The Bone Express'],
};

// Four-star jobs get names to match.
const GRAND_NAMES = (w) => [`The ${w} Job of the Century`, 'The Big One', 'The Job of a Lifetime', 'One Last Job', 'The Big Score', 'The Biggest Bone in Town', 'The Masterpiece'];

function jobName(rng, venueType, star, type, grand) {
  const w = rng.pick(JOB_WORDS[venueType]);
  if (grand) return rng.pick(GRAND_NAMES(w));
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
    () => `${rng.pick(['Ocean\'s', 'Rover\'s', 'Fido\'s'])} ${rng.pick(['Eleven', 'Twelve', 'Thirteen'])}`,
    () => `The ${rng.pick(['Biscuit Tin', 'Bone Yard', 'Lead and Collar'])} Job`,
  ];
  const weights = [3, star.kind !== 'cash' && starName.split(' ').length <= 5 ? 3 : 0, 2, 1, 2, 0.5, 0.5, 0.5];
  if (TYPE_NAMES[type] && rng.chance(0.75)) return rng.pick(TYPE_NAMES[type](w, starName, VENUE_LABELS[venueType]));
  return rng.weighted(patterns.map((p, i) => [p, weights[i]]))();
}

// Your own lead on the job board (no outfit behind it).
export const ownOffer = (job, extra = {}) => ({ id: job.id, source: 'own', kind: 'own', job, ...extra });

// A job pinned to the board by someone's story (a rival's lair, a runner's hideout,
// Dan's wager). holder.board keeps it there through fresh boards until it's taken.
export function pinJob(state, holder, job) {
  holder.board = job;
  state.offers.unshift(ownOffer(job));
}
export function keepPinned(state, holder) {
  if (holder.board && !state.offers.some((o) => o.id === holder.board.id)) state.offers.unshift(ownOffer(holder.board));
}

// A four-star job: three master steps, each wanting a different skill at 8+.
export const GRAND_TIER = 4;
const mastersFor = (type) => Object.keys(MASTERS).filter((sk) => MASTERS[sk].types.includes(type));
// The kinds of job with enough master steps to make one.
export const GRAND_TYPES = Object.keys(JOB_TYPES).filter((t) => mastersFor(t).length >= 3);
// Big enough jobs, and a big enough name, before one turns up on the board.
export const grandReady = (state) => state.stats.jobs >= 8 && state.rep >= 50;

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
  hack: [['trace', 3], ['silent', 1], ['stakeout', 0.5]],
  fraud: [['auditor', 3], ['stakeout', 0.5]],
  tunnel: [['flood', 3], ['neighbour', 2], ['stakeout', 0.5]],
  roof: [['pigeons', 3], ['searchlight', 2], ['cat', 1], ['stakeout', 0.5]],
  fix: [['steward', 3], ['heavies', 2], ['stakeout', 0.5]],
  train: [['guardvan', 3], ['railpolice', 2], ['stakeout', 0.5]],
};
// Specialist steps that make sense for each kind of job.
const SPECIALS = {
  breakin: ['oldvault', 'biometric', 'wall', 'kennel', 'atrium', 'blastdoor', 'creaky'],
  swap: ['biometric', 'wall', 'kennel', 'atrium', 'creaky'],
  con: ['doorman', 'ball'],
  smash: [],
  van: ['carpark'],
  hack: ['biometric'],
  fraud: [],
  tunnel: ['oldvault', 'wall', 'kennel'],
  roof: ['wall', 'atrium', 'creaky'],
  fix: ['doorman'],
  train: ['carpark'],
};

function pickType(rng, venueType, grand) {
  const fits = Object.entries(JOB_TYPES).filter(([id, T]) => (!venueType || T.venues.includes(venueType)) && (!grand || GRAND_TYPES.includes(id)));
  return rng.weighted(fits.map(([id, T]) => [id, T.weight]));
}

// Pick n options from a pool, making sure at least one needs no kit, intel or insider.
function options(rng, pool, n, fallback) {
  const o = rng.sample(pool, Math.min(n, pool.length));
  if (!o.some(isUngated)) o[0] = rng.pick(fallback || pool.filter(isUngated));
  return o;
}

// With an rng, an obstacle offers three of its ways through (plus the bribed guard, if you pay for one).
function obstacle(id, o, extra, rng) {
  const all = OBSTACLES[o].options;
  let opts = all.slice();
  if (rng && all.length > 3) {
    opts = options(rng, all.filter((ap) => ap !== 'o_bribed'), 3);
    if (all.includes('o_bribed')) opts.push('o_bribed');
  }
  return { id, kind: 'obstacle', label: OBSTACLES[o].label, icon: OBSTACLES[o].icon, options: opts, ...extra };
}
// A vault with lots of ways in offers four of them.
const vaultOptions = (rng, vt) => (VAULTS[vt].options.length > 4 ? options(rng, VAULTS[vt].options, 4) : null);
// A step drawn from a pool: a few of its ways through, never the same mix twice.
const step = (rng, id, kind, label, icon, pool, n = 3, extra = {}) => ({ id, kind, label, icon, options: options(rng, pool, n), ...extra });
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
      ...obstacles.map((o) => obstacle(`obs_${o}`, o, {}, rng)),
      ...hiddenHazards(hazards),
      ((vt) => vault(vt, vaultOptions(rng, vt)))(rng.pick(V.vaults.filter((v) => VAULTS[v].options.length))),
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
      // Sometimes it's the big store: a whole fake bookies, built for one mark.
      ...(rng.chance(0.4) ? [{ id: 'obs_store', kind: 'obstacle', label: 'Build the Big Store', icon: '🏪', noSig: true, options: ['c_storerent', 'c_storeextras', 'c_storewire'] }] : []),
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
  hack({ rng, hazards }) {
    return [
      { id: 'entry', kind: 'entry', label: 'Get Into the Network', icon: '💻', noSig: true, options: options(rng, ['h_phish', 'h_wifi', 'h_sticky', 'h_usb'], 3) },
      { id: 'obs_server', kind: 'obstacle', label: 'The Server Room', icon: '🗄️', options: options(rng, ['h_vent', 'h_badge', 'h_tailgate', 'h_heat'], 3) },
      ...hiddenHazards(hazards),
      { id: 'obs_accounts', kind: 'obstacle', label: 'Find the Money', icon: '🔍', options: ['h_trail', 'h_query', 'h_shoulder'] },
      vault('wire', options(rng, VAULTS.wire.options, 3), { noSig: true }),
      { id: 'exit', kind: 'exit', label: 'Cover Your Tracks', icon: '🧹', noSig: true, options: ['h_wipe', 'h_scent', 'h_unplug'] },
    ];
  },
  fraud({ rng, hazards }) {
    return [
      { id: 'entry', kind: 'entry', label: 'Get a Job There', icon: '👔', noSig: true, options: options(rng, ['f_cv', 'f_interview', 'f_temp', 'f_nephew'], 3) },
      { id: 'obs_trust', kind: 'obstacle', label: 'Earn Their Trust', icon: '☕', noSig: true, options: options(rng, ['f_tea', 'f_gossip', 'f_fixpc', 'f_late'], 3) },
      ...hiddenHazards(hazards),
      { id: 'obs_fund', kind: 'obstacle', label: 'Find the Slush Fund', icon: '🗂️', options: ['f_books', 'f_files', 'f_system'] },
      vault('books', null, { noSig: true }),
      { id: 'exit', kind: 'exit', label: 'Resign Quietly', icon: '📨', noSig: true, options: ['f_notice', 'f_shred', 'f_sniffout'] },
    ];
  },
  tunnel({ rng, V, hazards }) {
    return [
      step(rng, 'entry', 'entry', 'The Shop Next Door', '🏪', ['u_lease', 'u_squat', 'u_front', 'u_cellars'], 3, { noSig: true }),
      step(rng, 'obs_dig', 'obstacle', 'The Dig', '⛏️', ['u_shovel', 'u_old', 'u_trains', 'u_bore']),
      ...hiddenHazards(hazards),
      step(rng, 'obs_wall', 'obstacle', 'Through the Wall', '🧱', ['u_core', 'u_chisel', 'u_bricks', 'u_mortar']),
      vault(V.vaults.includes('boxes') ? 'boxes' : rng.pick(V.vaults), options(rng, VAULTS.boxes.options, 3)),
      step(rng, 'exit', 'exit', 'Back Down the Hole', '🕳️', ['u_backout', 'u_brickup', 'u_laundry']),
      getaway(rng),
    ];
  },
  roof({ rng, V, hazards }) {
    return [
      step(rng, 'entry', 'entry', 'Up the Building', '🧗', ['r_drainpipe', 'r_crane', 'r_fireescape', 'r_cradle', 'r_line']),
      step(rng, 'obs_roofs', 'obstacle', 'Across the Rooftops', '🏘️', ['r_leap', 'r_plank', 'r_zip', 'r_chimneys']),
      ...hiddenHazards(hazards),
      step(rng, 'obs_skylight', 'obstacle', 'The Skylight', '🪟', ['r_glasscut', 'r_sensor', 'r_lower', 'r_warmwire']),
      ((vt) => vault(vt, vaultOptions(rng, vt)))(rng.pick(V.vaults)),
      step(rng, 'exit', 'exit', 'Away Over the Roofs', '🌙', ['r_abseil', 'r_climbout', 'r_dressinggown', 'x_same']),
      getaway(rng),
    ];
  },
  fix({ rng, V, hazards }) {
    const bets = (label) => step(rng, 'obs_bets', 'obstacle', label, '💷', ['k_spread', 'k_runners', 'k_mug', 'k_phones'], 3, { noSig: true });
    const collect = () => step(rng, 'exit', 'exit', 'Collect the Winnings', '💰', ['k_collect', 'k_quick', 'k_sniffcash'], 3, { noSig: true });
    // At the boxing club, sometimes one of the crew gets on the card and fights him.
    if (V === VENUES.ring && rng.chance(0.5)) {
      return [
        step(rng, 'entry', 'entry', 'Get on the Card', '📝', ['k_signup', 'k_sparring', 'k_record', 'k_moustache'], 3, { noSig: true }),
        step(rng, 'obs_camp', 'obstacle', 'Training Camp', '🏋️', ['k_roadwork', 'k_skipping', 'k_tapes', 'k_gloves'], 3, { noSig: true }),
        bets('Bet on Ourselves'),
        ...hiddenHazards(hazards),
        vault('fight', options(rng, ['k_slug', 'k_dance', 'k_lowblow', 'k_uppercut'], 3), { noSig: true, label: 'Into the Ring' }),
        collect(),
      ];
    }
    const nobble = step(rng, 'obs_nobble', 'obstacle', 'Nobble the Favourite', '🧪', ['k_camomile', 'k_purse', 'k_laces', 'k_word', 'k_kibble']);
    if (V === VENUES.ring && !nobble.options.includes('k_kibble')) nobble.options[rng.int(0, nobble.options.length - 1)] = 'k_kibble';
    return [
      step(rng, 'entry', 'entry', 'Get to the Favourite', '🥊', ['k_trainer', 'k_fan', 'k_window', 'k_liniment'], 3, { noSig: true }),
      nobble,
      bets('Place the Bets'),
      ...hiddenHazards(hazards),
      vault('fight', options(rng, VAULTS.fight.options, 3), { noSig: true }),
      collect(),
    ];
  },
  train({ rng, hazards, insider }) {
    const stop = step(rng, 'entry', 'entry', 'Stop the Train', '🚦', ['n_signal', 'n_cow', 'n_jumpon', 'n_cuppa'], 3, { noSig: true });
    if (insider) stop.options.push('n_fireman');
    return [
      stop,
      step(rng, 'obs_carriages', 'obstacle', 'Through the Carriages', '🚃', ['n_roofs', 'n_ticket', 'n_corridor', 'n_shoulder']),
      ...hiddenHazards(hazards),
      vault('mailcar', options(rng, VAULTS.mailcar.options, 3)),
      step(rng, 'exit', 'exit', 'Off the Train', '🔗', ['n_uncouple', 'n_drive', 'n_jumpoff']),
      getaway(rng),
    ];
  },
  van({ rng, hazards }) {
    return [
      { id: 'entry', kind: 'entry', label: 'Stop the Van', icon: '🚦', noSig: true, options: options(rng, ['t_box', 't_roadworks', 't_granny', 't_tyres'], 3) },
      ...hiddenHazards(hazards),
      obstacle('obs_guards', 'guards', {}, rng),
      vault('van'),
      getaway(rng),
    ];
  },
};

const DAY_JOBS = { con: 14, fraud: 11 };

// opts: tier, venueType, owner (group id or null), lootMult (small jobs < 1), type
export function genJob(state, rng, opts = {}) {
  const tier = opts.tier ?? jobTier(state);
  const grand = tier >= GRAND_TIER;
  const type = opts.type ?? pickType(rng, opts.venueType, grand);
  const T = JOB_TYPES[type];
  const venueType = opts.venueType ?? rng.pick(T.venues);
  const V = VENUES[venueType];
  const base = 2 + Math.min(3, tier); // a four-star job's ordinary steps are no harder than a three-star's; the masters are the thing
  const mult = (1 + (tier - 1) * 0.7) * (opts.lootMult ?? 1) * (grand ? 2.2 : 1);
  const owners = VENUE_OWNERS[venueType] || [];
  const owner = opts.owner !== undefined ? opts.owner : owners.length && rng.chance(0.45) ? rng.pick(owners) : null;

  // Loot
  const table = T.loot || V.loot;
  const nLoot = rng.int(2, Math.min(4, table.length));
  const loot = rng.sample(table, nLoot).map(([name, kind, bulk, worth], i) => ({
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
  if (grand) {
    // Three master steps before the goods, each in a different skill.
    const at = stages.findIndex((st) => st.kind === 'vault');
    const steps = rng.sample(mastersFor(type), 3).map((sk) => {
      const m = MASTERS[sk];
      return { id: `master_${sk}`, kind: 'obstacle', label: m.label, icon: m.icon, options: m.options.slice(), master: true, noSig: true, needs: { skill: sk, min: MASTER_MIN } };
    });
    stages.splice(at, 0, ...steps);
  }
  // Sometimes one step takes a real specialist.
  const specials = SPECIALS[type];
  if (!grand && specials.length && rng.chance(tier === 1 ? 0.3 : 0.45)) {
    const sp = SPECIALISTS[rng.pick(specials)];
    const at = stages.findIndex((st) => st.kind === 'vault');
    stages.splice(at, 0, { id: 'specialist', kind: 'obstacle', label: sp.label, icon: sp.icon, options: sp.options.slice(), needs: { skill: sp.skill, min: sp.min } });
  }

  // A twist, now and then (more often on bigger jobs).
  const twist = opts.twist !== undefined ? opts.twist : rng.chance([0, 0.35, 0.5, 0.65, 0.65][tier]) ? pickTwist(rng, type, stages) : null;
  let daysLeft = 5;
  let jobBase = base;
  if (twist === 'rush') daysLeft = 2;
  if (twist === 'bigger') {
    jobBase += 1;
    for (const l of loot) l.value = Math.round((l.value * 1.4) / 50) * 50;
  }
  if (twist === 'rivals') stages.splice(stages.findIndex((st) => st.kind === 'vault'), 0, obstacle('obs_rivals', 'rivals', {}, rng));

  // Your master key card opens a way into any building.
  if (state.kit?.keycard > 0 && ['breakin', 'swap'].includes(type)) stages[0].options.splice(stages[0].options.length - (insider ? 1 : 0), 0, 'e_keycard');
  // Some jobs have special kit worth keeping, besides the loot.
  const prizes = Object.keys(KIT).filter((k) => KIT[k].special && (KIT[k].from.includes(type) || KIT[k].from.includes(venueType)) && !(state.kit?.[k] > 0));
  const prize = prizes.length && rng.chance(0.4) ? rng.pick(prizes) : null;

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
  if (type === 'hack') intel.net_map = false;
  if (type === 'fraud') intel.org_chart = false;
  if (type === 'tunnel') { intel.blueprints = false; intel.tunnel_plan = false; }
  if (type === 'roof') intel.blueprints = false;
  if (type === 'fix') intel.routine = false;
  if (type === 'train') intel.timetable = false;
  intel.loot_value = false;
  if (has('getaway')) intel.escape_routes = false;
  for (const h of Object.keys(hazards)) intel[`hz_${h}`] = false;
  // Someone on the inside has already talked.
  const told = twist === 'grudge' ? rng.sample(Object.keys(intel), 2) : [];

  const mark = type === 'con' ? rng.pick(MARKS) : null;
  // Brick Bone's own vault only turns up when his Firm owns the place.
  const place = rng.pick(V.names.filter((n) => owner === 'firm' || !n.includes('Brick Bone')));
  const venueName = mark ? `${mark}, at ${place}` : type === 'van' ? `${place} cash van` : place;
  const heat = state.heat;
  const job = {
    id: `j${state.stats.jobs + 1}-${state.nextId++}`,
    name: jobName(rng, venueType, star, type, grand),
    type,
    venueType,
    venueName,
    mark,
    district: rng.pick(DISTRICTS),
    tier,
    base: jobBase,
    twist,
    ringer: stages.some((st) => st.id === 'obs_camp'),
    owner,
    patron: null,
    loot,
    stages,
    intel,
    hazards,
    stakeoutTime,
    noInsider: !insider,
    prize,
    alert: 0,
    daysLeft,
    insider: null,
    bribed: false,
    buyer: false,
    fenceVetted: false,
    stingFence: heat >= 30 && rng.chance(0.3 + (heat - 30) / 100),
    safehouse: false,
    fakeIds: false,
    // Cons and office fraud happen in the day: that's when marks and offices are about.
    time: DAY_JOBS[type] ? 'day' : 'night',
    hour: DAY_JOBS[type] || 2,
    plan: {},
  };
  for (const k of told) revealIntel(job, k);
  return job;
}

function pickTwist(rng, type, stages) {
  const fits = Object.entries(TWISTS).filter(([, t]) => (!t.types || t.types.includes(type)) && (!t.needs || stages.some((st) => st.id === t.needs)));
  return fits.length ? rng.pick(fits)[0] : null;
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

// What a piece of intel says once you have it.
export function intelLabel(job, k) {
  if (k === 'tipster') return job.sting ? '🚨 The tip is a SETUP' : '✅ The tip is genuine';
  return INTEL[k].label.replace('Hazard: ', '⚠️ ');
}

export function revealIntel(job, k) {
  job.intel[k] = true;
  const h = INTEL[k]?.hazard;
  if (h) {
    const st = job.stages.find((s) => s.hazard === h);
    if (st) st.hidden = false;
  }
}

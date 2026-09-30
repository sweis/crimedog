// Dog (crew member) generation, derived stats, and procedural SVG portraits.
import { SKILLS, TALENTS, QUIRKS, BREEDS, FACTIONS, NAMES, SURNAMES, NICKNAMES, ARCHETYPES } from './data.js';

const QUIRK_CLASHES = [['nervous', 'steel'], ['pack', 'lonewolf'], ['looselips', 'nevergrass'], ['goodboy', 'greedy'], ['sheds', 'eatsevidence']];

export function genDog(state, rng, opts = {}) {
  const breedId = opts.breed || rng.pick(Object.keys(BREEDS));
  const breed = BREEDS[breedId];
  const faction = breed.faction;
  let voice = FACTIONS[faction].voice;
  const nameKey = voice === 'neutral' ? rng.pick(['neutral', 'neutral', 'cockney', 'posh']) : voice;
  const first = rng.pick(NAMES[nameKey]);
  const last = rng.pick(SURNAMES[nameKey]);
  const nick = rng.chance(0.6) ? rng.pick(NICKNAMES) : null;

  // Skills: 0-1 baseline, breed-biased primary/secondary.
  const quality = opts.quality ?? 0; // 0..3, from rep / tier
  const skills = Object.fromEntries(SKILLS.map((s) => [s, rng.chance(0.35) ? 1 : 0]));
  const primary = rng.chance(0.75) ? rng.pick(breed.bias) : rng.pick(SKILLS);
  const secondaryPool = SKILLS.filter((s) => s !== primary);
  const biasRest = breed.bias.filter((s) => s !== primary);
  const secondary = biasRest.length && rng.chance(0.5) ? rng.pick(biasRest) : rng.pick(secondaryPool);
  skills[primary] = Math.min(5, rng.int(2, 3) + (rng.chance(0.25 + quality * 0.2) ? 1 : 0) + (quality >= 2 && rng.chance(0.3) ? 1 : 0));
  skills[secondary] = Math.max(skills[secondary], rng.int(1, 2) + (rng.chance(0.2 + quality * 0.1) ? 1 : 0));
  if (opts.undercover) {
    // Too good to be true.
    skills[primary] = 5;
    skills[secondary] = Math.max(skills[secondary], 3);
  }

  // Talents: mostly aligned with what they're good at.
  const nTalents = rng.int(2, 3) + (quality >= 2 ? 1 : 0);
  const talents = [];
  const all = Object.values(TALENTS);
  while (talents.length < nTalents) {
    const pool = rng.chance(0.7) ? all.filter((t) => t.skill === primary || t.skill === secondary) : all;
    const t = rng.pick(pool);
    if (!talents.includes(t.id)) talents.push(t.id);
  }

  // Quirks.
  const quirks = [];
  const nQuirks = rng.int(1, 2);
  const quirkIds = Object.keys(QUIRKS);
  let guard = 0;
  while (quirks.length < nQuirks && guard++ < 50) {
    const q = rng.pick(quirkIds);
    if (quirks.includes(q)) continue;
    if (QUIRK_CLASHES.some(([a, b]) => (q === a && quirks.includes(b)) || (q === b && quirks.includes(a)))) continue;
    quirks.push(q);
  }
  if (quirks.includes('mumbles')) voice = 'mumble';

  let loyalty = rng.int(20, 90);
  const nerve = rng.int(20, 90);
  let greed = rng.int(10, 80);
  if (quirks.includes('goodboy')) loyalty = Math.max(loyalty, 80);
  if (quirks.includes('greedy')) greed = Math.min(100, greed + 30);

  const archetype = rng.pick(ARCHETYPES);
  const dog = {
    id: `d${state.nextId++}`,
    first, last, nick,
    breed: breedId,
    faction,
    voice,
    skills,
    talents,
    quirks,
    loyalty,
    nerve,
    greed,
    undercover: !!opts.undercover,
    archetype: archetype.id,
    catchphrase: archetype.line,
    status: 'free', // free | crew | pound | farm | gone
    sentence: 0,
    relation: 0,
    jobs: 0,
    wins: 0,
    minRep: 0,
    fee: 0,
    look: genLook(rng, breedId, faction),
    known: { skills: { [primary]: true }, talents: [], quirks: [], loyalty: false, nerve: false, greed: false, undercover: false },
    notes: [],
  };
  dog.fee = feeFor(dog, opts.undercover);
  const power = topSkills(dog, 3).reduce((s, [, v]) => s + v, 0);
  dog.minRep = power >= 14 ? 40 : power >= 12 ? 20 : 0;
  if (opts.undercover) dog.minRep = 0;
  return dog;
}

function genLook(rng, breedId, faction) {
  const breed = BREEDS[breedId];
  const hats = {
    ze: ['peaked', 'none', 'none', 'beanie'],
    firm: ['flatcap', 'flatcap', 'none', 'beanie'],
    poodle: ['tophat', 'bowler', 'none', 'none'],
    whippet: ['flatcap', 'none', 'beanie', 'none'],
    terrier: ['flatcap', 'beanie', 'none', 'none'],
    hounds: ['bowler', 'flatcap', 'none', 'trilby'],
    indie: ['none', 'trilby', 'beanie', 'flatcap', 'bowler', 'none'],
  }[faction];
  const eyes = faction === 'poodle' ? ['monocle', 'none', 'none'] : faction === 'ze' ? ['sunglasses', 'none'] : ['none', 'none', 'none', 'sunglasses'];
  const necks = faction === 'poodle' ? ['bowtie', 'scarf', 'pearls'] : faction === 'firm' ? ['chain', 'none', 'bandana'] : ['none', 'scarf', 'bandana', 'chain', 'bowtie', 'none'];
  const outfits = {
    ze: ['#1d1d22', '#2b2b33'], firm: ['#3a4f7a', '#4b2e2e', '#2e4a3a'], poodle: ['#6b5a3e', '#34405a', '#5a2b3a'],
    whippet: ['#8a2b2b', '#2b4a6b'], terrier: ['#4a4a2b', '#6b3a2b'], hounds: ['#b39a6b', '#8a7a5a'], indie: ['#3d3d4d', '#5a4030', '#2e4f4f', '#6b2e4a'],
  }[faction];
  return {
    coat: rng.pick(breed.coats),
    hat: rng.pick(hats),
    eyes: rng.pick(eyes),
    neck: rng.pick(necks),
    outfit: rng.pick(outfits),
    brow: rng.pick(['stern', 'neutral', 'raised', 'stern']),
    seed: rng.int(1, 1e6),
  };
}

export function skillOf(dog, skill) {
  let v = dog.skills[skill] || 0;
  for (const t of dog.talents) if (TALENTS[t].skill === skill) v += TALENTS[t].bonus;
  return v;
}

export function topSkills(dog, n = 3) {
  return SKILLS.map((s) => [s, skillOf(dog, s)]).sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function hasSpecial(dog, special) {
  return dog.talents.some((t) => TALENTS[t].special === special);
}

export function feeFor(dog, cheap) {
  const power = topSkills(dog, 3).reduce((s, [, v]) => s + v, 0);
  const base = 30 + power * 18 + (dog.relation > 30 ? -20 : 0);
  return Math.max(30, Math.round((cheap ? base * 0.6 : base) / 10) * 10);
}

export function displayName(dog) {
  return dog.nick ? `${dog.first} "${dog.nick}" ${dog.last}` : `${dog.first} ${dog.last}`;
}
export function shortName(dog) {
  return dog.nick ? dog.nick.replace(/^The /, '') : dog.first;
}

export function relationLabel(dog) {
  if (dog.status === 'gone' && dog.undercover && dog.known.undercover) return 'Copper in disguise';
  if (dog.status === 'farm') return 'Gone to live on a farm';
  if (dog.status === 'gone') return 'Did a runner';
  const r = dog.relation;
  if (dog.jobs === 0 && r === 0) return 'Unknown quantity';
  if (r >= 60) return 'Trusted associate';
  if (r >= 30) return 'Solid';
  if (r >= 5) return 'Known face';
  if (r > -20) return 'Wary';
  return 'Holds a grudge';
}

export function band(v) {
  return v >= 75 ? 'Very high' : v >= 55 ? 'High' : v >= 40 ? 'Middling' : v >= 25 ? 'Low' : 'Very low';
}

// ---------------------------------------------------------------- portraits
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
}

let portraitUid = 0;

// Layered, shaded portrait. Colour comes from flat fills; form comes from
// shared overlay gradients (highlight top-left, shade bottom-right) so every
// breed/coat gets the same lighting. Ids are unique per SVG instance.
export function portraitSVG(dog, opts = {}) {
  const b = BREEDS[dog.breed];
  const L = dog.look;
  const u = `pt${++portraitUid}`;
  const coat = L.coat;
  const dark = shade(coat, -0.18);
  const line = shade(coat, lum(coat) > 0.55 ? -0.42 : -0.28);
  const ink = '#1b1b22';
  const narrow = b.narrow ? 0.85 : 1;
  const small = b.small ? 0.92 : 1;
  const hx = 50, hy = 50, rx = 25 * narrow * small, ry = 27 * small;
  const snout = b.snout;
  const sy = hy + 12 + 5 * (snout - 1), srx = 12 * (b.narrow ? 0.8 : 1) + (b.jowls ? 3 : 0), sry = 7 + 5 * snout;
  const stroke = `stroke="${line}" stroke-width="1.1" stroke-linejoin="round"`;
  const lit = `fill="url(#${u}l)"`; // overlay: lighting
  let s = '';
  s += `<defs>
    <radialGradient id="${u}bg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${opts.bg || '#efe3c8'}"/><stop offset="1" stop-color="${shade(opts.bg || '#efe3c8', -0.22)}"/></radialGradient>
    <radialGradient id="${u}l" cx="36%" cy="28%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
    <linearGradient id="${u}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(L.outfit, 0.12)}"/><stop offset="1" stop-color="${shade(L.outfit, -0.14)}"/></linearGradient>
    <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="${u}d" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>`;
  if (opts.bg !== false) {
    const r = opts.round ? 50 : 14;
    s += `<rect width="100" height="100" rx="${r}" fill="url(#${u}bg)"/>`;
    // faint pinstripe wallpaper
    s += `<path d="M20 0V100M40 0V100M60 0V100M80 0V100" stroke="#000" stroke-opacity=".035" stroke-width="3"/>`;
  }
  // Body / outfit: jacket, lapels, shirt, soft shadow under the head
  s += `<path d="M12 100 Q14 79 36 75 L64 75 Q86 79 88 100 Z" fill="url(#${u}o)" stroke="${shade(L.outfit, -0.3)}" stroke-width="1"/>`;
  s += `<path d="M40 75 L50 92 L60 75 Z" fill="#efe9dc"/><path d="M40 75 L50 92 L45 100 L33 78 Z M60 75 L50 92 L55 100 L67 78 Z" fill="${shade(L.outfit, -0.08)}" stroke="${shade(L.outfit, -0.3)}" stroke-width=".8"/>`;
  s += `<ellipse cx="50" cy="78" rx="22" ry="6" fill="url(#${u}d)"/>`;
  // Ears behind
  const ear = shade(coat, -0.12);
  if (b.ears === 'pointy') {
    for (const k of [-1, 1]) {
      s += `<path d="M${hx + k * (rx - 4)} ${hy - 6} L${hx + k * (rx - 2)} ${hy - 38} L${hx + k * 6} ${hy - 22} Z" fill="${ear}" ${stroke}/>`;
      s += `<path d="M${hx + k * (rx - 7)} ${hy - 12} L${hx + k * (rx - 6)} ${hy - 30} L${hx + k * 10} ${hy - 20} Z" fill="#e3a098"/><path d="M${hx + k * (rx - 7)} ${hy - 12} L${hx + k * (rx - 6)} ${hy - 30} L${hx + k * 10} ${hy - 20} Z" fill="url(#${u}d)"/>`;
    }
  } else if (b.ears === 'bat') {
    for (const k of [-1, 1]) {
      s += `<path d="M${hx + k * (rx - 6)} ${hy - 2} L${hx + k * (rx + 8)} ${hy - 40} L${hx + k * 4} ${hy - 20} Z" fill="${ear}" ${stroke}/>`;
      s += `<path d="M${hx + k * (rx - 6)} ${hy - 8} L${hx + k * (rx + 3)} ${hy - 32} L${hx + k * 8} ${hy - 18} Z" fill="#e6aaa2"/>`;
    }
  } else if (b.ears === 'puff') {
    s += `<g ${stroke}><circle cx="${hx}" cy="${hy - 26}" r="13" fill="${coat}"/><circle cx="${hx - 9}" cy="${hy - 22}" r="9" fill="${coat}"/><circle cx="${hx + 9}" cy="${hy - 22}" r="9" fill="${coat}"/></g><circle cx="${hx}" cy="${hy - 26}" r="13" ${lit}/>`;
  }
  // Head
  s += `<ellipse cx="${hx}" cy="${hy}" rx="${rx}" ry="${ry}" fill="${coat}" ${stroke}/>`;
  // Markings
  if (b.mask && b.maskStyle === 'blaze') {
    s += `<path d="M${hx - 4} ${hy - 26} Q${hx} ${hy - 30} ${hx + 4} ${hy - 26} L${hx + 7} ${hy + 4} L${hx - 7} ${hy + 4} Z" fill="${b.mask}"/>`;
  } else if (b.mask && !b.maskStyle) {
    s += `<path d="M${hx - rx + 2} ${hy - 4} Q${hx} ${hy - ry - 6} ${hx + rx - 2} ${hy - 4} Q${hx} ${hy - 12} ${hx - rx + 2} ${hy - 4} Z" fill="${b.mask}" opacity="0.9"/>`;
  } else if (b.mask && b.maskStyle === 'points') {
    s += `<ellipse cx="${hx - 10}" cy="${hy - 12}" rx="3.4" ry="2.4" fill="${b.mask}"/><ellipse cx="${hx + 10}" cy="${hy - 12}" rx="3.4" ry="2.4" fill="${b.mask}"/>`;
  }
  if (b.patch) s += `<ellipse cx="${hx + 10}" cy="${hy - 3}" rx="10" ry="11" fill="${b.patch}"/>`;
  if (b.spots) {
    let seed = L.seed;
    for (let i = 0; i < 9; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const a = (seed / 233280) * Math.PI * 2;
      seed = (seed * 9301 + 49297) % 233280;
      const r = 6 + (seed / 233280) * 16;
      s += `<circle cx="${(hx + Math.cos(a) * r).toFixed(1)}" cy="${(hy - 6 + Math.sin(a) * r * 0.9).toFixed(1)}" r="${2 + (i % 3)}" fill="${b.spots}"/>`;
    }
  }
  // Fur texture: a few short strokes, seeded so each dog keeps its own
  {
    let seed = L.seed * 7 + 3;
    const furCol = shade(coat, lum(coat) > 0.5 ? -0.25 : 0.2);
    for (let i = 0; i < 6; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const a = Math.PI * (0.9 + 1.2 * (seed / 233280));
      const r = rx * 0.82;
      const x = hx + Math.cos(a) * r, y = hy + Math.sin(a) * ry * 0.85;
      s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(a) * 3).toFixed(1)} ${(Math.sin(a) * 3 + 1.5).toFixed(1)}" stroke="${furCol}" stroke-width="1" stroke-linecap="round" opacity=".7"/>`;
    }
  }
  // Head lighting overlay
  s += `<ellipse cx="${hx}" cy="${hy}" rx="${rx}" ry="${ry}" ${lit}/>`;
  // Ears in front (floppy / long / rose / fold)
  if (b.ears === 'floppy' || b.ears === 'long') {
    const len = b.ears === 'long' ? 24 : 16;
    const ec = b.patch && b.ears === 'floppy' ? b.patch : shade(coat, -0.2);
    for (const k of [-1, 1]) {
      const ex0 = hx + k * (rx - 2);
      const tr = `transform="rotate(${-k * 12} ${ex0} ${hy - 6})"`;
      s += `<ellipse cx="${ex0}" cy="${hy + len / 2 - 6}" rx="8" ry="${len}" fill="${ec}" stroke="${shade(ec, -0.3)}" stroke-width="1.1" ${tr}/>`;
      s += `<ellipse cx="${ex0}" cy="${hy + len / 2 - 6}" rx="8" ry="${len}" ${lit} ${tr}/>`;
    }
  } else if (b.ears === 'rose') {
    for (const k of [-1, 1]) s += `<path d="M${hx + k * (rx - 6)} ${hy - 18} L${hx + k * (rx + 6)} ${hy - 22} L${hx + k * (rx - 2)} ${hy - 6} Z" fill="${dark}" ${stroke}/>`;
  } else if (b.ears === 'fold') {
    for (const k of [-1, 1]) {
      s += `<path d="M${hx + k * (rx - 5)} ${hy - 16} L${hx + k * (rx - 2)} ${hy - 30} L${hx + k * 8} ${hy - 22} Z" fill="${dark}" ${stroke}/><path d="M${hx + k * (rx - 2)} ${hy - 30} L${hx + k * 8} ${hy - 22} L${hx + k * (rx - 6)} ${hy - 12} Z" fill="${shade(coat, -0.28)}" ${stroke}/>`;
    }
  } else if (b.ears === 'puff') {
    for (const side of [-1, 1]) {
      const cx = hx + side * (rx + 1);
      s += `<g ${stroke}><circle cx="${cx}" cy="${hy + 6}" r="10" fill="${coat}"/><circle cx="${cx}" cy="${hy + 16}" r="9" fill="${coat}"/><circle cx="${cx - side * 2}" cy="${hy - 2}" r="7" fill="${coat}"/></g><circle cx="${cx}" cy="${hy + 10}" r="12" ${lit}/>`;
    }
  }
  // Snout
  const muzzleCol = b.mask && ['muzzle', 'points', 'blaze'].includes(b.maskStyle) ? b.mask : shade(coat, lum(coat) > 0.6 ? -0.06 : 0.12);
  const mStroke = `stroke="${shade(muzzleCol, -0.25)}" stroke-width=".9"`;
  if (b.jowls) {
    s += `<ellipse cx="${hx - 9}" cy="${sy + 5}" rx="10" ry="8" fill="${muzzleCol}" ${mStroke}/><ellipse cx="${hx + 9}" cy="${sy + 5}" rx="10" ry="8" fill="${muzzleCol}" ${mStroke}/>`;
  }
  s += `<ellipse cx="${hx}" cy="${sy}" rx="${srx}" ry="${sry}" fill="${muzzleCol}" ${mStroke}/><ellipse cx="${hx}" cy="${sy}" rx="${srx}" ry="${sry}" ${lit}/>`;
  // whisker dots
  s += `<g fill="${shade(muzzleCol, -0.35)}" opacity=".7"><circle cx="${hx - 6}" cy="${sy + 1}" r=".7"/><circle cx="${hx - 8.5}" cy="${sy - 1}" r=".7"/><circle cx="${hx + 6}" cy="${sy + 1}" r=".7"/><circle cx="${hx + 8.5}" cy="${sy - 1}" r=".7"/></g>`;
  const ny = sy - sry + 5;
  s += `<path d="M${hx - 5.8} ${ny - 1.5} Q${hx} ${ny - 4.6} ${hx + 5.8} ${ny - 1.5} Q${hx + 5} ${ny + 3.6} ${hx} ${ny + 3.8} Q${hx - 5} ${ny + 3.6} ${hx - 5.8} ${ny - 1.5} Z" fill="${ink}"/><ellipse cx="${hx - 1.8}" cy="${ny - 1.6}" rx="2" ry="1.1" fill="#fff" opacity=".55"/>`;
  s += `<path d="M${hx} ${ny + 3} L${hx} ${ny + 7} M${hx - 6} ${ny + 8} Q${hx - 3} ${ny + 11} ${hx} ${ny + 7} Q${hx + 3} ${ny + 11} ${hx + 6} ${ny + 8}" stroke="${ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  // Eyes
  const ey = hy - 6;
  const ex = 10 * narrow;
  if (L.eyes === 'sunglasses') {
    for (const k of [-1, 1]) {
      const x0 = hx + k * ex - 6.5;
      s += `<rect x="${x0}" y="${ey - 5}" width="13" height="9" rx="3" fill="${ink}"/><rect x="${x0 + 1.5}" y="${ey - 4}" width="10" height="3.5" rx="1.5" fill="url(#${u}g)"/>`;
    }
    s += `<path d="M${hx - ex + 6} ${ey - 2} L${hx + ex - 6} ${ey - 2}" stroke="${ink}" stroke-width="2"/>`;
  } else {
    for (const k of [-1, 1]) {
      const x = hx + k * ex;
      s += `<ellipse cx="${x}" cy="${ey + 0.4}" rx="4.4" ry="4" fill="${shade(coat, -0.3)}" opacity=".35"/><circle cx="${x}" cy="${ey}" r="3.7" fill="#3b2415"/><circle cx="${x}" cy="${ey}" r="2.6" fill="${ink}"/><circle cx="${x + 1.2}" cy="${ey - 1.3}" r="1.2" fill="#fff"/><circle cx="${x - 1.1}" cy="${ey + 1.2}" r=".5" fill="#fff" opacity=".7"/>`;
    }
    const browCol = lum(coat) > 0.5 ? shade(coat, -0.4) : shade(coat, 0.35);
    const bd = L.brow === 'stern' ? [2, -2] : L.brow === 'raised' ? [-2, -2] : [0, 0];
    s += `<path d="M${hx - ex - 5} ${ey - 7 + bd[1]} Q${hx - ex} ${ey - 9 + (bd[0] + bd[1]) / 2} ${hx - ex + 4} ${ey - 7 + bd[0]}" stroke="${browCol}" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M${hx + ex + 5} ${ey - 7 + (L.brow === 'raised' ? -4 : bd[1])} Q${hx + ex} ${ey - 9 + (bd[0] + bd[1]) / 2} ${hx + ex - 4} ${ey - 7 + bd[0]}" stroke="${browCol}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
    if (L.eyes === 'monocle') {
      s += `<circle cx="${hx + ex}" cy="${ey}" r="6" fill="#fff" fill-opacity=".12" stroke="#d4a93a" stroke-width="1.8"/><path d="M${hx + ex - 3} ${ey - 3} A4 4 0 0 1 ${hx + ex + 2} ${ey - 4}" stroke="#fff" stroke-width=".8" fill="none" opacity=".8"/><path d="M${hx + ex + 5} ${ey + 4} Q${hx + ex + 9} ${ey + 20} ${hx + ex + 4} ${ey + 30}" stroke="#d4a93a" stroke-width="0.9" fill="none"/>`;
    }
  }
  // Neckwear
  if (L.neck === 'chain') s += `<path d="M36 80 Q50 92 64 80" stroke="#8a6a18" stroke-width="3.4" fill="none" stroke-dasharray="3 1.5"/><path d="M36 79.4 Q50 91.4 64 79.4" stroke="#f3cf5a" stroke-width="1.6" fill="none" stroke-dasharray="3 1.5"/>`;
  else if (L.neck === 'scarf') s += `<path d="M34 76 Q50 86 66 76 L66 82 Q50 92 34 82 Z" fill="#b8372e" stroke="#7d231c" stroke-width=".8"/><path d="M58 82 L62 98 L68 96 L63 80 Z" fill="#9c2e27" stroke="#7d231c" stroke-width=".8"/><path d="M38 80 Q50 88 62 80" stroke="#e6b54a" stroke-width="1" fill="none" opacity=".8"/>`;
  else if (L.neck === 'bowtie') s += `<path d="M50 84 L41 79 L41 89 Z M50 84 L59 79 L59 89 Z" fill="#b8372e" stroke="#7d231c" stroke-width=".8"/><path d="M42 80.5 L48 83" stroke="#fff" stroke-opacity=".35"/><circle cx="50" cy="84" r="2.4" fill="#8e2721"/>`;
  else if (L.neck === 'bandana') s += `<path d="M36 78 Q50 84 64 78 L50 94 Z" fill="#2f5d9a" stroke="#1d3d6a" stroke-width=".8"/><circle cx="46" cy="83" r="1" fill="#fff"/><circle cx="53" cy="85" r="1" fill="#fff"/><circle cx="50" cy="89" r="1" fill="#fff"/>`;
  else if (L.neck === 'pearls') s += `<path d="M36 79 Q50 90 64 79" stroke="#c9c2b2" stroke-width="4" fill="none" stroke-dasharray="0.1 4.2" stroke-linecap="round"/><path d="M36 78.5 Q50 89.5 64 78.5" stroke="#fffdf6" stroke-width="2.2" fill="none" stroke-dasharray="0.1 4.2" stroke-linecap="round"/>`;
  // Hats (each gets a sheen overlay)
  const top = hy - ry;
  const sheen = (d) => `<path d="${d}" fill="url(#${u}g)"/>`;
  if (L.hat === 'flatcap') {
    const crown = `M${hx - rx + 1} ${top + 14} Q${hx} ${top - 8} ${hx + rx - 1} ${top + 14} Z`;
    s += `<path d="${crown}" fill="#6d6452" stroke="#3e382c" stroke-width="1"/>${sheen(crown)}<path d="M${hx - 14} ${top + 13} Q${hx + 8} ${top + 6} ${hx + rx + 6} ${top + 16} Q${hx + 8} ${top + 19} ${hx - 14} ${top + 16} Z" fill="#5b5344" stroke="#3e382c" stroke-width="1"/><path d="M${hx - rx + 5} ${top + 8} L${hx + rx - 5} ${top + 8} M${hx - rx + 8} ${top + 3} L${hx + rx - 8} ${top + 3}" stroke="#8a806a" stroke-width=".8" stroke-dasharray="1.5 1.5"/>`;
  } else if (L.hat === 'bowler') {
    const dome = `M${hx - 15} ${top + 10} Q${hx - 15} ${top - 12} ${hx} ${top - 12} Q${hx + 15} ${top - 12} ${hx + 15} ${top + 10} Z`;
    s += `<ellipse cx="${hx}" cy="${top + 10}" rx="${rx + 4}" ry="4" fill="#15151a"/><path d="${dome}" fill="#23232a"/>${sheen(dome)}<path d="M${hx - 15} ${top + 6} L${hx + 15} ${top + 6}" stroke="#4a3b2e" stroke-width="2.2"/>`;
  } else if (L.hat === 'tophat') {
    s += `<rect x="${hx - 12}" y="${top - 22}" width="24" height="30" rx="2" fill="#1a1a1f"/><rect x="${hx - 10}" y="${top - 21}" width="6" height="28" rx="2" fill="#fff" opacity=".12"/><rect x="${hx - 12}" y="${top + 1}" width="24" height="5" fill="#8e2721"/><ellipse cx="${hx}" cy="${top + 9}" rx="${rx}" ry="4" fill="#15151a"/><ellipse cx="${hx}" cy="${top - 22}" rx="12" ry="2.2" fill="#2e2e36"/>`;
  } else if (L.hat === 'beanie') {
    const crown = `M${hx - rx + 2} ${top + 12} Q${hx} ${top - 14} ${hx + rx - 2} ${top + 12} Z`;
    s += `<path d="${crown}" fill="#2f5d9a" stroke="#1d3d6a" stroke-width="1"/>${sheen(crown)}<rect x="${hx - rx + 1}" y="${top + 8}" width="${rx * 2 - 2}" height="7" rx="3" fill="#264d80" stroke="#1d3d6a" stroke-width=".8"/><path d="M${hx - rx + 5} ${top + 9} V${top + 14} M${hx - rx + 10} ${top + 9} V${top + 14} M${hx} ${top + 9} V${top + 14} M${hx + rx - 10} ${top + 9} V${top + 14} M${hx + rx - 5} ${top + 9} V${top + 14}" stroke="#1d3d6a" stroke-width=".8"/><circle cx="${hx}" cy="${top - 4}" r="4.2" fill="#e8e1d2" stroke="#b9b09c" stroke-width=".8"/>`;
  } else if (L.hat === 'peaked') {
    const crown = `M${hx - rx + 1} ${top + 12} Q${hx} ${top - 12} ${hx + rx - 1} ${top + 12} Z`;
    s += `<path d="${crown}" fill="#2a2d33"/>${sheen(crown)}<path d="M${hx - rx + 2} ${top + 12} Q${hx} ${top + 22} ${hx + rx - 2} ${top + 12} Z" fill="#111317"/><circle cx="${hx}" cy="${top + 4}" r="2.6" fill="#c9a43a" stroke="#8a6a18" stroke-width=".6"/>`;
  } else if (L.hat === 'trilby') {
    const crown = `M${hx - 14} ${top + 10} L${hx - 12} ${top - 8} Q${hx} ${top - 3} ${hx + 12} ${top - 8} L${hx + 14} ${top + 10} Z`;
    s += `<ellipse cx="${hx}" cy="${top + 10}" rx="${rx + 7}" ry="4.5" fill="#3e3125"/><path d="${crown}" fill="#5a4838"/>${sheen(crown)}<rect x="${hx - 14}" y="${top + 3}" width="28" height="4" fill="#2a211a"/>`;
  }
  // Frame edge
  if (opts.bg !== false) s += `<rect x=".5" y=".5" width="99" height="99" rx="${opts.round ? 49.5 : 13.5}" fill="none" stroke="#000" stroke-opacity=".18"/>`;
  const size = opts.size || 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${escapeAttr(dog.first)} the ${escapeAttr(b.label)}">${s}</svg>`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

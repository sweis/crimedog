// Small helpers shared across modules.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
// A name as it reads mid-sentence: loot is named like a list item ("A solid gold
// roulette ball"), so the first word drops its capital. Quoted titles keep theirs.
export const inSentence = (name) => (/^[A-Z](?:[a-z-]|\s)/.test(name) ? name[0].toLowerCase() + name.slice(1) : name);
export const money = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;
// £950, £1.2k, £16k. Rounded down, so £99,600 never reads as £100k.
export const moneyShort = (n) => {
  const a = Math.abs(n);
  const k = a < 1000 ? null : a < 10000 ? Math.floor(a / 100) / 10 : Math.floor(a / 1000);
  return `${n < 0 ? '−' : ''}£${k === null ? Math.round(a) : `${k}k`}`;
};
// A line of details ("Poodle · Charm · Solid"): each piece stays in one piece, so a
// line breaks between them, never mid-phrase. Parts are HTML; empty ones are dropped.
export const dots = (...parts) => parts.flat().filter(Boolean).map((p) => `<span class="bit">${p}</span>`).join(' · ');
// Fill a line's {placeholders} from `vars`. A placeholder with no value becomes
// `missing` (pass null to leave it as written).
export const fillIn = (text, vars, missing = '') => String(text).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? (missing ?? m));
export const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Prices and amounts in round numbers: to the nearest £10 (or `step`).
export const roundTo = (n, step = 10) => Math.round(n / step) * step;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// A stable pick for flavour text, so it doesn't use up a draw from the game's RNG.
export const hashOf = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
export const pickBy = (key, list) => list[hashOf(key) % list.length];

// Career counters on state.stats (older saves may not have them all yet).
export const addStat = (state, key, n = 1) => { state.stats[key] = (state.stats[key] || 0) + n; };
// Someone tips off security: the next job starts with security on alert.
export const addSabotage = (state, n = 1) => { state.sabotage = (state.sabotage || 0) + n; };

// The police turning up, in a heist's beats (older saves only have the words).
export const coppersCame = (b) => b.kind === 'alarm' && (b.coppers || /Old Bill have arrived/.test(b.text));

// Every player action returns one of these.
export const fail = (msg) => ({ ok: false, msg });
export const done = (msg, extra) => ({ ok: true, msg, ...extra });

// The game's meters, kept in range.
export const addHeat = (state, n) => { state.heat = clamp(state.heat + n, 0, 100); };
// The bigger your name, the harder it is to impress anyone: from 40 up, what a good job
// adds to your record shrinks as it climbs, to nothing at the top. Losses hit in full.
export const repGain = (rep, n) => (n > 0 ? Math.round(n * (rep < 40 ? 1 : Math.max(0, (100 - rep) / 60) ** 1.5)) : n);
// Reputation changes are tagged with which side of it they came from (see repute.js).
// Returns the change actually made.
export const addRep = (state, n, part = 'record') => {
  const before = state.rep;
  state.rep = clamp(state.rep + (part === 'record' ? repGain(before, n) : n), 0, 100);
  const parts = (state.repParts ||= {});
  parts[part] = (parts[part] || 0) + (state.rep - before);
  return state.rep - before;
};
// " (+4 rep)", for the end of a line that says what happened.
export const repNote = (d) => (d ? ` (${d > 0 ? '+' : '-'}${Math.abs(d)} rep)` : '');
export const addRelation = (dog, n) => { dog.relation = clamp(dog.relation + n, -100, 100); };

// Every change to the cash goes through here, tagged with what it was for, so the
// books add up (see the cash pane). The open period closes when a job is graded.
export const book = (state, cat, amount) => {
  state.cash += amount;
  const b = (state.books ||= { open: {}, jobs: [] });
  b.open[cat] = (b.open[cat] || 0) + amount;
};

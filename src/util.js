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
export const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
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

// Every player action returns one of these.
export const fail = (msg) => ({ ok: false, msg });
export const done = (msg, extra) => ({ ok: true, msg, ...extra });

// The game's meters, kept in range.
export const addHeat = (state, n) => { state.heat = clamp(state.heat + n, 0, 100); };
// Reputation changes are tagged with which side of it they came from (see repute.js).
export const addRep = (state, n, part = 'record') => {
  const before = state.rep;
  state.rep = clamp(state.rep + n, 0, 100);
  const parts = (state.repParts ||= {});
  parts[part] = (parts[part] || 0) + (state.rep - before);
};
export const addRelation = (dog, n) => { dog.relation = clamp(dog.relation + n, -100, 100); };

// Every change to the cash goes through here, tagged with what it was for, so the
// books add up (see the cash pane). The open period closes when a job is graded.
export const book = (state, cat, amount) => {
  state.cash += amount;
  const b = (state.books ||= { open: {}, jobs: [] });
  b.open[cat] = (b.open[cat] || 0) + amount;
};

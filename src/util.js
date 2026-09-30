// Small helpers shared across modules.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const money = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Every player action returns one of these.
export const fail = (msg) => ({ ok: false, msg });
export const done = (msg, extra) => ({ ok: true, msg, ...extra });

// The game's meters, kept in range.
export const addHeat = (state, n) => { state.heat = clamp(state.heat + n, 0, 100); };
export const addRep = (state, n) => { state.rep = clamp(state.rep + n, 0, 100); };
export const addRelation = (dog, n) => { dog.relation = clamp(dog.relation + n, -100, 100); };

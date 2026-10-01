// Reputation has more than one side. The ⭐ score is a composite: your track
// record (how jobs go) plus how generous you're known to be with the take. A
// separate soft-to-hard scale doesn't count towards the score, but it changes how
// the crew feel: hard masterminds are feared (fewer runners, fewer talkers) and
// harder to warm to; soft ones are liked, and easier to cross.
import { clamp, addRep } from './util.js';

const START = { generosity: 50, hardness: 0 };
export const generosityOf = (state) => state.generosity ?? START.generosity;
export const hardnessOf = (state) => state.hardness ?? START.hardness;

// What generosity adds to (or takes off) the ⭐ score: up to ±15.
export const generosityBonus = (g) => Math.round((g - 50) * 0.3);

export function addGenerosity(state, n) {
  const before = generosityOf(state);
  state.generosity = clamp(before + n, 0, 100);
  const d = generosityBonus(state.generosity) - generosityBonus(before);
  if (d) addRep(state, d, 'generosity');
  return state.generosity - before;
}

export function addHardness(state, n) {
  const before = hardnessOf(state);
  state.hardness = clamp(before + n, -100, 100);
  return state.hardness - before;
}

// Paying the crew: the cut you give is what you're known for. [generosity, hardness]
export const CUT_REPUTE = { 0: [-12, 4], 15: [-4, 1], 30: [3, 0], 45: [8, -2] };

// How the crew feel about you, from the soft-to-hard scale.
// fear: 0..0.7 off the chance of a runner (and of talking); warmth: relation per job (+4 soft .. -4 hard).
export function crewFeeling(state) {
  const h = hardnessOf(state);
  return { fear: Math.max(0, h) / 100 * 0.7, soft: Math.max(0, -h) / 100, warmth: -h / 25 };
}

export function hardnessLabel(h) {
  return h <= -50 ? 'A soft touch' : h <= -15 ? 'Kind-hearted' : h < 15 ? 'Even-handed' : h < 50 ? 'Hard but fair' : 'Ruthless';
}
export function generosityLabel(g) {
  return g < 25 ? 'Tight-fisted' : g < 45 ? 'Careful with money' : g < 60 ? 'Fair' : g < 80 ? 'Generous' : 'Open-handed';
}

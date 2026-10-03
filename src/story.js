// The story queue: scenes on the job board between jobs (the Inspector's moves,
// rivals, runners, crew drama, the outfits). Scenes are plain data and their
// choices carry an effect id rather than a function, so the queue survives a save.
import { fail, done, book } from './util.js';

// Queue a scene of `type` with its choices.
export function pushScene(state, type, fields) {
  const st = { type, ...fields, choices: fields.choices.map((c) => ({ label: c.label, cost: c.cost || 0, effect: c.effect || null })) };
  state.story.push(st);
  return st;
}

// Each choice, and whether you can pay for it.
export const affordable = (state, choices) => choices.map((c) => ({ ...c, ok: c.cost <= state.cash }));

// Answer the scene at the front of the queue with choice i: check it, pay for it
// (booked under `ledger`, when the choice itself doesn't), take the scene off the
// queue and run its effect, which returns the message to show.
export function answerScene(state, type, i, effect, ledger = null) {
  const st = state.story[0];
  if (!st || st.type !== type) return fail('Nothing to answer.');
  const c = st.choices[i];
  if (!c) return fail('No such choice.');
  if (c.cost > state.cash) return fail('You can\'t afford that.');
  if (c.cost && ledger) book(state, ledger, -c.cost);
  state.story.shift();
  return done(c.effect ? effect(st, c.effect) : '');
}

// A heist told in brief: who did what, how it went, who got away. Kept in the
// history for the rap sheet and the shareable recap card.
import { APPROACHES } from './data.js';
import { shortName } from './dogs.js';
import { lootItem } from './heists.js';
import { coppersCame } from './util.js';

export const HISTORY_MAX = 30;
// Best grade first.
export const GRADE_ORDER = 'SABCDF';

// How each crew member's night ended.
function fateOf(r, id) {
  if (r.lost.some((l) => l.id === id)) return 'farm';
  if ((r.hurt || []).some((l) => l.id === id)) return 'hospital';
  if (r.captured.some((c) => c.id === id)) return 'nicked';
  if (r.runners.some((x) => x.id === id)) return 'ran';
  if (r.exposed.includes(id) || r.tipped.includes(id)) return 'copper';
  return 'away';
}

// Beats worth retelling.
const isMoment = (b) => ['pear', 'caught', 'lost', 'hurt', 'betray', 'rescue'].includes(b.kind) || coppersCame(b);

export function buildRecap(state) {
  const { job, result: r, after: a, dogs } = state;
  const who = (id) => (dogs[id] ? shortName(dogs[id]) : '?');
  const steps = [];
  for (const st of job.stages) {
    const tries = r.beats.filter((b) => b.stage === st.id && (b.kind === 'ok' || b.kind === 'fail') && b.approach);
    if (!tries.length) continue;
    steps.push({
      icon: st.icon,
      label: st.label,
      surprise: r.beats.some((b) => b.stage === st.id && b.kind === 'surprise'),
      tries: tries.map((b) => ({ dog: who(b.dog), how: APPROACHES[b.approach].label, ok: b.kind === 'ok', improv: b.tag === 'improv' })),
    });
  }
  return {
    id: job.id,
    name: job.name,
    type: job.type || 'breakin',
    venue: job.venueName,
    district: job.district,
    day: state.day,
    grade: a.grade.letter,
    score: a.grade.score,
    take: a.received,
    outcome: r.outcome,
    headline: a.headline,
    // A snapshot of each dog, enough to draw them even after they're gone.
    crew: r.crew.map((id) => {
      const d = dogs[id];
      return { id, first: d.first, nick: d.nick || null, breed: d.breed, look: d.look, role: d.role?.kind || null, rarity: d.rarity || null, fate: fateOf(r, id) };
    }),
    steps,
    moments: r.beats.filter(isMoment).map((b) => b.text).slice(0, 5),
    loot: r.secured.map((id) => lootItem(job, id).name),
    alarmMax: r.alarmMax,
    clues: r.clues,
  };
}

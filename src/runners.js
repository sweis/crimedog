// Crew who do a runner don't just vanish: they become rivals with a plotline.
// Put the word out and, a job or two later, your people find where they're
// holed up. Then: steal it back (their hideout goes on the job board), pay them a
// visit and send them to the farm (hard), show mercy (soft), or let it go.
// While they're loose they make trouble: talking to the Inspector, tipping off
// security. Scene data lives on the scene, so it survives a save.
import { fail, done, money, addHeat, addRep, addRelation, book, inSentence } from './util.js';
import { displayName, shortName, skillOf } from './dogs.js';
import { addHardness } from './repute.js';
import { pushScene, answerScene } from './story.js';
import { pinJob, keepPinned } from './heists.js';

export const HUNT_COST = 150;
const LEADS_NEEDED = 2;
const HIDEOUTS = ['a caravan behind the racetrack', 'a bedsit above a chip shop', 'a houseboat on the canal', 'a lock-up under the railway arches', 'their nan\'s spare room'];

const runnersOf = (state) => (state.runners ||= {});
export const loose = (r) => ['loose', 'hunting', 'found'].includes(r.stage);

// Someone did a runner (on a job, or at the end of a drama). took: what they ran with.
export function newRunner(state, d, took, value, rng) {
  const R = runnersOf(state);
  R[d.id] = { dog: d.id, took, value: Math.max(100, value || 0), stage: 'loose', leads: 0, hideout: rng.pick(HIDEOUTS), since: state.day };
  return scene(state, d.id, 'ran', {
    title: 'Done a Runner',
    text: `${displayName(d)} did a runner with ${inSentence(took)}. Nobody's seen them since. The whole pub is waiting to see what you do about it.`,
    choices: [{ label: 'Put the word out', cost: HUNT_COST, effect: 'hunt' }, { label: 'Let them go', effect: 'letgo' }],
  });
}

const scene = (state, dog, move, s) => pushScene(state, 'runner', { dog, move, title: s.title, text: s.text, choices: s.choices });

// Anyone in your book who's good at finding people: a nose or a sneak of 4+.
const tracker = (state) => Object.values(state.dogs).find((d) => d.met && d.status === 'free' && !d.undercover && (skillOf(d, 'nose') >= 4 || skillOf(d, 'sneak') >= 4));

// Between jobs: leads come in on the ones you're hunting; the loose ones make trouble.
export function runnersBetweenJobs(state, rng) {
  const R = runnersOf(state);
  const events = [];
  for (const r of Object.values(R)) {
    const d = state.dogs[r.dog];
    if (!d) continue;
    keepPinned(state, r);
    if (r.stage === 'hunting') {
      const t = tracker(state);
      r.leads += 1 + (t ? 1 : 0);
      if (r.leads >= LEADS_NEEDED) {
        r.stage = 'found';
        scene(state, d.id, 'found', {
          title: 'Found Them',
          text: `${t ? `${shortName(t)} sniffed out the trail. ` : ''}${displayName(d)} is holed up in ${r.hideout}, living off ${inSentence(r.took)}. They don't know you know.`,
          choices: foundChoices(state, r),
        });
        events.push(`${displayName(d)} has been found.`);
      } else events.push(`A lead on ${displayName(d)}: they were seen near the docks.`);
    } else if (loose(r) && r.stage !== 'found' && rng.chance(0.2)) {
      // Loose and bitter: they sell what they know.
      if (rng.chance(0.5)) {
        addHeat(state, 4);
        events.push(`${displayName(d)} has been talking to the Inspector to save their own skin. (+4 heat)`);
      } else {
        state.sabotage = (state.sabotage || 0) + 1;
        events.push(`${displayName(d)} has been telling security you're coming. Your next job starts on alert.`);
      }
    }
  }
  return events;
}

function foundChoices(state, r) {
  return [
    ...(r.board ? [] : [{ label: 'Steal it back', effect: 'stealback' }]),
    { label: 'Pay them a visit. The farm.', effect: 'farm' },
    { label: 'Show mercy', effect: 'mercy' },
    { label: 'Let it go', effect: 'letgo' },
  ];
}

// Putting the word out books its own cost (as intel), so nothing is booked here.
export const chooseRunner = (state, i, rng, ctx = {}) => answerScene(state, 'runner', i, (st, effect) => act(state, st.dog, effect, rng, ctx));

// The same actions, from the Players tab.
export function runnerAction(state, dogId, effect, rng, ctx = {}) {
  const r = runnersOf(state)[dogId];
  if (!r || !loose(r)) return fail('Nothing to do there.');
  const allowed = r.stage === 'found' ? foundChoices(state, r).map((c) => c.effect) : r.stage === 'loose' ? ['hunt', 'letgo'] : ['letgo'];
  if (!allowed.includes(effect)) return fail('Not yet.');
  if (state.phase !== 'select') return fail('Between jobs.');
  state.story = state.story.filter((x) => !(x.type === 'runner' && x.dog === dogId));
  return done(act(state, dogId, effect, rng, ctx));
}

const act = (state, dogId, effect, rng, ctx) => EFFECTS[effect](state, runnersOf(state)[dogId], state.dogs[dogId], rng, ctx);

const EFFECTS = {
  hunt(state, r, d) {
    if (state.cash < HUNT_COST) return 'You can\'t afford to put the word out.';
    book(state, 'intel', -HUNT_COST);
    r.stage = 'hunting';
    return `The word's out. Every barman in town is looking for ${shortName(d)}. Give it a job or two.`;
  },
  letgo(state, r, d) {
    r.stage = 'done';
    r.ended = 'letgo';
    addHardness(state, -4);
    return `You let ${shortName(d)} go. Some will call it big of you. Others will call it soft.`;
  },
  stealback(state, r, d, rng, ctx) {
    const job = ctx.genJob(state, rng, { type: 'breakin', venueType: 'mansion', owner: null, tier: 1, twist: null });
    job.name = `Getting It Back from ${shortName(d)}`;
    job.venueName = `${d.first}'s hideout, ${r.hideout}`;
    job.runnerHit = d.id;
    job.loot[0].name = r.took;
    job.loot[0].value = Math.max(job.loot[0].value, r.value);
    pinJob(state, r, job);
    return `${shortName(d)}'s hideout is on the job board. Time to take back what's yours.`;
  },
  farm(state, r, d) {
    r.stage = 'done';
    r.ended = 'farm';
    d.status = 'farm';
    d.farmedBy = 'you';
    state.stats.farmed = (state.stats.farmed || 0) + 1;
    addHardness(state, 12);
    addRep(state, 2);
    const back = Math.round((r.value * 0.5) / 10) * 10;
    book(state, 'recovered', back);
    return `You pay ${shortName(d)} a visit. They hand over what's left (${money(back)}) and go to live on a farm. Nobody will cross you in a hurry. (+2 rep)`;
  },
  mercy(state, r, d) {
    r.stage = 'done';
    r.ended = 'mercy';
    d.status = 'free';
    d.left = null;
    d.relation = 20;
    d.loyalty = Math.min(100, d.loyalty + 30);
    addHardness(state, -12);
    const back = Math.round((r.value * 0.3) / 10) * 10;
    book(state, 'recovered', back);
    return `${shortName(d)} expected the farm. Instead you buy them a drink. They give back what they can (${money(back)}) and swear they'll never cross you again. They're back in your book.`;
  },
};

// After a job: did we get it back from their hideout?
export function runnersAfterJob(state) {
  const job = state.job;
  if (!job.runnerHit) return [];
  const r = runnersOf(state)[job.runnerHit];
  const d = state.dogs[job.runnerHit];
  r.board = null;
  if ((state.after.securedValue || 0) > 0) {
    r.stage = 'done';
    r.ended = 'robbed';
    addHardness(state, 3);
    addRelation(d, -10);
    return [`💨 You got ${inSentence(r.took)} back from ${shortName(d)}. They've fled town with nothing.`];
  }
  r.stage = 'hunting';
  r.leads = 0;
  return [`💨 ${shortName(d)} got away again, and moved on. You'll have to find them all over.`];
}

// Taking (or walking away from) a hideout job takes it off the board.
export function tookRunnerJob(state, job) {
  if (job.runnerHit) runnersOf(state)[job.runnerHit].board = null;
}

// For the Players tab.
export function runnerStatus(r) {
  if (r.stage === 'loose') return 'On the loose';
  if (r.stage === 'hunting') return `Hunting them: ${Math.min(r.leads, LEADS_NEEDED)}/${LEADS_NEEDED} leads`;
  if (r.stage === 'found') return r.board ? 'Their hideout is on the board' : 'Found them';
  return { letgo: 'Let go', farm: 'On the farm', mercy: 'Forgiven', robbed: 'Robbed back, run off' }[r.ended] || 'Gone';
}
export const runnersList = (state) => Object.values(runnersOf(state));

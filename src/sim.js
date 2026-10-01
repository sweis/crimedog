// Heist resolution. Pure: takes state + plan + rng, returns a list of beats and
// an outcome. The UI plays the beats back; engine.resolveHeist applies effects.
import { APPROACHES, KIT, CHAOS, VOICES, TALENTS, SIGNATURES, WILD, TWISTS } from './data.js';
import { skillOf, hasSpecial, shortName, roleLevel } from './dogs.js';
import { clamp } from './util.js';
import { lootItem } from './heists.js';
import { moPenalty, SETUP_TEXT } from './inspector.js';

export const ALARM_MAX = 10;

// Signature moves: a rare or legendary dog's secret way through the steps it fits.
export function signatureFits(sigId, stage) {
  if (stage.noSig) return false;
  return SIGNATURES[sigId].fits.some((t) => t === stage.kind || t === stage.id || t === `vault:${stage.vaultType}`);
}

// Only a signature's owner can pull it off.
export const canDo = (dog, approachId) => !APPROACHES[approachId].signature || dog.signature === APPROACHES[approachId].signature;

// A step's options: the usual ones, plus secret ones this crew can open.
export function stageOptions(stage, crew) {
  const opts = stage.options.slice();
  for (const d of crew) {
    const ap = d.signature && signatureFits(d.signature, stage) && SIGNATURES[d.signature].approach;
    if (ap && !opts.includes(ap)) opts.push(ap);
  }
  return opts;
}

const hiredDogs = (state) => (state.crew || []).map((id) => state.dogs[id]);

// crew: who's available to do it (defaults to the hired crew).
export function approachAvailable(state, job, approachId, kitLeft, crew = hiredDogs(state)) {
  const a = APPROACHES[approachId];
  const kit = kitLeft || state.kit;
  if (a.signature && !crew.some((d) => d.signature === a.signature)) return { ok: false, reason: `Needs ${SIGNATURES[a.signature].name}` };
  if (a.needKit && !(kit[a.needKit] > 0)) return { ok: false, reason: `Needs ${KIT[a.needKit].name}` };
  if (a.needIntel && !job.intel[a.needIntel]) return { ok: false, reason: 'Needs intel' };
  if (a.needInsider && !job.insider) return { ok: false, reason: 'Needs an inside dog' };
  if (a.needBribe && !job.bribed) return { ok: false, reason: 'Needs a bribed guard' };
  return { ok: true };
}

export function difficulty(state, job, stage, approachId, kitLeft) {
  const a = APPROACHES[approachId];
  const kit = kitLeft || state.kit;
  let d = job.base + a.mod + job.alert;
  if (a.kitBonus && kit[a.kitBonus] > 0) d -= 2;
  if (a.intelBonus && job.intel[a.intelBonus]) d -= 2;
  const night = job.time === 'night';
  if (night && (a.skill === 'sneak' || a.skill === 'agility')) d -= 1;
  if (!night && (a.skill === 'charm' || a.skill === 'disguise')) d -= 1;
  if (!night && a.skill === 'sneak') d += 1;
  if (a.crowd) d += night ? 2 : -1;
  if (stage.kind === 'getaway') {
    if (job.intel.escape_routes) d -= 1;
    if (job.hazards.stakeout && job.time === job.stakeoutTime) d += 2;
  }
  if (stage.kind === 'vault' && job.hazards.silent && job.intel.hz_silent) d += 1;
  if (stage.id === 'obs_guards' && job.insider) d -= 1;
  d += specialKitBonus(kit, job, stage, a);
  d += moPenalty(state, approachId); // the Inspector has briefed security on your favourite tricks
  const tw = TWISTS[job.twist]?.mods;
  if (tw) d += (tw.skills?.[a.skill] || 0) + (tw.stages?.[stage.id] || 0) + (tw.kinds?.[stage.kind] || 0);
  return d;
}

// Special kit won on earlier jobs: which pieces help on this step, and by how much.
export function specialKitFor(kit, job, stage, a) {
  return Object.keys(kit).filter((k) => {
    const e = KIT[k]?.effect;
    if (!e || !(kit[k] > 0)) return false;
    return e.stage === stage.id || e.kind === stage.kind || e.skill === a.skill || !!e.types?.includes(job.type);
  });
}
const specialKitBonus = (kit, job, stage, a) => specialKitFor(kit, job, stage, a).reduce((sum, k) => sum + KIT[k].effect.diff, 0);

export function baseOdds(skill, diff) {
  return clamp(0.6 + 0.11 * (skill - diff), 0.05, 0.95);
}


function crewOf(plan) {
  return [...new Set(Object.values(plan).map((p) => p && p.dog).filter(Boolean))];
}

// Probability a dog pulls off an approach. ctx carries in-heist conditions.
export function odds(state, job, stage, approachId, dog, ctx = {}) {
  const a = APPROACHES[approachId];
  let skill = skillOf(dog, a.skill);
  if (job.time === 'night' && hasSpecial(dog, 'night')) skill += 1;
  // A specialist step: anyone short of the mark is out of their depth.
  const outOfDepth = stage.needs && skill < stage.needs.min ? 3 : 0;
  const diff = difficulty(state, job, stage, approachId, ctx.kitLeft) + (ctx.extra || 0) + outOfDepth;
  let p = baseOdds(skill, diff);
  const alarm = ctx.alarm || 0;
  const crew = ctx.crew || [...new Set([...crewOf(job.plan), ...(state.crew || [])])].map((id) => state.dogs[id]).filter(Boolean);
  const q = dog.quirks;
  if (alarm >= 4) {
    if (q.includes('nervous')) p -= 0.15;
    if (q.includes('steel')) p += 0.1;
    if (hasSpecial(dog, 'cool') || hasSpecial(dog, 'nerve')) p += 0.05;
  }
  if (q.includes('pack') && crew.some((c) => c.id !== dog.id && c.faction === dog.faction)) p += 0.1;
  if (q.includes('lonewolf')) p += crew.length <= 2 ? 0.1 : crew.length >= 4 ? -0.1 : 0;
  if (q.includes('napper') && ['exit', 'getaway'].includes(stage.kind)) p -= 0.1;
  if (q.includes('glory')) p += 0.08;
  const load = Object.values(job.plan).filter((p2) => p2 && p2.dog === dog.id).length;
  if (load > 3) p -= 0.05 * (load - 3);
  p += (dog.drama?.edge || 0) * 0.08; // fired up or distracted by personal drama
  p += 0.02 * roleLevel(crew, 'leader'); // a leader steadies everyone
  p += ctx.bonus || 0;
  return { p: clamp(p, 0.03, 0.97), skill, diff };
}

// Does the player know enough to see the odds?
export function oddsKnown(dog, approachId) {
  return !!dog.known.skills[APPROACHES[approachId].skill];
}

function carryCapacity(crew, kit) {
  let c = 3;
  for (const d of crew) c += Math.floor(skillOf(d, 'muscle') / 2) + (hasSpecial(d, 'carry') ? 2 : 0);
  if (kit.bags > 0) c += 2;
  if (kit.van > 0) c += 3;
  return c;
}

// Stages on the way out, where a fumble gets dogs nicked rather than just noticed.
const OUT = ['exit', 'getaway'];
// Fumbling these can cost a dog for good.
const RISKY = new Set(['agility', 'muscle', 'wheels']);
const LOSS_TEXT = {
  agility: '{d} slips. It\'s a long way down.',
  muscle: '{d} takes on one guard too many.',
  wheels: '{d} wraps the motor round a lamppost.',
  other: '{d} doesn\'t make it out.',
};
const END_TEXT = {
  swap: 'Not a whisker out of place. They won\'t even know they\'ve been robbed.',
  clean: 'In and out. Clean as a whistle.',
  tidy: 'Done. A few loose ends, but the goods are out.',
  messy: 'Chaos. Sirens. But they\'ve got something.',
  bust: 'Nothing to show for it but sore paws.',
  aborted: 'The job\'s off. Better luck next time.',
  setup: 'Stitched up like a kipper. The Inspector got his photos.',
};

const loyaltyOf = (d) => d.loyalty + d.relation * 0.5;

function outcomeOf(ctx) {
  const hurt = ctx.captured.length || ctx.lost.length;
  if (ctx.aborted) return 'aborted';
  if (!ctx.secured.length) return 'bust';
  if (ctx.alarmMax === 0 && ctx.clues === 0 && !hurt) return 'clean';
  if (hurt || ctx.alarmMax >= 6) return 'messy';
  return 'tidy';
}

export function simulate(state, job, rng) {
  const plan = job.plan;
  // Everyone on the crew turns up: the plan says who leads each step, spares improvise.
  const crewIds = [...new Set([...crewOf(plan), ...(state.crew || [])])];
  const crew = crewIds.map((id) => state.dogs[id]);
  const beats = [];
  const ctx = {
    alarm: 0,
    alarmMax: 0,
    clues: 0,
    coppers: false,
    ringing: false,
    pearShaped: false,
    aborted: false,
    vaultDone: false,
    swap: false,
    tipped: [],
    exposed: [],
    captured: [],
    lost: [],
    runners: [],
    secured: [],
    dropped: [],
    kitLeft: { ...state.kit },
    kitUsed: {},
    luckUsed: new Set(),
    lookoutUsed: false,
    nextBonus: 0,
    lastOk: null,
    lastFail: null,
    learned: {},
    acted: new Set(),
    practised: {},
  };

  // ---- Helpers over this job's state
  // Tipped undercover dogs stay "active" during the job; they only reveal themselves after.
  const gone = (id) => ctx.exposed.includes(id) || [ctx.captured, ctx.runners, ctx.lost].some((xs) => xs.some((x) => x.id === id));
  const active = () => crew.filter((d) => !gone(d.id));
  const learn = (dog, kind, v) => {
    const L = (ctx.learned[dog.id] ||= { skills: [], talents: [], quirks: [], loyalty: false, undercover: false });
    if (kind === 'loyalty' || kind === 'undercover') L[kind] = true;
    else if (!L[kind].includes(v)) L[kind].push(v);
  };
  const say = (dog, kind) => {
    const lines = VOICES[dog.voice]?.[kind];
    return lines ? rng.pick(lines) : null;
  };
  const beat = (b) => {
    beats.push({ alarm: ctx.alarm, clues: ctx.clues, ...b });
  };
  const useKit = (id) => {
    ctx.kitLeft[id]--;
    ctx.kitUsed[id] = (ctx.kitUsed[id] || 0) + 1;
  };
  const lootName = (id) => lootItem(job, id).name;

  const addAlarm = (n, stageId) => {
    if (n <= 0) return;
    const before = ctx.alarm;
    ctx.alarm = Math.min(ALARM_MAX, ctx.alarm + n);
    ctx.alarmMax = Math.max(ctx.alarmMax, ctx.alarm);
    if (before < 6 && ctx.alarm >= 6) {
      const look = active().find((d) => hasSpecial(d, 'lookout'));
      if (look && !ctx.lookoutUsed) {
        ctx.lookoutUsed = true;
        ctx.alarm = Math.max(0, ctx.alarm - 2);
        learn(look, 'talents', 'lookout');
        beat({ kind: 'good', stage: stageId, dog: look.id, text: `${shortName(look)} spots trouble coming and gets everyone into cover just in time.` });
        return;
      }
    }
    if (!ctx.ringing && ctx.alarm >= 6) {
      ctx.ringing = true;
      beat({ kind: 'alarm', stage: stageId, text: 'BRRRRING! The alarm is going off!' });
    }
    // Once the Inspector is close, the police are never far away.
    if (!ctx.coppers && ctx.alarm >= (state.heat >= 60 ? ALARM_MAX - 2 : ALARM_MAX)) {
      ctx.coppers = true;
      beat({ kind: 'alarm', stage: stageId, text: 'Sirens! Blue lights! The Old Bill have arrived!' });
      const unlucky = active();
      if (unlucky.length) escapeCheck(rng.pick(unlucky), stageId);
    }
  };

  // One dog tries one approach at one step.
  const attempt = (stage, approachId, dog, extra, tag) => {
    const a = APPROACHES[approachId];
    const has = (q) => dog.quirks.includes(q);
    if (a.needKit && KIT[a.needKit].consumable) useKit(a.needKit);
    ctx.acted.add(dog.id);
    const o = odds(state, job, stage, approachId, dog, { alarm: ctx.alarm, crew: active(), kitLeft: ctx.kitLeft, extra: (extra || 0) + (ctx.coppers ? 2 : 0), bonus: ctx.nextBonus });
    ctx.nextBonus = 0;
    let p = o.p;
    if (tag === 'improv' && dog.role?.kind === 'wildcard') p = clamp(p + 0.05 * dog.role.level, 0.03, 0.97); // made for making it up
    if (hasSpecial(dog, 'wild')) {
      p = clamp(p + rng.float(-0.2, 0.2), 0.03, 0.97);
      learn(dog, 'talents', 'zoomies');
    }
    learn(dog, 'skills', a.skill);
    let ok;
    let roll;
    let text;
    if (has('squirrel') && rng.chance(0.12)) {
      learn(dog, 'quirks', 'squirrel');
      ok = false;
      roll = 1;
      text = `${shortName(dog)} was about to "${a.label.toLowerCase()}" when— SQUIRREL! Gone. Just gone.`;
    } else {
      roll = rng.next();
      ok = roll < p;
      if (!ok && (has('lucky') || hasSpecial(dog, 'lucky')) && !ctx.luckUsed.has(dog.id)) {
        ctx.luckUsed.add(dog.id);
        if (has('lucky')) learn(dog, 'quirks', 'lucky');
        else learn(dog, 'talents', 'trickshot');
        roll = rng.next();
        ok = roll < p;
        beat({ kind: 'luck', stage: stage.id, dog: dog.id, text: `${shortName(dog)} fumbles... and gets a lucky second go.` });
      }
      text = (ok ? a.ok : a.fail).replace(/\{d\}/g, shortName(dog));
    }
    // Talents that helped
    for (const t of dog.talents) {
      if (skillTalent(t, a.skill)) learn(dog, 'talents', t);
    }
    // Noise & clues
    let noise = Math.max(0, (ok ? a.noise : a.failNoise) + (TWISTS[job.twist]?.noise || 0));
    if (ok && a.skill === 'muscle' && hasSpecial(dog, 'loud')) noise += 1;
    if (ok && (hasSpecial(dog, 'hothead') || has('postmen')) && stage.kind === 'obstacle') {
      noise += 1;
      if (has('postmen')) learn(dog, 'quirks', 'postmen');
    }
    let clues = ok ? a.clues : 1;
    if (has('sheds') && rng.chance(0.5)) { clues += 1; learn(dog, 'quirks', 'sheds'); }
    if (has('glory')) { clues += 1; learn(dog, 'quirks', 'glory'); }
    if (hasSpecial(dog, 'clean')) clues -= 1;
    // Witnesses, in daylight (a con wants to be seen: that's the point).
    if (job.time === 'day' && !['con', 'fraud'].includes(job.type) && ['charm', 'disguise'].includes(a.skill)) clues += 1;
    ctx.clues += Math.max(0, clues);
    if (has('nervous') && ctx.alarm >= 4) learn(dog, 'quirks', 'nervous');
    if (has('steel') && ctx.alarm >= 4) learn(dog, 'quirks', 'steel');
    if (has('pack')) learn(dog, 'quirks', 'pack');
    const line = rng.chance(0.55) ? say(dog, ok ? 'ok' : 'fail') : null;
    if (ok) {
      ctx.lastOk = approachId;
      (ctx.practised[dog.id] ||= []).push(a.skill);
    } else ctx.lastFail = { dog, approachId, margin: roll - p };
    beat({ kind: ok ? 'ok' : 'fail', stage: stage.id, dog: dog.id, approach: approachId, tag, p, roll, text, line });
    addAlarm(noise, stage.id);
    return ok;
  };

  const bestFor = (stage, exclude = [], extra = 0) => {
    let best = null;
    for (const ap of stageOptions(stage, active())) {
      if (exclude.includes(ap)) continue;
      if (!approachAvailable(state, job, ap, ctx.kitLeft, active()).ok) continue;
      for (const d of active()) {
        if (!canDo(d, ap)) continue;
        const o = odds(state, job, stage, ap, d, { alarm: ctx.alarm, crew: active(), kitLeft: ctx.kitLeft, extra });
        if (!best || o.p > best.p) best = { approach: ap, dog: d, p: o.p };
      }
    }
    return best;
  };

  // Anything a dog was carrying on the way out is lost with them.
  const dropLoot = (stageId, how) => {
    // Half the time someone else grabs the bag first.
    if (!ctx.secured.length || !OUT.includes(stageId) || rng.chance(0.5)) return;
    const lostItem = ctx.secured.splice(rng.int(0, ctx.secured.length - 1), 1)[0];
    ctx.dropped.push(lostItem);
    beat({ kind: 'fail', stage: stageId, text: `${lootName(lostItem)} ${how}.` });
  };

  const loseDog = (dog, stageId, skill) => {
    ctx.lost.push({ id: dog.id, stage: stageId });
    const t = (LOSS_TEXT[skill] || LOSS_TEXT.other).replace('{d}', shortName(dog));
    beat({ kind: 'lost', stage: stageId, dog: dog.id, text: `${t} ${shortName(dog)} has gone to live on a farm.` });
    dropLoot(stageId, 'is left behind');
  };

  // What a failed check costs the dog who fumbled it.
  // Going in, a fumble mostly raises the alarm; on the way out (or once the
  // alarm is ringing) it gets dogs nicked or worse.
  const fallout = (stageId, second) => {
    const f = ctx.lastFail;
    if (!f || !active().includes(f.dog)) return;
    const a = APPROACHES[f.approachId];
    const risky = RISKY.has(a.skill) || ['drill', 'van', 'grapple'].includes(a.needKit);
    const goingIn = !ctx.vaultDone && ctx.alarm < 6;
    const pLose = (second ? 0.45 : 0.3) * (goingIn ? 0.5 : 1) * (1 - 0.12 * roleLevel(active(), 'leader'));
    if (risky && f.margin > (second ? 0.2 : 0.3) && rng.chance(pLose)) loseDog(f.dog, stageId, a.skill);
    else if (rng.chance(second ? 0.55 : 0.12 + ctx.alarm * 0.04)) {
      beat({ kind: 'chaos', stage: stageId, dog: f.dog.id, text: `${shortName(f.dog)} has been spotted!` });
      if (goingIn) addAlarm(1, stageId);
      else escapeCheck(f.dog, stageId);
    }
  };

  const escapeCheck = (dog, stageId) => {
    let p = 0.5 + 0.06 * Math.max(skillOf(dog, 'agility'), skillOf(dog, 'sneak'), skillOf(dog, 'wheels')) - 0.035 * ctx.alarm;
    if (hasSpecial(dog, 'escape')) { p += 0.2; learn(dog, 'talents', dog.talents.find((t) => ['getaway', 'parkour'].includes(t))); }
    if (ctx.kitLeft.smoke > 0) {
      p += 0.2;
      useKit('smoke');
    }
    if (job.safehouse) p += 0.05;
    if (ctx.kitLeft.scanner > 0) p += KIT.scanner.escape;
    if (ctx.coppers) p -= 0.1;
    p = clamp(p, 0.08, 0.92);
    if (rng.chance(p)) {
      beat({ kind: 'escape', stage: stageId, dog: dog.id, text: `${shortName(dog)} gives them the slip.` });
      return true;
    }
    ctx.captured.push({ id: dog.id, stage: stageId });
    beat({ kind: 'caught', stage: stageId, dog: dog.id, text: `${shortName(dog)} is collared by the Old Bill!`, line: say(dog, 'caught') });
    dropLoot(stageId, 'goes with them into the police van');
    return false;
  };

  const grabLoot = (stage) => {
    if (job.hazards.silent && !job.intel.hz_silent) {
      beat({ kind: 'alarm', stage: stage.id, text: 'Nobody hears it, but a silent alarm has just rung at the police station.' });
      addAlarm(4, stage.id);
    }
    const cap = carryCapacity(active(), ctx.kitLeft);
    if (ctx.kitLeft.bags > 0) useKit('bags');
    let used = 0;
    const byRatio = job.loot.slice().sort((x, y) => y.value / y.bulk - x.value / x.bulk);
    const left = [];
    for (const l of byRatio) {
      if (used + l.bulk <= cap) { ctx.secured.push(l.id); used += l.bulk; } else left.push(l);
    }
    beat({ kind: 'loot', stage: stage.id, text: `${{ hack: 'Moved', fraud: 'Moved', fix: 'The bets come in' }[job.type] || 'In the bag'}: ${ctx.secured.map(lootName).join(', ')}.` + (left.length ? ` Had to leave ${left.map((l) => l.name).join(', ')} — too heavy.` : '') });
  };

  const betrayals = () => {
    for (const d of active()) {
      if (d.quirks.includes('goodboy') || d.undercover) continue;
      if (!ctx.secured.length) break;
      const p = Math.max(0, (d.greed - loyaltyOf(d) - 10 * roleLevel(active(), 'leader')) / 100) * 0.6 + (ctx.pearShaped ? 0.06 : 0);
      if (rng.chance(p)) {
        const lootId = ctx.secured.shift();
        ctx.runners.push({ id: d.id, lootId });
        learn(d, 'loyalty');
        beat({ kind: 'betray', stage: 'vault', dog: d.id, text: `${shortName(d)} grabs ${lootName(lootId)} and legs it out a side door! Didn't even say goodbye.` });
      }
    }
  };

  // ---- Each step of the job
  // Who leads a step, and how: the plan, or whoever's best placed if the plan has fallen through.
  const lead = (stage) => {
    if (stage.hidden) {
      const b = bestFor(stage, [], 1.5);
      if (!b) return null;
      beat({ kind: 'surprise', stage: stage.id, text: `Surprise! ${stage.label}. Nobody said anything about this!` });
      ctx.pearShaped = true;
      return { dog: b.dog, approach: b.approach, extra: 1.5 };
    }
    const choice = plan[stage.id] || {};
    let dog = state.dogs[choice.dog];
    let approach = choice.approach;
    if (!dog || !active().includes(dog)) {
      const b = bestFor(stage);
      if (!b) return null;
      if (dog) beat({ kind: 'improv', stage: stage.id, dog: b.dog.id, text: `${shortName(dog)} isn't here. ${shortName(b.dog)} steps up.` });
      dog = b.dog;
      approach ||= b.approach;
    }
    if (!approach || !approachAvailable(state, job, approach, ctx.kitLeft, active()).ok) {
      const b = bestFor(stage);
      if (!b) return null;
      beat({ kind: 'improv', stage: stage.id, text: `The plan called for ${approach ? APPROACHES[approach].label.toLowerCase() : 'something'}, but that's off the table now.` });
      approach = b.approach;
      if (!canDo(dog, approach)) dog = b.dog;
    }
    // A signature move is its owner's to pull off.
    if (!canDo(dog, approach)) dog = active().find((d) => canDo(d, approach));
    return { dog, approach, extra: 0 };
  };

  // A fumbled step goes pear-shaped: fallout, maybe a twist of chaos, then someone improvises.
  // Returns whether the step got done, or null once there's nobody left to try.
  const recover = (stage, { approach, extra }) => {
    if (!ctx.pearShaped) {
      ctx.pearShaped = true;
      beat({ kind: 'pear', stage: stage.id, text: 'It\'s all gone PEAR-SHAPED!' });
      const lead = active().filter((d) => d.role?.kind === 'leader').sort((a, b) => b.role.level - a.role.level)[0];
      if (lead) {
        ctx.alarm = Math.max(0, ctx.alarm - 1);
        beat({ kind: 'good', stage: stage.id, dog: lead.id, text: `${shortName(lead)} keeps everyone calm. "Stick to the plan. We\'ve got this."` });
      }
    }
    fallout(stage.id, false);
    if (!active().length) return null;
    if (rng.chance(0.3)) {
      const good = rng.chance(0.5);
      beat({ kind: good ? 'good' : 'chaos', stage: stage.id, text: rng.pick(good ? CHAOS.good : CHAOS.bad) });
      if (good) { ctx.alarm = Math.max(0, ctx.alarm - 1); ctx.nextBonus = 0.15; } else { addAlarm(1, stage.id); ctx.nextBonus = -0.1; }
    }
    const b = bestFor(stage, [approach], extra + 0.5) || bestFor(stage, [], extra + 0.5);
    if (!b) return false;
    const again = b.approach === approach;
    beat({ kind: 'improv', stage: stage.id, dog: b.dog.id, text: again ? `No other way through. ${shortName(b.dog)} has another go.` : `${shortName(b.dog)} improvises: ${APPROACHES[b.approach].label.toLowerCase()}!` });
    if (attempt(stage, b.approach, b.dog, extra + 0.5, 'improv')) return true;
    fallout(stage.id, true);
    return active().length ? false : null;
  };

  const succeed = (stage) => {
    // With the police outside, even a clean exit is a scramble.
    if (ctx.coppers && OUT.includes(stage.kind)) {
      for (const d of active()) if (rng.chance(0.2)) escapeCheck(d, stage.id);
    }
    if (stage.kind !== 'vault') return;
    ctx.vaultDone = true;
    if (job.callingCard) {
      ctx.clues += 1;
      beat({ kind: 'info', stage: stage.id, text: 'The crew leave your calling card where the goods used to be: a monogrammed biscuit. Somebody will notice.' });
    }
    if (APPROACHES[ctx.lastOk]?.swap) ctx.swap = true;
    grabLoot(stage);
    betrayals();
  };

  // Both tries at a step failed. Some kinds of job tell it their own way.
  const FAILED = {
    con: { entry: 'The mark isn\'t biting. Everyone melts away.', vault: 'At the last moment, the mark keeps hold of it.', exit: 'The mark twigs. Scatter!' },
    van: { entry: 'The van gets away. The job\'s off.', vault: 'The back doors won\'t budge. Empty-pawed.' },
    smash: { entry: 'The glass holds. The job\'s off. Leg it!' },
    hack: { entry: 'The network won\'t let them in. The job\'s off.', vault: 'The transfer bounces. Nothing moves.' },
    fraud: { entry: 'They don\'t get the job. That\'s that.', vault: 'The books won\'t cook. Nothing to take.' },
    tunnel: { entry: 'No shop, no tunnel. The job\'s off.', vault: 'The boxes won\'t open. Back down the hole, empty-pawed.' },
    roof: { entry: 'Nobody can get up there. The job\'s off.' },
    fix: { entry: 'Nobody can get near the favourite. The fix is off.', vault: 'The favourite wins fair and square. Every bet\'s lost.', exit: 'The bookies won\'t pay out. Scarper!' },
    train: { entry: 'The train thunders past. The job\'s off.', vault: 'The mail car won\'t open. The train pulls away.' },
  }[job.type] || {};
  const botch = (stage) => {
    const id = stage.id;
    const fail = (text) => beat({ kind: 'fail', stage: id, text });
    const scatter = (text) => {
      fail(text);
      for (const d of active()) escapeCheck(d, id);
    };
    switch (stage.kind) {
      case 'entry':
        // Only a building has a back window to put a bin through.
        if (['breakin', 'swap'].includes(job.type || 'breakin') && ctx.alarm < 6 && rng.chance(0.5)) {
          beat({ kind: 'chaos', stage: id, text: 'Sod finesse. They put a bin through a back window and climb in. Loud, but they\'re in.' });
          ctx.clues += 1;
          addAlarm(3, id);
          return;
        }
        fail(FAILED.entry || 'They can\'t get in. "Abort! ABORT!" Everyone legs it.');
        ctx.aborted = true;
        if (ctx.alarm >= 4) for (const d of active()) if (rng.chance(0.5)) escapeCheck(d, id);
        return;
      case 'obstacle':
        fail('No finesse left. They barge straight through.');
        addAlarm(2, id);
        return;
      case 'vault': return fail(FAILED.vault || 'The vault won\'t budge. They\'ll have to leave empty-pawed.');
      case 'exit': return scatter(FAILED.exit || 'Every exit\'s blocked. Scatter!');
      case 'getaway': return scatter('The getaway\'s blown. Every dog for himself!');
    }
  };

  // ---- Afterwards
  const interrogate = (d) => {
    let pTalk = clamp((75 - loyaltyOf(d) * 0.5 - d.nerve * 0.3) / 100 - 0.05 * roleLevel(crew, 'leader'), 0.03, 0.9);
    if (d.quirks.includes('looselips')) pTalk += 0.3;
    if (job.fakeIds) pTalk -= 0.15;
    if (d.quirks.includes('nevergrass')) pTalk = 0;
    const talked = rng.chance(clamp(pTalk, 0, 0.95));
    const sentence = rng.int(2, 3) + (ctx.coppers ? 1 : 0);
    learn(d, 'loyalty');
    if (d.quirks.includes('mumbles')) {
      learn(d, 'quirks', 'mumbles');
      beat({ kind: 'interrogation', stage: null, dog: d.id, text: `The Inspector grills ${shortName(d)} for three hours. He talks the whole time. Nobody understands a single word.`, line: say(d, 'talk') });
      return { id: d.id, talked: false, mumbled: true, sentence };
    }
    if (talked) {
      if (d.quirks.includes('looselips')) learn(d, 'quirks', 'looselips');
      beat({ kind: 'interrogation', stage: null, dog: d.id, text: `Under the lamp, ${shortName(d)} cracks. The Inspector's pencil is very busy.`, line: say(d, 'talk') });
      return { id: d.id, talked: true, sentence: Math.max(1, sentence - 1) };
    }
    if (d.quirks.includes('nevergrass')) learn(d, 'quirks', 'nevergrass');
    beat({ kind: 'interrogation', stage: null, dog: d.id, text: `${shortName(d)} stares at the wall for six hours. Not a word. Off to the pound.`, line: say(d, 'caught') });
    return { id: d.id, talked: false, sentence };
  };

  // A stranger's tip that was the Inspector all along.
  const springSetup = (stage) => {
    ctx.setup = true;
    beat({ kind: 'alarm', stage: stage.id, text: SETUP_TEXT });
    ctx.ringing = true;
    ctx.coppers = true;
    ctx.alarm = ctx.alarmMax = ALARM_MAX;
    ctx.clues += 3;
    for (const d of active()) escapeCheck(d, stage.id);
  };

  // ==== The job itself
  beat({ kind: 'intro', stage: null, text: `${String(job.hour).padStart(2, '0')}:00. ${job.venueName}, ${job.district}. The crew is in position.` });

  // Undercover coppers in the crew.
  for (const u of crew.filter((d) => d.undercover)) {
    const sniffer = crew.find((d) => d.id !== u.id && hasSpecial(d, 'sniff') && !d.undercover);
    if (sniffer && rng.chance(0.65)) {
      ctx.exposed.push(u.id);
      learn(u, 'undercover');
      learn(sniffer, 'talents', 'snifftest');
      beat({ kind: 'good', stage: null, dog: sniffer.id, text: `${shortName(sniffer)} sniffs ${shortName(u)}'s collar. "Cheap aftershave. Police issue." ${shortName(u)} is a plant! Sent packing before the job starts.` });
    } else {
      ctx.tipped.push(u.id);
    }
  }
  if (ctx.tipped.length) {
    beat({ kind: 'omen', stage: null, text: 'Something feels off. The street is too quiet. Was that a van with a ladder on it?' });
    addAlarm(3, null);
  }

  // Personal drama that follows a dog to work turns up at one step (see drama.js).
  const troubled = crew.filter((d) => d.drama?.trouble);
  const troubleAt = troubled.length ? rng.int(0, job.stages.length - 2) : -1;
  const trouble = (stage) => {
    for (const d of troubled.filter((x) => active().includes(x))) {
      const t = d.drama.trouble;
      beat({ kind: 'chaos', stage: stage.id, dog: d.id, text: t.text });
      if (t.kind === 'heavies') {
        addAlarm(3, stage.id);
        if (rng.chance(0.5) && active().includes(d)) escapeCheck(d, stage.id);
      } else if (t.kind === 'relative') {
        ctx.clues += 2;
        addAlarm(1, stage.id);
      } else if (t.kind === 'tail') {
        ctx.clues += 3;
        addAlarm(2, stage.id);
      }
    }
  };

  // Wildcards: now and then, something happens. Usually good, sometimes not.
  const wildcards = (stage) => {
    for (const d of active().filter((x) => x.role?.kind === 'wildcard')) {
      if (!rng.chance(0.1 + 0.03 * d.role.level)) continue;
      const good = rng.chance(0.5 + 0.04 * d.role.level);
      const e = rng.pick(good ? WILD.good : WILD.bad);
      beat({ kind: good ? 'good' : 'chaos', stage: stage.id, dog: d.id, text: e.text.replace(/\{d\}/g, shortName(d)) });
      if (e.alarm > 0) addAlarm(e.alarm, stage.id);
      if (e.alarm < 0) ctx.alarm = Math.max(0, ctx.alarm + e.alarm);
      if (e.bonus) ctx.nextBonus = e.bonus;
      if (e.clues) ctx.clues = Math.max(0, ctx.clues + e.clues);
      if (e.smoke) ctx.kitLeft.smoke = (ctx.kitLeft.smoke || 0) + e.smoke;
    }
  };

  for (const [k, stage] of job.stages.entries()) {
    if (ctx.aborted || !active().length) break;
    if (k === troubleAt) trouble(stage);
    wildcards(stage);
    if (!active().length) break;
    if (stage.kind === 'vault' && job.sting) {
      springSetup(stage);
      break;
    }
    const pick = lead(stage);
    if (!pick) {
      if (stage.hidden) continue;
      break;
    }
    beat({ kind: 'stage', stage: stage.id, dog: pick.dog.id, text: `${stage.icon} ${stage.label}: ${shortName(pick.dog)} — ${APPROACHES[pick.approach].label}.` });
    let ok = attempt(stage, pick.approach, pick.dog, pick.extra, 'plan');
    if (!ok) ok = recover(stage, pick);
    if (ok === null) break;
    if (ok) succeed(stage);
    else botch(stage);
  }

  // Stakeout at the getaway
  if (!ctx.aborted && job.hazards.stakeout && job.time === job.stakeoutTime) {
    ctx.clues += 2;
    beat({ kind: 'omen', stage: 'getaway', text: 'An unmarked car across the road. Someone inside is taking photos...' });
  }

  // Van burned
  if (ctx.kitLeft.van > 0 && ctx.alarmMax >= 6 && Object.values(plan).some((p) => p && ['e_ram', 'g_van'].includes(p.approach))) {
    useKit('van');
    beat({ kind: 'info', stage: 'getaway', text: 'The van\'s been clocked. It goes in the river.' });
  }

  // Clue adjustments
  const escaped = active().filter((d) => !ctx.tipped.includes(d.id));
  const eater = crew.find((d) => d.quirks.includes('eatsevidence') && ctx.acted.has(d.id));
  if (eater && ctx.clues > 0) {
    ctx.clues -= 1;
    learn(eater, 'quirks', 'eatsevidence');
    beat({ kind: 'good', stage: null, dog: eater.id, text: `${shortName(eater)} quietly eats a glove someone dropped. Evidence: gone.` });
  }
  if (job.fakeIds && ctx.clues > 0) ctx.clues -= 1;
  for (const d of escaped) {
    if (d.quirks.includes('looselips') && rng.chance(0.5)) {
      ctx.clues += 1;
      learn(d, 'quirks', 'looselips');
      beat({ kind: 'chaos', stage: null, dog: d.id, text: `Later, down the pub, ${shortName(d)} tells everyone about "a hypothetical job". In detail.` });
    }
  }

  const interrogations = ctx.captured.map((c) => state.dogs[c.id]).filter((d) => !d.undercover).map(interrogate);

  // The undercover reveal
  for (const id of ctx.tipped) {
    const u = state.dogs[id];
    learn(u, 'undercover');
    beat({ kind: 'betray', stage: null, dog: id, text: `Turns out ${shortName(u)} was Mr. Orange all along — an undercover copper! Everything goes straight to the Inspector.` });
  }

  const talkedCount = interrogations.filter((i) => i.talked).length;
  let heatGain = ctx.clues * 2 + (ctx.ringing ? 3 : 0) + (ctx.coppers ? 4 : 0) + talkedCount * 8 + ctx.tipped.length * 25;
  if (job.safehouse) heatGain = Math.round(heatGain * 0.6);

  const outcome = outcomeOf(ctx);
  const swap = ctx.swap && outcome === 'clean';
  beat({ kind: 'end', stage: null, text: END_TEXT[ctx.setup ? 'setup' : swap ? 'swap' : outcome] });

  return {
    beats,
    outcome,
    secured: ctx.secured,
    dropped: ctx.dropped,
    alarmMax: ctx.alarmMax,
    clues: ctx.clues,
    coppers: ctx.coppers,
    pearShaped: ctx.pearShaped,
    aborted: ctx.aborted,
    swap,
    setup: !!ctx.setup,
    captured: interrogations,
    lost: ctx.lost,
    runners: ctx.runners,
    exposed: ctx.exposed,
    tipped: ctx.tipped,
    escaped: escaped.map((d) => d.id),
    crew: crewIds,
    kitUsed: ctx.kitUsed,
    learned: ctx.learned,
    practised: ctx.practised,
    heatGain,
  };
}


function skillTalent(t, skill) {
  return TALENTS[t] && TALENTS[t].skill === skill;
}

// An uneventful result for the given crew; dev hooks and tests stage outcomes with it.
export function blankResult(crew, extra = {}) {
  return {
    beats: [], outcome: 'clean', secured: [], dropped: [], alarmMax: 0, clues: 0, coppers: false, pearShaped: false, aborted: false, swap: false,
    captured: [], lost: [], runners: [], exposed: [], tipped: [], escaped: crew.slice(), crew: crew.slice(), kitUsed: {}, learned: {}, practised: {}, heatGain: 0,
    ...extra,
  };
}

// Debug hooks (window.cd) and the diagnostics overlay. Enabled with ?dev=1.
// Kept working for the life of the project — tests drive the game through these.
import * as E from './engine.js';
import { genDog } from './dogs.js';
import { blankResult } from './sim.js';
import { startArc } from './drama.js';
import { inspectorMoves, moFile } from './inspector.js';
import { rivalsBetweenJobs, rivalsOf, ghostScene } from './rivals.js';
import { newRunner } from './runners.js';
import { genJob } from './heists.js';
import { KIT } from './data.js';
import { VERSION } from './version.js';
import { SCREENS, currentScreen } from './ui.js';

let gpuString = null;
function gpu() {
  if (gpuString !== null) return gpuString;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    if (!gl) return (gpuString = 'no-webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpuString = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (e) {
    gpuString = 'error';
  }
  return gpuString;
}

export function snapshot(G) {
  const s = G.state;
  const r = s?.result;
  return {
    screen: currentScreen(G),
    modal: G.ui.modal,
    frozen: G.frozen,
    phase: s?.phase ?? null,
    seed: s?.seed ?? null,
    day: s?.day, cash: s?.cash, rep: s?.rep, heat: s?.heat,
    job: s?.job ? {
      id: s.job.id, name: s.job.name, type: s.job.type, noInsider: !!s.job.noInsider, tier: s.job.tier, daysLeft: s.job.daysLeft, time: s.job.time, hour: s.job.hour, alert: s.job.alert,
      stages: s.job.stages.map((st) => ({ id: st.id, label: st.label, hidden: !!st.hidden, options: st.options.length, needs: st.needs || null })),
      intel: s.job.intel, plan: s.job.plan, loot: s.job.loot.map((l) => ({ name: l.name, value: l.value })), patron: s.job.patron, owner: s.job.owner,
    } : null,
    crew: s ? s.crew.map((id) => ({ id, name: s.dogs[id].first, undercover: s.dogs[id].undercover })) : [],
    pub: s ? s.pub.length : 0,
    stars: s ? s.pub.map((id) => s.dogs[id]).filter((d) => d.rarity).map((d) => ({ id: d.id, rarity: d.rarity, signature: d.signature, fee: d.fee })) : [],
    dogs: s ? Object.keys(s.dogs).length : 0,
    kit: s?.kit,
    offers: s?.offers?.map((o) => ({ id: o.id, source: o.source, kind: o.kind, name: o.job.name, owner: o.job.owner, type: o.job.type, tip: !!o.job.tip, sting: !!o.job.sting, watched: !!o.job.watched, twist: o.job.twist || null })) ?? [],
    groups: s?.groups ? Object.fromEntries(Object.entries(s.groups).map(([k, g]) => [k, { standing: g.standing, met: g.met, debt: g.debt?.amount ?? 0 }])) : null,
    story: s?.story?.length ?? 0,
    books: s?.books ? { open: s.books.open, jobs: s.books.jobs.map((j) => ({ label: j.label, net: j.net })) } : null,
    timeline: s?.timeline ?? [],
    rivals: s ? Object.fromEntries(Object.entries(rivalsOf(s)).map(([k, r]) => [k, { met: r.met, status: r.status, beef: r.beef, notes: r.notes, interest: r.interest, test: !!r.test, board: r.board?.id || null }])) : null,
    inspector: s ? { met: !!s.inspector?.met, plant: !!s.inspector?.plant, moves: (s.inspector?.moves || []).map((m) => m.move), file: moFile(s), story: s.story.map((x) => x.type) } : null,
    history: s?.history?.map((h) => ({ name: h.name, grade: h.grade, type: h.type, steps: h.steps?.length ?? 0, crew: h.crew?.length ?? 0 })) ?? [],
    arcs: s?.arcs?.map((a) => ({ id: a.id, kind: a.kind, dog: a.dog, node: a.node, wait: a.wait, shown: a.shown })) ?? [],
    drama: s ? Object.values(s.dogs).filter((d) => d.drama).map((d) => ({ id: d.id, ...d.drama })) : [],
    heist: r ? { beat: G.ui.heist.i, beats: r.beats.length, playing: G.ui.heist.playing, alarm: r.beats[Math.min(G.ui.heist.i, r.beats.length - 1)].alarm, outcome: r.outcome } : null,
    after: s?.after ? { step: s.after.step, grade: s.after.grade?.letter ?? null, received: s.after.received, relations: s.after.relations } : null,
    over: s?.over ?? null,
    version: VERSION,
    runners: s?.runners ? Object.values(s.runners).map((r) => ({ dog: r.dog, stage: r.stage, leads: r.leads, ended: r.ended || null, board: r.board?.id || null })) : [],
    repute: s ? { rep: s.rep, generosity: s.generosity ?? 50, hardness: s.hardness ?? 0, parts: s.repParts || {} } : null,
    stats: s?.stats,
    frameMs: +G.stats.frameMs.toFixed(2),
    frames: G.stats.frames,
    simTime: +G.stats.simTime.toFixed(3),
    renders: G.stats.renders,
    renderMs: +(G.stats.renderMs || 0).toFixed(2),
    renderMax: +(G.stats.renderMax || 0).toFixed(2),
    saveBytes: G.stats.saveBytes ?? (() => { try { return (localStorage.getItem(G.saveKey) || '').length; } catch { return -1; } })(),
    domNodes: document.getElementsByTagName('*').length,
    drawCalls: 0, // DOM/SVG renderer: no GL draw calls
    shaderPrograms: 0,
    renderer: gpu(),
    contextLost: false,
    errors: G.stats.errors.slice(-5),
    invariants: s ? E.invariants(s) : [],
  };
}

// Dev shortcut: planning screens need a job, so take the first offer on the board.
function ensurePlan(G) {
  const s = G.state;
  if (s?.phase === 'select') { s.story = []; E.acceptOffer(s, s.offers[0].id); }
}

export function installDebug(G) {
  const cd = {
    screens: () => SCREENS.slice(),
    getState: () => snapshot(G),
    live: () => G.state, // the real state, for scripted set-ups (call cd.teleport or similar to re-render)
    teleport(spot) {
      if (!G.state && !['title', 'intro'].includes(spot)) cd.setSeed(1);
      const s = G.state;
      if (spot === 'select') {
        if (s.phase !== 'select' && s.phase !== 'over') {
          if (s.phase === 'heist') { G.ui.heist.i = s.result.beats.length - 1; E.resolveHeist(s); }
          if (s.phase === 'aftermath') { s.after.step = 'grade'; s.after.grade ||= E.gradeJob(s); }
          E.nextJob(s);
        }
      } else if (!['title', 'intro', 'over'].includes(spot)) ensurePlan(G);
      if (spot === 'heist' || spot === 'aftermath') {
        if (s.phase === 'plan') {
          if (!s.crew.length) E.hire(s, s.pub.find((id) => s.dogs[id].fee <= s.cash) || s.pub[0]);
          E.pullJob(s);
          G.ui.heist = { i: 0, playing: false };
        }
        if (spot === 'aftermath' && s.phase === 'heist') { G.ui.heist.i = s.result.beats.length - 1; E.resolveHeist(s); }
      } else if (spot === 'over') {
        cd.lose();
      }
      G.ui.screen = spot;
      G.ui.modal = null;
      G.commit();
      return currentScreen(G);
    },
    freeze() { G.frozen = true; G.render(); },
    resume() { G.frozen = false; G.render(); },
    step(n = 1) {
      for (let k = 0; k < n; k++) {
        G.stats.simTime += G.fixedDt;
        if (G.state?.phase === 'heist') G.advanceBeat(false);
      }
      G.commit();
      return snapshot(G).heist;
    },
    simdt(ms) { G.beatMs = ms; },
    setTimeOfDay(h) {
      if (!G.state) return;
      const t = h >= 7 && h < 19 ? 'day' : 'night';
      E.setTime(G.state, t);
      G.state.job.hour = h;
      G.commit();
    },
    setSeed(n) {
      G.state = E.newGame(n);
      G.ui = { ...G.ui, screen: 'job', modal: null, heist: { i: 0, playing: true } };
      G.commit();
      return n;
    },
    spawn(kind, at) {
      const s = G.state;
      if (!s) return null;
      if (kind === 'dog') {
        const rarity = at === 'rare' ? 'rare' : at === 'legend' ? 'legendary' : null;
        if (at === 'crew' || rarity) ensurePlan(G);
        const rng = E.rngOf(s);
        const d = genDog(s, rng, { undercover: at === 'copper', quality: 1, rarity, signature: !!rarity });
        if (rarity) d.inTown = s.townKey ?? s.job?.id;
        s.dogs[d.id] = d;
        s.pub.push(d.id);
        if (at === 'crew') { s.cash += d.fee; E.hire(s, d.id); }
        G.commit();
        return d.id;
      }
      if (kind === 'arc') {
        // A story for someone you know: spawn('arc', 'debt' | 'family' | 'partner' | 'mentor' | 'tape' | 'box' | 'watched')
        const d = Object.values(s.dogs).find((x) => x.met && x.status === 'free');
        if (!d) return null;
        const arc = startArc(s, at || 'debt', d.id, E.rngOf(s));
        G.commit();
        return arc.id;
      }
      if (kind === 'move') {
        // The Inspector makes a move: spawn('move', 'plant' | 'stakeout' | 'warn' | 'tail' | 'questioning' | 'lineup' | 'strip' | 'sting' | 'flip' | 'raid')
        const st = inspectorMoves(s, E.rngOf(s), { genJob, force: at || 'plant' });
        G.commit();
        return st?.move || at;
      }
      if (kind === 'rival') {
        // A rival's scene: spawn('rival', 'jacksIntro' | 'jacksMischief' | 'danIntro' | 'danNote' | 'danWager' | 'ghost')
        const rng = E.rngOf(s);
        const R = rivalsOf(s);
        if (at === 'ghost') { R.ghost.interest = Math.max(R.ghost.interest, 2); ghostScene(s, rng); }
        else {
          if (at?.startsWith('jacks')) R.jacks.met = true;
          if (at?.startsWith('dan') && at !== 'danIntro') { R.dan.met = true; R.dan.notes = Math.max(R.dan.notes, 3); }
          rivalsBetweenJobs(s, rng, { genJob, force: at || 'jacksIntro' });
        }
        G.commit();
        return s.story.at(-1)?.move;
      }
      if (kind === 'runner') {
        // One of your book does a runner: spawn('runner') — their plotline starts.
        const d = Object.values(s.dogs).find((x) => x.met && x.status === 'free' && !x.undercover);
        if (!d) return null;
        Object.assign(d, { status: 'gone', left: 'runner', relation: -100, ranWith: 'the biscuit tin' });
        newRunner(s, d, 'the biscuit tin', 800, E.rngOf(s));
        G.commit();
        return d.id;
      }
      if (kind === 'retire') { s.cash = Math.max(s.cash, 100000); G.commit(); return s.cash; }
      if (kind === 'cash') { s.cash += Number(at) || 1000; G.commit(); return s.cash; }
      if (kind === 'kit') { const ids = at ? [at] : Object.keys(KIT); for (const k of ids) s.kit[k] = (s.kit[k] || 0) + 1; G.commit(); return s.kit; }
      if (kind === 'rep') { s.rep = Number(at) || 60; G.commit(); return s.rep; }
      if (kind === 'intel') { for (const k of Object.keys(s.job.intel)) { s.job.intel[k] = true; } for (const st of s.job.stages) st.hidden = false; G.commit(); return s.job.intel; }
      return null;
    },
    clearAll() {
      G.clearSave();
      G.state = null;
      G.ui = { screen: 'title', modal: null, heist: { i: 0, playing: true }, introPage: 0 };
      G.commit();
    },
    win() {
      const s = G.state;
      if (!s) return;
      ensurePlan(G);
      if (!s.crew.length) {
        s.cash += 2000;
        s.pub.find((id) => E.hire(s, id).ok); // the first who'll come
      }
      s.job.buyer = true;
      s.result = blankResult(s.crew, {
        beats: [{ kind: 'intro', stage: null, text: 'A perfect night.', alarm: 0, clues: 0 }, { kind: 'end', stage: null, text: 'They won\'t even know they\'ve been robbed.', alarm: 0, clues: 0 }],
        secured: s.job.loot.map((l) => l.id), swap: true,
      });
      s.phase = 'heist';
      E.resolveHeist(s);
      if (s.after.step === 'deliver') E.deliver(s);
      if (s.after.step === 'fence') E.fence(s, 'collector');
      E.payCrew(s, 30);
      G.commit();
      return s.after.grade.letter;
    },
    lose() {
      if (!G.state) cd.setSeed(1);
      G.state.heat = 100;
      E.checkGameOver(G.state);
      G.commit();
      return G.state.over;
    },
    cam(name) {
      // 'blueprint' is just the current screen from the top.
      G.ui.modal = null;
      if (name === 'overview' && G.state?.phase === 'plan') G.ui.screen = 'job';
      if (name === 'hero-close') {
        ensurePlan(G);
        G.ui.modal = { type: 'dog', id: G.state.crew[0] || G.state.pub[0] };
      }
      if (name === 'hud-check') G.showDiag(true);
      G.commit();
      window.scrollTo(0, 0);
      return name;
    },
  };
  window.cd = cd;
  return cd;
}

export function updateOverlay(G) {
  const el = document.getElementById('diag');
  if (el.hidden) return;
  const s = snapshot(G);
  el.textContent = `CRIMEDOG dev\nscreen ${s.screen} phase ${s.phase}\nframe ${s.frameMs}ms  frames ${s.frames}\nrenders ${s.renders}  dom ${s.domNodes}\nsim ${s.simTime}s ${G.frozen ? '[FROZEN]' : ''}\ngpu ${s.renderer}\nerr ${s.errors.length ? s.errors[s.errors.length - 1] : '-'}`;
}

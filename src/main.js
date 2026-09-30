// Boot, save/load, input routing and the frame loop.
import * as E from './engine.js';
import { render, currentScreen, hiringFor } from './ui.js';
import { installDebug, updateOverlay } from './debug.js';
import { cardPNG, shareBlob } from './card.js';

const SAVE_KEY = 'crimedog.save.v2';
const params = new URLSearchParams(location.search);

const G = {
  state: null,
  ui: { screen: 'title', modal: null, heist: { i: 0, playing: true }, introPage: 0 },
  stats: { renders: 0, frames: 0, frameMs: 0, simTime: 0, errors: [] },
  frozen: false,
  fixedDt: 1 / 60,
  beatMs: Number(params.get('simdt')) || 1500,
  dev: params.has('dev'),
};

// ------------------------------------------------------------------ persistence
G.hasSave = () => {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
};
G.save = () => {
  if (!G.state) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state: G.state, screen: G.ui.screen, heistI: G.ui.heist.i }));
  } catch { /* private mode etc. */ }
};
G.load = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.state || data.state.version !== 2) return false;
    G.state = data.state;
    G.ui.screen = data.screen || 'job';
    G.ui.heist = { i: data.heistI || 0, playing: true };
    return true;
  } catch { return false; }
};
G.clearSave = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
};
G.commit = () => {
  G.save();
  G.render();
};
G.render = () => {
  const t0 = performance.now();
  render(G);
  const ms = performance.now() - t0;
  G.stats.renderMs = ms;
  G.stats.renderMax = Math.max(G.stats.renderMax || 0, ms);
};
G.clearToasts = () => { document.getElementById('toast').innerHTML = ''; };
G.showDiag = (on) => {
  document.getElementById('diag').hidden = !on;
  updateOverlay(G);
};

// ------------------------------------------------------------------ feedback
function toast(msg, bad) {
  if (!msg) return;
  const root = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `t ${bad ? 'bad' : ''}`;
  el.textContent = msg;
  root.appendChild(el);
  while (root.children.length > 2) root.firstChild.remove();
  setTimeout(() => el.remove(), 2900);
}
G.toast = toast;

const QUIET = new Set([E.setPlan, E.autoPlan, E.resolveHeist, E.setTime]);
function run(fn, ...args) {
  const r = fn(G.state, ...args);
  if (r && r.msg && (!r.ok || !QUIET.has(fn))) toast(r.msg, !r.ok);
  G.commit();
  return r;
}

// ------------------------------------------------------------------ heist playback
G.advanceBeat = (doRender = true) => {
  const r = G.state?.result;
  if (!r) return;
  if (G.ui.heist.i < r.beats.length - 1) G.ui.heist.i++;
  if (G.ui.heist.i >= r.beats.length - 1) G.ui.heist.playing = false;
  if (doRender) {
    G.commit();
    document.querySelector('.beat[data-latest]')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }
};

// ------------------------------------------------------------------ actions
// Back to the plan, scrolled to (and briefly highlighting) the step we hired for.
function returnToPlan(stageId) {
  G.ui.hireFor = null;
  G.ui.modal = null;
  G.ui.screen = 'plan';
  G.commit();
  const el = stageId && document.querySelector(`.stage[data-stage="${stageId}"]`);
  if (el) {
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
  } else window.scrollTo(0, 0);
}

const A = {
  'go'(el) {
    G.clearToasts();
    G.ui.hireFor = null;
    G.ui.screen = el.dataset.to;
    G.ui.modal = null;
    // First look at the plan: have the crew pencil one in, so there's something to tweak.
    const s = G.state;
    if (el.dataset.to === 'plan' && s?.phase === 'plan' && s.crew.length && !Object.keys(s.job.plan).length) {
      E.autoPlan(s);
      toast('The crew pencilled in a plan. Tweak it.');
    }
    G.commit();
    window.scrollTo(0, 0);
  },
  'new-game'() {
    const seed = params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
    G.state = E.newGame(seed);
    G.ui = { ...G.ui, screen: 'intro', introPage: 0, modal: null, heist: { i: 0, playing: true } };
    G.commit();
  },
  'continue'() {
    if (!G.load()) toast('No saved game.', true);
    G.render();
  },
  'intro-next'() { G.ui.introPage++; G.render(); },
  'start'() { G.ui.screen = 'job'; G.commit(); window.scrollTo(0, 0); },
  'take-offer'(el) {
    const r = E.acceptOffer(G.state, el.dataset.id);
    toast(r.msg, !r.ok);
    if (r.ok) G.ui.screen = 'job';
    G.commit();
    window.scrollTo(0, 0);
  },
  'dig-leads'() { run(E.digLeads); },
  'borrow'() { run(E.borrow); },
  'pay-debt'(el) { run(E.payDebt, el.dataset.g); },
  'story-ok'() { E.dismissStory(G.state); G.commit(); },
  'deliver'() { run(E.deliver); },
  'time'(el) { run(E.setTime, el.dataset.t); },
  'pick'(el) { G.ui.modal = { type: 'pick', purpose: el.dataset.purpose }; G.render(); },
  'picked'(el) {
    G.ui.modal = null;
    if (el.dataset.purpose === 'case') run(E.caseJoint, el.dataset.id);
    else run(E.plantInsider, el.dataset.id);
  },
  'walk-away'(el) {
    if (G.ui.confirmWalk) { G.ui.confirmWalk = false; run(E.nextJob); G.ui.screen = 'job'; G.render(); return; }
    G.ui.confirmWalk = true;
    el.textContent = 'Really walk away? (-3 rep) Tap again.';
    el.classList.add('red');
  },
  'ask-around'() { run(E.askAround); },
  'buy'(el) { run(E.buy, el.dataset.kit); },
  'bribe'() { run(E.bribeGuard); },
  'safehouse'() { run(E.buySafehouse); },
  'fakeids'() { run(E.buyFakeIds); },
  'buyer'() { run(E.lineUpBuyer); },
  'vet'() { run(E.vetFence); },
  'laylow'() { run(E.layLow); },
  'dog'(el) { G.ui.modal = { type: 'dog', id: el.dataset.id }; G.ui.confirmFarm = null; G.render(); },
  'close-modal'() { G.ui.modal = null; G.ui.confirmFarm = null; G.render(); },
  'hire'(el) {
    const id = el.dataset.id;
    const hf = hiringFor(G);
    const r = E.hire(G.state, id);
    if (!r.ok || !hf) {
      toast(r.msg, !r.ok);
      G.commit();
      return;
    }
    E.assignToStage(G.state, hf.stage.id, id);
    toast(`${r.msg} On step ${hf.n}: ${hf.stage.label}.`);
    returnToPlan(hf.stage.id);
  },
  'hire-for'(el) {
    G.clearToasts();
    G.ui.hireFor = { stage: el.dataset.stage };
    G.ui.screen = 'pub';
    G.ui.modal = null;
    G.commit();
    window.scrollTo(0, 0);
  },
  'hire-back'() { returnToPlan(G.ui.hireFor?.stage); },
  'dismiss'(el) { run(E.dismiss, el.dataset.id); },
  'surveil'(el) { run(E.surveil, el.dataset.id); },
  'lawyer'(el) { run(E.lawyer, el.dataset.id); },
  'farm'(el) {
    const id = el.dataset.id;
    if (G.ui.confirmFarm !== id) { G.ui.confirmFarm = id; G.render(); return; }
    G.ui.confirmFarm = null;
    G.ui.modal = null;
    run(E.farm, id);
  },
  async 'share'(el) {
    const dog = G.state.dogs[el.dataset.id];
    try {
      const blob = await cardPNG(dog);
      if (G.card?.url) URL.revokeObjectURL(G.card.url);
      G.card = { id: dog.id, blob, url: URL.createObjectURL(blob) };
      G.ui.modal = { type: 'card', id: dog.id };
      G.render();
    } catch (e) {
      toast('Couldn\'t draw the card.', true);
      logError(e);
    }
  },
  async 'share-native'() {
    if (!G.card) return;
    const how = await shareBlob(G.state.dogs[G.card.id], G.card.blob);
    if (how === 'shared') toast('Shared.');
    else if (how !== 'cancelled') toast('Sharing isn\'t available here. Long-press the card to save it.', true);
  },
  'plan-ap'(el) {
    const st = el.dataset.stage;
    const ap = el.dataset.ap;
    const cur = G.state.job.plan[st] || {};
    run(E.setPlan, st, { approach: ap, dog: cur.dog || G.state.crew[0] });
  },
  'plan-dog'(el) { run(E.setPlan, el.dataset.stage, { dog: el.dataset.id }); },
  'autoplan'() { run(E.autoPlan); },
  'pull'() {
    const r = E.pullJob(G.state);
    if (!r.ok) { toast(r.msg, true); return; }
    G.ui.heist = { i: 0, playing: true };
    G.ui.screen = 'heist';
    G.commit();
    window.scrollTo(0, 0);
  },
  'heist-toggle'() { G.ui.heist.playing = !G.ui.heist.playing; G.render(); },
  'heist-step'() { G.ui.heist.playing = false; G.advanceBeat(); },
  'heist-skip'() {
    G.ui.heist.i = G.state.result.beats.length - 1;
    G.ui.heist.playing = false;
    G.commit();
    document.querySelector('.beat[data-latest]')?.scrollIntoView({ block: 'end' });
  },
  'resolve'() { run(E.resolveHeist); window.scrollTo(0, 0); },
  'fence'(el) { run(E.fence, el.dataset.f); },
  'pay'(el) { run(E.payCrew, Number(el.dataset.pct)); window.scrollTo(0, 0); },
  'next-job'() {
    run(E.nextJob);
    G.ui.screen = 'job';
    G.render();
    window.scrollTo(0, 0);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-stop]');
  if (!el || el.hasAttribute('data-stop')) return;
  if (el.disabled) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  if (el.dataset.act !== 'walk-away') G.ui.confirmWalk = false;
  try {
    fn(el);
  } catch (err) {
    logError(err);
    toast('Something went wrong.', true);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && G.ui.modal) A['close-modal']();
  if (e.key === '`' && G.dev) G.showDiag(document.getElementById('diag').hidden);
});

function logError(err) {
  G.stats.errors.push(String(err && err.stack ? err.stack.split('\n')[0] : err));
  console.error(err);
}
window.addEventListener('error', (e) => G.stats.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => G.stats.errors.push(String(e.reason)));

// ------------------------------------------------------------------ frame loop
let last = performance.now();
let beatAcc = 0;
let overlayAcc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  G.stats.frames++;
  G.stats.frameMs = G.stats.frameMs * 0.9 + dt * 1000 * 0.1;
  if (!G.frozen) {
    G.stats.simTime += G.fixedDt;
    if (G.state?.phase === 'heist' && G.ui.heist.playing && currentScreen(G) === 'heist') {
      beatAcc += dt * 1000;
      if (beatAcc >= G.beatMs) { beatAcc = 0; G.advanceBeat(); }
    } else beatAcc = 0;
  }
  overlayAcc += dt;
  if (overlayAcc > 0.25) { overlayAcc = 0; updateOverlay(G); }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
if (G.dev || params.has('hooks')) installDebug(G);
if (G.dev) G.showDiag(true);
if (params.has('seed') && G.dev) {
  G.state = E.newGame(Number(params.get('seed')));
  G.ui.screen = 'job';
}
G.render();
requestAnimationFrame(frame);
window.__crimedogBooted = true;

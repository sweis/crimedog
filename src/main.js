// Boot, save/load, input routing and the frame loop.
import * as E from './engine.js';
import { render, renderModal, currentScreen, hiringFor, profileHTML, careerHTML } from './ui.js';
import { installDebug, updateOverlay } from './debug.js';
import { approachAvailable } from './sim.js';
import { visibleStages } from './heists.js';
import { cardPNG, careerPNG, recapPNG, shareBlob } from './card.js';

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
  saveKey: SAVE_KEY,
};

// ------------------------------------------------------------------ persistence
// First-visit tips, once per device; they still work (for the session) without storage.
const TIPS_KEY = 'crimedog.tips';
G.ui.tipsSeen = (() => { try { return JSON.parse(localStorage.getItem(TIPS_KEY) || '[]'); } catch { return []; } })();
G.seeTip = (id) => {
  if (!G.ui.tipsSeen.includes(id)) G.ui.tipsSeen.push(id);
  try { localStorage.setItem(TIPS_KEY, JSON.stringify(G.ui.tipsSeen)); } catch { /* private mode */ }
};
let saveTimer = null;
G.hasSave = () => {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
};
G.save = () => {
  if (!G.state) return;
  try {
    const json = JSON.stringify({ state: G.state, screen: G.ui.screen, heistI: G.ui.heist.i });
    localStorage.setItem(SAVE_KEY, json);
    G.stats.saveBytes = json.length;
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
  clearTimeout(saveTimer);
  saveTimer = null;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
};
// Saving a long career takes a few milliseconds, so it happens just after the
// tap rather than during it, and any pending save is flushed when the page is
// hidden or closed (switching apps on a phone, a reload).
const flushSave = () => {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  G.save();
};
G.commit = () => {
  G.render();
  saveTimer ||= setTimeout(flushSave, 250);
};
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
G.render = () => {
  const t0 = performance.now();
  render(G);
  const ms = performance.now() - t0;
  G.stats.renderMs = ms;
  G.stats.renderMax = Math.max(G.stats.renderMax || 0, ms);
};
// Opening or closing a sheet changes nothing underneath it: redraw just the sheet.
G.renderModal = () => {
  const t0 = performance.now();
  renderModal(G);
  G.stats.renders++;
  G.stats.renderMs = performance.now() - t0;
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

const QUIET = new Set([E.setPlan, E.autoPlan, E.resolveHeist, E.setTime, E.nextJob]);
function run(fn, ...args) {
  const r = fn(G.state, ...args);
  if (r && r.msg && (!r.ok || !QUIET.has(fn))) toast(r.msg, !r.ok);
  G.commit();
  return r;
}

// ------------------------------------------------------------------ heist playback
// The log grows downwards; keep the newest beat in view, just above the sticky controls.
function scrollToLatest(smooth) {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

G.advanceBeat = (doRender = true) => {
  const r = G.state?.result;
  if (!r) return;
  if (G.ui.heist.i < r.beats.length - 1) G.ui.heist.i++;
  if (G.ui.heist.i >= r.beats.length - 1) G.ui.heist.playing = false;
  if (doRender) {
    G.commit();
    scrollToLatest(true);
  }
};

// ------------------------------------------------------------------ actions
// Draw a shareable card (crew member or heist) and show it with share/save buttons.
async function showCard(make) {
  try {
    const card = await make();
    if (G.card?.url) URL.revokeObjectURL(G.card.url);
    G.card = { ...card, url: URL.createObjectURL(card.blob) };
    G.ui.modal = { type: 'card' };
    G.render();
  } catch (e) {
    toast('Couldn\'t draw the card.', true);
    logError(e);
  }
}

function show(screen) {
  G.ui.screen = screen;
  G.ui.modal = null;
  G.ui.hireFor = null;
  G.ui.unlockFor = null;
  G.commit();
  window.scrollTo(0, 0);
}

// Unlocking an option from the plan: do it, then put the option on the plan if it's open now.
function unlockWith(fn, ...args) {
  G.ui.modal = null;
  run(fn, ...args);
  useUnlocked();
}
function useUnlocked() {
  const u = G.ui.unlockFor;
  G.ui.unlockFor = null;
  const s = G.state;
  if (!u || s?.phase !== 'plan' || !approachAvailable(s, s.job, u.ap).ok) return;
  if (E.setPlan(s, u.stage, { approach: u.ap, dog: E.bestDogFor(s, u.stage, u.ap) || s.crew[0] }).ok) {
    G.commit();
    const el = document.querySelector(`.plan-step[data-stage="${u.stage}"]`);
    el?.classList.add('flash');
  }
}

// First look at the plan: have the crew pencil one in (around anything you've
// already set), so there's something to tweak.
function firstLook() {
  const s = G.state;
  if (s?.phase !== 'plan' || !s.crew.length || s.job.pencilled) return;
  s.job.pencilled = true;
  E.autoPlan(s);
  toast('The crew pencilled in a plan. Tweak it.');
}

// Intel can turn up a step nobody knew about (a cat, a stakeout): once the crew
// have pencilled in a plan, they pencil in the new step too.
function pencilNew() {
  const s = G.state;
  if (s?.phase !== 'plan' || !s.job.pencilled) return;
  const gaps = visibleStages(s.job).filter((st) => !s.job.plan[st.id]?.dog);
  if (!gaps.length) return;
  E.autoPlan(s);
  const filled = gaps.filter((st) => s.job.plan[st.id]?.dog);
  if (filled.length) toast(`New on the plan: ${filled.map((st) => `${st.icon} ${st.label}`).join(', ')}.`);
  G.commit();
}

// Back to the plan, scrolled to (and briefly highlighting) the step we hired for.
function returnToPlan(stageId) {
  firstLook();
  show('plan');
  const el = stageId && document.querySelector(`.plan-step[data-stage="${stageId}"]`);
  if (el) {
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
  }
}

// Buttons that just call one engine action, optionally with a data-* argument.
const SIMPLE = {
  'dig-leads': [E.digLeads],
  'borrow': [E.borrow],
  'pay-debt': [E.payDebt, 'g'],
  'deliver': [E.deliver],
  'time': [E.setTime, 't'],
  'ask-around': [E.askAround],
  'buy': [E.buy, 'kit'],
  'bribe': [E.bribeGuard],
  'safehouse': [E.buySafehouse],
  'fakeids': [E.buyFakeIds],
  'buyer': [E.lineUpBuyer],
  'vet': [E.vetFence],
  'laylow': [E.layLow],
  'dismiss': [E.dismiss, 'id'],
  'surveil': [E.surveil, 'id'],
  'lawyer': [E.lawyer, 'id'],
  'autoplan': [E.autoPlan],
  'fence': [E.fence, 'f'],
};

const A = {
  'go'(el) {
    G.clearToasts();
    if (el.dataset.to === 'plan') firstLook();
    show(el.dataset.to);
  },
  'new-game'() {
    const seed = params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
    G.state = E.newGame(seed);
    G.ui = { ...G.ui, introPage: 0, heist: { i: 0, playing: true } };
    show('intro');
  },
  'continue'() {
    if (!G.load()) toast('No saved game.', true);
    G.render();
  },
  'intro-next'() { G.ui.introPage++; G.render(); },
  'start'() { show('job'); },
  'take-offer'(el) {
    G.clearToasts();
    const r = E.acceptOffer(G.state, el.dataset.id);
    toast(r.msg, !r.ok);
    show('job');
  },
  'tip-ok'(el) { G.seeTip(el.dataset.tip); G.render(); },
  'story-ok'() { E.dismissStory(G.state); G.commit(); },
  'drama'(el) { run(E.chooseStory, Number(el.dataset.i)); },
  'pay-hospital'(el) { run(E.payHospitalBill, el.dataset.id); },
  'amends'(el) { run(E.makeAmends, el.dataset.g, el.dataset.how); },
  'runner-act'(el) { run(E.runnerAction, el.dataset.id, el.dataset.effect); },
  'calling-card'() { run(E.toggleCallingCard); },
  'picked'(el) {
    G.ui.modal = null;
    const r = run(el.dataset.purpose === 'case' ? E.caseJoint : E.plantInsider, el.dataset.id);
    if (r.ok) pencilNew();
    useUnlocked();
  },
  // A locked option on the plan: a sheet with the way to unlock it.
  'unlock'(el) {
    G.ui.unlockFor = { stage: el.dataset.stage, ap: el.dataset.ap };
    G.ui.modal = { type: 'unlock', ...G.ui.unlockFor };
    G.renderModal();
  },
  'unlock-buy'(el) { unlockWith(E.buy, el.dataset.kit); },
  'unlock-tip'(el) { unlockWith(E.tipFor, el.dataset.k); pencilNew(); },
  'unlock-bribe'() { unlockWith(E.bribeGuard); },
  // Retiring ends the game, so it takes two taps.
  'retire'(el) {
    if (!G.ui.confirmRetire) {
      G.ui.confirmRetire = true;
      el.textContent = 'Really retire? This ends the game. Tap again.';
      el.classList.add('red');
      return;
    }
    G.ui.confirmRetire = false;
    G.ui.modal = null;
    run(E.retireNow);
  },
  'walk-away'(el) {
    if (!G.ui.confirmWalk) {
      G.ui.confirmWalk = true;
      el.textContent = 'Really walk away? (-3 rep) Tap again.';
      el.classList.add('red');
      return;
    }
    G.ui.confirmWalk = false;
    run(E.nextJob);
    show('job');
  },
  'dog'(el) { G.ui.modal = { type: 'dog', id: el.dataset.id }; G.ui.confirmFarm = null; G.renderModal(); },
  'close-modal'() { G.ui.modal = null; G.ui.confirmFarm = null; G.ui.unlockFor = null; G.renderModal(); },
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
  // Hired to case the joint: back to the casing list, with them on it.
  'recruit-case'(el) {
    const r = E.hire(G.state, el.dataset.id);
    toast(r.msg, !r.ok);
    if (r.ok) G.ui.modal = { type: 'pick', purpose: 'case' };
    G.commit();
  },
  'hire-for'(el) {
    G.clearToasts();
    show('pub');
    G.ui.hireFor = { stage: el.dataset.stage };
    G.commit();
  },
  'hire-back'() { returnToPlan(G.ui.hireFor?.stage); },
  'farm'(el) {
    const id = el.dataset.id;
    if (G.ui.confirmFarm !== id) { G.ui.confirmFarm = id; G.render(); return; }
    G.ui.confirmFarm = null;
    G.ui.modal = null;
    run(E.farm, id);
  },
  async 'share'(el) {
    const d = G.state.dogs[el.dataset.id];
    await showCard(() => cardPNG(d, profileHTML(G, d)));
  },
  async 'share-career'() {
    await showCard(() => careerPNG(G.state, careerHTML(G)));
  },
  async 'share-recap'(el) {
    await showCard(() => recapPNG(G.state.history[Number(el.dataset.i)]));
  },
  async 'share-native'() {
    if (!G.card) return;
    const how = await shareBlob(G.card);
    if (how === 'shared') toast('Shared.');
    else if (how !== 'cancelled') toast('Sharing isn\'t available here. Long-press the card to save it.', true);
  },
  // Tapping a chart mark shows its value in the chart's caption (phones can't hover).
  'tip'(el) {
    const cap = el.closest('.chart')?.querySelector('.chart-tip');
    if (cap) cap.textContent = el.dataset.text;
  },
  // A new approach goes to whoever looks best at it; tap a face to change that.
  'plan-ap'(el) {
    const st = el.dataset.stage;
    run(E.setPlan, st, { approach: el.dataset.ap, dog: E.bestDogFor(G.state, st, el.dataset.ap) || G.state.crew[0] });
  },
  'plan-dog'(el) { run(E.setPlan, el.dataset.stage, { dog: el.dataset.id }); },
  'pull'() {
    const r = E.pullJob(G.state);
    if (!r.ok) { toast(r.msg, true); return; }
    G.ui.heist = { i: 0, playing: true };
    show('heist');
  },
  'heist-toggle'() { G.ui.heist.playing = !G.ui.heist.playing; G.render(); },
  'heist-step'() { G.ui.heist.playing = false; G.advanceBeat(); },
  'heist-skip'() {
    G.ui.heist.i = G.state.result.beats.length - 1;
    G.ui.heist.playing = false;
    G.commit();
    scrollToLatest(false);
  },
  'resolve'() { run(E.resolveHeist); window.scrollTo(0, 0); },
  'pay'(el) { run(E.payCrew, Number(el.dataset.pct)); window.scrollTo(0, 0); },
  'next-job'() { run(E.nextJob); show('job'); },
};
for (const [act, [fn, key]] of Object.entries(SIMPLE)) A[act] = (el) => run(fn, key && el.dataset[key]);
// Buttons that open a modal sheet, and the data-* value it needs (if any).
const OPENS = { pick: 'purpose', recruit: null, career: null, history: null, help: null, pane: 'pane', recap: 'i' };
for (const [type, key] of Object.entries(OPENS)) {
  A[type] = (el) => {
    G.ui.modal = key ? { type, [key]: el.dataset[key] } : { type };
    G.renderModal();
  };
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-stop]');
  if (!el || el.hasAttribute('data-stop')) return;
  if (el.disabled) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  if (el.dataset.act !== 'walk-away') G.ui.confirmWalk = false;
  if (el.dataset.act !== 'retire') G.ui.confirmRetire = false;
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

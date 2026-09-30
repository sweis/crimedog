// DOM rendering. Every screen is a function of (state, ui) -> HTML string;
// clicks are routed through data-act attributes to the controller in main.js.
import * as E from './engine.js';
import { SKILLS, SKILL_INFO, TALENTS, QUIRKS, BREEDS, FACTIONS, KIT, APPROACHES, INTEL, FENCES, CUTS, INTRO, LOOT_KINDS, VENUE_LABELS } from './data.js';
import { portraitSVG, displayName, shortName, skillOf, relationLabel, band, topSkills } from './dogs.js';
import { visibleStages, totalLootValue } from './heists.js';
import { odds, oddsKnown, approachAvailable, ALARM_MAX } from './sim.js';
import { canShareFiles } from './card.js';

export const SCREENS = ['title', 'intro', 'job', 'pub', 'crew', 'kit', 'fixer', 'plan', 'heist', 'aftermath', 'over'];
export const PLAN_TABS = [
  ['job', '🗺️', 'Job'],
  ['pub', '🍺', 'Pub'],
  ['crew', '🐾', 'Crew'],
  ['kit', '🧰', 'Kit'],
  ['fixer', '🤝', 'Fixer'],
];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;

export const GUVNOR = {
  id: 'guv', first: 'The Guv\'nor', last: '', breed: 'bulldog', faction: 'firm', talents: [], quirks: [],
  look: { coat: '#d8b38a', hat: 'tophat', eyes: 'monocle', neck: 'bowtie', outfit: '#23232a', brow: 'stern', seed: 1 },
};

// Which screen should show, given state + requested ui.screen.
export function currentScreen(G) {
  const { state, ui } = G;
  if (!state) return ui.screen === 'intro' ? 'intro' : 'title';
  if (ui.screen === 'title' || ui.screen === 'intro') return ui.screen;
  if (state.phase === 'over') return 'over';
  if (state.phase === 'heist') return 'heist';
  if (state.phase === 'aftermath') return 'aftermath';
  return ['job', 'pub', 'crew', 'kit', 'fixer', 'plan'].includes(ui.screen) ? ui.screen : 'job';
}

export function render(G) {
  const screen = currentScreen(G);
  G.ui.rendered = screen;
  const app = document.getElementById('app');
  const body = SCREEN_RENDER[screen](G);
  const showTop = !['title', 'intro', 'heist'].includes(screen);
  const showNav = G.state && G.state.phase === 'plan' && !['title', 'intro'].includes(screen);
  app.innerHTML = (showTop ? topbar(G) : '') + `<main data-screen="${screen}">${body}</main>` + (showNav ? nav(G, screen) : '');
  app.dataset.screen = screen;
  renderModal(G);
  G.stats.renders++;
}

function topbar(G) {
  const s = G.state;
  return `<header class="topbar"><div class="topbar-row"><div class="logo"><span class="full">CRIMEDOG</span><span class="short">🐕</span></div><div class="stats">
    <span class="stat" title="Cash">💷 <b>${money(s.cash)}</b></span>
    <span class="stat" title="Reputation">⭐ <b>${s.rep}</b></span>
    <span class="stat ${s.heat >= 60 ? 'hot' : ''}" title="The Inspector's heat">🕵️ <b>${s.heat}</b></span>
    <span class="stat" title="Day">📅 <b>${s.day}</b></span>
  </div></div><div class="heatbar" title="The Inspector: ${esc(E.inspectorLabel(s.heat))}"><i style="width:${s.heat}%"></i></div></header>`;
}

function nav(G, screen) {
  const s = G.state;
  return `<nav class="nav"><div class="nav-inner">${PLAN_TABS.map(([id, ico, label]) => {
    const badge = id === 'crew' && s.crew.length ? `<span class="badge">${s.crew.length}</span>` : '';
    return `<button data-act="go" data-to="${id}" class="${screen === id || (screen === 'plan' && id === 'job') ? 'on' : ''}"><span class="ico">${ico}</span>${badge}${label}</button>`;
  }).join('')}</div></nav>`;
}

// ------------------------------------------------------------------ title & intro
function titleScreen(G) {
  const hasSave = G.hasSave();
  return `<section class="title-screen">
    <div class="title-portrait">${portraitSVG(GUVNOR, { bg: '#e9dcc3', size: 180 })}</div>
    <h1 class="title-logo">CRIMEDOG</h1>
    <div class="title-tag">A heist game. For dogs.</div>
    <p class="fog">Recruit a crew. Case the joint. Pull the job.<br>Don't get nicked.</p>
    <div class="title-actions">
      ${hasSave ? '<button class="btn big block" data-act="continue">Continue</button>' : ''}
      <button class="btn big block ${hasSave ? 'ghost' : ''}" data-act="new-game">New Game</button>
    </div>
  </section>`;
}

function introScreen(G) {
  const page = G.ui.introPage || 0;
  const last = page >= INTRO.length - 1;
  return `<section class="title-screen intro-text">
    <div class="title-portrait" style="width:120px;height:120px">${portraitSVG(GUVNOR, { size: 120 })}</div>
    <p>${esc(INTRO[page])}</p>
    <div class="title-actions">
      <button class="btn big block" data-act="${last ? 'start' : 'intro-next'}">${last ? 'Right. Let\'s get to work.' : 'Go on...'}</button>
      ${last ? '' : '<button class="btn ghost block" data-act="start">Skip</button>'}
    </div>
  </section>`;
}

// ------------------------------------------------------------------ job
function lootValueText(job, l) {
  if (job.intel.loot_value) return money(l.value);
  if (l.value >= 4000) return 'A fortune?';
  if (l.value >= 2000) return 'A tidy sum?';
  return 'A bob or two?';
}

function jobScreen(G) {
  const s = G.state;
  const job = s.job;
  const stars = '★'.repeat(job.tier) + '☆'.repeat(3 - job.tier);
  const intelKeys = Object.keys(job.intel);
  const known = intelKeys.filter((k) => job.intel[k]);
  const days = Array.from({ length: 5 }, (_, i) => `<i class="${i >= job.daysLeft ? 'used' : ''}"></i>`).join('');
  const stake = job.intel.hz_stakeout ? `<p class="chip bad">🚓 Police stakeout at ${job.stakeoutTime === 'night' ? 'night' : 'daytime'}</p>` : '';
  return `
  <section class="card">
    <div class="row spread"><span class="stamp">${esc(VENUE_LABELS[job.venueType])}</span><span title="Difficulty">${stars}</span></div>
    <div class="job-name mt">${esc(job.name)}</div>
    <p class="muted">${esc(job.venueName)}, ${esc(job.district)}</p>
    <h3 class="mt">The Goods</h3>
    <ul class="loot-list">${job.loot.map((l) => `<li><span>${LOOT_KINDS[l.kind].icon} ${esc(l.name)}</span><span class="v">${lootValueText(job, l)}</span></li>`).join('')}</ul>
    <div class="row spread mt"><div><b>Days until the window closes</b><div class="days mt">${days}</div></div>
    <div class="seg" role="group" aria-label="Time of the job">${timeSeg(job)}</div></div>
    ${stake}
    ${job.alert ? `<p class="chip bad mt">⚠️ Security on alert: +${job.alert} difficulty</p>` : ''}
  </section>
  <section class="card">
    <div class="row spread"><h2>Intel</h2><span class="chip info">${known.length}/${intelKeys.length}</span></div>
    <div class="intel-list">${intelKeys.map((k) => {
      const isHz = !!INTEL[k].hazard;
      return job.intel[k] ? `<div class="intel known ${isHz ? 'hz' : ''}"><b>${esc(INTEL[k].label)}</b><br><span class="muted">${esc(INTEL[k].blurb)}</span></div>` : '<div class="intel">❓ <span class="muted">Unknown</span></div>';
    }).join('')}</div>
    <div class="btn-row mt"><button class="btn" data-act="pick" data-purpose="case" ${job.daysLeft ? '' : 'disabled'}>🔎 Case the joint <small>(1 day)</small></button></div>
  </section>
  <button class="btn big block red" data-act="go" data-to="plan">📋 Plan the heist</button>
  <div class="btn-row mt"><button class="btn ghost small" data-act="walk-away">Walk away from this job</button></div>
  <section class="card dark mt"><h2>The Word on the Street</h2><ul class="news">${s.news.slice(0, 4).map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul></section>`;
}

function timeSeg(job) {
  return `<button data-act="time" data-t="night" class="${job.time === 'night' ? 'on' : ''}">🌙 Night</button><button data-act="time" data-t="day" class="${job.time === 'day' ? 'on' : ''}">☀️ Day</button>`;
}

// ------------------------------------------------------------------ dogs
export function pips(v, known, max = 7) {
  if (!known) return '<span class="q">? ? ?</span>';
  let h = '<span class="pips">';
  for (let i = 0; i < max; i++) h += `<i class="${i < v ? 'on' : ''}"></i>`;
  return h + '</span>';
}

function specialtyText(d) {
  const [top] = topSkills(d, 1);
  return `${SKILL_INFO[top[0]].icon} ${SKILL_INFO[top[0]].label}`;
}

function dogCard(G, d, opts = {}) {
  const s = G.state;
  const b = BREEDS[d.breed];
  const hired = s.crew.includes(d.id);
  let right = '';
  if (opts.fee) right = `<div class="fee">${money(d.fee)}</div>${d.minRep > s.rep && d.relation < 30 ? `<div class="chip warn">Rep ${d.minRep}+</div>` : ''}`;
  if (d.status === 'pound') right = `<div class="chip bad">Pound: ${d.sentence} job${d.sentence > 1 ? 's' : ''}</div>`;
  if (d.known.undercover && d.undercover) right = '<div class="chip bad">COPPER</div>';
  const flags = [];
  if (d.known.undercover && d.undercover && d.status !== 'gone') flags.push('<span class="chip bad">Undercover!</span>');
  else if (d.cleared) flags.push('<span class="chip good">Checked out</span>');
  return `<button class="dog-card ${hired ? 'hired' : ''} ${['gone', 'farm'].includes(d.status) ? 'gone' : ''}" data-act="dog" data-id="${d.id}">
    <div class="pic">${portraitSVG(d, { size: 64 })}</div>
    <div class="grow"><div class="name">${esc(displayName(d))}</div>
      <div class="faction">${esc(FACTIONS[d.faction].label)}</div>
      <div class="sub">${esc(b.label)} · ${specialtyText(d)} · ${esc(relationLabel(d))}</div>
      ${flags.join(' ')}</div>
    <div class="center">${right}</div></button>`;
}

function pubScreen(G) {
  const s = G.state;
  const pub = s.pub.map((id) => s.dogs[id]).filter((d) => d.status === 'free');
  return `<h2>The Dog &amp; Duck</h2>
  <p class="muted">Smoke, darts, and dogs looking for work. Tap someone to size them up.</p>
  ${pub.map((d) => dogCard(G, d, { fee: true })).join('') || '<p class="muted">The pub is empty. Ask around.</p>'}
  <div class="btn-row"><button class="btn ghost" data-act="ask-around" ${s.job.daysLeft ? '' : 'disabled'}>🗣️ Ask around for new faces (1 day)</button></div>`;
}

function crewScreen(G) {
  const s = G.state;
  const crew = E.crewDogs(s);
  const book = E.bookDogs(s).filter((d) => d.status === 'free' && !s.crew.includes(d.id));
  const pound = E.bookDogs(s).filter((d) => d.status === 'pound');
  const gone = Object.values(s.dogs).filter((d) => d.met && ['gone', 'farm'].includes(d.status));
  return `<h2>Your Crew <span class="muted">(${crew.length}/${E.MAX_CREW})</span></h2>
  ${crew.map((d) => dogCard(G, d)).join('') || '<p class="muted">Nobody yet. Head down the pub.</p>'}
  <h2 class="mt">Little Black Book</h2>
  <p class="muted">Dogs you know. Rehire them for the retainer.</p>
  ${book.map((d) => dogCard(G, d, { fee: true })).join('') || '<p class="muted">Empty. For now.</p>'}
  ${pound.length ? `<h2 class="mt">In the Pound</h2>${pound.map((d) => dogCard(G, d)).join('')}` : ''}
  ${gone.length ? `<h2 class="mt">Gone</h2>${gone.map((d) => dogCard(G, d)).join('')}` : ''}`;
}

function kitScreen(G) {
  const s = G.state;
  return `<h2>Kit Shop</h2><p class="muted">"No questions asked, no receipts given."</p>
  <section class="card">${Object.entries(KIT).map(([id, k]) => {
    const own = s.kit[id] || 0;
    const canBuy = s.cash >= k.price && (k.consumable || !own);
    return `<div class="kit"><div class="ico">${k.icon}</div><div class="grow"><b>${esc(k.name)}</b> ${own ? `<span class="own">✓ ${k.consumable ? `×${own}` : 'owned'}</span>` : ''}<div class="muted">${esc(k.blurb)}</div></div>
      <button class="btn small" data-act="buy" data-kit="${id}" ${canBuy ? '' : 'disabled'}>${money(k.price)}</button></div>`;
  }).join('')}</section>`;
}

function fixerScreen(G) {
  const s = G.state;
  const job = s.job;
  const hasGuards = job.stages.some((st) => st.id === 'obs_guards');
  const svc = (act, icon, name, desc, price, state, disabled, extra = '') =>
    `<div class="kit"><div class="ico">${icon}</div><div class="grow"><b>${name}</b> ${state ? `<span class="own">✓ ${state}</span>` : ''}<div class="muted">${desc}</div></div>
    <button class="btn small" data-act="${act}" ${extra} ${disabled ? 'disabled' : ''}>${price}</button></div>`;
  const insiderName = job.insider ? shortName(s.dogs[job.insider]) : '';
  return `<h2>The Fixer</h2><p class="muted">A man in a camel coat who knows people who know people.</p>
  <section class="card">
    ${svc('pick', '🧹', 'Plant an inside dog', 'Get a crew member a job there. Unlocks the inside entry and softens the guards.', '£100 · 1 day', insiderName ? `${esc(insiderName)} is inside` : '', !!job.insider || !job.daysLeft, 'data-purpose="insider"')}
    ${hasGuards ? svc('bribe', '💵', 'Bribe a guard', 'Adds a "wave at the guard you bribed" option. Might backfire.', money(150 * job.tier), job.bribed ? 'Bribed' : '', job.bribed) : ''}
    ${svc('safehouse', '🏚️', 'Safehouse', 'Somewhere to lie low. Less heat from this job, better escapes.', '£250', job.safehouse ? 'Sorted' : '', job.safehouse)}
    ${svc('fakeids', '🪪', 'Fake IDs', 'Fewer clues; captured crew are less likely to crack.', '£200', job.fakeIds ? 'Sorted' : '', job.fakeIds)}
    ${svc('buyer', '🎩', 'Line up The Collector', 'A buyer who pays full value. Needs arranging in advance.', '£150 · 1 day', job.buyer ? 'Waiting' : '', job.buyer || !job.daysLeft)}
    ${svc('vet', '🔍', 'Check out Fancy Francesca', 'The new fence in town pays well. Is she too good to be true?', '£60', job.fenceVetted ? (job.stingFence ? 'STING!' : 'Legit') : '', job.fenceVetted)}
    ${svc('laylow', '🛋️', 'Lie low for a day', 'Keep your head down. The Inspector loses the scent.', '£100 · 1 day', '', !job.daysLeft)}
  </section>
  <section class="card dark"><h2>The Inspector</h2><p><b>${esc(E.inspectorLabel(s.heat))}</b> (${s.heat}/100)</p>
  <p class="muted">Clues, alarms and crew who talk all feed the Inspector's file. At 25+ they start planting undercover coppers in the pub. At 40+ some fences are stings. At 100 it's game over.</p></section>`;
}

// ------------------------------------------------------------------ plan
function planScreen(G) {
  const s = G.state;
  const job = s.job;
  const crew = E.crewDogs(s);
  const stages = visibleStages(job);
  const unknownIntel = Object.values(job.intel).filter((v) => !v).length;
  const probs = E.planProblems(s);
  let h = `<div class="row spread"><h2>${esc(job.name)}</h2><div class="seg">${timeSeg(job)}</div></div>`;
  if (!crew.length) {
    return h + '<section class="card"><p>You need a crew before you can plan. Even just one dog. Even a bad one.</p><button class="btn block" data-act="go" data-to="pub">🍺 Go to the pub</button></section>';
  }
  if (unknownIntel) h += `<p class="muted">${unknownIntel} bit${unknownIntel > 1 ? 's' : ''} of intel still unknown. There could be surprises.</p>`;
  stages.forEach((st, i) => {
    const p = job.plan[st.id] || {};
    h += `<section class="stage" data-stage="${st.id}"><div class="stage-head"><span class="n">${i + 1}</span><h3>${st.icon} ${esc(st.label)}</h3></div><div class="opts">`;
    for (const ap of st.options) {
      const a = APPROACHES[ap];
      const av = approachAvailable(s, job, ap);
      const tags = [];
      if (!av.ok) tags.push(`🔒 ${av.reason}`);
      if (a.kitBonus && s.kit[a.kitBonus]) tags.push(`+${KIT[a.kitBonus].name}`);
      if (a.intelBonus && job.intel[a.intelBonus]) tags.push(`+${INTEL[a.intelBonus].label}`);
      if (a.noise >= 3) tags.push('🔊 Loud');
      else if (a.noise > 0) tags.push('🔉 Noisy');
      if (a.clues >= 2) tags.push('🔍 Messy');
      if (a.swap) tags.push('🤫 They won\'t notice');
      h += `<button class="opt ${p.approach === ap ? 'on' : ''}" data-act="plan-ap" data-stage="${st.id}" data-ap="${ap}" ${av.ok ? '' : 'disabled'}><span class="ski">${SKILL_INFO[a.skill].icon}</span><span class="grow">${esc(a.label)}<div class="tags">${SKILL_INFO[a.skill].label}${tags.length ? ' · ' + esc(tags.join(' · ')) : ''}</div></span></button>`;
    }
    h += '</div>';
    if (p.approach) {
      const skill = APPROACHES[p.approach].skill;
      h += `<div class="assignees">${crew.map((d) => `<button class="assignee ${p.dog === d.id ? 'on' : ''}" data-act="plan-dog" data-stage="${st.id}" data-id="${d.id}">${portraitSVG(d, { size: 44 })}${esc(shortName(d))}<br><b>${d.known.skills[skill] ? skillOf(d, skill) : '?'}</b> ${SKILL_INFO[skill].icon}</button>`).join('')}</div>`;
      if (p.dog) {
        const d = s.dogs[p.dog];
        const o = odds(s, job, st, p.approach, d);
        const known = oddsKnown(d, p.approach);
        const pct = Math.round(o.p * 100);
        const cls = !known ? 'unk' : pct >= 70 ? '' : pct >= 45 ? 'mid' : 'low';
        h += `<div class="odds ${cls}"><span>${known ? `${pct}%` : '??%'}</span><div class="bar"><i style="width:${known ? pct : 60}%"></i></div><span class="muted">${known ? '' : 'Unknown skill'}</span></div>`;
      }
    }
    h += '</section>';
  });
  if (probs.length) h += `<div class="problems"><b>Loose ends</b><ul>${probs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  h += `<div class="btn-row"><button class="btn ghost" data-act="autoplan">✏️ Pencil in the gaps</button></div>
  <button class="btn big block red mt" data-act="pull">🚨 PULL THE JOB</button>
  <p class="muted center mt">You won't be there. You'll be watching.</p>`;
  return h;
}

// ------------------------------------------------------------------ heist playback
function heistScreen(G) {
  const s = G.state;
  const r = s.result;
  const i = Math.min(G.ui.heist.i, r.beats.length - 1);
  const shown = r.beats.slice(0, i + 1);
  const cur = shown[shown.length - 1];
  const alarm = cur.alarm;
  const finished = i >= r.beats.length - 1;
  const segs = Array.from({ length: ALARM_MAX }, (_, k) => `<i class="${k < alarm ? 'on' : ''} ${alarm >= 6 ? 'hot' : ''} ${alarm >= ALARM_MAX ? 'max' : ''}"></i>`).join('');
  const ringing = shown.some((b) => b.kind === 'alarm');
  const log = shown.map((b, k) => beatHTML(G, b, k === shown.length - 1)).join('');
  return `<section class="heist"><div class="heist-head">
    <div class="row spread"><h2 style="margin:0">${esc(s.job.name)}</h2><span class="chip dark">${s.job.time === 'night' ? '🌙' : '☀️'} ${String(s.job.hour).padStart(2, '0')}:00</span></div>
    <div class="row"><span class="muted" style="width:44px">Alarm</span><div class="alarm grow" data-alarm="${alarm}">${segs}</div><span class="chip dark" title="Clues left">🔍 ${cur.clues}</span></div>
    <div class="blueprint ${ringing && !finished ? 'ringing' : ''}">${blueprintSVG(G, shown)}</div></div>
    <div class="log">${log}</div>
    <div class="heist-controls">
      ${finished ? '<button class="btn big block" data-act="resolve">See the aftermath →</button>' : `<button class="btn" data-act="heist-toggle">${G.ui.heist.playing ? '⏸ Pause' : '▶ Play'}</button><button class="btn ghost" data-act="heist-step">Next ›</button><button class="btn ghost" data-act="heist-skip">Skip ⏭</button>`}
    </div></section>`;
}

function beatHTML(G, b, latest) {
  const d = b.dog ? G.state.dogs[b.dog] : null;
  const pct = b.p != null ? `<span class="pct">${b.kind === 'ok' ? '✓' : '✗'} ${Math.round(b.p * 100)}%</span>` : '';
  return `<div class="beat ${b.kind}" ${latest ? 'data-latest' : ''}>${d && b.kind !== 'stage' ? `<div class="mini">${portraitSVG(d, { size: 40 })}</div>` : ''}<div class="txt">${esc(b.text)}${b.line ? `<div class="line">"${esc(b.line)}"</div>` : ''}</div>${pct}</div>`;
}

export function blueprintSVG(G, shown) {
  const s = G.state;
  const job = s.job;
  const r = s.result;
  const surprised = new Set(shown.filter((b) => b.kind === 'surprise').map((b) => b.stage));
  const stages = job.stages.filter((st) => !st.hidden || surprised.has(st.id));
  const W = 340, cols = 3, rw = 100, rh = 44, gx = 10, gy = 16, ox = 5, oy = 6;
  const rows = Math.ceil(stages.length / cols);
  const lostCount = shown.filter((b) => b.kind === 'caught' || (b.kind === 'betray' && b.dog)).length + r.exposed.length;
  const H = oy * 2 + rows * rh + (rows - 1) * gy + (lostCount ? 30 : 0);
  const pos = stages.map((st, k) => {
    const row = Math.floor(k / cols);
    const c = row % 2 === 0 ? k % cols : cols - 1 - (k % cols);
    return { st, x: ox + c * (rw + gx), y: oy + row * (rh + gy) };
  });
  const curStage = [...shown].reverse().find((b) => b.stage && stages.some((st) => st.id === b.stage))?.stage;
  const curIdx = pos.findIndex((p) => p.st.id === curStage);
  const failed = new Set(shown.filter((b) => b.kind === 'fail').map((b) => b.stage));
  const captured = new Set(shown.filter((b) => b.kind === 'caught').map((b) => b.dog));
  const gone = new Set(shown.filter((b) => b.kind === 'betray' && b.dog).map((b) => b.dog));
  const exposed = new Set(r.exposed);
  const ended = shown.some((b) => b.kind === 'end');
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">`;
  svg += '<defs><pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#9ec1f0" stroke-opacity=".12"/></pattern></defs>';
  svg += `<rect width="${W}" height="${H}" fill="url(#grid)"/>`;
  // path
  for (let k = 1; k < pos.length; k++) {
    const a = pos[k - 1], b = pos[k];
    svg += `<line x1="${a.x + rw / 2}" y1="${a.y + rh / 2}" x2="${b.x + rw / 2}" y2="${b.y + rh / 2}" stroke="#9ec1f0" stroke-width="2" stroke-dasharray="5 5" opacity="${k <= curIdx ? 0.9 : 0.35}"/>`;
  }
  pos.forEach((p, k) => {
    const isCur = k === curIdx && !ended;
    const done = k < curIdx || (ended && k <= curIdx);
    const bad = failed.has(p.st.id);
    const stroke = isCur ? '#d6a93b' : bad ? '#ff7a6b' : done ? '#7ee0a8' : '#9ec1f0';
    svg += `<rect x="${p.x}" y="${p.y}" width="${rw}" height="${rh}" rx="6" fill="#16305a" stroke="${stroke}" stroke-width="${isCur ? 3 : 2}"/>`;
    svg += `<text x="${p.x + 6}" y="${p.y + 20}" font-size="14">${p.st.icon}</text>`;
    svg += `<text x="${p.x + 26}" y="${p.y + 18}" font-size="10" fill="#e6efff" font-weight="700">${esc(trunc(p.st.label.replace(/^The /, ''), 13))}</text>`;
    const mark = bad && done ? '✗ messy' : done ? '✓' : isCur ? '▶ now' : '';
    svg += `<text x="${p.x + 6}" y="${p.y + 38}" font-size="10" fill="${bad ? '#ff9a8b' : isCur ? '#d6a93b' : '#7ee0a8'}">${mark}</text>`;
  });
  // tokens
  const crew = r.crew.map((id) => s.dogs[id]);
  const here = crew.filter((d) => !captured.has(d.id) && !gone.has(d.id) && !exposed.has(d.id));
  const anchor = curIdx >= 0 ? pos[curIdx] : { x: ox, y: oy - 60 };
  here.forEach((d, k) => {
    const tx = anchor.x + rw - 20 - (k % 4) * 15;
    const ty = curIdx >= 0 ? anchor.y + rh - 21 - Math.floor(k / 4) * 13 : oy;
    svg += `<g transform="translate(${tx} ${ty})"><circle cx="9" cy="9" r="9" fill="#f4ead3"/>${innerPortrait(d, 18)}</g>`;
  });
  // van / gone tray
  const tray = [...captured].map((id) => ['🚓', s.dogs[id]]).concat([...gone, ...exposed].map((id) => ['💨', s.dogs[id]]));
  const ty = H - 26;
  svg += `<text x="${ox}" y="${ty + 15}" font-size="10" fill="#9ec1f0">${tray.length ? 'Lost:' : ''}</text>`;
  tray.forEach(([ico, d], k) => {
    svg += `<g transform="translate(${ox + 32 + k * 42} ${ty})"><text x="0" y="15" font-size="12">${ico}</text><g transform="translate(16 0)"><circle cx="10" cy="10" r="10" fill="#f4ead3" opacity=".7"/>${innerPortrait(d, 20)}</g></g>`;
  });
  svg += '</svg>';
  return svg;
}

function innerPortrait(d, size) {
  // Nested <svg> keeps the portrait self-contained inside the blueprint.
  return portraitSVG(d, { size, bg: false });
}

function trunc(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ------------------------------------------------------------------ aftermath
function aftermathScreen(G) {
  const s = G.state;
  const r = s.result;
  const a = s.after;
  const job = s.job;
  const loot = (ids) => ids.map((id) => job.loot.find((l) => l.id === id));
  let h = '';
  h += `<div class="paper"><div class="mast">The Daily Bark</div><div class="hl">${esc(a.headline || headlineGuess(s))}</div></div>`;
  h += `<section class="card"><h2>What Happened</h2>`;
  const sec = loot(r.secured);
  h += sec.length ? `<ul class="loot-list">${sec.map((l) => `<li><span>${LOOT_KINDS[l.kind].icon} ${esc(l.name)}</span><span class="v">${money(l.value)}</span></li>`).join('')}</ul>` : '<p>No loot. Not a sausage.</p>';
  const lines = [];
  for (const run of r.runners) lines.push(`💨 <b>${esc(shortName(s.dogs[run.id]))}</b> did a runner with ${esc(job.loot.find((l) => l.id === run.lootId).name)}.`);
  for (const l of loot(r.dropped)) lines.push(`🚓 Lost to the police: ${esc(l.name)}.`);
  for (const c of r.captured) lines.push(`🚓 <b>${esc(shortName(s.dogs[c.id]))}</b> was nicked — ${c.mumbled ? 'mumbled incoherently for hours' : c.talked ? '<b>talked</b>' : 'said nothing'}. ${c.sentence} jobs in the pound.`);
  for (const id of [...r.exposed, ...r.tipped]) lines.push(`👮 <b>${esc(shortName(s.dogs[id]))}</b> was an undercover copper!`);
  for (const im of a.improved || []) lines.push(`📈 <b>${esc(shortName(s.dogs[im.id]))}</b> is getting better at ${SKILL_INFO[im.skill].icon} ${SKILL_INFO[im.skill].label} (now ${skillOf(s.dogs[im.id], im.skill)}).`);
  lines.push(`🕵️ Heat +${r.heatGain} (alarm peaked at ${r.alarmMax}/10, ${r.clues} clue${r.clues === 1 ? '' : 's'} left behind).`);
  h += `<div class="stack mt">${lines.map((l) => `<div class="trait">${l}</div>`).join('')}</div></section>`;

  if (a.step === 'fence') {
    h += `<section class="card"><h2>Fence the Goods</h2><p class="muted">Who's buying?</p>`;
    for (const [id, f] of Object.entries(FENCES)) {
      const locked = id === 'collector' && !job.buyer;
      const flagged = id === 'francesca' && job.fenceVetted ? (job.stingFence ? '<span class="chip bad">STING!</span>' : '<span class="chip good">Checked out</span>') : '';
      h += `<button class="fence-opt" data-act="fence" data-f="${id}" ${locked ? 'disabled' : ''}><div class="row spread"><b>${esc(f.name)}</b><span class="amt">${locked ? '🔒' : money(E.fenceRate(s, id))}</span></div><div class="muted">${esc(locked ? 'Only by appointment — line him up before the job.' : f.blurb)} ${flagged}</div></button>`;
    }
    h += '</section>';
  } else if (a.step === 'pay') {
    const owed = r.crew.filter((id) => r.escaped.includes(id) || r.captured.some((c) => c.id === id));
    h += `<section class="card"><h2>Pay the Crew</h2>`;
    if (a.sting) h += '<p class="chip bad">Francesca was a sting. The loot is gone.</p>';
    if (!a.received) {
      h += '<p>No take, no cut. The crew shuffle their paws.</p><button class="fence-opt" data-act="pay" data-pct="0"><b>Nothing to split. Move on.</b></button></section>';
      return h;
    }
    h += `<p class="muted">You got ${money(a.received)}. ${owed.length} dog${owed.length === 1 ? '' : 's'} expect${owed.length === 1 ? 's' : ''} a cut. Loyalty is bought, one job at a time.</p><div class="stack">`;
    for (const c of CUTS) {
      const amt = Math.round((a.received * c.pct) / 100);
      h += `<button class="fence-opt" data-act="pay" data-pct="${c.pct}" ${amt > s.cash ? 'disabled' : ''}><div class="row spread"><b>${c.label} (${c.pct}%)</b><span class="amt">${money(amt)}</span></div></button>`;
    }
    h += '</div></section>';
  } else if (a.step === 'grade') {
    const g = a.grade;
    const labels = { loot: 'Loot secured', fence: 'Fenced value', stealth: 'Stealth', crew: 'Crew got away', clues: 'Clean scene', pay: 'Crew paid fairly' };
    const maxes = { loot: 35, fence: 15, stealth: 20, crew: 15, clues: 10, pay: 5 };
    h += `<section class="card center"><div class="grade ${g.letter}" data-grade="${g.letter}">${g.letter}</div><p><b>${g.score}/100</b> · Rep ${a.repDelta >= 0 ? '+' : ''}${a.repDelta}</p>
    ${g.letter === 'S' ? '<p class="chip good">The perfect heist.</p>' : ''}
    <table class="parts">${Object.entries(g.parts).map(([k, v]) => `<tr><td>${labels[k]}</td><td>${v}/${maxes[k]}</td></tr>`).join('')}</table></section>`;
    // crew management
    const involved = r.crew.map((id) => s.dogs[id]).filter((d) => !['gone'].includes(d.status));
    if (involved.length) {
      h += '<section class="card"><h2>The Crew</h2><p class="muted">Tap a dog to see what you learned about them.</p>';
      h += involved.map((d) => dogCard(G, d)).join('');
      h += '</section>';
    }
    h += '<button class="btn big block" data-act="next-job">Next job →</button>';
  }
  return h;
}

function headlineGuess(s) {
  return `SOMETHING HAPPENED AT ${s.job.venueName.toUpperCase()}`;
}

// ------------------------------------------------------------------ game over
function overScreen(G) {
  const s = G.state;
  const t = E.GAME_OVER_TEXT[s.over.reason];
  return `<section class="title-screen">
    <div class="title-portrait" style="filter:grayscale(1)">${portraitSVG(GUVNOR, { size: 180 })}</div>
    <h1 class="title-logo" style="font-size:38px">${esc(t.title)}</h1>
    <p>${esc(t.text)}</p>
    <section class="card" style="width:100%;text-align:left"><h2>Your Career</h2>
    <p>${s.stats.jobs} jobs · ${s.stats.perfect} perfect · ${money(s.stats.earned)} earned · ${s.day} days</p>
    <ul class="loot-list">${s.history.map((h) => `<li><span>${esc(h.name)}</span><span class="v">${h.grade}</span></li>`).join('')}</ul></section>
    <div class="title-actions"><button class="btn big block" data-act="new-game">New Game</button></div>
  </section>`;
}

const SCREEN_RENDER = {
  title: titleScreen,
  intro: introScreen,
  job: jobScreen,
  pub: pubScreen,
  crew: crewScreen,
  kit: kitScreen,
  fixer: fixerScreen,
  plan: planScreen,
  heist: heistScreen,
  aftermath: aftermathScreen,
  over: overScreen,
};

// ------------------------------------------------------------------ modals
function renderModal(G) {
  const root = document.getElementById('modal-root');
  const m = G.ui.modal;
  if (!m || !G.state) { root.innerHTML = ''; return; }
  let inner = '';
  if (m.type === 'dog') inner = dogModal(G, G.state.dogs[m.id]);
  else if (m.type === 'pick') inner = pickModal(G, m.purpose);
  else if (m.type === 'card') inner = cardModal(G, G.state.dogs[m.id]);
  root.innerHTML = `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop role="dialog" aria-modal="true"><button class="close" data-act="close-modal" aria-label="Close">✕</button>${inner}</div></div>`;
}

function dogModal(G, d) {
  const s = G.state;
  if (!d) return '';
  const b = BREEDS[d.breed];
  const inCrew = s.crew.includes(d.id);
  const planning = s.phase === 'plan';
  const skills = SKILLS.map((sk) => `<div class="skill"><span class="lbl">${SKILL_INFO[sk].icon} ${SKILL_INFO[sk].label}</span>${pips(skillOf(d, sk), d.known.skills[sk])}</div>`).join('');
  const talents = d.talents.map((t) => d.known.talents.includes(t) ? `<div class="trait"><b>${esc(TALENTS[t].name)}</b><span class="muted">${SKILL_INFO[TALENTS[t].skill].icon} +${TALENTS[t].bonus} · ${esc(TALENTS[t].blurb)}</span></div>` : '<div class="trait"><b>???</b><span class="muted">A talent you haven\'t seen yet.</span></div>').join('');
  const quirks = d.known.quirks.map((q) => `<div class="trait"><b>${esc(QUIRKS[q].name)}</b><span class="muted">${esc(QUIRKS[q].blurb)}</span></div>`).join('') || '<div class="trait"><span class="muted">No quirks known yet. Work with them, or have them followed.</span></div>';
  const trait = (k, label) => `<div class="trait"><b>${label}</b><span>${d.known[k] ? band(d[k]) : '<span class="q">?</span>'}</span></div>`;
  const undercover = d.known.undercover && d.undercover ? '<p class="chip bad">👮 UNDERCOVER COPPER</p>' : d.cleared ? '<p class="chip good">Checked out: seems legit</p>' : '';
  const actions = [];
  if (planning && d.status === 'free' && !inCrew) actions.push(`<button class="btn" data-act="hire" data-id="${d.id}">Hire · ${money(d.fee)}</button>`);
  if (planning && inCrew) actions.push(`<button class="btn ghost" data-act="dismiss" data-id="${d.id}">Drop from crew</button>`);
  if (planning && ['free', 'crew'].includes(d.status) && !(d.known.loyalty && (d.cleared || d.known.undercover))) actions.push(`<button class="btn ghost" data-act="surveil" data-id="${d.id}" ${s.job.daysLeft ? '' : 'disabled'}>🕵️ Have them followed · £80, 1 day</button>`);
  if (d.status === 'pound') actions.push(`<button class="btn" data-act="lawyer" data-id="${d.id}">⚖️ Hire a brief · £150</button>`);
  actions.push(`<button class="btn ghost" data-act="share" data-id="${d.id}">📸 Share card</button>`);
  if (d.met && ['free', 'crew', 'pound'].includes(d.status) && s.phase !== 'heist') {
    const confirm = G.ui.confirmFarm === d.id;
    actions.push(`<button class="btn ${confirm ? 'red' : 'ghost'} small" data-act="farm" data-id="${d.id}">${confirm ? 'Really? Tap again. There\'s no coming back.' : '🚜 Send to live on a farm'}</button>`);
  }
  return `<div class="row" style="align-items:flex-start"><div class="portrait-big">${portraitSVG(d, { size: 120 })}</div>
    <div class="grow"><h2 style="margin-top:4px">${esc(displayName(d))}</h2><div class="faction">${esc(FACTIONS[d.faction].label)}</div>
    <div class="muted">${esc(b.label)} · ${esc(relationLabel(d))}</div>
    <div class="muted">${d.jobs} job${d.jobs === 1 ? '' : 's'} with you · ${d.status === 'pound' ? `in the pound (${d.sentence})` : d.status}</div></div></div>
    <div class="quote">"${esc(d.catchphrase)}"</div>
    ${undercover}
    <h3>Skills</h3><div class="skill-grid">${skills}</div>
    <h3>Talents</h3>${talents}
    <h3 class="mt">Character</h3>${trait('loyalty', 'Loyalty')}${trait('nerve', 'Nerve')}${trait('greed', 'Greed')}${quirks}
    <div class="stack mt">${actions.join('')}</div>`;
}

function cardModal(G, d) {
  if (!G.card || G.card.id !== d.id) return '';
  const name = `crimedog-${d.first.toLowerCase()}.png`;
  return `<h2>${esc(shortName(d))}'s card</h2>
    <img class="card-preview" src="${G.card.url}" alt="Character card for ${esc(displayName(d))}" data-card-preview>
    <p class="muted center">Long-press or right-click the card to save it.</p>
    <div class="btn-row">${canShareFiles() ? '<button class="btn" data-act="share-native">📤 Share</button>' : ''}<a class="btn ghost" href="${G.card.url}" download="${esc(name)}">💾 Save</a></div>`;
}

function pickModal(G, purpose) {
  const s = G.state;
  const crew = E.crewDogs(s);
  const title = purpose === 'case' ? 'Who cases the joint?' : 'Who goes undercover as staff?';
  const skill = purpose === 'case' ? 'nose' : 'disguise';
  let h = `<h2>${title}</h2><p class="muted">${purpose === 'case' ? 'A good nose finds more; a clumsy one gets spotted. £40 expenses.' : 'Disguise or charm helps. £100 for a fake reference.'}</p><div class="pick-list">`;
  h += crew.map((d) => `<button class="dog-card" data-act="picked" data-purpose="${purpose}" data-id="${d.id}"><div class="pic">${portraitSVG(d, { size: 64 })}</div><div class="grow"><div class="name">${esc(shortName(d))}</div><div class="sub">${SKILL_INFO[skill].icon} ${SKILL_INFO[skill].label}: ${d.known.skills[skill] ? skillOf(d, skill) : '?'} · ${SKILL_INFO.sneak.icon} Sneak: ${d.known.skills.sneak ? skillOf(d, 'sneak') : '?'}</div></div></button>`).join('') || '<p>Nobody on the crew yet.</p>';
  h += '</div>';
  if (purpose === 'case') h += '<button class="btn block ghost" data-act="picked" data-purpose="case" data-id="tipster">💰 Pay a tipster instead · £120</button>';
  return h;
}

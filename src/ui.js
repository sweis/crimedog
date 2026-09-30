// DOM rendering. Every screen is a function of (state, ui) -> HTML string;
// clicks are routed through data-act attributes to the controller in main.js.
import * as E from './engine.js';
import { esc, money, count } from './util.js';
import { GROUPS, SKILLS, SKILL_INFO, TALENTS, QUIRKS, BREEDS, FACTIONS, KIT, APPROACHES, INTEL, FENCES, CUTS, INTRO, LOOT_KINDS, VENUE_LABELS, RARITY, SIGNATURES, JOB_TYPES } from './data.js';
import { portraitSVG, displayName, shortName, skillOf, relationLabel, band, topSkills, isVisitor, specialty } from './dogs.js';
import { visibleStages, lootItem } from './heists.js';
import { odds, oddsKnown, approachAvailable, stageOptions, canDo, ALARM_MAX } from './sim.js';
import { canShareFiles } from './card.js';
import { ARCS, sceneChoices } from './drama.js';
import { venueSVG, skylineSVG } from './art.js';
import { GROUP_IDS, standingLabel, hireBlocked, hireCost, canBorrow, LOAN } from './groups.js';

export const SCREENS = ['title', 'intro', 'select', 'job', 'pub', 'crew', 'kit', 'fixer', 'plan', 'heist', 'aftermath', 'over'];
const PLAN_TABS = [
  ['job', '🗺️', 'Job'],
  ['pub', '🍺', 'Pub'],
  ['crew', '🐾', 'Crew'],
  ['kit', '🧰', 'Kit'],
  ['fixer', '🤝', 'Fixer'],
];


const GUVNOR = {
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
  if (state.phase === 'select') return 'select';
  return ['job', 'pub', 'crew', 'kit', 'fixer', 'plan'].includes(ui.screen) ? ui.screen : 'job';
}

export function render(G) {
  const screen = currentScreen(G);
  if (screen === 'heist' && G.ui.rendered === 'heist' && patchHeist(G)) {
    G.stats.renders++;
    return;
  }
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
    <div class="title-hero">${skylineSVG(11)}<div class="title-portrait">${portraitSVG(GUVNOR, { bg: '#e9dcc3', size: 180 })}</div></div>
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

// ------------------------------------------------------------------ groups & job board
export function bossDog(gid) {
  const b = GROUPS[gid].bossDog;
  return { id: `boss-${gid}`, first: GROUPS[gid].boss, last: '', breed: b.breed, faction: b.faction, talents: [], quirks: [], look: b.look };
}

function standingBar(v) {
  const pct = (v + 100) / 2;
  const cls = v >= 20 ? 'good' : v <= -20 ? 'bad' : '';
  return `<div class="standing ${cls}" title="${v}"><i style="left:${pct}%"></i></div>`;
}

function dealTerms(G, job) {
  const p = job.patron;
  const chips = [];
  if (p) {
    const G2 = GROUPS[p.group];
    if (p.deal === 'marker') chips.push(`<span class="chip bad">📜 Clears £${p.debtClear.toLocaleString('en-GB')} debt</span>`);
    if (p.want) {
      const item = lootItem(job, p.want);
      chips.push(`<span class="chip warn">🎯 ${esc(item.name)}</span>`);
      if (p.fee) chips.push(`<span class="chip good">💷 ${money(p.fee)}</span>`);
    }
    if (p.cut) chips.push(`<span class="chip info">✂️ ${p.cut}% cut</span><span class="chip good">🗺️ Intel</span>`);
    if (p.front) chips.push(`<span class="chip warn">💰 ${money(p.front)} up front${G2.serious ? ' · fail = debt' : ''}</span>`);
    if (p.rivalHit) chips.push(`<span class="chip bad">⚔️ vs ${GROUPS[p.rivalHit].emblem} ${esc(GROUPS[p.rivalHit].short)}</span>`);
  }
  if (job.owner && (!p || p.rivalHit !== job.owner)) chips.push(`<span class="chip bad">⚠️ ${GROUPS[job.owner].emblem} ${esc(GROUPS[job.owner].short)}'s place</span>`);
  return chips.join('');
}

// What kind of job it is, and what it'll take.
function jobTraits(job) {
  const T = JOB_TYPES[job.type || 'breakin'];
  const chips = [`<span class="chip dark">${T.icon} ${esc(T.label)}</span>`];
  const sp = job.stages.find((st) => st.needs);
  if (sp) chips.push(`<span class="chip warn">${SKILL_INFO[sp.needs.skill].icon} ${SKILL_INFO[sp.needs.skill].label} ${sp.needs.min}+</span>`);
  if (job.noInsider) chips.push('<span class="chip">🚫 No insiders</span>');
  if (job.stages.some((st) => st.kind === 'vault' && st.options.filter((ap) => APPROACHES[ap].needKit === 'replica').length > 1)) chips.push(`<span class="chip info">${KIT.replica.icon} Replica</span>`);
  return chips.join('');
}

function selectScreen(G) {
  const s = G.state;
  const debts = GROUP_IDS.filter((g) => s.groups[g].debt);
  let h = `<div class="row spread"><h2>The Job Board</h2><span class="chip dark">📅 Day ${s.day}</span></div>`;
  for (const gid of debts) {
    const d = s.groups[gid].debt;
    h += `<section class="card debt-card"><div class="row"><div class="boss-pic">${portraitSVG(bossDog(gid), { size: 56 })}</div><div class="grow"><b>You owe ${GROUPS[gid].emblem} ${money(d.amount)}</b><div class="muted">${d.patience > 0 ? `⏳ ${count(d.patience, 'job')} left` : '⏳ Out of patience'}</div></div></div>
      <button class="btn small mt" data-act="pay-debt" data-g="${gid}" ${s.cash >= d.amount ? '' : 'disabled'}>Pay ${money(d.amount)}</button></section>`;
  }
  for (const o of s.offers) {
    const job = o.job;
    const stars = '★'.repeat(job.tier) + '☆'.repeat(3 - job.tier);
    const pic = o.source === 'own' ? '<div class="boss-pic own">🔎</div>' : `<div class="boss-pic">${portraitSVG(bossDog(o.source), { size: 48 })}</div>`;
    const whoName = o.source === 'own' ? 'Your own lead' : `${GROUPS[o.source].emblem} ${esc(GROUPS[o.source].boss)}`;
    h += `<section class="card offer ${o.kind === 'marker' ? 'marker' : ''}" data-offer="${o.id}">
      <div class="offer-from">${pic}<div class="grow"><b>${whoName}</b><div class="muted">${esc(VENUE_LABELS[job.venueType])} · ${stars}</div></div></div>
      <div class="job-name">${esc(job.name)}</div>
      <p class="muted">${esc(job.venueName)}, ${esc(job.district)}</p>
      ${o.source !== 'own' ? `<div class="quote">${esc(o.pitch)}</div>` : ''}
      <div class="dm-chips">${jobTraits(job)}${dealTerms(G, job)}</div>
      <button class="btn block mt ${o.kind === 'marker' ? 'red' : ''}" data-act="take-offer" data-id="${o.id}">${o.kind === 'marker' ? 'Do them the favour' : 'Take the job'}</button></section>`;
  }
  h += `<div class="btn-row"><button class="btn ghost" data-act="dig-leads" ${s.cash >= 40 ? '' : 'disabled'}>🍻 Buy a round for fresh leads · £40</button></div>`;
  if (s.cash < 200 && canBorrow(s)) h += `<div class="btn-row mt"><button class="btn red" data-act="borrow">🌹 Borrow £${LOAN.amount} from the Family · owe £${LOAN.owe}</button></div>`;
  h += `<section class="card dark mt"><h2>The Players</h2>`;
  for (const gid of GROUP_IDS) {
    const Gp = GROUPS[gid];
    const g = s.groups[gid];
    const status = s.rep < Gp.minRep ? `🔒 Rep ${Gp.minRep}+` : g.standing <= -50 ? '🚫 Won\'t deal' : '';
    const rivals = Gp.rivals.length ? `⚔️ ${Gp.rivals.map((r) => GROUPS[r].emblem).join(' ')}` : '';
    const meta = [status, rivals, g.debt ? `📜 ${money(g.debt.amount)}` : ''].filter(Boolean).join(' · ');
    h += `<div class="player"><div class="boss-pic">${portraitSVG(bossDog(gid), { size: 44 })}</div><div class="grow"><div class="row spread"><b>${Gp.emblem} ${esc(Gp.name)}</b><span class="chip ${g.standing >= 20 ? 'good' : g.standing <= -20 ? 'bad' : ''}">${standingLabel(g.standing)}</span></div>
      ${standingBar(g.standing)}${meta ? `<div class="muted">${meta}</div>` : ''}</div></div>`;
  }
  h += '</section>';
  return h;
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
  <section class="card job-card">
    ${venueSVG(job)}
    <div class="row spread"><span class="stamp">${esc(VENUE_LABELS[job.venueType])}</span><span title="Difficulty">${stars}</span></div>
    <div class="job-name mt">${esc(job.name)}</div>
    <p class="muted">${esc(job.venueName)}, ${esc(job.district)}</p>
    <div class="dm-chips">${jobTraits(job)}</div>
    ${JOB_TYPES[job.type]?.blurb ? `<p class="muted mt">${esc(JOB_TYPES[job.type].blurb)}</p>` : ''}
    <h3 class="mt">The Goods</h3>
    <ul class="loot-list">${job.loot.map((l) => `<li><span>${LOOT_KINDS[l.kind].icon} ${esc(l.name)}${job.patron?.want === l.id ? ` <span class="chip warn">🎯 ${GROUPS[job.patron.group].emblem}</span>` : ''}</span><span class="v">${lootValueText(job, l)}</span></li>`).join('')}</ul>
    <div class="row spread mt"><div><b>Days left</b><div class="days mt">${days}</div></div>
    <div class="seg" role="group" aria-label="Time of the job">${timeSeg(job)}</div></div>
    ${stake}
    ${job.alert ? `<p class="chip bad mt">⚠️ Security on alert: +${job.alert} difficulty</p>` : ''}
  </section>
  ${job.patron || job.owner ? `<section class="card deal-card">${job.patron ? `<div class="offer-from"><div class="boss-pic">${portraitSVG(bossDog(job.patron.group), { size: 48 })}</div><div><b>${esc(GROUPS[job.patron.group].boss)}</b><div class="muted">${esc(GROUPS[job.patron.group].name)}</div></div></div>` : ''}<div class="dm-chips mt">${dealTerms(G, job)}</div></section>` : ''}
  <section class="card">
    <div class="row spread"><h2>Intel</h2><span class="chip info">${known.length}/${intelKeys.length}</span></div>
    <div class="intel-list">${intelKeys.map((k) => {
      const isHz = !!INTEL[k].hazard;
      return job.intel[k] ? `<div class="intel known ${isHz ? 'hz' : ''}"><b>${esc(INTEL[k].label.replace('Hazard: ', '⚠️ '))}</b></div>` : '<div class="intel">❓</div>';
    }).join('')}</div>
    <div class="btn-row mt"><button class="btn" data-act="pick" data-purpose="case" ${job.daysLeft ? '' : 'disabled'}>🔎 Case the joint <small>(1 day)</small></button></div>
  </section>
  <button class="btn big block red" data-act="go" data-to="plan">📋 Plan the heist</button>
  <div class="btn-row mt"><button class="btn ghost small" data-act="walk-away">Walk away from this job</button></div>`;
}

function timeSeg(job) {
  return `<button data-act="time" data-t="night" class="${job.time === 'night' ? 'on' : ''}">🌙 Night</button><button data-act="time" data-t="day" class="${job.time === 'day' ? 'on' : ''}">☀️ Day</button>`;
}

// ------------------------------------------------------------------ dogs
function pips(v, known, max = 7) {
  if (!known) return '<span class="q">? ? ?</span>';
  let h = '<span class="pips">';
  for (let i = 0; i < max; i++) h += `<i class="${i < v ? 'on' : ''}"></i>`;
  return h + '</span>';
}

// Best skill the player actually knows about (never leaks hidden stats).
function specialtyText(d) {
  const sk = specialty(d);
  return sk ? `${SKILL_INFO[sk].icon} ${SKILL_INFO[sk].label}` : '❓ Unknown';
}

// A skill's value if you've seen the dog use it, otherwise '?'.
const knownSkill = (d, sk) => (d.known.skills[sk] ? skillOf(d, sk) : '?');
const skillChip = (d, sk) => `<span class="chip ${d.known.skills[sk] ? 'info' : ''}">${SKILL_INFO[sk].icon} ${SKILL_INFO[sk].label} ${knownSkill(d, sk)}</span>`;

// Rare/legendary badge and signature move.
const rarityBadge = (d) => (d.rarity ? `<span class="rar ${d.rarity}">${RARITY[d.rarity].icon} ${RARITY[d.rarity].label}</span>` : '');

// Personal drama carried into the next job, and the story a dog is caught up in.
function dramaChips(d) {
  const dr = d.drama || {};
  const c = [];
  if (dr.away) c.push('<span class="chip">🏠 Away</span>');
  if (dr.edge > 0) c.push('<span class="chip good">🔥 Fired up</span>');
  if (dr.edge < 0) c.push('<span class="chip warn">😟 Distracted</span>');
  if (dr.trouble) c.push('<span class="chip bad">⚠️ Trouble</span>');
  return c;
}
const dramaMark = (d) => (d.drama?.trouble ? ' ⚠️' : d.drama?.edge > 0 ? ' 🔥' : d.drama?.edge < 0 ? ' 😟' : '');

// opts: fee (show hire cost), skill (show that skill), act/extra (tap action; default opens the profile)
function dogCard(G, d, opts = {}) {
  const s = G.state;
  const b = BREEDS[d.breed];
  const hired = s.crew.includes(d.id);
  const away = isVisitor(d) && d.status === 'free' && d.inTown !== s.job?.id;
  let right = '';
  if (opts.fee && away) right = '<div class="chip">Out of town</div>';
  else if (opts.fee) right = `<div class="fee">${money(hireCost(s, d))}</div>${hireBlocked(s, d) ? '<div class="chip bad">Won\'t work for you</div>' : ''}${d.minRep > s.rep && d.relation < 30 ? `<div class="chip warn">Rep ${d.minRep}+</div>` : ''}`;
  if (d.status === 'pound') right = `<div class="chip bad">Pound: ${d.sentence} job${d.sentence > 1 ? 's' : ''}</div>`;
  if (d.known.undercover && d.undercover) right = '<div class="chip bad">COPPER</div>';
  const flags = [];
  if (d.known.undercover && d.undercover && d.status !== 'gone') flags.push('<span class="chip bad">Undercover!</span>');
  else if (d.cleared) flags.push('<span class="chip good">Checked out</span>');
  if ((s.arcs || []).some((x) => x.dog === d.id)) flags.push('<span class="chip info">📖 Story</span>');
  flags.push(...dramaChips(d));
  return `<button class="dog-card ${d.rarity || ''} ${hired ? 'hired' : ''} ${['gone', 'farm'].includes(d.status) ? 'gone' : ''}" data-act="${opts.act || 'dog'}" data-id="${d.id}" ${opts.extra || ''}>
    <div class="pic">${portraitSVG(d, { size: 64 })}</div>
    <div class="grow"><div class="name">${esc(displayName(d))}</div>
      <div class="faction">${rarityBadge(d)}${esc(FACTIONS[d.faction].label)}</div>
      <div class="sub">${esc(b.label)} · ${specialtyText(d)} · ${esc(relationLabel(d))}</div>
      ${d.signature && opts.fee ? `<div class="sig">✨ <b>${esc(SIGNATURES[d.signature].name)}</b></div>` : ''}
      ${[].concat(opts.skill || []).map((sk) => skillChip(d, sk)).join(' ')}
      ${flags.join(' ')}</div>
    <div class="center">${right}</div></button>`;
}

function pubScreen(G) {
  const s = G.state;
  const pub = s.pub.map((id) => s.dogs[id]).filter((d) => d.status === 'free');
  const hf = hiringFor(G);
  if (hf) {
    // Best known fit for the step first; unknowns after.
    const fit = (d) => (hf.skill && d.known.skills[hf.skill] ? skillOf(d, hf.skill) : -1); // unknowns sort last
    const sort = (list) => list.slice().sort((a, b) => fit(b) - fit(a));
    const book = E.bookDogs(s).filter((d) => d.status === 'free' && !s.crew.includes(d.id) && !s.pub.includes(d.id));
    const need = hf.skill ? `Needs ${SKILL_INFO[hf.skill].icon} <b>${SKILL_INFO[hf.skill].label}</b>` : 'Anyone will do';
    return `<section class="card dark hire-banner"><div class="muted">Hiring for step ${hf.n}</div><h2>${hf.stage.icon} ${esc(hf.stage.label)}</h2>
      <p>${need}</p>
      <button class="btn ghost small" data-act="hire-back">← Back to the plan</button></section>
      ${book.length ? `<h2>Your Little Black Book</h2>${sort(book).map((d) => dogCard(G, d, { fee: true, skill: hf.skill })).join('')}` : ''}
      <h2 class="mt">At the Dog &amp; Duck</h2>
      ${sort(pub).map((d) => dogCard(G, d, { fee: true, skill: hf.skill })).join('') || '<p class="muted">The pub is empty. Ask around.</p>'}
      <div class="btn-row"><button class="btn ghost" data-act="ask-around" ${s.job.daysLeft ? '' : 'disabled'}>🗣️ Ask around for new faces (1 day)</button></div>`;
  }
  return `<h2>The Dog &amp; Duck</h2>
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
  ${book.map((d) => dogCard(G, d, { fee: true })).join('') || '<p class="muted">Empty. For now.</p>'}
  ${pound.length ? `<h2 class="mt">In the Pound</h2>${pound.map((d) => dogCard(G, d)).join('')}` : ''}
  ${gone.length ? `<h2 class="mt">Gone</h2>${gone.map((d) => dogCard(G, d)).join('')}` : ''}`;
}

function kitScreen(G) {
  const s = G.state;
  return `<h2>Kit Shop</h2>
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
  return `<h2>The Fixer</h2>
  <section class="card">
    ${svc('pick', '🧹', 'Plant an inside dog', job.noInsider ? 'Not on this job: nobody new gets in.' : 'Opens a way in; softer guards.', '£100 · 1 day', insiderName ? `${esc(insiderName)} is inside` : '', job.noInsider || !!job.insider || !job.daysLeft, 'data-purpose="insider"')}
    ${hasGuards ? svc('bribe', '💵', 'Bribe a guard', 'Guard looks away. Might backfire.', money(150 * job.tier), job.bribed ? 'Bribed' : '', job.bribed) : ''}
    ${svc('safehouse', '🏚️', 'Safehouse', 'Less heat, better escapes.', '£250', job.safehouse ? 'Sorted' : '', job.safehouse)}
    ${svc('fakeids', '🪪', 'Fake IDs', 'Fewer clues; nicked crew crack less.', '£200', job.fakeIds ? 'Sorted' : '', job.fakeIds)}
    ${svc('buyer', '🎩', 'Line up The Collector', 'Pays full value.', '£150 · 1 day', job.buyer ? 'Waiting' : '', job.buyer || !job.daysLeft)}
    ${svc('vet', '🔍', 'Check out Francesca', 'Is the new fence a sting?', '£60', job.fenceVetted ? (job.stingFence ? 'STING!' : 'Legit') : '', job.fenceVetted)}
    ${svc('laylow', '🛋️', 'Lie low', 'Less heat.', '£100 · 1 day', '', !job.daysLeft)}
  </section>
  <section class="card dark"><h2>🕵️ The Inspector</h2><p><b>${esc(E.inspectorLabel(s.heat))}</b> · ${s.heat}/100</p>
  <div class="dm-chips"><span class="chip dark">25+ 👮 plants</span><span class="chip dark">40+ 🪤 stings</span><span class="chip dark">100 🚔 nicked</span></div></section>`;
}

// ------------------------------------------------------------------ plan
function hireTile(st, skill) {
  return `<button class="assignee hire-tile" data-act="hire-for" data-stage="${st.id}" aria-label="Hire someone for ${esc(st.label)}"><span class="plus">＋</span>Hire<br><small>${SKILL_INFO[skill].icon} ${SKILL_INFO[skill].label}</small></button>`;
}

// Which step (and skill) the pub is hiring for, if we came from the plan.
export function hiringFor(G) {
  const hf = G.ui.hireFor;
  if (!hf || !G.state || G.state.phase !== 'plan') return null;
  const stages = visibleStages(G.state.job);
  const idx = stages.findIndex((st) => st.id === hf.stage);
  if (idx < 0) return null;
  const st = stages[idx];
  const ap = G.state.job.plan[st.id]?.approach;
  return { stage: st, n: idx + 1, approach: ap || null, skill: ap ? APPROACHES[ap].skill : null };
}

function planScreen(G) {
  const s = G.state;
  const job = s.job;
  const crew = E.crewDogs(s);
  const stages = visibleStages(job);
  const unknownIntel = Object.values(job.intel).filter((v) => !v).length;
  const probs = E.planProblems(s);
  let h = `<div class="row spread"><h2>${esc(job.name)}</h2><div class="seg">${timeSeg(job)}</div></div>`;
  if (!crew.length) {
    return h + '<section class="card"><p>No crew yet.</p><button class="btn block" data-act="go" data-to="pub">🍺 Go to the pub</button></section>';
  }
  if (unknownIntel) h += `<p><span class="chip warn">❓ ${unknownIntel} intel unknown</span></p>`;
  stages.forEach((st, i) => {
    const p = job.plan[st.id] || {};
    // A specialist step says what it takes, and whether anyone on the crew has it.
    const needs = st.needs ? `<span class="chip ${crew.some((d) => d.known.skills[st.needs.skill] && skillOf(d, st.needs.skill) >= st.needs.min) ? 'good' : 'bad'}">${SKILL_INFO[st.needs.skill].icon} ${st.needs.min}+ only</span>` : '';
    h += `<section class="plan-step" data-stage="${st.id}"><div class="stage-head"><span class="n">${i + 1}</span><h3>${st.icon} ${esc(st.label)}</h3>${needs}</div><div class="opts">`;
    // Secret options (a star's signature move) go first.
    for (const ap of stageOptions(st, crew).sort((x, y) => !!APPROACHES[y].signature - !!APPROACHES[x].signature)) {
      const a = APPROACHES[ap];
      const av = approachAvailable(s, job, ap);
      const tags = [];
      const owner = a.signature && crew.find((d) => canDo(d, ap));
      if (owner) tags.push(`✨ ${shortName(owner)} only`);
      if (!av.ok) tags.push(`🔒 ${av.reason}`);
      if (a.kitBonus && s.kit[a.kitBonus]) tags.push(`+${KIT[a.kitBonus].name}`);
      if (a.intelBonus && job.intel[a.intelBonus]) tags.push(`+${INTEL[a.intelBonus].label}`);
      if (a.noise >= 3) tags.push('🔊 Loud');
      else if (a.noise > 0) tags.push('🔉 Noisy');
      if (a.clues >= 2) tags.push('🔍 Messy');
      if (a.swap) tags.push('🤫 They won\'t notice');
      h += `<button class="opt ${owner ? 'secret' : ''} ${p.approach === ap ? 'on' : ''}" data-act="plan-ap" data-stage="${st.id}" data-ap="${ap}" ${av.ok ? '' : 'disabled'}><span class="ski">${SKILL_INFO[a.skill].icon}</span><span class="grow">${esc(a.label)}<div class="tags">${SKILL_INFO[a.skill].label}${tags.length ? ' · ' + esc(tags.join(' · ')) : ''}</div></span></button>`;
    }
    h += '</div>';
    if (!p.approach) h += `<button class="hire-link" data-act="hire-for" data-stage="${st.id}">🍺 Hire someone for this step →</button>`;
    if (p.approach) {
      const skill = APPROACHES[p.approach].skill;
      h += `<div class="assignees">${crew.filter((d) => canDo(d, p.approach)).map((d) => `<button class="assignee ${p.dog === d.id ? 'on' : ''}" data-act="plan-dog" data-stage="${st.id}" data-id="${d.id}">${portraitSVG(d, { size: 44 })}${esc(shortName(d))}${dramaMark(d)}<br><b>${knownSkill(d, skill)}</b> ${SKILL_INFO[skill].icon}</button>`).join('')}${hireTile(st, skill)}</div>`;
      if (p.dog) {
        const d = s.dogs[p.dog];
        const o = odds(s, job, st, p.approach, d);
        const known = oddsKnown(d, p.approach);
        const pct = Math.round(o.p * 100);
        const cls = !known ? 'unk' : pct >= 70 ? '' : pct >= 45 ? 'mid' : 'low';
        h += `<div class="odds ${cls}"><span>${known ? `${pct}%` : '??%'}</span><div class="bar"><i style="width:${known ? pct : 60}%"></i></div></div>`;
      }
    }
    h += '</section>';
  });
  if (probs.length) h += `<div class="problems"><b>Loose ends</b><ul>${probs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  h += `<div class="btn-row"><button class="btn ghost" data-act="autoplan">✏️ Pencil in the gaps</button></div>
  <button class="btn big block red mt" data-act="pull">🚨 PULL THE JOB</button>`;
  return h;
}

// ------------------------------------------------------------------ heist playback
function heistScreen(G) {
  const s = G.state;
  const r = s.result;
  const i = Math.min(G.ui.heist.i, r.beats.length - 1);
  const shown = r.beats.slice(0, i + 1);
  const finished = i >= r.beats.length - 1;
  const log = shown.map((b, k) => beatHTML(G, b, k === shown.length - 1)).join('');
  return `<section class="heist" data-beat="${i}"><div class="heist-head">${heistHead(G, shown, finished)}</div>
    <div class="log">${log}</div>
    <div class="heist-controls">${heistControls(G, finished)}</div></section>`;
}

function heistHead(G, shown, finished) {
  const s = G.state;
  const cur = shown[shown.length - 1];
  const alarm = cur.alarm;
  const segs = Array.from({ length: ALARM_MAX }, (_, k) => `<i class="${k < alarm ? 'on' : ''} ${alarm >= 6 ? 'hot' : ''} ${alarm >= ALARM_MAX ? 'max' : ''}"></i>`).join('');
  const ringing = shown.some((b) => b.kind === 'alarm');
  return `<div class="row spread"><h2 style="margin:0">${esc(s.job.name)}</h2><span class="chip dark">${s.job.time === 'night' ? '🌙' : '☀️'} ${String(s.job.hour).padStart(2, '0')}:00</span></div>
    <div class="row"><span class="muted" style="width:44px">Alarm</span><div class="alarm grow" data-alarm="${alarm}">${segs}</div><span class="chip dark" title="Clues left">🔍 ${cur.clues}</span></div>
    <div class="blueprint ${ringing && !finished ? 'ringing' : ''}">${blueprintSVG(G, shown)}</div>`;
}

function heistControls(G, finished) {
  return finished ? '<button class="btn big block" data-act="resolve">See the aftermath →</button>' : `<button class="btn" data-act="heist-toggle">${G.ui.heist.playing ? '⏸ Pause' : '▶ Play'}</button><button class="btn ghost" data-act="heist-step">Next ›</button><button class="btn ghost" data-act="heist-skip">Skip ⏭</button>`;
}

// Playing forward on the heist screen: append the new beats and redraw the
// header, instead of rebuilding a log that grows to hundreds of nodes.
function patchHeist(G) {
  const sec = document.querySelector('main[data-screen="heist"] .heist');
  if (!sec || G.ui.modal) return false;
  const r = G.state.result;
  const i = Math.min(G.ui.heist.i, r.beats.length - 1);
  const prev = Number(sec.dataset.beat);
  if (!(i >= prev)) return false;
  const shown = r.beats.slice(0, i + 1);
  const finished = i >= r.beats.length - 1;
  const log = sec.querySelector('.log');
  if (i > prev) {
    log.querySelector('[data-latest]')?.removeAttribute('data-latest');
    log.insertAdjacentHTML('beforeend', r.beats.slice(prev + 1, i + 1).map((b, k, arr) => beatHTML(G, b, k === arr.length - 1)).join(''));
    sec.querySelector('.heist-head').innerHTML = heistHead(G, shown, finished);
    sec.dataset.beat = String(i);
  }
  sec.querySelector('.heist-controls').innerHTML = heistControls(G, finished);
  return true;
}

function beatHTML(G, b, latest) {
  const d = b.dog ? G.state.dogs[b.dog] : null;
  const pct = b.p != null ? `<span class="pct">${b.kind === 'ok' ? '✓' : '✗'} ${Math.round(b.p * 100)}%</span>` : '';
  return `<div class="beat ${b.kind}" ${latest ? 'data-latest' : ''}>${d && b.kind !== 'stage' ? `<div class="mini">${portraitSVG(d, { size: 40 })}</div>` : ''}<div class="txt">${esc(b.text)}${b.line ? `<div class="line">"${esc(b.line)}"</div>` : ''}</div>${pct}</div>`;
}

function blueprintSVG(G, shown) {
  const s = G.state;
  const job = s.job;
  const r = s.result;
  const surprised = new Set(shown.filter((b) => b.kind === 'surprise').map((b) => b.stage));
  const stages = job.stages.filter((st) => !st.hidden || surprised.has(st.id));
  const W = 340, cols = 3, rw = 100, rh = 44, gx = 10, gy = 16, ox = 5, oy = 6;
  const rows = Math.ceil(stages.length / cols);
  const lostCount = shown.filter((b) => b.kind === 'caught' || b.kind === 'lost' || (b.kind === 'betray' && b.dog)).length + r.exposed.length;
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
  const farmed = new Set(shown.filter((b) => b.kind === 'lost').map((b) => b.dog));
  const exposed = new Set(r.exposed);
  const ended = shown.some((b) => b.kind === 'end');
  const coppers = shown.some((b) => b.kind === 'alarm' && /Old Bill have arrived/.test(b.text));
  const alarm = shown[shown.length - 1].alarm;
  const u = `bp${++bpUid}`;
  const foot = 16;
  const HH = H + foot;
  const mono = 'ui-monospace, Menlo, Consolas, monospace';
  let svg = `<svg viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg" font-family="Roboto Slab, system-ui, sans-serif">`;
  svg += `<defs>
    <pattern id="${u}g" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M6 0H0V6" fill="none" stroke="#9ec1f0" stroke-opacity=".07"/></pattern>
    <pattern id="${u}G" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#9ec1f0" stroke-opacity=".16"/></pattern>
    <linearGradient id="${u}room" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21447c"/><stop offset="1" stop-color="#16305a"/></linearGradient>
    <radialGradient id="${u}red" cx="50%" cy="50%" r="75%"><stop offset=".55" stop-color="#ff3b2a" stop-opacity="0"/><stop offset="1" stop-color="#ff3b2a" stop-opacity=".55"/></radialGradient>
    <filter id="${u}glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>`;
  svg += `<rect width="${W}" height="${HH}" fill="url(#${u}g)"/><rect width="${W}" height="${HH}" fill="url(#${u}G)"/>`;
  // corridors, then the route taken so far
  const ctr = (p) => [p.x + rw / 2, p.y + rh / 2];
  for (let k = 1; k < pos.length; k++) {
    const [x1, y1] = ctr(pos[k - 1]); const [x2, y2] = ctr(pos[k]);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9ec1f0" stroke-opacity=".5" stroke-width="10"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#18356a" stroke-width="8"/>`;
  }
  for (let k = 1; k < pos.length; k++) {
    const [x1, y1] = ctr(pos[k - 1]); const [x2, y2] = ctr(pos[k]);
    const walked = k <= curIdx;
    svg += `<line class="${walked && !ended && k === curIdx ? 'route-live' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${walked ? '#ffe3a0' : '#9ec1f0'}" stroke-width="1.6" stroke-dasharray="4 4" opacity="${walked ? 0.95 : 0.35}"/>`;
  }
  pos.forEach((p, k) => {
    const isCur = k === curIdx && !ended;
    const done = k < curIdx || (ended && k <= curIdx);
    const bad = failed.has(p.st.id);
    const stroke = isCur ? '#ffd27a' : bad ? '#ff7a6b' : done ? '#7ee0a8' : '#9ec1f0';
    if (isCur) svg += `<rect class="room-glow" x="${p.x - 2}" y="${p.y - 2}" width="${rw + 4}" height="${rh + 4}" rx="7" fill="none" stroke="#ffd27a" stroke-width="4" filter="url(#${u}glow)"/>`;
    svg += `<rect x="${p.x}" y="${p.y}" width="${rw}" height="${rh}" rx="4" fill="url(#${u}room)" stroke="${stroke}" stroke-width="${isCur ? 2.6 : 2}"/>`;
    svg += `<rect x="${p.x + 3}" y="${p.y + 3}" width="${rw - 6}" height="${rh - 6}" rx="2" fill="none" stroke="${stroke}" stroke-opacity=".4" stroke-width=".7"/>`;
    // corner dimension ticks
    svg += `<path d="M${p.x - 3} ${p.y} h-3 M${p.x} ${p.y - 3} v-3 M${p.x + rw + 3} ${p.y + rh} h3 M${p.x + rw} ${p.y + rh + 3} v3" stroke="#9ec1f0" stroke-opacity=".5" stroke-width=".7"/>`;
    svg += `<text x="${p.x + 6}" y="${p.y + 20}" font-size="14">${p.st.icon}</text>`;
    svg += `<text x="${p.x + 26}" y="${p.y + 18}" font-size="10" fill="#e6efff" font-weight="700">${esc(trunc(p.st.label.replace(/^The /, ''), 13))}</text>`;
    svg += `<text x="${p.x + rw - 5}" y="${p.y + 10}" font-size="6" text-anchor="end" fill="#9ec1f0" opacity=".6" font-family="${mono}">RM ${String(k + 1).padStart(2, '0')}</text>`;
    const mark = bad && done ? '✗ messy' : done ? '✓ clear' : isCur ? '▶ now' : '';
    svg += `<text x="${p.x + 6}" y="${p.y + 38}" font-size="9.5" font-weight="700" fill="${bad ? '#ff9a8b' : isCur ? '#ffd27a' : '#7ee0a8'}">${mark}</text>`;
  });
  // crew tokens
  const crew = r.crew.map((id) => s.dogs[id]);
  const here = crew.filter((d) => !captured.has(d.id) && !gone.has(d.id) && !exposed.has(d.id) && !farmed.has(d.id));
  const anchor = curIdx >= 0 ? pos[curIdx] : { x: ox, y: oy - 60 };
  here.forEach((d, k) => {
    const tx = anchor.x + rw - 22 - (k % 4) * 15;
    const ty = curIdx >= 0 ? anchor.y + rh - 23 - Math.floor(k / 4) * 13 : oy;
    svg += `<g transform="translate(${tx} ${ty})"><ellipse cx="10" cy="20" rx="8" ry="2.2" fill="#000" opacity=".4"/><circle cx="10" cy="10" r="10" fill="#f4ead3" stroke="#0c1427" stroke-width="1.4"/><g transform="translate(1 1)">${innerPortrait(d, 18)}</g></g>`;
  });
  // van / gone tray
  const tray = [...captured].map((id) => ['🚓', s.dogs[id]]).concat([...farmed].map((id) => ['🚜', s.dogs[id]]), [...gone, ...exposed].map((id) => ['💨', s.dogs[id]]));
  const ty = H - 26;
  svg += `<text x="${ox}" y="${ty + 15}" font-size="10" fill="#9ec1f0">${tray.length ? 'Lost:' : ''}</text>`;
  tray.forEach(([ico, d], k) => {
    svg += `<g transform="translate(${ox + 32 + k * 42} ${ty})"><text x="0" y="15" font-size="12">${ico}</text><g transform="translate(16 0)"><circle cx="10" cy="10" r="10" fill="#f4ead3" opacity=".7"/>${innerPortrait(d, 20)}</g></g>`;
  });
  // drawing title block
  svg += `<path d="M0 ${HH - foot + 2} H${W}" stroke="#9ec1f0" stroke-opacity=".35"/>`;
  svg += `<text x="${ox + 2}" y="${HH - 5}" font-size="7" fill="#9ec1f0" opacity=".75" font-family="${mono}" letter-spacing=".5">DRG ${esc(job.id.toUpperCase())} · ${esc(trunc(job.venueName.toUpperCase(), 34))}</text>`;
  svg += `<g transform="translate(${W - 16} ${HH - 9})" opacity=".75"><circle r="5.5" fill="none" stroke="#9ec1f0" stroke-width=".7"/><path d="M0 -5 L2 1 L0 0 L-2 1 Z" fill="#9ec1f0"/><text x="-12" y="3" font-size="7" fill="#9ec1f0" font-family="${mono}">N</text></g>`;
  // alarm wash and police lights
  if (alarm > 0 && !ended) svg += `<rect width="${W}" height="${HH}" fill="url(#${u}red)" opacity="${Math.min(1, alarm / 10).toFixed(2)}" class="${alarm >= 6 ? 'alarm-wash' : ''}"/>`;
  if (coppers && !ended) svg += `<circle class="siren-a" cx="12" cy="10" r="16" fill="#ff3b2a" opacity=".6" filter="url(#${u}glow)"/><circle class="siren-b" cx="${W - 12}" cy="10" r="16" fill="#3b7bff" opacity=".6" filter="url(#${u}glow)"/>`;
  svg += '</svg>';
  return svg;
}

let bpUid = 0;

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
  const loot = (ids) => ids.map((id) => lootItem(job, id));
  let h = '';
  h += `<div class="paper"><div class="mast">The Daily Bark</div><div class="hl">${esc(a.headline || headlineGuess(s))}</div></div>`;
  h += `<section class="card"><h2>What Happened</h2>`;
  const sec = loot(r.secured);
  h += sec.length ? `<ul class="loot-list">${sec.map((l) => `<li><span>${LOOT_KINDS[l.kind].icon} ${esc(l.name)}</span><span class="v">${money(l.value)}</span></li>`).join('')}</ul>` : '<p>No loot. Not a sausage.</p>';
  const lines = [];
  for (const run of r.runners) lines.push(`💨 <b>${esc(shortName(s.dogs[run.id]))}</b> did a runner with ${esc(lootItem(job, run.lootId).name)}.`);
  for (const l of loot(r.dropped)) lines.push(`🚓 Lost to the police: ${esc(l.name)}.`);
  for (const l of r.lost || []) lines.push(`🚜 <b>${esc(shortName(s.dogs[l.id]))}</b> has gone to live on a farm. For good.`);
  for (const c of r.captured) lines.push(`🚓 <b>${esc(shortName(s.dogs[c.id]))}</b> was nicked — ${c.mumbled ? 'mumbled incoherently for hours' : c.talked ? '<b>talked</b>' : 'said nothing'}. ${count(c.sentence, 'job')} in the pound.`);
  for (const id of [...r.exposed, ...r.tipped]) lines.push(`👮 <b>${esc(shortName(s.dogs[id]))}</b> was an undercover copper!`);
  for (const p of a.promoted || []) {
    const d = s.dogs[p.id];
    lines.push(`🌟 <b>${esc(shortName(d))}</b> has made a name for themselves: <span class="rar ${p.to}">${RARITY[p.to].icon} ${RARITY[p.to].label}</span> ✨ ${esc(SIGNATURES[d.signature].name)}`);
  }
  for (const im of a.improved || []) lines.push(`📈 <b>${esc(shortName(s.dogs[im.id]))}</b> is getting better at ${SKILL_INFO[im.skill].icon} ${SKILL_INFO[im.skill].label} (now ${skillOf(s.dogs[im.id], im.skill)}).`);
  lines.push(`🕵️ Heat +${r.heatGain} (alarm peaked at ${r.alarmMax}/10, ${count(r.clues, 'clue')} left behind).`);
  h += `<div class="events mt">${lines.map((l) => `<p class="event">${l}</p>`).join('')}</div></section>`;

  const p = job.patron;
  if (a.step === 'deliver') {
    const item = lootItem(job, p.want);
    const Gp = GROUPS[p.group];
    h += `<section class="card deal-card"><h2>Deliver the Goods</h2><div class="offer-from"><div class="boss-pic">${portraitSVG(bossDog(p.group), { size: 56 })}</div><div><b>${esc(Gp.boss)}</b><div class="muted">${esc(Gp.bossTitle)}</div></div></div>
      <p class="mt">🎯 ${esc(item.name)}${p.deal === 'marker' ? ' · 📜 clears your debt' : ''}</p>
      <button class="btn block" data-act="deliver">🤝 Hand it over${p.fee ? ` · ${money(p.fee)}` : ''}</button></section>`;
  } else if (a.step === 'fence') {
    h += `<section class="card"><h2>Fence the Goods</h2>${p?.cut ? `<p><span class="chip info">✂️ ${GROUPS[p.group].emblem} takes ${p.cut}%</span></p>` : ''}`;
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
      h += '<button class="fence-opt" data-act="pay" data-pct="0"><b>Nothing to split. Move on.</b></button></section>';
      return h;
    }
    if (a.patronCut) h += `<p class="chip info">✂️ ${esc(GROUPS[p.group].name)} took their cut: ${money(a.patronCut)}</p>`;
    h += `<p class="muted">${money(a.received)} to split · ${count(owed.length, 'dog')}</p><div class="stack">`;
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
    if (a.relations?.length) {
      h += '<section class="card"><h2>The Players</h2>';
      for (const rl of a.relations) {
        const arrow = rl.debt ? '📜' : rl.delta > 0 ? '▲' : rl.delta < 0 ? '▼' : '✓';
        h += `<div class="trait rel ${rl.delta > 0 ? 'up' : rl.delta < 0 ? 'down' : ''}"><div class="boss-pic sm">${portraitSVG(bossDog(rl.gid), { size: 32 })}</div><div class="grow"><b>${esc(GROUPS[rl.gid].name)}</b> <span class="rel-d">${arrow} ${rl.delta ? (rl.delta > 0 ? '+' : '') + rl.delta : ''}</span> · ${esc(rl.why)} <span class="muted">(${standingLabel(rl.now)})</span>${rl.quote ? `<div class="line">${esc(rl.quote)}</div>` : ''}</div></div>`;
      }
      h += '</section>';
    }
    // crew management
    const involved = r.crew.map((id) => s.dogs[id]).filter((d) => d.status !== 'gone');
    if (involved.length) {
      h += '<section class="card"><h2>The Crew</h2>';
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
    <div class="title-hero">${skylineSVG(5)}<div class="title-portrait" style="filter:grayscale(1)">${portraitSVG(GUVNOR, { size: 180 })}</div></div>
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
  select: selectScreen,
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
  let m = G.ui.modal;
  if (!m && G.state?.story?.length && currentScreen(G) === 'select') m = { type: 'story' };
  document.body.classList.toggle('modal-open', !!(m && G.state));
  if (!m || !G.state) { root.innerHTML = ''; return; }
  if (m.type === 'story' && G.state.story[0].type === 'drama') {
    const st = G.state.story[0];
    const d = G.state.dogs[st.dog];
    const choices = sceneChoices(G.state, st);
    root.innerHTML = `<div class="modal-back"><div class="modal story drama" data-stop role="dialog" aria-modal="true">
      <div class="story-pic ${d.rarity || ''}">${portraitSVG(d, { size: 96 })}</div>
      <div class="muted center">📖 ${esc(displayName(d))}</div>
      <h2 class="center">${esc(st.title)}</h2><p class="story-text">${esc(st.text)}</p>
      ${st.notes?.length ? `<p class="chip good">${esc(st.notes.join(' '))}</p>` : ''}
      <div class="stack">${choices.map((c, i) => `<button class="btn block ${i ? 'ghost' : ''}" data-act="drama" data-i="${i}" ${c.ok ? '' : 'disabled'}>${esc(c.label)}${c.cost ? ` · ${money(c.cost)}` : ''}</button>`).join('')}</div></div></div>`;
    return;
  }
  if (m.type === 'story') {
    const st = G.state.story[0];
    root.innerHTML = `<div class="modal-back"><div class="modal story" data-stop role="dialog" aria-modal="true">
      <div class="story-pic">${portraitSVG(bossDog(st.gid), { size: 120 })}</div>
      <div class="muted center">${GROUPS[st.gid].emblem} ${esc(GROUPS[st.gid].name)}</div>
      <h2 class="center">${esc(st.title)}</h2><p class="story-text">${esc(st.text)}</p>
      <button class="btn block" data-act="story-ok">${st.kind === 'intro' ? 'Hear them out' : 'Right.'}</button></div></div>`;
    return;
  }
  let inner = '';
  if (m.type === 'dog') inner = dogModal(G, G.state.dogs[m.id]);
  else if (m.type === 'pick') inner = pickModal(G, m.purpose);
  else if (m.type === 'card') inner = cardModal(G, G.state.dogs[m.id]);
  root.innerHTML = `<div class="modal-back" data-act="close-modal"><div class="modal" data-stop role="dialog" aria-modal="true"><div class="modal-bar"><button class="close" data-act="close-modal" aria-label="Close">✕</button></div>${inner}</div></div>`;
}

// Compact profile: sized to fit a phone screen, with actions pinned to the
// bottom of the sheet so they're always reachable.
function dogModal(G, d) {
  const s = G.state;
  if (!d) return '';
  const b = BREEDS[d.breed];
  const inCrew = s.crew.includes(d.id);
  const planning = s.phase === 'plan';
  const skills = SKILLS.map((sk) => `<div class="skill"><span class="lbl">${SKILL_INFO[sk].icon} ${SKILL_INFO[sk].label}</span>${pips(skillOf(d, sk), d.known.skills[sk])}</div>`).join('');
  const knownT = d.talents.filter((t) => d.known.talents.includes(t));
  const unknownT = d.talents.length - knownT.length;
  const sig = d.signature ? `<span class="chip sig-chip" title="${esc(SIGNATURES[d.signature].blurb)}">✨ ${esc(SIGNATURES[d.signature].name)}</span>` : '';
  // Best three known talents; the rest fold into a "+N" chip so the profile fits a phone.
  const shownT = knownT.slice().sort((x, y) => TALENTS[y].bonus - TALENTS[x].bonus).slice(0, d.signature ? 2 : 3);
  const moreT = knownT.filter((t) => !shownT.includes(t));
  const talents = sig + shownT.map((t) => `<span class="chip info" title="${esc(TALENTS[t].blurb)}">${esc(TALENTS[t].name)} ${SKILL_INFO[TALENTS[t].skill].icon}+${TALENTS[t].bonus}</span>`).join('')
    + (moreT.length ? `<span class="chip info" title="${esc(moreT.map((t) => TALENTS[t].name).join(', '))}">+${moreT.length} more</span>` : '')
    + (unknownT ? `<span class="chip">❓ ${unknownT} unknown</span>` : '');
  const quirks = d.known.quirks.map((q) => `<span class="chip ${QUIRKS[q].good === true ? 'good' : QUIRKS[q].good === false ? 'bad' : ''}" title="${esc(QUIRKS[q].blurb)}">${esc(QUIRKS[q].name)}</span>`).join('')
    || '<span class="muted">No quirks known yet.</span>';
  const trait = (k, label) => `<div class="dm-trait"><span>${label}</span><b>${d.known[k] ? band(d[k]) : '?'}</b></div>`;
  const arc = (s.arcs || []).find((a) => a.dog === d.id);
  const undercover = (d.known.undercover && d.undercover ? '<span class="chip bad">👮 UNDERCOVER COPPER</span>' : d.cleared ? '<span class="chip good">✓ Checked out</span>' : '')
    + (arc ? `<span class="chip info">📖 ${esc(ARCS[arc.kind].title)}</span>` : '') + dramaChips(d).join('');
  const where = d.status === 'pound' ? `in the pound (${d.sentence})` : d.status === 'crew' ? 'on your crew' : d.status;

  // Actions: one primary, then compact secondaries.
  const primary = [];
  const minor = [];
  const hf = hiringFor(G);
  const away = isVisitor(d) && d.status === 'free' && d.inTown !== s.job?.id;
  if (planning && d.status === 'free' && !inCrew && away) primary.push('<span class="chip">Out of town. Stars come and go.</span>');
  else if (planning && d.status === 'free' && !inCrew && d.drama?.away) primary.push('<span class="chip">Sitting this one out.</span>');
  else if (planning && d.status === 'free' && !inCrew) primary.push(`<button class="btn" data-act="hire" data-id="${d.id}">${hf ? `Hire for step ${hf.n}` : 'Hire'} · ${money(hireCost(s, d))}</button>`);
  if (planning && inCrew) primary.push(`<button class="btn ghost" data-act="dismiss" data-id="${d.id}">Drop from crew</button>`);
  if (d.status === 'pound') primary.push(`<button class="btn" data-act="lawyer" data-id="${d.id}">⚖️ Hire a brief · £150</button>`);
  if (planning && ['free', 'crew'].includes(d.status) && !(d.known.loyalty && (d.cleared || d.known.undercover))) minor.push(`<button class="btn ghost small" data-act="surveil" data-id="${d.id}" ${s.job.daysLeft ? '' : 'disabled'} aria-label="Have them followed, £80, 1 day">🕵️ Tail<small>£80 · 1 day</small></button>`);
  minor.push(`<button class="btn ghost small" data-act="share" data-id="${d.id}" aria-label="Share card">📸 Share<small>their card</small></button>`);
  const canFarm = d.met && ['free', 'crew', 'pound'].includes(d.status) && s.phase !== 'heist';
  if (canFarm) minor.push(`<button class="btn ghost small" data-act="farm" data-id="${d.id}" aria-label="Send to live on a farm">🚜 Farm<small>no return</small></button>`);
  let actions;
  if (canFarm && G.ui.confirmFarm === d.id) {
    actions = `<div class="dm-confirm">Send ${esc(shortName(d))} to live on a farm? There's no coming back, and the others will notice.</div>
      <div class="dm-row"><button class="btn red" data-act="farm" data-id="${d.id}">🚜 Yes, the farm</button><button class="btn ghost" data-act="dog" data-id="${d.id}">Cancel</button></div>`;
  } else {
    actions = `${primary.length ? `<div class="dm-row">${primary.join('')}</div>` : ''}<div class="dm-row minor">${minor.join('')}</div>`;
  }

  return `<div class="dm-head ${d.rarity || ''}"><div class="portrait-big">${portraitSVG(d, { size: 84 })}</div>
    <div class="grow"><h2 class="dm-name ${displayName(d).length > 22 ? 'long' : ''}">${esc(displayName(d))}</h2><div class="faction">${rarityBadge(d)}${esc(FACTIONS[d.faction].label)}</div>
    <div class="dm-sub">${[b.label, relationLabel(d), d.jobs ? count(d.jobs, 'job') : '', d.status === 'free' ? '' : where].filter(Boolean).map(esc).join(' · ')}</div></div></div>
    <div class="quote dm-quote">"${esc(d.catchphrase)}"</div>
    <h3 class="dm-h">Skills</h3><div class="skill-grid dm-skills">${skills}</div>
    <h3 class="dm-h">Talents</h3><div class="dm-chips">${talents}</div>
    <h3 class="dm-h">Character</h3><div class="dm-traits">${trait('loyalty', 'Loyalty')}${trait('nerve', 'Nerve')}${trait('greed', 'Greed')}</div>
    <div class="dm-chips">${undercover}${quirks}</div>
    <div class="dm-actions">${actions}</div>`;
}

function cardModal(G, d) {
  if (!G.card || G.card.id !== d.id) return '';
  const name = `crimedog-${d.first.toLowerCase()}.png`;
  return `<h2>${esc(shortName(d))}'s card</h2>
    <img class="card-preview" src="${G.card.url}" alt="Character card for ${esc(displayName(d))}" data-card-preview>
    <p class="muted center">Long-press to save</p>
    <div class="btn-row">${canShareFiles() ? '<button class="btn" data-act="share-native">📤 Share</button>' : ''}<a class="btn ghost" href="${G.card.url}" download="${esc(name)}">💾 Save</a></div>`;
}

function pickModal(G, purpose) {
  const s = G.state;
  const crew = E.crewDogs(s);
  const title = purpose === 'case' ? 'Who cases the joint?' : 'Who goes undercover as staff?';
  let h = `<h2>${title}</h2><p class="muted">${purpose === 'case' ? '👃 finds more · 🐾 avoids being spotted · £40' : '🥸 or 🎩 helps · £100'}</p><div class="pick-list">`;
  h += crew.map((d) => dogCard(G, d, { act: 'picked', extra: `data-purpose="${purpose}"`, skill: purpose === 'case' ? ['nose', 'sneak'] : ['disguise', 'charm'] })).join('') || '<p>Nobody on the crew yet.</p>';
  h += '</div>';
  if (purpose === 'case') h += '<button class="btn block ghost" data-act="picked" data-purpose="case" data-id="tipster">💰 Pay a tipster instead · £120</button>';
  return h;
}

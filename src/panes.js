// The top bar's panes (cash, reputation, the Inspector, the day book) and the
// help page. Each is modal content; renderModal in ui.js wraps it.
import { esc, money } from './util.js';
import { inspectorLabel, starChance } from './engine.js';
import { columnChart, lineChart, UP, DOWN } from './charts.js';
import { APPROACHES, GROUPS, RARITY } from './data.js';
import { INSPECTOR, MOVE_LABELS, moFile } from './inspector.js';

// What each kind of money was for.
const CATS = {
  fence: ['🤝', 'Fenced loot'], commission: ['🎯', 'Commissions'], front: ['💰', 'Money fronted'], loan: ['🌹', 'Family loan'],
  crew: ['🐾', 'Hiring crew'], pay: ['✂️', 'Crew\'s cut'], kit: ['🧰', 'Kit'], intel: ['🔎', 'Intel & tips'], fixer: ['🗝️', 'The fixer'],
  pound: ['⚖️', 'Lawyers'], debts: ['📜', 'Debts'], raids: ['💥', 'Raids'], drama: ['📖', 'Crew drama'], wager: ['🎲', 'Wagers & gifts'],
};
// The timeline is booked at the end of each job; things move between jobs
// (heat cools, raids), so end the line on where it stands now.
function series(s, key) {
  const pts = (s.timeline || []).map((p) => ({ label: p.label, value: p[key], tip: `${p.label}: ${p[key]}` }));
  if (pts.length && pts.at(-1).value !== s[key]) pts.push({ label: 'Now', value: s[key], tip: `Now: ${s[key]}` });
  return pts;
}
const signed = (n) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
const short = (n) => (Math.abs(n) >= 1000 ? `${n < 0 ? '−' : ''}£${(Math.abs(n) / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : `${n < 0 ? '−' : ''}£${Math.abs(n)}`);

function items(obj) {
  const rows = Object.entries(obj || {}).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '<p class="muted">Nothing yet.</p>';
  return `<ul class="ledger">${rows.map(([k, v]) => `<li><span>${CATS[k]?.[0] || '•'} ${esc(CATS[k]?.[1] || k)}</span><b class="${v < 0 ? 'out' : 'in'}">${signed(v)}</b></li>`).join('')}</ul>`;
}

function cashPane(s) {
  const b = s.books || { open: {}, jobs: [] };
  const all = b.jobs.flatMap((j) => Object.values(j.items)).concat(Object.values(b.open));
  const earned = all.filter((v) => v > 0).reduce((a, v) => a + v, 0);
  const spent = all.filter((v) => v < 0).reduce((a, v) => a + v, 0);
  const recent = b.jobs.slice(0, 12).reverse();
  const chart = recent.length
    ? columnChart(recent.map((j) => ({ label: j.label, value: j.net, tip: `${j.label}: ${signed(j.net)}` })), { fmt: short, caption: 'Profit or loss per job. Tap a column.' })
    : '<p class="muted">Finish a job to see how it paid.</p>';
  return `<h2>💷 The Books</h2>
    <div class="hero-fig">${money(s.cash)}</div>
    <div class="tiles"><div class="tile"><span>Earned</span><b>${money(earned)}</b></div><div class="tile"><span>Spent</span><b>${money(-spent)}</b></div><div class="tile"><span>Jobs</span><b>${b.jobs.length}</b></div></div>
    <div class="legend"><span><i style="background:${UP}"></i>Profit</span><span><i style="background:${DOWN}"></i>Loss</span></div>
    ${chart}
    <h3 class="dm-h">Since the last job</h3>${items(b.open)}
    ${b.jobs.length ? `<h3 class="dm-h">Job by job</h3>${b.jobs.map((j) => `<details class="pl"><summary><span>${j.grade ? `<b class="gl g${j.grade}">${j.grade}</b>` : '<b class="gl">–</b>'} ${esc(j.label)}</span><b class="${j.net < 0 ? 'out' : 'in'}">${signed(j.net)}</b></summary>${items(j.items)}</details>`).join('')}` : ''}`;
}

const REP_WORDS = [[80, 'A legend'], [60, 'Feared'], [45, 'Respected'], [30, 'Known'], [15, 'Small-time'], [0, 'Nobody']];
function repPane(s) {
  const t = s.timeline || [];
  const word = REP_WORDS.find(([min]) => s.rep >= min)[1];
  const unlocks = [
    ...Object.values(GROUPS).map((g) => [g.minRep, `${g.emblem} ${g.name} offer work`]),
    [RARITY.legendary.minRep, '★★ Legendary crew will work for you'],
    [60, '★★★ Bigger jobs'],
  ].sort((a, b) => a[0] - b[0]);
  const changes = t.slice(1).map((p, i) => ({ label: p.label, d: p.rep - t[i].rep })).reverse().slice(0, 6);
  return `<h2>⭐ Reputation</h2>
    <div class="hero-fig">${s.rep}<small>/100 · ${word}</small></div>
    ${t.length > 1 ? lineChart(series(s, 'rep'), { caption: 'Reputation after each job. Tap a point.' }) : '<p class="muted">Finish a job to start the chart.</p>'}
    <h3 class="dm-h">What it opens up</h3>
    <ul class="ledger">${unlocks.map(([min, what]) => `<li><span>${s.rep >= min ? '✅' : '🔒'} ${esc(what)}</span><b>${min}+</b></li>`).join('')}
      <li><span>🌟 Chance a star's in the pub</span><b>${Math.round(starChance(s.rep) * 100)}%</b></li></ul>
    ${changes.length ? `<h3 class="dm-h">Lately</h3><ul class="ledger">${changes.map((c) => `<li><span>${esc(c.label)}</span><b class="${c.d < 0 ? 'out' : 'in'}">${c.d >= 0 ? '+' : '−'}${Math.abs(c.d)}</b></li>`).join('')}</ul>` : ''}
    <p class="muted">Good grades raise it; flops, walking away and farming real crooks lower it. At 0, nobody will work for you.</p>`;
}

const HEAT_LEVELS = [
  [12, '🚓', 'Undercover coppers and stakeouts'],
  [25, '🪤', 'Stings: fake tips, and Fancy Francesca'],
  [35, '🐀', 'He turns your regulars into grasses'],
  [45, '🚪', 'Raids on your back room'],
  [60, '🚨', 'The police come running sooner'],
  [100, '🚔', 'The Inspector knocks. Game over'],
];
function heatPane(s) {
  const t = s.timeline || [];
  const sev = s.heat >= 60 ? 'serious' : s.heat >= 25 ? 'warning' : 'good';
  const changes = t.slice(1).map((p, i) => ({ label: p.label, d: p.heat - t[i].heat })).reverse().slice(0, 6);
  const file = moFile(s);
  const moves = (s.inspector?.moves || []).filter((m) => MOVE_LABELS[m.move]).slice(0, 6);
  return `<h2>🕵️ ${esc(INSPECTOR.name)}</h2>
    <div class="hero-fig">${s.heat}<small>/100 · ${esc(inspectorLabel(s.heat))}</small></div>
    <div class="meter ${sev}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.heat}"><i style="width:${s.heat}%"></i></div>
    ${t.length > 1 ? lineChart(series(s, 'heat'), { color: DOWN, refs: [{ y: 12, label: 'coppers' }, { y: 25, label: 'stings' }, { y: 45, label: 'raids' }], caption: 'Heat after each job. Tap a point.' }) : ''}
    <h3 class="dm-h">What the heat brings</h3>
    <ul class="ledger">${HEAT_LEVELS.map(([at, icon, what]) => `<li><span>${s.heat >= at ? '⚠️' : icon} ${esc(what)}</span><b>${at}+</b></li>`).join('')}</ul>
    <h3 class="dm-h">His file on your methods</h3>
    ${file.length ? `<ul class="ledger">${file.map((f) => `<li><span>📁 ${esc(APPROACHES[f.ap].label)}</span><b class="out">+${f.pen}</b></li>`).join('')}</ul><p class="muted">Security has been briefed on these. Mix it up and the file goes stale.</p>` : '<p class="muted">Nothing on your methods yet. Vary your tricks and keep it that way.</p>'}
    ${moves.length ? `<h3 class="dm-h">His moves</h3><ul class="news">${moves.map((m) => `<li><b>Day ${m.day}</b> ${esc(MOVE_LABELS[m.move])}</li>`).join('')}</ul>` : ''}
    <h3 class="dm-h">Cooling off</h3>
    <p class="muted">Clues, alarms, the Old Bill turning up and crew who talk all add heat. It cools a little after every job; lying low (the fixer), a safehouse and fake IDs help.</p>
    ${changes.length ? `<h3 class="dm-h">Lately</h3><ul class="ledger">${changes.map((c) => `<li><span>${esc(c.label)}</span><b class="${c.d > 0 ? 'out' : 'in'}">${c.d >= 0 ? '+' : '−'}${Math.abs(c.d)}</b></li>`).join('')}</ul>` : ''}`;
}

function dayPane(s) {
  return `<h2>📅 The Day Book</h2><p class="muted">Day ${s.day}. What's been happening.</p>
    <ul class="news">${s.news.map((n) => `<li><b>Day ${n.day}</b> ${esc(n.text)}</li>`).join('') || '<li>Nothing yet.</li>'}</ul>`;
}

export function paneModal(G, which) {
  const s = G.state;
  return { cash: cashPane, rep: repPane, heat: heatPane, day: dayPane }[which]?.(s) || '';
}

// ------------------------------------------------------------------ help
const HELP = [
  ['🎯 The idea', `You're the mastermind. You never go on the job: you pick it, hire the crew, case the joint, buy the kit and draw up the plan, then watch it play out. Get rich, stay respected, and keep the Inspector off your back.`],
  ['🔁 A turn', `<b>Job board</b>: pick a job (your own leads, or offers from the city's outfits once you've a name). <b>Plan</b>: hire at the pub, case the joint, buy kit, see the fixer, then choose who does each step and how. <b>The heist</b>: watch it unfold. <b>Aftermath</b>: hand over or fence the goods, pay the crew, get graded.`],
  ['🐾 Crew', `Each dog has skills (only the ones you've seen are shown), talents and quirks. Work together and you learn more; get on and they get better, even rare or legendary. 👑 Leaders steady everyone; 🃏 wildcards bring chaos, good and bad. ★ Stars drift through town with secret moves.`],
  ['📋 Planning', `Casing finds intel and hidden hazards: a good nose smells things out, a hacker finds the systems, a sneak watches the patrols. Get spotted and security goes on alert. The odds on each step are shown for skills you know. Kit and intel open new ways through.`],
  ['💥 When it goes wrong', `A fumbled step goes pear-shaped: someone improvises, alarms ring, the Old Bill may arrive. Crew can get nicked, end up on the farm, do a runner, or turn out to be undercover coppers.`],
  ['🕵️ The Inspector', `He makes a move between jobs: coppers planted in the pub, stakeouts, tips that are really setups, crew pulled in for questioning, regulars turned into grasses, raids. He also keeps a file on your tricks: use the same one job after job and security will be ready for it. Surveil strangers, case tips before you trust them, and mix it up.`],
  ['🦹 Rivals', `Other crews work this town too. The Jack Russell Gang make trouble: tipping off security, nicking kit, turning up on your jobs. Dandy Dan leaves notes and bets you can't pull a job. Rat them out (it costs rep), set them up, or rob them. And someone called the Grey Ghost is watching: leave your calling card on good, quiet jobs and you might win them over.`],
  ['🗺️ Kinds of job', `Break-ins, switches (swap it for a replica), long cons, smash & grabs, van jobs, wire jobs and paper trails. Each has its own steps. Some won't take an insider; some need a real specialist.`],
  ['🏙️ The city', `Five outfits offer work once your rep clears their bar. Do right by them and they pay; cross them and they act against you. The Family and the Syndicate lend money, and they collect.`],
  ['📊 The top bar', `Tap 💷 for the books, ⭐ for your reputation, 🕵️ for the Inspector and 📅 for the day book. 📜 Rap sheet keeps every job, and you can share any of them.`],
];
export function helpModal() {
  return `<h2>❓ How to Play</h2>
    ${HELP.map(([title, body], i) => `<details class="help" ${i === 0 ? 'open' : ''}><summary>${title}</summary><p>${body}</p></details>`).join('')}
    <p class="muted center mt">A heist game. For dogs.</p>`;
}

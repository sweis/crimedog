// Nods to the films: wiretaps, black boxes, little cars, hard-nosed coppers and
// the usual suspects. Each one has to do something, and read cleanly.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { ARCHETYPES, VERDICTS, CHAOS, TWISTS, NICKNAMES, APPROACHES, GETAWAY_POOL } from '../src/data.js';
import { ARCS, startArc } from '../src/drama.js';
import { inspectorMoves } from '../src/inspector.js';
import { bondOf } from '../src/bonds.js';
import { genDog } from '../src/dogs.js';
import { genJob, visibleStages } from '../src/heists.js';
import { odds } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const REAL = ['Italian', 'French', 'Poughkeepsie', 'Marseille', 'Turin', 'London', 'Brooklyn', 'San Francisco', 'Union Square', 'Kobayashi Porcelain'];

test('kibble is for closers. Not coffee, not biscuits.', () => {
  const text = JSON.stringify({ ARCHETYPES, VERDICTS, over: E.GAME_OVER_TEXT });
  assert.doesNotMatch(text, /coffee|biscuits are for closers/i);
  assert.match(E.GAME_OVER_TEXT.nobody.text, /Kibble is for closers/);
  assert.ok(ARCHETYPES.some((a) => /Kibble is for closers/.test(a.line)));
});

test('the new lines read cleanly: no real places or nationalities, nobody admits to being a dog', () => {
  const NEW_ARCS = ['tape', 'box'];
  const NEW_LINES = ['passport', 'secrets', 'recording', 'hunch', 'singer', 'suspect', 'oldlag'];
  const scenes = NEW_ARCS.flatMap((k) => Object.values(ARCS[k].nodes).flatMap((n) => [n.text, n.maxed, ...n.choices.map((c) => `${c.label} ${c.say || ''}`)]));
  const text = JSON.stringify({
    lines: ARCHETYPES.filter((a) => NEW_LINES.includes(a.id)),
    chaos: [...CHAOS.good.slice(-2), ...CHAOS.bad.slice(-2)],
    twists: [TWISTS.gridlock, TWISTS.bugged],
    scenes,
    getaways: [APPROACHES.s_wheelman, APPROACHES.g_traffic],
    nicks: NICKNAMES.slice(-14),
  });
  for (const w of REAL) assert.ok(!text.includes(w), w);
  assert.doesNotMatch(text.replace(/Dog & Duck/g, ''), /\bdogs?\b/i);
  assert.equal(new Set(NICKNAMES).size, NICKNAMES.length);
});

// A game between jobs with a few regulars who've worked for you.
function withRegulars(seed, n = 5) {
  const s = E.newGame(seed);
  s.cash = 5000;
  s.inspector = { met: true, moves: [], plant: false };
  const rng = E.rngOf(s);
  const ds = Array.from({ length: n }, () => {
    const d = genDog(s, rng, {});
    Object.assign(d, { met: true, jobs: 2, faction: 'indie' });
    s.dogs[d.id] = d;
    return d;
  });
  s.story = [];
  return { s, ds };
}

test('the usual suspects: a line-up leaves them thick as thieves', () => {
  const { s, ds } = withRegulars(3);
  const st = inspectorMoves(s, makeRng({ s: 3 }), { force: 'lineup' });
  assert.equal(st.title, 'The Usual Suspects');
  assert.match(st.text, /Hand over the keys, you dozy mutt/);
  const inLine = st.dogs.map((id) => s.dogs[id]);
  assert.ok(inLine.length >= 3);
  assert.ok(bondOf(s, inLine[0].id, inLine[1].id) >= 15);
  const before = inLine.map((d) => d.relation);
  assert.ok(E.chooseStory(s, 0).ok);
  assert.ok(inLine.every((d, i) => d.relation > before[i]), 'a round on you');
  // Too few regulars: no line-up.
  const few = withRegulars(4, 2);
  for (const d of Object.values(few.s.dogs)) if (!few.ds.includes(d)) d.jobs = 0;
  assert.equal(inspectorMoves(few.s, makeRng({ s: 4 }), { force: 'lineup' }), null);
});

test('down to the last bolt: no van, no scene; scrap it and it\'s gone, rebuild it and it isn\'t', () => {
  const { s } = withRegulars(5);
  assert.equal(inspectorMoves(s, makeRng({ s: 5 }), { force: 'strip' }), null);
  s.kit.van = 1;
  inspectorMoves(s, makeRng({ s: 5 }), { force: 'strip' });
  assert.equal(s.story[0].title, 'Down to the Last Bolt');
  E.chooseStory(s, 1);
  assert.equal(s.kit.van, 0);
  s.kit.van = 1;
  inspectorMoves(s, makeRng({ s: 6 }), { force: 'strip' });
  const cash = s.cash;
  E.chooseStory(s, 0);
  assert.equal(s.kit.van, 1);
  assert.equal(s.cash, cash - 250);
});

test('followed: lead him a merry dance, and a good sneak loses him on the train', () => {
  let lost = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s, ds } = withRegulars(seed, 3);
    for (const d of ds) d.skills.sneak = 5;
    const st = inspectorMoves(s, makeRng({ s: seed }), { force: 'tail' });
    assert.ok(st.choices.some((c) => c.effect === 'slip'));
    const r = E.chooseStory(s, st.choices.findIndex((c) => c.effect === 'slip'));
    if (/waves goodbye through the window/.test(r.msg)) lost++;
    else assert.ok(s.dogs[st.dog].drama?.trouble, 'still on their tail');
  }
  assert.ok(lost >= 15 && lost < 30, `${lost}/30 lost him`);
});

test('the tape: clean it up and it means something else; forget it and the floorboards come up', () => {
  const { s, ds } = withRegulars(7, 1);
  const d = ds[0];
  let arc = startArc(s, 'tape', d.id, makeRng({ s: 7 }));
  assert.match(s.story.at(-1).text, /He'd grass us if he got the chance/);
  s.story = s.story.slice(-1);
  E.chooseStory(s, 0);
  assert.match(s.story[0].text, /He'd grass US if he got the chance/);
  // Forget it: a scene next time about the floorboards.
  s.story = [];
  arc = startArc(s, 'tape', d.id, makeRng({ s: 8 }));
  s.story = s.story.slice(-1);
  E.chooseStory(s, 1);
  assert.equal(arc.node, 'floorboards');
});

test('no more secrets: sell the box, hand it back, or keep it and verify', () => {
  const { s, ds } = withRegulars(9, 1);
  const d = ds[0];
  startArc(s, 'box', d.id, makeRng({ s: 9 }));
  s.story = s.story.slice(-1);
  const cash = s.cash;
  const heat = s.heat;
  E.chooseStory(s, 0);
  assert.ok(s.cash > cash + 500 && s.heat > heat, 'sold: money, and the man in the grey suit');
  startArc(s, 'box', d.id, makeRng({ s: 10 }));
  s.story = s.story.slice(-1);
  s.heat = 30;
  E.chooseStory(s, 1);
  assert.equal(s.heat, 22, 'handed back: your file goes missing');
  const arc = startArc(s, 'box', d.id, makeRng({ s: 11 }));
  s.story = s.story.slice(-1);
  E.chooseStory(s, 2);
  assert.equal(arc.node, 'voice');
  assert.match(ARCS.box.nodes.voice.text, /My voice is my passport\. Verify me\./);
});

test('gridlock makes a getaway on wheels harder; the traffic lights turn up as a getaway, the little cars as the Wheelman\'s', () => {
  let traffic = 0;
  let gridlocks = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = E.newGame(seed);
    const job = genJob(s, makeRng({ s: seed }), { tier: 2 });
    if (job.stages.find((st) => st.id === 'getaway')?.options.includes('g_traffic')) traffic++;
    if (job.twist === 'gridlock') gridlocks++;
  }
  assert.ok(traffic > 10 && gridlocks > 3, `${traffic} ${gridlocks}`);
  assert.ok(GETAWAY_POOL.includes('g_traffic'));
  assert.match(APPROACHES.s_wheelman.label, /Three little cars/);
  const s = E.newGame(2);
  const job = genJob(s, makeRng({ s: 2 }), { type: 'breakin', tier: 2, twist: null });
  s.job = job;
  const g = visibleStages(job).find((st) => st.id === 'getaway');
  const d = genDog(s, E.rngOf(s), {});
  d.skills.wheels = 4;
  const clear = odds(s, job, g, 'g_hotwire', d, { crew: [d] }).p;
  const drive = odds(s, job, g, 'g_barge', d, { crew: [d] }).p;
  job.twist = 'gridlock';
  assert.ok(odds(s, job, g, 'g_barge', d, { crew: [d] }).p < drive, 'wheels: harder');
  assert.equal(odds(s, job, g, 'g_hotwire', d, { crew: [d] }).p, clear, 'tech: no different');
});

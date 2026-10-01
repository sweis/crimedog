// The books: every penny in or out is booked, so the cash pane's P&L adds up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { career } from '../tools/balance.mjs';

const START = 2500;
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('over whole careers, the books reconcile with the cash to the penny', () => {
  for (const policy of ['smart', 'reckless']) {
    for (let seed = 1; seed <= 60; seed++) {
      const { s } = career(seed, policy, 10);
      const booked = s.books.jobs.reduce((a, j) => a + sum(j.items), 0) + sum(s.books.open);
      assert.equal(START + booked, s.cash, `${policy} seed ${seed}`);
      for (const j of s.books.jobs) assert.equal(j.net, sum(j.items));
    }
  }
});

test('each job closes its books and adds a point to the timeline', () => {
  const { s, grades } = career(7, 'smart', 8);
  const graded = s.books.jobs.filter((j) => j.grade).length;
  assert.equal(graded, grades.length);
  assert.equal(s.timeline[0].label, 'Start');
  assert.equal(s.timeline.length, s.books.jobs.length + 1);
  const last = s.timeline.at(-1);
  assert.ok(Number.isFinite(last.rep) && Number.isFinite(last.heat) && Number.isFinite(last.cash));
  // Income shows up under what earned it.
  assert.ok(s.books.jobs.some((j) => (j.items.fence || 0) + (j.items.commission || 0) > 0), 'something was earned');
  assert.ok(s.books.jobs.some((j) => j.items.crew < 0), 'crew were hired');
});

test('the top bar panes and help render cleanly, and the charts end where things stand now', async () => {
  const { paneModal, helpModal } = await import('../src/panes.js');
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const jobs of [0, 1, 12]) {
      const { s } = career(seed, seed % 2 ? 'smart' : 'reckless', jobs);
      for (const which of ['cash', 'rep', 'heat', 'day']) {
        const html = paneModal({ state: s }, which);
        assert.ok(html.length > 100, which);
        assert.doesNotMatch(html, /undefined|NaN|\[object/, `${which} seed ${seed} jobs ${jobs}`);
      }
      // The latest point on each line is the number in the top bar.
      for (const [which, key] of [['rep', 'rep'], ['heat', 'heat']]) {
        const html = paneModal({ state: s }, which);
        const labels = [...html.matchAll(/font-weight="700"[^>]*>(-?\d+)<\/text>/g)].map((m) => Number(m[1]));
        if (s.timeline.length > 1) assert.equal(labels.at(-1), s[key], `${which} seed ${seed}`);
      }
      // Cash columns: one per job, up to 12.
      const cols = (paneModal({ state: s }, 'cash').match(/data-act="tip"/g) || []).length;
      assert.equal(cols, Math.min(12, s.books?.jobs.length ?? 0));
    }
  }
  assert.ok((helpModal().match(/<details class="help"/g) || []).length >= 6);
});

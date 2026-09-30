import test from 'node:test';
import assert from 'node:assert/strict';
import { career } from '../tools/balance.mjs';

// Guards the difficulty curve: planning should pay, recklessness mostly shouldn't.
test('balance: careful play beats reckless play by a wide margin', () => {
  const tally = { smart: {}, reckless: {} };
  for (const policy of ['smart', 'reckless']) {
    for (let seed = 1; seed <= 80; seed++) {
      for (const g of career(seed, policy, 8).grades) tally[policy][g] = (tally[policy][g] || 0) + 1;
    }
  }
  const rate = (t, gs) => gs.reduce((s, g) => s + (t[g] || 0), 0) / Object.values(t).reduce((a, b) => a + b, 0);
  const smartGood = rate(tally.smart, ['S', 'A', 'B']);
  const recklessBad = rate(tally.reckless, ['D', 'F']);
  console.log({ smartGood: smartGood.toFixed(2), recklessBad: recklessBad.toFixed(2), smart: tally.smart, reckless: tally.reckless });
  assert.ok(smartGood >= 0.3, `smart B+ rate ${smartGood}`);
  assert.ok(recklessBad >= 0.6, `reckless D/F rate ${recklessBad}`);
  assert.ok((tally.smart.S || 0) > 0, 'a perfect heist is achievable');
  assert.ok((tally.smart.S || 0) / Object.values(tally.smart).reduce((a, b) => a + b, 0) < 0.2, 'perfect heists stay rare');
});

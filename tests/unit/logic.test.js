// Pure logic tests (node --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, makeUnit, DYING_TIME } from '../../js/battle.js';
import { enemyWave, rewardCoins, mergedRank, MAX_RANK, computeStats, wavePower, COLS, ZONE_ROWS } from '../../js/data.js';
import { Store } from '../../js/store.js';

const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

test('friendly fire deals no damage', () => {
  const a = makeUnit({ team: 'ally', type: 'sword', rank: 1, cell: 0 });
  const b = makeUnit({ team: 'ally', type: 'sword', rank: 1, cell: 1 });
  const e = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 10 });
  const bt = new Battle({ allies: [a, b], enemies: [e] });
  assert.equal(bt.applyDamage(a, b), 0); assert.equal(b.hp, b.maxHp);
  assert.ok(bt.applyDamage(a, e) > 0); assert.ok(e.hp < e.maxHp);
});

test('units walk until in range, then attack; dead units removed after dying time', () => {
  const a = makeUnit({ team: 'ally', type: 'archer', rank: 3, cell: 12 });
  const e = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 2, mult: 0.5 });
  const bt = new Battle({ allies: [a], enemies: [e] }); bt.trace = [];
  while (!bt.over) bt.step(1 / 60);
  for (const x of bt.trace) {
    if (x.kind === 'walk') assert.ok(x.dist > x.range);
    if (x.kind === 'attack') assert.ok(x.dist <= x.range);
  }
  const dy = bt.trace.find((x) => x.kind === 'dying'), rm = bt.trace.find((x) => x.kind === 'removed');
  assert.ok(rm.t - dy.t >= DYING_TIME - 1e-9);
  assert.equal(bt.winner, 'ally');
});

test('merge rules', () => {
  const s = new Store(mem());
  const [s1, s2] = s.data.roster.filter((c) => c.type === 'sword');
  const mage = s.data.roster.find((c) => c.type === 'mage');
  assert.equal(s.merge(mage.id, s1.id).ok, false);
  const r = s.merge(s2.id, s1.id); assert.ok(r.ok); assert.equal(s1.rank, 2);
  assert.equal(mergedRank(9, 9), MAX_RANK); assert.equal(mergedRank(10, 1), MAX_RANK);
});

test('win rewards exceed lose rewards', () => {
  for (let st = 1; st < 50; st++) assert.ok(rewardCoins(st, true) > rewardCoins(st, false));
});

test('enemy strength grows smoothly (no sudden spikes) over 100+ stages', () => {
  const pw = (st) => { const w = enemyWave(st); return wavePower(w.units, w.mult); };
  for (let st = 1; st < 150; st++) {
    const r = pw(st + 1) / pw(st);
    assert.ok(r >= 1 && r <= 1.15, `stage ${st}->${st + 1} ratio ${r.toFixed(3)}`);
  }
  assert.ok(pw(100) / pw(1) > 300, 'stage 100 is much stronger than stage 1');
});

test('every ally cell can be filled (no deployment limit)', () => {
  const s = new Store(mem());
  for (let i = 0; i < 20; i++) { s.data.coins = 1000; s.recruit('sword'); }
  s.data.formation = {};
  const ids = s.data.roster.map((c) => c.id);
  for (let cell = 0; cell < COLS * ZONE_ROWS; cell++) assert.equal(s.place(ids[cell], cell), 'ok');
  assert.equal(s.placedCount(), COLS * ZONE_ROWS);
});

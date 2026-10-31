// Pure logic tests (node --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, makeUnit, DYING_TIME } from '../../js/battle.js';
import { enemyWave, rewardCoins, mergedRank, fmtRank, computeStats, wavePower, COLS, ZONE_ROWS, MONSTER_TYPES, MONSTER_UNLOCK, gridFor } from '../../js/data.js';
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
  assert.equal(mergedRank(3, 5), 8); assert.equal(mergedRank(1, 1), 2); assert.equal(mergedRank(60, 60), 120);
  // ranks add up with no upper limit (★100 and beyond keep merging)
  s.data.coins = 10000; const a = s.recruit('sword'), b = s.recruit('sword'), c = s.recruit('sword'), d = s.recruit('sword');
  a.rank = 7; b.rank = 5; assert.equal(s.merge(b.id, a.id).rank, 12);
  a.rank = 60; c.rank = 50; assert.equal(s.merge(c.id, a.id).rank, 110);
  d.rank = 99890; assert.equal(s.merge(d.id, a.id).rank, 100000);
  assert.ok(computeStats('sword', 100000).atk > computeStats('sword', 100).atk * 900, 'stats keep growing');
});

test('rank badge text stays short for huge ranks', () => {
  assert.deepEqual([1, 100, 999, 1000, 1234, 9999, 12345, 123456, 2500000, 34000000, 1.5e9].map(fmtRank),
    ['1', '100', '999', '1.0K', '1.2K', '9.9K', '12K', '123K', '2.5M', '34M', '1.5B']);
});

test('win rewards exceed lose rewards', () => {
  for (let st = 1; st < 50; st++) assert.ok(rewardCoins(st, true) > rewardCoins(st, false));
});

test('enemy strength grows smoothly (no sudden spikes) over 100+ stages', () => {
  const pw = (st) => { const w = enemyWave(st); return wavePower(w.units, w.mult); };
  for (let st = 1; st < 150; st++) {
    const r = pw(st + 1) / pw(st);
    assert.ok(r >= 1 && r <= 1.25, `stage ${st}->${st + 1} ratio ${r.toFixed(3)}`);
  }
  assert.ok(pw(100) / pw(1) > 10000, 'stage 100 is much stronger than stage 1');
});

test('every ally cell can be filled (no deployment limit)', () => {
  const s = new Store(mem());
  for (let i = 0; i < 20; i++) { s.data.coins = 1000; s.recruit('sword'); }
  s.data.formation = {};
  const ids = s.data.roster.map((c) => c.id);
  for (let cell = 0; cell < COLS * ZONE_ROWS; cell++) assert.equal(s.place(ids[cell], cell), 'ok');
  assert.equal(s.placedCount(), COLS * ZONE_ROWS);
});

// ---------- monster attack styles ----------
const run = (bt, sec) => { for (let i = 0; i < sec * 60 && !bt.over; i++) bt.step(1 / 60); };

test('new monster types appear as stages progress', () => {
  const seen = new Set();
  for (let st = 1; st <= 40; st++) enemyWave(st).units.forEach((u) => seen.add(u.type));
  for (const t of MONSTER_TYPES) assert.ok(seen.has(t), t);
  for (const t of MONSTER_TYPES) if (MONSTER_UNLOCK[t] > 1) assert.ok(enemyWave(MONSTER_UNLOCK[t]).units.some((u) => u.type === t), `${t} shown on unlock stage`);
  assert.ok(!enemyWave(2).units.some((u) => MONSTER_UNLOCK[u.type] > 2));
});

test('bat dives at the lowest-HP target, ignoring the nearer front line', () => {
  const front = makeUnit({ team: 'ally', type: 'shield', rank: 5, cell: 2 });
  const back = makeUnit({ team: 'ally', type: 'healer', rank: 1, cell: 12 });
  const bat = makeUnit({ team: 'enemy', type: 'bat', rank: 1, cell: 12 });
  const bt = new Battle({ allies: [front, back], enemies: [bat] }); bt.trace = [];
  run(bt, 3);
  const hit = bt.trace.find((x) => x.kind === 'damage' && x.from === bat.uid);
  assert.equal(hit.to, back.uid);
});

test('slime poisons: damage continues after the hit, ignoring defence', () => {
  const t = makeUnit({ team: 'ally', type: 'shield', rank: 1, cell: 2 });
  const sl = makeUnit({ team: 'enemy', type: 'slime', rank: 1, cell: 12 });
  const bt = new Battle({ allies: [t], enemies: [sl] });
  run(bt, 4);
  assert.ok(t.poisonUntil > bt.time - 4);
  const hp = t.hp; bt.units = bt.units.filter((u) => u !== sl); bt.units.push(makeUnit({ team: 'enemy', type: 'shield', rank: 1, cell: 0 }));
  const before = bt.time; while (bt.time - before < 1) bt.step(1 / 60);
  assert.ok(t.hp < hp, 'poison ticks after the slime is gone');
});

test('golem slam hits an area and stuns', () => {
  const a = makeUnit({ team: 'ally', type: 'shield', rank: 20, cell: 2 });
  const b = makeUnit({ team: 'ally', type: 'shield', rank: 20, cell: 1 });
  const g = makeUnit({ team: 'enemy', type: 'golem', rank: 1, cell: 12 });
  const bt = new Battle({ allies: [a, b], enemies: [g] }); bt.trace = [];
  let stunned = false;
  for (let i = 0; i < 600 && !stunned; i++) { bt.step(1 / 60); stunned = a.stunUntil > bt.time && b.stunUntil > bt.time; }
  assert.ok(stunned, 'both units stunned by one slam');
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp);
  // a stunned unit does not act
  const cd = a.cd; bt.step(1 / 60); assert.equal(a.cd, cd);
});

test('dragon breath pierces through the target to units behind it', () => {
  const near = makeUnit({ team: 'ally', type: 'shield', rank: 30, cell: 2 });
  const behind = makeUnit({ team: 'ally', type: 'shield', rank: 30, cell: 7 });
  const side = makeUnit({ team: 'ally', type: 'shield', rank: 30, cell: 10 });
  const d = makeUnit({ team: 'enemy', type: 'dragon', rank: 1, cell: 12 });
  const bt = new Battle({ allies: [near, behind, side], enemies: [d] }); bt.trace = [];
  for (const u of [near, behind, side]) { u.speed = 0; u.range = 0.1; }
  run(bt, 4);
  const hits = new Set(bt.trace.filter((x) => x.kind === 'damage' && x.from === d.uid).map((x) => x.to));
  assert.ok(hits.has(near.uid) && hits.has(behind.uid));
  assert.ok(!hits.has(side.uid));
});

test('lich summons skeletons (max 2 alive) on the enemy team', () => {
  const wall = makeUnit({ team: 'ally', type: 'shield', rank: 60, cell: 2 });
  wall.speed = 0; wall.atk = 0;
  const l = makeUnit({ team: 'enemy', type: 'lich', rank: 1, cell: 12 });
  const bt = new Battle({ allies: [wall], enemies: [l] });
  run(bt, 30);
  const sk = bt.units.filter((u) => u.type === 'skeleton');
  assert.equal(sk.length, 2);
  assert.ok(sk.every((u) => u.team === 'enemy' && u.summoner === l.uid));
});

// ---------- new ally classes ----------
test('lancer: long wind-up (stays still), then charges a fixed distance through enemies', () => {
  const l = makeUnit({ team: 'ally', type: 'lancer', rank: 1, cell: 12 });
  const e = makeUnit({ team: 'enemy', type: 'shield', rank: 1, cell: 12 }); e.speed = 0; e.atk = 0;
  const bt = new Battle({ allies: [l], enemies: [e] });
  while (l.state !== 'windup') bt.step(1 / 60);
  const x0 = l.x, y0 = l.y, t0 = bt.time;
  while (l.state === 'windup') { bt.step(1 / 60); if (l.state === 'windup') assert.equal(l.y, y0); }
  assert.ok(bt.time - t0 >= l.charge.windup - 1e-9, 'wind-up takes time');
  assert.equal(l.state, 'charge');
  const hp0 = e.hp;
  while (l.state === 'charge') bt.step(1 / 60);
  assert.ok(Math.abs(Math.hypot(l.x - x0, l.y - y0) - l.charge.dist) < 0.05, 'charged the full distance');
  assert.ok(hp0 - e.hp > l.atk * 1.5, 'heavy damage');
});

test('lancer: keeps charging the full distance even when the target dodged', () => {
  const l = makeUnit({ team: 'ally', type: 'lancer', rank: 1, cell: 12 });
  const e = makeUnit({ team: 'enemy', type: 'shield', rank: 1, cell: 12 }); e.speed = 0; e.atk = 0;
  const bt = new Battle({ allies: [l], enemies: [e] });
  while (l.state !== 'windup') bt.step(1 / 60);
  const x0 = l.x, y0 = l.y;
  e.x = 0.5; e.y = 1.0;                       // target moves out of the charge line
  while (l.state !== 'charge') bt.step(1 / 60);
  while (l.state === 'charge') bt.step(1 / 60);
  assert.ok(Math.abs(Math.hypot(l.x - x0, l.y - y0) - l.charge.dist) < 0.05);
  assert.equal(e.hp, e.maxHp, 'missed');
});

test('thief: fast, low HP, targets the enemy with low HP and high attack', () => {
  const th = makeUnit({ team: 'ally', type: 'thief', rank: 1, cell: 12 });
  const sw = makeUnit({ team: 'ally', type: 'sword', rank: 1, cell: 12 });
  assert.ok(th.speed > sw.speed * 1.5 && th.maxHp < sw.maxHp);
  const shield = makeUnit({ team: 'enemy', type: 'shield', rank: 1, cell: 12 });
  const archer = makeUnit({ team: 'enemy', type: 'archer', rank: 1, cell: 11 });
  const mage = makeUnit({ team: 'enemy', type: 'mage', rank: 1, cell: 2 });
  th.hp = th.maxHp = 5000; // survive long enough to check the targeting
  const bt = new Battle({ allies: [th], enemies: [shield, archer, mage] }); bt.trace = [];
  run(bt, 4);
  const hit = bt.trace.find((x) => x.kind === 'damage' && x.from === th.uid);
  assert.equal(hit.to, mage.uid);
});

test('enchanter raises the attack of nearby allies', () => {
  const en = makeUnit({ team: 'ally', type: 'enchanter', rank: 1, cell: 12 });
  const sw = makeUnit({ team: 'ally', type: 'sword', rank: 1, cell: 7 });
  const far = makeUnit({ team: 'enemy', type: 'shield', rank: 1, cell: 0 }); far.speed = 0;
  const bt = new Battle({ allies: [en, sw], enemies: [far] });
  assert.equal(bt.atkOf(sw), sw.atk);
  let t = 0; while (!(sw.buffUntil > bt.time) && t++ < 600) bt.step(1 / 60);
  assert.ok(sw.buffUntil > bt.time, 'buffed');
  assert.equal(bt.atkOf(sw), Math.round(sw.atk * 1.2));
  const e = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 0 }); e.def = 0;
  bt.rnd = () => 0.5; assert.equal(bt.applyDamage(sw, e), Math.round(sw.atk * 1.2));
  const hi = makeUnit({ team: 'ally', type: 'enchanter', rank: 100, cell: 12 });
  assert.ok(hi.buff.amount > 0.45, 'stronger buff at higher rank');
  assert.equal(makeUnit({ team: 'ally', type: 'enchanter', rank: 5000, cell: 12 }).buff.amount, 1, 'buff stops at +100%');
});

test('summoner chants, then summons a dragon (one at a time); stuns interrupt the chant', () => {
  const su = makeUnit({ team: 'ally', type: 'summoner', rank: 1, cell: 12 });
  const wall = makeUnit({ team: 'enemy', type: 'shield', rank: 80, cell: 2 }); wall.speed = 0; wall.atk = 0;
  const bt = new Battle({ allies: [su], enemies: [wall] });
  bt.step(1 / 60);
  assert.equal(su.state, 'cast');
  run(bt, su.chant - 0.2);
  assert.equal(bt.units.filter((u) => u.type === 'dragon').length, 0, 'nothing before the chant ends');
  run(bt, 0.4);
  const dr = bt.units.filter((u) => u.type === 'dragon');
  assert.equal(dr.length, 1); assert.equal(dr[0].team, 'ally'); assert.equal(dr[0].summoner, su.uid);
  run(bt, 10);
  assert.equal(bt.units.filter((u) => u.type === 'dragon').length, 1, 'only one dragon at a time');
  // stun interrupts the chant
  const su2 = makeUnit({ team: 'ally', type: 'summoner', rank: 1, cell: 12 });
  const bt2 = new Battle({ allies: [su2], enemies: [makeUnit({ team: 'enemy', type: 'shield', rank: 80, cell: 2 })] });
  run(bt2, 2); su2.stunUntil = bt2.time + 0.5; run(bt2, 2.6);
  assert.equal(bt2.units.filter((u) => u.type === 'dragon').length, 0);
});

// ---------- bulk merge / auto arrange / recruit many ----------
test('bulk merge: smallest first, no rank cap, skips locked and placed units, returns equipment', () => {
  const s = new Store(mem());
  s.data.coins = 100000; s.recruitMany('sword', 5);
  const tg = s.char(1);                          // placed swordsman
  const bench = s.data.roster.filter((c) => c.type === 'sword' && s.cellOf(c.id) == null);
  bench[0].rank = 40; bench[1].rank = 60; bench[2].locked = true;
  s.data.inventory.bronze_sword = 1; s.equip(bench[3].id, 'bronze_sword');
  const pv = s.previewBulk(tg.id, Infinity);
  assert.equal(pv.available, 5);                 // 6 bench swords minus the locked one
  // smallest first, and everything fits (no cap): 1 + 1+1+1(equipped)+40+60 = 104
  assert.equal(pv.max, 5); assert.equal(pv.to, 104); assert.equal(pv.equipped, 1);
  assert.equal(s.previewBulk(tg.id, 4).to, 44);
  const r = s.bulkMerge(tg.id, 2); assert.equal(r.rank, 3); assert.equal(r.count, 2);
  s.bulkMerge(tg.id, Infinity);
  assert.equal(tg.rank, 104);
  assert.equal(s.data.inventory.bronze_sword, 1, 'equipment went back to the inventory');
  assert.ok(s.char(bench[2].id), 'locked unit kept');
  assert.equal(s.merge(bench[2].id, tg.id).reason, 'locked');
});

test('auto arrange fills empty tiles (melee front / ranged back), merges the rest, conserves ranks', () => {
  const s = new Store(mem());
  s.data.coins = 100000; s.recruitMany('sword', 30); s.recruitMany('archer', 10); s.recruitMany('mage', 2);
  const total = s.data.roster.reduce((a, c) => a + c.rank, 0);
  const even = s.planAuto('even'), front = s.planAuto('front');
  assert.equal(even.places.length, 11);
  for (const p of even.places) {
    const row = Math.floor(p.cell / 5);
    if (p.type === 'sword') assert.ok(row <= 1, 'melee in front'); else assert.ok(row >= 1, 'ranged in back');
  }
  const ranks = (plan) => plan.merges.filter((m) => m.type === 'sword').map((m) => m.to);
  assert.ok(Math.max(...ranks(even)) - Math.min(...ranks(even)) <= 1, 'even spreads ranks');
  assert.ok(Math.max(...ranks(front)) > Math.max(...ranks(even)), 'front concentrates');
  s.applyPlan(even);
  assert.equal(s.placedCount(), 15);
  assert.equal(s.data.roster.reduce((a, c) => a + c.rank, 0), total);
  assert.equal(s.data.roster.length, 15);
  // undo
  const s2 = new Store(mem()); s2.data.coins = 5000; const snap = s2.snapshot();
  s2.recruitMany('thief', 10); s2.applyPlan(s2.planAuto('front')); s2.restore(snap);
  assert.equal(s2.snapshot(), snap);
});

test('recruitMany stops when coins run out', () => {
  const s = new Store(mem()); s.data.coins = 260;
  assert.equal(s.maxRecruitable('sword'), 5);
  assert.equal(s.recruitMany('sword', 10), 5); assert.equal(s.data.coins, 10);
});

// ---------- big board from stage 100 ----------
test('board is 5x3 per side until stage 99, 10x5 (50 tiles) from stage 100', () => {
  assert.deepEqual([gridFor(99).cols, gridFor(99).zoneRows, gridFor(99).cells], [5, 3, 15]);
  assert.deepEqual([gridFor(100).cols, gridFor(100).zoneRows, gridFor(100).cells], [10, 5, 50]);
  assert.equal(gridFor(100).fieldRows, 12); assert.equal(gridFor(100).allyRow0, 7);
});

test('enemy waves on the big board: more monsters (up to 50), valid unique tiles, front line first', () => {
  for (const st of [100, 101, 120, 135, 160]) {
    const w = enemyWave(st), g = gridFor(st);
    const cells = w.units.map((u) => u.cell);
    assert.equal(new Set(cells).size, cells.length);
    assert.ok(cells.every((c) => c >= 0 && c < g.cells));
  }
  assert.equal(enemyWave(99).units.length, 15);
  assert.equal(enemyWave(100).units.length, 15);
  assert.equal(enemyWave(120).units.length, 35);
  assert.equal(enemyWave(135).units.length, 50);
  assert.equal(enemyWave(160).units.length, 50);
  // melee monsters stand on the enemy's front row (row 4 = next to the middle)
  const sw = enemyWave(120).units.find((u) => u.type === 'sword');
  assert.equal(Math.floor(sw.cell / 10), 4);
});

test('store: the formation carries over to the big board and all 50 tiles can be filled', () => {
  const s = new Store(mem());
  const small = { ...s.data.formation };
  s.data.stage = 100;
  // same rows, columns shifted to the centre (+2)
  for (const [id, cell] of Object.entries(small)) {
    assert.equal(s.cellOf(+id), Math.floor(cell / 5) * 10 + (cell % 5) + 2);
  }
  s.data.coins = 1e6; s.recruitMany('sword', 50);
  s.applyPlan(s.planAuto('even'));
  assert.equal(s.placedCount(), 50);
  assert.deepEqual(s.data.formation, small, 'small-board formation untouched');
  // a merged-away character disappears from both formations
  const id = +Object.keys(small)[0];
  const tgt = s.data.roster.find((c) => c.type === s.char(id).type && c.id !== id);
  if (tgt) { s.merge(id, tgt.id); assert.equal(s.data.formation[id], undefined); assert.equal(s.data.formationBig[id], undefined); }
});

test('battles on the big board use the whole 10-wide field', () => {
  const g = gridFor(100);
  const a = makeUnit({ team: 'ally', type: 'thief', rank: 1, cell: 9, grid: g });
  const e = makeUnit({ team: 'enemy', type: 'shield', rank: 1, cell: 49, grid: g });
  assert.equal(a.x, 9.5); assert.equal(e.x, 9.5); assert.equal(a.y, 7.5); assert.equal(e.y, 4.5);
  const bt = new Battle({ allies: [a], enemies: [e], grid: g });
  run(bt, 3);
  assert.ok(a.x > 5, 'not clamped to the small board');
});

// ---------- magic: share of max HP, area, both teams ----------
test('magic takes a share of MAX HP from every enemy in the area (ignores defence)', () => {
  const mage = makeUnit({ team: 'ally', type: 'mage', rank: 1, cell: 12 });
  const tgt = makeUnit({ team: 'enemy', type: 'shield', rank: 50, cell: 7 });     // huge HP & DEF
  const near = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 7 }); near.x = tgt.x + 1;   // inside radius 1.25
  const far = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 7 }); far.x = tgt.x + 2;     // outside
  const buddy = makeUnit({ team: 'ally', type: 'sword', rank: 1, cell: 7 }); buddy.x = tgt.x; buddy.y = tgt.y + 0.3;
  const bt = new Battle({ allies: [mage, buddy], enemies: [tgt, near, far] });
  bt.rnd = () => 0.5;
  bt.applyMagic(mage, tgt);
  assert.equal(mage.magic.pct, 0.08);
  assert.equal(tgt.maxHp - tgt.hp, Math.round(tgt.maxHp * 0.08), 'share of max HP, defence ignored');
  assert.equal(near.maxHp - near.hp, Math.round(near.maxHp * 0.08), 'area');
  assert.equal(far.hp, far.maxHp, 'outside the area');
  assert.equal(buddy.hp, buddy.maxHp, 'no friendly fire');
});

test('magic share grows with rank (capped) and with weapons / buffs', () => {
  const pct = (rank, equip = {}) => { const u = makeUnit({ team: 'ally', type: 'mage', rank, equip, cell: 12 }); return new Battle({ allies: [u], enemies: [] }).magicPct(u); };
  assert.ok(pct(50) > pct(1) && pct(100) > pct(50));
  assert.equal(pct(100000), 0.25, 'capped at 25%');
  assert.ok(pct(1, { weapon: 'mythril_sword' }) > pct(1) * 1.4, 'weapon raises the share');
});

test('enemies use magic too: waves have mages from stage 2, and they hit allies by % of max HP', () => {
  assert.equal(enemyWave(1).units.filter((u) => u.type === 'mage').length, 0);
  for (const st of [2, 5, 20, 60, 99, 100, 135]) {
    const w = enemyWave(st); const n = w.units.filter((u) => u.type === 'mage').length;
    assert.equal(n, Math.max(1, Math.round(w.units.length / 8)), `stage ${st}`);
  }
  // a weak enemy mage still hurts a ★1000 ally: the damage scales with the ally's max HP
  const em = makeUnit({ team: 'enemy', type: 'mage', rank: 1, cell: 2 });
  const big = makeUnit({ team: 'ally', type: 'shield', rank: 1000, cell: 2 });
  const bt = new Battle({ allies: [big], enemies: [em] }); bt.trace = [];
  let t = 0; while (!bt.trace.some((x) => x.magic) && t++ < 1200) bt.step(1 / 60);
  const hit = bt.trace.find((x) => x.magic);
  assert.ok(hit && hit.to === big.uid);
  assert.ok(Math.abs(hit.amount / big.maxHp - 0.08) < 0.01, 'about 8% of max HP');
});

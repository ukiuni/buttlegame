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
  const e = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 0 }); e.def = 0; e.x = 40;   // away from any shielder's guard
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
  assert.ok(pct(1, { weapon: 'sage_staff' }) > pct(1) * 1.4, 'a staff (magic power) raises the share');
  assert.equal(pct(1, { weapon: 'mythril_sword' }), pct(1), 'a sword does nothing for a mage (it cannot hold one)');
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

// ---------- warder (魔法防御師): nullifies magic inside its barrier ----------
test('warder barrier nullifies magic for allies inside it, not outside; gone when the warder falls', () => {
  const em = makeUnit({ team: 'enemy', type: 'mage', rank: 1, cell: 2 });
  const wd = makeUnit({ team: 'ally', type: 'warder', rank: 1, cell: 12 });
  const inside = makeUnit({ team: 'ally', type: 'sword', rank: 1, cell: 12 }); inside.x = wd.x + 1; inside.y = wd.y;   // radius 1.6
  const outside = makeUnit({ team: 'ally', type: 'sword', rank: 1, cell: 12 }); outside.x = wd.x + 2.2; outside.y = wd.y;
  const bt = new Battle({ allies: [wd, inside, outside], enemies: [em] }); bt.trace = [];
  assert.equal(wd.ward.radius, 1.6);
  // spell centred between them: radius 1.25 reaches both swordsmen
  bt.applyMagic(em, { ...inside, x: wd.x + 1.6, y: wd.y });
  assert.equal(inside.hp, inside.maxHp, 'inside the barrier: nullified');
  assert.ok(outside.hp < outside.maxHp, 'outside the barrier: damaged');
  assert.ok(bt.events.some((e) => e.type === 'nullify' && e.uid === inside.uid && e.warder === wd.uid));
  bt.applyMagic(em, wd);
  assert.equal(wd.hp, wd.maxHp, 'the warder protects itself');
  // the barrier only blocks the enemy's magic: our own mage still hits enemies standing in it
  const am = makeUnit({ team: 'ally', type: 'mage', rank: 1, cell: 13 });
  const foe = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 2 }); foe.x = wd.x; foe.y = wd.y + 0.5;
  bt.units.push(am, foe); bt.applyMagic(am, foe);
  assert.ok(foe.hp < foe.maxHp);
  // once the warder is down, magic gets through
  bt.kill(wd); bt.applyMagic(em, inside);
  assert.ok(inside.hp < inside.maxHp);
});

test('warder barrier grows with rank (capped); warder is recruitable', () => {
  const r = (rank) => makeUnit({ team: 'ally', type: 'warder', rank, cell: 12 }).ward.radius;
  assert.ok(r(100) > r(1)); assert.equal(r(100000), 2.6);
  const s = new Store(mem()); s.data.coins = 1000;
  const w = s.recruit('warder'); assert.equal(w.type, 'warder');
});

// ---------- defence & shielder guard ----------
test('defence reduces damage proportionally (atk^2 / (atk + def)) and grows with rank', () => {
  const sw = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 2 });
  const bt = new Battle({ allies: [], enemies: [sw] }); bt.rnd = () => 0.5;   // no random spread
  const hit = (target) => { bt.units.push(target); target.hp = target.maxHp; return bt.applyDamage(sw, target); };
  const lone = (type, rank = 1) => { const u = makeUnit({ team: 'ally', type, rank, cell: 12 }); u.x = 40; return u; };   // far from any shielder
  const sh = lone('shield'), mg = lone('mage'); mg.x = 80;
  assert.equal(hit(sh), Math.round((sw.atk * sw.atk) / (sw.atk + sh.def)));
  assert.ok(hit(sh) < hit(mg) * 0.7, 'the shielder takes far less damage than a mage');
  // defence scales with rank, so a shielder stays tough against stronger enemies
  assert.equal(makeUnit({ team: 'ally', type: 'shield', rank: 100, cell: 12 }).def, Math.round(20 * (1 + 0.3 * 99)));
  const big = makeUnit({ team: 'enemy', type: 'sword', rank: 100, cell: 2 }), bigSh = lone('shield', 100);
  const b2 = new Battle({ allies: [bigSh], enemies: [big] }); b2.rnd = () => 0.5;
  const ratioHigh = b2.applyDamage(big, bigSh) / big.atk, ratioLow = hit(sh) / sw.atk;
  assert.ok(Math.abs(ratioHigh - ratioLow) < 0.05, 'same share of damage gets through at rank 1 and rank 100');
});

test('shielder guards nearby allies: +40% of its defence, strongest only, own team only', () => {
  const sh = makeUnit({ team: 'ally', type: 'shield', rank: 10, cell: 12 });
  const near = makeUnit({ team: 'ally', type: 'archer', rank: 1, cell: 12 }); near.x = sh.x + 1; near.y = sh.y;   // radius 1.5
  const far = makeUnit({ team: 'ally', type: 'archer', rank: 1, cell: 12 }); far.x = sh.x + 2; far.y = sh.y;
  const foe = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 2 }); foe.x = sh.x - 1; foe.y = sh.y;
  const weak = makeUnit({ team: 'ally', type: 'shield', rank: 1, cell: 12 }); weak.x = sh.x + 0.5; weak.y = sh.y + 1;   // covers sh & near, not far
  const bt = new Battle({ allies: [sh, near, far, weak], enemies: [foe] });
  const bonus = Math.round(sh.def * 0.4);
  assert.equal(bt.defOf(near), near.def + bonus, 'guarded by the stronger shielder (no stacking)');
  assert.equal(bt.defOf(far), far.def, 'outside the guard');
  assert.equal(bt.defOf(foe), foe.def, 'enemies are not guarded by our shielder');
  assert.equal(bt.guardOf(sh), weak, 'a shielder can be guarded by another shielder, never by itself');
  // guarded allies take less damage; the guard disappears with the shielder
  bt.rnd = () => 0.5;
  const dmgGuarded = bt.applyDamage(foe, near); near.hp = near.maxHp;
  bt.kill(sh); bt.kill(weak);
  assert.ok(bt.applyDamage(foe, near) > dmgGuarded);
});

// ---------- equipment: bulk buy, merge (levels add up), auto-equip ----------
test('items: levels scale stats; buying many; merging adds levels (mixed levels too)', async () => {
  const { itemStats, computeStats } = await import('../../js/data.js');
  assert.equal(itemStats('bronze_sword').atk, 5); assert.equal(itemStats('bronze_sword+3').atk, 15);
  assert.equal(itemStats('mythril_armor+2').hp, 100); assert.equal(itemStats('mythril_armor+2').def, 20);
  assert.ok(itemStats('speed_ring+4').haste > itemStats('speed_ring').haste && itemStats('speed_ring+999').haste <= 0.5);
  assert.equal(computeStats('sword', 1, { weapon: 'bronze_sword+3' }).atk, computeStats('sword', 1).atk + 15);
  const s = new Store(mem());
  s.data.coins = 450;
  assert.equal(s.buyItems('bronze_sword', 10), 10); assert.equal(s.data.coins, 50);
  assert.equal(s.buyItems('bronze_sword', 10), 1, 'only as many as the coins allow');
  s.data.inventory['bronze_sword+3'] = 1;                // a previously merged one
  const sw = s.data.roster.find((c) => c.type === 'sword');
  assert.ok(s.equip(sw.id, 'bronze_sword'));             // equipped copies are not merged
  const r = s.mergeItems('bronze_sword');
  assert.deepEqual(r, { key: 'bronze_sword+13', lv: 13, count: 11 });   // 10 x Lv1 + Lv3
  assert.deepEqual(s.data.inventory, { 'bronze_sword+13': 1 });
  assert.equal(s.mergeItems('bronze_sword'), null, 'nothing left to merge');
  assert.ok(s.equip(sw.id, 'bronze_sword+13'));
  assert.equal(sw.equip.weapon, 'bronze_sword+13'); assert.equal(s.data.inventory.bronze_sword, 1, 'old one back in the bag');
});

test('auto arrange also equips spare items where they add the most, conserving every item', () => {
  const s = new Store(mem());
  s.data.coins = 100000; s.recruitMany('sword', 3);
  s.data.inventory = { 'mythril_sword+4': 1, bronze_sword: 2, 'mythril_armor+2': 1, speed_ring: 1, life_amulet: 1 };
  const benchSword = s.data.roster.find((c) => c.type === 'sword' && s.cellOf(c.id) == null);
  s.data.inventory.leather_armor = 1; s.equip(benchSword.id, 'leather_armor');   // freed when it gets merged
  const count = () => {
    const n = {}; for (const [k, v] of Object.entries(s.data.inventory)) n[k] = (n[k] || 0) + v;
    for (const c of s.data.roster) for (const k of Object.values(c.equip)) n[k] = (n[k] || 0) + 1;
    return n;
  };
  const before = count();
  const plan = s.planAuto('front');
  assert.ok(plan.equips.length > 0);
  s.applyPlan(plan);
  assert.deepEqual(count(), before, 'no item lost or duplicated');
  const placed = Object.keys(s.formation).map((id) => s.char(+id));
  const worn = placed.flatMap((c) => Object.values(c.equip));
  assert.ok(worn.includes('mythril_sword+4') && worn.includes('mythril_armor+2'), 'the best items are used');
  // the strongest weapon goes to a damage dealer, not to the healer
  const holder = placed.find((c) => c.equip.weapon === 'mythril_sword+4');
  assert.notEqual(holder.type, 'healer');
  // fewer weapons than units on the field: every weapon ends up being worn
  assert.equal(placed.filter((c) => c.equip.weapon).length, 3);
  assert.ok(!Object.keys(s.data.inventory).some((k) => k.includes('sword')), 'no weapon left in the bag');
  // planning again finds nothing better
  assert.equal(s.planAuto('front').equips.length, 0);
});

// ---------- Ward Imp (monster warder): nullifies OUR magic on monsters inside its barrier ----------
test('Ward Imp appears from stage 25 (max 1, or 2 in big waves) and blocks our magic', () => {
  assert.equal(MONSTER_UNLOCK.warder, 25);
  for (let st = 1; st < 25; st++) assert.ok(!enemyWave(st).units.some((u) => u.type === 'warder'), `none before 25 (stage ${st})`);
  assert.ok(enemyWave(25).units.some((u) => u.type === 'warder'), 'introduced at stage 25');
  for (let st = 25; st <= 140; st++) {
    const w = enemyWave(st).units; const n = w.filter((u) => u.type === 'warder').length;
    assert.ok(n <= (w.length >= 10 ? 2 : 1), `cap at stage ${st}`);
  }
  const imp = makeUnit({ team: 'enemy', type: 'warder', rank: 1, cell: 7 });
  const foe = makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 7 }); foe.x = imp.x + 1;
  const ours = makeUnit({ team: 'ally', type: 'mage', rank: 1, cell: 12 });
  const bt = new Battle({ allies: [ours], enemies: [imp, foe] });
  bt.applyMagic(ours, foe);
  assert.equal(foe.hp, foe.maxHp); assert.equal(imp.hp, imp.maxHp);
  assert.ok(bt.events.some((e) => e.type === 'nullify' && e.warder === imp.uid));
  // physical attacks still work
  assert.ok(bt.applyDamage(ours, foe, 50) > 0);
});

test('wave strength counts the Ward Imp as support for the whole wave', () => {
  const base = [{ type: 'sword', rank: 5 }, { type: 'archer', rank: 5 }];
  const withImp = [...base, { type: 'warder', rank: 5 }];
  const withSword = [...base, { type: 'sword', rank: 5 }];
  assert.ok(wavePower(withImp, 1) / wavePower(base, 1) > 1.35, 'counts more than its own small stats');
  assert.ok(wavePower(withImp, 1) < wavePower(withSword, 1) * 1.5);
});

// ---------- bosses ----------
import { BOSSES, BOSS_COUNT, BASE, bossForStage, isBossStage } from '../../js/data.js';
import { STRINGS } from '../../js/i18n.js';

test('50 different bosses, each with stats and a unique name in every language', () => {
  assert.equal(BOSS_COUNT, 50);
  assert.equal(new Set(BOSSES.map((b) => b.type)).size, 50);
  assert.equal(new Set(BOSSES.map((b) => b.body + '/' + b.element)).size, 50);
  for (const b of BOSSES) {
    const st = computeStats(b.type, 10);
    assert.ok(st.boss && st.maxHp > computeStats(b.base, 10).maxHp * 4, `${b.type} is big`);
  }
  for (const lang of Object.keys(STRINGS)) {
    const names = BOSSES.map((b) => STRINGS[lang]['mon.' + b.type]);
    assert.ok(names.every((n) => n && !n.includes('{')), lang);
    assert.equal(new Set(names).size, 50, `${lang} names are unique`);
    assert.ok(BOSSES.every((b) => STRINGS[lang]['monDesc.' + b.type]), `${lang} descriptions`);
  }
});

test('a boss joins the wave every 10 stages (one at a time, cycling through all 50), and pays double', () => {
  for (let st = 1; st <= 520; st++) {
    const bosses = enemyWave(st).units.filter((u) => /^boss/.test(u.type));
    assert.equal(bosses.length, st % 10 === 0 ? 1 : 0, `stage ${st}`);
    if (bosses.length) assert.equal(bosses[0].type, 'boss' + ((st / 10 - 1) % 50));
  }
  const seen = new Set(); for (let st = 10; st <= 500; st += 10) seen.add(bossForStage(st).type);
  assert.equal(seen.size, 50, 'stages 10-500 meet every boss once');
  // the boss takes one of the usual slots: the number of monsters stays the same (stage 10: 4, stage 100: 15)
  assert.equal(enemyWave(10).units.length, 4);
  assert.equal(enemyWave(100).units.length, 15);
  // the boss stands in the centre column
  const w = enemyWave(10), b = w.units.find((u) => u.boss);
  assert.equal(b.cell % w.grid.cols, 2);
  assert.ok(isBossStage(10) && !isBossStage(11));
  assert.equal(rewardCoins(10, true), (40 + 150) * 2);
  assert.equal(rewardCoins(11, true), 40 + 165);
  assert.equal(rewardCoins(10, false), 5 + 20);
});

test('boss traits: resists magic, drains HP, regenerates, volleys several targets', () => {
  const at = (type, team, cell) => makeUnit({ team, type, rank: 5, cell });
  // magic resistance: a mage's spell takes half the usual share of a boss's max HP
  const mage = at('mage', 'ally', 7);
  const boss = at('boss0', 'enemy', 7), mob = at('sword', 'enemy', 6);
  let bt = new Battle({ allies: [mage], enemies: [boss, mob] });
  bt.applyMagic(mage, boss);
  const pBoss = (boss.maxHp - boss.hp) / boss.maxHp, pMob = (mob.maxHp - mob.hp) / mob.maxHp;
  assert.ok(Math.abs(pBoss - pMob * 0.5) < 0.01, `boss ${pBoss.toFixed(3)} vs mob ${pMob.toFixed(3)}`);
  // dark element: heals by a share of the damage it deals
  const dark = BOSSES.find((b) => b.element === 'dark' && b.body === 'goblin').type;
  const d = at(dark, 'enemy', 7), victim = at('sword', 'ally', 7);
  bt = new Battle({ allies: [victim], enemies: [d] });
  d.hp = Math.round(d.maxHp / 2); const hp0 = d.hp;
  const dmg = bt.applyDamage(d, victim);
  assert.equal(d.hp - hp0, Math.round(dmg * BASE[dark].drain));
  // holy element: regenerates over time
  const holy = BOSSES.find((b) => b.element === 'holy' && b.body === 'orc').type;
  const h = at(holy, 'enemy', 7), far = at('sword', 'ally', 0);
  bt = new Battle({ allies: [far], enemies: [h] });
  h.hp = Math.round(h.maxHp / 2); const h0 = h.hp;
  h.cd = 99; far.cd = 99;
  for (let i = 0; i < 60; i++) bt.step(1 / 60);
  assert.ok(h.hp - h0 >= h.maxHp * 0.011, 'regenerated about 1.2% max HP in 1s');
  // lizard ranger: each shot hits 3 targets
  const liz = BOSSES.find((b) => b.body === 'lizard').type;
  const l = at(liz, 'enemy', 7), a1 = at('sword', 'ally', 1), a2 = at('sword', 'ally', 2), a3 = at('sword', 'ally', 3), a4 = at('sword', 'ally', 12);
  bt = new Battle({ allies: [a1, a2, a3, a4], enemies: [l] });
  l.action = 'attack'; bt.resolveHit(l, a2);
  assert.deepEqual([a1, a2, a3].map((u) => u.hp < u.maxHp), [true, true, true]);
  assert.equal(a4.hp, a4.maxHp, 'only 3 targets');
});


// ---------- weapon kinds, magic power, magic defence ----------
import { canEquip, ITEMS, WEAPON_KIND, MRES_MAX } from '../../js/data.js';

test('weapons: warrior blades, bows (archer only), spears (lancer only), staves (mage classes); armour and accessories for all', () => {
  const kinds = (k) => Object.keys(ITEMS).filter((id) => ITEMS[id].kind === k);
  for (const k of ['blade', 'bow', 'spear', 'staff']) assert.ok(kinds(k).length >= 4, `${k}: 4+ weapons`);
  assert.ok(Object.keys(ITEMS).filter((id) => ITEMS[id].slot === 'armor').length >= 4);
  for (const type of Object.keys(WEAPON_KIND)) {
    for (const id of Object.keys(ITEMS)) {
      const it = ITEMS[id];
      assert.equal(canEquip(type, id), it.slot !== 'weapon' || WEAPON_KIND[type] === it.kind, `${type} / ${id}`);
    }
  }
  assert.ok(canEquip('archer', 'long_bow') && !canEquip('sword', 'long_bow') && !canEquip('lancer', 'long_bow'));
  assert.ok(canEquip('lancer', 'halberd') && !canEquip('archer', 'halberd') && !canEquip('sword', 'halberd'));
  assert.ok(canEquip('healer', 'oak_staff+3') && !canEquip('healer', 'bronze_sword'));
  // the store refuses a weapon of the wrong kind
  const s = new Store(mem());
  const archer = s.data.roster.find((c) => c.type === 'archer'), sw = s.data.roster.find((c) => c.type === 'sword');
  s.data.inventory = { long_bow: 1 };
  assert.equal(s.equip(sw.id, 'long_bow'), false);
  assert.equal(s.equip(archer.id, 'long_bow'), true);
});

test('mage classes use magic power: staves raise it (not ATK) and it scales heals, buffs, barriers and summons', () => {
  const st = (type, equip = {}) => computeStats(type, 5, equip);
  assert.equal(st('mage', { weapon: 'sage_staff' }).atk, st('mage').atk, 'staff adds no attack');
  assert.equal(st('mage', { weapon: 'sage_staff' }).mag, st('mage').mag + 17);
  assert.equal(st('sword').mag, 0, 'warriors have no magic power');
  assert.ok(st('healer', { weapon: 'archmage_staff' }).heal > st('healer').heal * 1.2, 'heals');
  assert.ok(st('enchanter', { weapon: 'archmage_staff' }).buff.amount > st('enchanter').buff.amount, 'buffs');
  assert.ok(st('warder', { weapon: 'archmage_staff' }).ward.radius > st('warder').ward.radius, 'barrier');
  // summoner: the dragon gets stronger with magic power
  const summon = (equip) => {
    const u = makeUnit({ team: 'ally', type: 'summoner', rank: 5, equip, cell: 12 });
    const bt = new Battle({ allies: [u], enemies: [makeUnit({ team: 'enemy', type: 'sword', rank: 1, cell: 2 })] });
    return bt.doSummon(u, { x: u.x, y: u.y - 1 });
  };
  assert.ok(summon({ weapon: 'archmage_staff' }).atk > summon({}).atk);
  // a blade on a mage (old save) is ignored
  assert.equal(st('mage', { weapon: 'flame_blade' }).atk, st('mage').atk);
});

test('magic defence accessories cut magic damage taken; old saves drop weapons a class cannot hold', () => {
  const hit = (equip) => {
    const em = makeUnit({ team: 'enemy', type: 'mage', rank: 5, cell: 2 });
    const a = makeUnit({ team: 'ally', type: 'sword', rank: 5, equip, cell: 2 });
    const bt = new Battle({ allies: [a], enemies: [em], seed: 3 });
    bt.applyMagic(em, a);
    return a.maxHp - a.hp;
  };
  const plain = hit({}), charm = hit({ accessory: 'ward_charm' }), talisman = hit({ accessory: 'saint_talisman' });
  assert.ok(Math.abs(charm / plain - 0.85) < 0.03, `charm ${charm}/${plain}`);
  assert.ok(talisman < charm);
  const lv50 = computeStats('sword', 1, { accessory: 'ward_charm+50' }).mres;
  assert.ok(lv50 > 0.6 && lv50 <= MRES_MAX, 'levels approach the cap');
  // migration
  const raw = { roster: [{ id: 1, type: 'mage', rank: 1, equip: { weapon: 'mythril_sword', armor: 'leather_armor' } }], inventory: {} };
  const s = new Store({ getItem: () => JSON.stringify(raw), setItem: () => {} });
  assert.equal(s.data.roster[0].equip.weapon, undefined);
  assert.equal(s.data.roster[0].equip.armor, 'leather_armor');
  assert.equal(s.data.inventory.mythril_sword, 1);
});

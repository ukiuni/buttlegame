// Game data & pure rules (no DOM) — importable from Node tests.

export const TYPES = ['sword', 'mage', 'archer', 'shield', 'healer', 'lancer', 'thief', 'enchanter', 'summoner', 'warder'];
// Shop listing order: the defensive classes (tank, ward) sit right under the mage so they are easy to find.
export const SHOP_ORDER = ['sword', 'mage', 'shield', 'warder', 'archer', 'healer', 'lancer', 'thief', 'enchanter', 'summoner'];
// Ranks have no upper limit: merging always adds the two ranks together.
// Enemy ranks are still generated up to ENEMY_MAX_RANK (the stat multiplier covers the rest).
export const ENEMY_MAX_RANK = 100;
// The enchanter's attack bonus stops growing at +100% so one huge enchanter can't multiply a whole army.
export const BUFF_MAX = 1.0;
// Compact rank text for small badges (at most 4 characters, rounded down):
// 999 -> "999", 1234 -> "1.2K", 12345 -> "12K", 2500000 -> "2.5M", 1.5e9 -> "1.5B".
export function fmtRank(r) {
  for (const [v, u] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (r >= v) { const x = r / v; return (x < 10 ? (Math.floor(x * 10) / 10).toFixed(1) : Math.floor(x)) + u; }
  }
  return String(r);
}
// Board size. Stages 1-99 use 5x3 tiles per side; from stage 100 the board grows to 10x5 per side.
// (COLS/ZONE_ROWS/FIELD_ROWS/ALLY_ROW0 describe the small board and stay as defaults.)
export const COLS = 5;
export const ZONE_ROWS = 3;      // rows per side
export const FIELD_ROWS = 8;     // enemy 0-2, neutral 3-4, ally 5-7
export const ALLY_ROW0 = 5;
export const BIG_GRID_STAGE = 100;
const GAP_ROWS = 2;
function makeGrid(cols, zoneRows) {
  return { cols, zoneRows, fieldRows: zoneRows * 2 + GAP_ROWS, allyRow0: zoneRows + GAP_ROWS, cells: cols * zoneRows, big: cols > COLS };
}
export const SMALL_GRID = makeGrid(COLS, ZONE_ROWS);
export const BIG_GRID = makeGrid(10, 5);
export function gridFor(stage) { return stage >= BIG_GRID_STAGE ? BIG_GRID : SMALL_GRID; }
// Columns ordered from the centre outwards (used when filling a row).
export function centerCols(cols) {
  const out = [], mid = (cols - 1) / 2;
  for (let c = 0; c < cols; c++) out.push(c);
  return out.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
}

export const BASE = {
  sword:  { hp: 130, atk: 24, def: 6,  range: 1.1, speed: 1.3,  interval: 1.0 },
  // mage: area magic — every enemy within `radius` of the target loses a share of its MAX HP
  // (ignores defence; the share grows with rank, weapons and buffs, up to `max`)
  mage:   { hp: 75,  atk: 28, def: 2,  range: 3.2, speed: 0.9,  interval: 1.7, magic: { pct: 0.08, perRank: 0.0006, max: 0.25, radius: 1.25 }, pw: 1.5 },
  archer: { hp: 85,  atk: 19, def: 3,  range: 4.2, speed: 1.0,  interval: 1.15 },
  // shield: very high defence, and guards nearby allies — they gain a share of the shielder's defence
  shield: { hp: 240, atk: 11, def: 20, range: 1.1, speed: 0.85, interval: 1.3, guard: { radius: 1.5, share: 0.4 } },
  healer: { hp: 85,  atk: 9,  def: 3,  range: 3.0, speed: 0.95, interval: 1.8, heal: 18 },
  // ---- extra ally classes ----
  // lancer: long wind-up, then charges a fixed distance in a straight line (even if it misses),
  // dealing heavy damage to every enemy it runs through
  lancer:    { hp: 120, atk: 30, def: 5, range: 2.6, speed: 1.0,  interval: 2.6, charge: { windup: 1.1, dist: 3.2, power: 2.2, speed: 7 } },
  // thief: fast and fragile; goes for the enemy with low HP and high attack, slipping past the front line
  thief:     { hp: 70,  atk: 30, def: 2, range: 1.0, speed: 2.3,  interval: 0.9, prey: true, fly: true },
  // enchanter: raises the attack of nearby allies (+20%, +0.3% per rank, up to +100%) for a while
  enchanter: { hp: 80,  atk: 8,  def: 3, range: 2.6, speed: 0.95, interval: 2.4, buff: { radius: 2.2, dur: 3.5, base: 0.2, perRank: 0.003 } },
  // summoner: chants for a while, then calls a dragon (one at a time); weak magic otherwise
  summoner:  { hp: 80,  atk: 10, def: 3, range: 3.0, speed: 0.85, interval: 1.8, summon: 'dragon', chant: 4.0, magic: { pct: 0.03, perRank: 0.0003, max: 0.1, radius: 0.9 } },
  // warder: an always-on barrier around itself — magic that would hit an ally inside it is nullified
  // (radius 1.6 cells, +0.004 per rank, up to 2.6)
  warder:    { hp: 110, atk: 10, def: 6, range: 2.4, speed: 0.9,  interval: 1.6, ward: { radius: 1.6, perRank: 0.004, max: 2.6 }, wave: 0.35 },
  // ---- monster-only types (each has its own attack style) ----
  // bat: fast flyer (passes over other units) that ignores the front line and dives at the weakest (lowest HP) target
  bat:      { hp: 70,  atk: 16, def: 2,  range: 1.0, speed: 2.4,  interval: 0.8, assassin: true, fly: true, pw: 1.1 },
  // slime: melee hit that poisons (damage over time, ignores defence)
  slime:    { hp: 150, atk: 10, def: 4,  range: 1.0, speed: 0.8,  interval: 1.2, poison: 0.5, pw: 1.3 },
  // golem: slow ground slam — area damage around the target and a short stun
  golem:    { hp: 320, atk: 22, def: 16, range: 1.2, speed: 0.6,  interval: 2.4, slam: 1.2, stun: 0.7, pw: 1.3 },
  // dragon: fire breath that pierces through the target and burns everyone behind it
  dragon:   { hp: 160, atk: 26, def: 6,  range: 2.6, speed: 0.8,  interval: 2.0, pierce: 2.0, pw: 1.3 },
  // lich: dark bolts, and every 3rd cast raises a skeleton soldier (max 2 alive per lich)
  lich:     { hp: 110, atk: 18, def: 4,  range: 3.2, speed: 0.8,  interval: 1.8, summon: 'skeleton', magic: { pct: 0.04, perRank: 0.0004, max: 0.15, radius: 1.0 }, pw: 1.8 },
  // skeleton: summoned by the lich
  skeleton: { hp: 60,  atk: 14, def: 2,  range: 1.1, speed: 1.4,  interval: 1.0 },
};

// Monster types and the stage where each first appears.
// warder = Ward Imp: the same barrier as our 魔法防御師 (nullifies OUR magic on monsters inside it)
export const MONSTER_UNLOCK = { sword: 1, archer: 1, mage: 1, shield: 1, healer: 1, bat: 3, slime: 6, golem: 10, dragon: 15, lich: 20, warder: 25 };
export const MONSTER_TYPES = Object.keys(MONSTER_UNLOCK);
const MELEE_FRONT = new Set(['sword', 'shield', 'golem', 'slime', 'bat']);

export const RECRUIT_COST = { sword: 50, mage: 70, archer: 60, shield: 60, healer: 70, lancer: 70, thief: 60, enchanter: 80, summoner: 90, warder: 80 };

export const SLOTS = ['weapon', 'armor', 'accessory'];
export const ITEMS = {
  bronze_sword:  { slot: 'weapon',    cost: 40,  atk: 5 },
  mythril_sword: { slot: 'weapon',    cost: 120, atk: 14 },
  leather_armor: { slot: 'armor',     cost: 40,  hp: 30, def: 2 },
  mythril_armor: { slot: 'armor',     cost: 120, hp: 80, def: 6 },
  speed_ring:    { slot: 'accessory', cost: 80,  haste: 0.2 },
  life_amulet:   { slot: 'accessory', cost: 80,  hp: 50 },
};

// ---- equipment levels ----
// An item is stored as a key: "bronze_sword" (Lv1) or "bronze_sword+3" (Lv3). Merging identical items adds
// their levels (like characters). ATK / HP / DEF grow linearly with the level; haste grows with diminishing
// returns towards HASTE_MAX.
export const HASTE_MAX = 0.5;
export function parseItem(key) {
  const m = /^([a-z_]+)(?:\+(\d+))?$/.exec(key || '');
  return m && ITEMS[m[1]] ? { id: m[1], lv: m[2] ? +m[2] : 1 } : null;
}
export function itemKey(id, lv = 1) { return lv > 1 ? `${id}+${lv}` : id; }
export function itemStats(key) {
  const p = parseItem(key); if (!p) return null;
  const it = ITEMS[p.id], lv = p.lv;
  return {
    id: p.id, lv, slot: it.slot, cost: it.cost,
    atk: (it.atk || 0) * lv, hp: (it.hp || 0) * lv, def: (it.def || 0) * lv,
    haste: it.haste ? +(it.haste + (HASTE_MAX - it.haste) * (1 - 1 / lv)).toFixed(3) : 0,
  };
}

export function rankMult(rank) { return 1 + 0.3 * (rank - 1); }

export function computeStats(type, rank = 1, equip = {}, mult = 1) {
  const b = BASE[type];
  const rm = rankMult(rank) * mult;
  const s = {
    maxHp: Math.round(b.hp * rm),
    atk: Math.round(b.atk * rm),
    // defence grows with rank like HP / attack, so it matters at every stage (see Battle.applyDamage)
    def: Math.round(b.def * rm),
    range: b.range,
    speed: b.speed,
    interval: b.interval,
    magic: b.magic ? { pct: +Math.min(b.magic.max, b.magic.pct + b.magic.perRank * (rank - 1)).toFixed(4), radius: b.magic.radius } : null,
    heal: b.heal ? Math.round(b.heal * rm) : 0,
    guard: b.guard ? { ...b.guard } : null,
    ward: b.ward ? { radius: +Math.min(b.ward.max, b.ward.radius + b.ward.perRank * (rank - 1)).toFixed(3) } : null,
    assassin: !!b.assassin, fly: !!b.fly, poison: b.poison || 0, slam: b.slam || 0, stun: b.stun || 0,
    pierce: b.pierce || 0, summon: b.summon || null,
    prey: !!b.prey, charge: b.charge || null, chant: b.chant || 0,
    buff: b.buff ? { ...b.buff, amount: +Math.min(BUFF_MAX, b.buff.base + b.buff.perRank * (rank - 1)).toFixed(3) } : null,
  };
  for (const slot of SLOTS) {
    const it = equip && equip[slot] ? itemStats(equip[slot]) : null;
    if (!it) continue;
    if (it.atk) { s.atk += it.atk; if (s.heal) s.heal += Math.round(it.atk * 0.8); }
    if (it.hp) s.maxHp += it.hp;
    if (it.def) s.def += it.def;
    if (it.haste) s.interval = +(s.interval * (1 - it.haste)).toFixed(3);
  }
  return s;
}

export function rewardCoins(stage, win) { return win ? 40 + stage * 15 : 5 + stage * 2; }

// Merging adds the two ranks together (★3 + ★5 = ★8), with no upper limit.
export function mergedRank(a, b) { return a + b; }

// Deterministic PRNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Enemy difficulty curve. Target power follows ((s + K) / (1 + K)) ^ P: about +20% per
// stage at the start, easing to about +7% near stage 100 (the player's army grows fast
// early and slower later, so the challenge stays even and has no sudden spikes).
// Designed for 100 stages: stage 100 needs an army of high-rank (★80-100) characters
// with good equipment. After that it keeps growing +2%/stage as an endless challenge.
export const STAGE_COUNT = 100;
const CURVE_K = 50, CURVE_P = 9.4;
const GROWTH_AFTER = 1.02;
export function targetPowerScale(stage) {
  const s = Math.min(stage, STAGE_COUNT);
  const extra = Math.max(0, stage - STAGE_COUNT);
  return Math.pow((s + CURVE_K) / (1 + CURVE_K), CURVE_P) * Math.pow(GROWTH_AFTER, extra);
}

const BASE_MULT = 0.8;
const typeWeight = (type) => (type === 'healer' ? 0.6 : MONSTER_UNLOCK[type] > 1 ? 1.2 : 1);

function enemyComposition(stage) {
  // Each stage has its own (seeded, so always identical) mix of monsters.
  const rnd = mulberry32(stage * 9973 + 24);
  // +1 monster every 5 stages up to 15; on the big board (stage 100+) +1 per stage up to 50
  const count = stage < BIG_GRID_STAGE ? Math.min(15, 3 + Math.floor((stage - 1) / 5))
    : Math.min(BIG_GRID.cells, 15 + (stage - BIG_GRID_STAGE));
  const pool = MONSTER_TYPES.filter((t) => MONSTER_UNLOCK[t] <= stage);
  // Keep waves balanced: at most half of them ranged, no more than ~1/4 of any one type,
  // and at most 2 liches (summoners).
  const counts = {};
  let ranged = 0;
  // enemies use magic too: from stage 2 every wave has exactly this many mages (about 1 in 8 monsters)
  const mageQuota = stage >= 2 ? Math.max(1, Math.round(count / 8)) : 0;
  const cap = (t) => (t === 'lich' ? 2 : t === 'mage' ? mageQuota : t === 'warder' ? (count >= 10 ? 2 : 1) : Math.max(2, Math.ceil(count / 4)));
  const allowed = (t) => (counts[t] || 0) < cap(t)
    && (MELEE_FRONT.has(t) || ranged < Math.floor(count / 2));
  const pick = () => {
    const opts = pool.filter(allowed);
    const tot = opts.reduce((a, t) => a + typeWeight(t), 0);
    let r = rnd() * tot;
    for (const t of opts) { r -= typeWeight(t); if (r < 0) return t; }
    return opts[opts.length - 1];
  };
  // Average rank so that the raw formation roughly matches the target power
  // (power ~ (count * rankMult)^2); the remaining gap is closed by the stat multiplier.
  const rm = (3 * Math.sqrt(targetPowerScale(Math.min(stage, STAGE_COUNT)))) / count;
  const avgRank = Math.max(1, Math.min(ENEMY_MAX_RANK, 1 + (rm - 1) / 0.3));
  const newcomer = pool.find((t) => MONSTER_UNLOCK[t] === stage && stage > 1);
  const list = [];
  for (let i = 0; i < count; i++) {
    let type;
    if (i === 0) type = rnd() < 0.5 ? 'sword' : 'shield';
    else if (i === 1 && newcomer) type = newcomer;           // show off a newly unlocked monster
    else if ((counts.mage || 0) < mageQuota && allowed('mage')) { type = 'mage'; rnd(); }
    else type = pick();
    counts[type] = (counts[type] || 0) + 1; if (!MELEE_FRONT.has(type)) ranged++;
    const spread = (rnd() * 2 - 1) * 0.2;                  // ranks vary ±20% inside a wave
    const rank = Math.max(1, Math.min(ENEMY_MAX_RANK, Math.round(avgRank * (1 + spread))));
    list.push({ type, rank });
  }
  return list;
}

// Rough fighting strength: total HP x total damage per second
// (special attack styles count via the per-type `pw` factor).
// `wave` = support monsters that strengthen the whole wave (e.g. the Ward Imp's barrier): +share each.
export function wavePower(units, mult) {
  let hp = 0, dps = 0, support = 1;
  for (const u of units) {
    const x = computeStats(u.type, u.rank, {}, mult);
    hp += x.maxHp; dps += (x.atk / x.interval) * (BASE[u.type].pw || 1);
    support += BASE[u.type].wave || 0;
  }
  return hp * dps * support;
}

const BASE_POWER = wavePower([{ type: 'sword', rank: 1 }, { type: 'archer', rank: 1 }, { type: 'shield', rank: 1 }], BASE_MULT);

// Enemy formation for a stage. cell = row*cols+col in the enemy zone (its last row is the front line).
export function enemyWave(stage) {
  const list = enemyComposition(stage);
  // Stat multiplier is solved so that power follows the smooth target curve exactly
  // (HP and ATK both scale with mult, so power ~ mult^2).
  const target = BASE_POWER * targetPowerScale(stage);
  const mult = +Math.sqrt(target / wavePower(list, 1)).toFixed(3);
  const front = [], back = [];
  for (const u of list) (MELEE_FRONT.has(u.type) ? front : back).push(u);
  const g = gridFor(stage);
  const free = new Set(Array.from({ length: g.cells }, (_, i) => i));
  const colOrder = centerCols(g.cols);
  const order = (rows) => {
    const cells = [];
    for (const r of rows) for (const c of colOrder) cells.push(r * g.cols + c);
    return cells;
  };
  const rowsFront = Array.from({ length: g.zoneRows }, (_, i) => g.zoneRows - 1 - i); // enemy front line = last row
  const out = [];
  const take = (list, rows) => {
    for (const u of list) {
      const cell = order(rows).find((c) => free.has(c));
      free.delete(cell);
      out.push({ ...u, cell });
    }
  };
  take(front, rowsFront);
  take(back, [...rowsFront].reverse());
  return { units: out, mult, grid: g };
}

// Ally cells: row 0 is the front line (next to the middle of the field).
export function cellToField(team, cell, grid = SMALL_GRID) {
  const col = cell % grid.cols, row = Math.floor(cell / grid.cols);
  return { x: col + 0.5, y: (team === 'ally' ? grid.allyRow0 : 0) + row + 0.5 };
}

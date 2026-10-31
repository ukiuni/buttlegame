// Game data & pure rules (no DOM) — importable from Node tests.

export const TYPES = ['sword', 'mage', 'archer', 'shield', 'healer'];
export const MAX_RANK = 10;
export const COLS = 5;
export const ZONE_ROWS = 3;      // rows per side
export const FIELD_ROWS = 8;     // enemy 0-2, neutral 3-4, ally 5-7
export const ALLY_ROW0 = 5;

export const BASE = {
  sword:  { hp: 130, atk: 24, def: 6,  range: 1.1, speed: 1.3,  interval: 1.0 },
  mage:   { hp: 75,  atk: 28, def: 2,  range: 3.2, speed: 0.9,  interval: 1.7, splash: 0.9 },
  archer: { hp: 85,  atk: 19, def: 3,  range: 4.2, speed: 1.0,  interval: 1.15 },
  shield: { hp: 240, atk: 11, def: 14, range: 1.1, speed: 0.85, interval: 1.3 },
  healer: { hp: 85,  atk: 9,  def: 3,  range: 3.0, speed: 0.95, interval: 1.8, heal: 18 },
};

export const RECRUIT_COST = { sword: 50, mage: 70, archer: 60, shield: 60, healer: 70 };

export const SLOTS = ['weapon', 'armor', 'accessory'];
export const ITEMS = {
  bronze_sword:  { slot: 'weapon',    cost: 40,  atk: 5 },
  mythril_sword: { slot: 'weapon',    cost: 120, atk: 14 },
  leather_armor: { slot: 'armor',     cost: 40,  hp: 30, def: 2 },
  mythril_armor: { slot: 'armor',     cost: 120, hp: 80, def: 6 },
  speed_ring:    { slot: 'accessory', cost: 80,  haste: 0.2 },
  life_amulet:   { slot: 'accessory', cost: 80,  hp: 50 },
};

export function rankMult(rank) { return 1 + 0.3 * (rank - 1); }

export function computeStats(type, rank = 1, equip = {}, mult = 1) {
  const b = BASE[type];
  const rm = rankMult(rank) * mult;
  const s = {
    maxHp: Math.round(b.hp * rm),
    atk: Math.round(b.atk * rm),
    def: Math.round((b.def + (rank - 1)) * mult),
    range: b.range,
    speed: b.speed,
    interval: b.interval,
    splash: b.splash || 0,
    heal: b.heal ? Math.round(b.heal * rm) : 0,
  };
  for (const slot of SLOTS) {
    const it = equip && equip[slot] ? ITEMS[equip[slot]] : null;
    if (!it) continue;
    if (it.atk) { s.atk += it.atk; if (s.heal) s.heal += Math.round(it.atk * 0.8); }
    if (it.hp) s.maxHp += it.hp;
    if (it.def) s.def += it.def;
    if (it.haste) s.interval = +(s.interval * (1 - it.haste)).toFixed(3);
  }
  return s;
}

export function rewardCoins(stage, win) { return win ? 40 + stage * 15 : 5 + stage * 2; }

export function mergedRank(a, b) { return Math.min(MAX_RANK, Math.max(a, b) + 1); }

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

// Enemy difficulty curve: total enemy power grows smoothly by ~6-9% per stage,
// so there are no sudden spikes. Designed for 100 stages: stage 100 needs a full
// ★10 army with good equipment. After that it keeps growing slowly as an endless challenge.
export const STAGE_COUNT = 100;
const GROWTH = 1.055;
const GROWTH_AFTER = 1.02;
export function targetPowerScale(stage) {
  let ln = 0;
  for (let s = 1; s < stage; s++) ln += Math.log(stageGrowth(s));
  return Math.exp(ln);
}
// Per-stage growth: ~+9% early, easing to ~+6% toward stage 100, then +2% (endless).
function stageGrowth(s) {
  if (s >= STAGE_COUNT) return GROWTH_AFTER;
  return GROWTH + 0.035 * Math.exp(-(s - 1) / 40);
}

function enemyComposition(stage) {
  // Fixed unit sequence (seeded) so a stage always has the same monsters.
  const rnd = mulberry32(24);
  const count = Math.min(15, 3 + Math.floor((stage - 1) / 8));      // +1 monster every 8 stages
  const list = [];
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let type;
    if (i === 0) type = 'sword';
    else if (r < 0.28) type = 'sword';
    else if (r < 0.46) type = 'archer';
    else if (r < 0.64) type = 'mage';
    else if (r < 0.82) type = 'shield';
    else type = 'healer';
    // Ranks rise one monster at a time (staggered), reaching ★10 around stage 100.
    const offset = (i * 7) % 11;
    const rank = Math.max(1, Math.min(MAX_RANK, 1 + Math.floor((stage - 4 + offset) / 11)));
    list.push({ type, rank });
  }
  return list;
}

// Rough fighting strength: total HP x total damage per second.
export function wavePower(units, mult) {
  let hp = 0, dps = 0;
  for (const u of units) {
    const x = computeStats(u.type, u.rank, {}, mult);
    hp += x.maxHp; dps += x.atk / x.interval;
  }
  return hp * dps;
}

const BASE_POWER = wavePower(enemyComposition(1), 0.8);

// Enemy formation for a stage. cell = row*COLS+col in enemy zone (row 2 is the front line).
export function enemyWave(stage) {
  const list = enemyComposition(stage);
  // Stat multiplier is solved so that power follows the smooth target curve exactly
  // (HP and ATK both scale with mult, so power ~ mult^2).
  const target = BASE_POWER * targetPowerScale(stage);
  const mult = +Math.sqrt(target / wavePower(list, 1)).toFixed(3);
  const front = [], back = [];
  for (const u of list) (u.type === 'sword' || u.type === 'shield' ? front : back).push(u);
  const free = new Set(Array.from({ length: 15 }, (_, i) => i));
  const order = (rows) => {
    const cells = [];
    for (const r of rows) for (const c of [2, 1, 3, 0, 4]) cells.push(r * COLS + c);
    return cells;
  };
  const out = [];
  const take = (list, rows) => {
    for (const u of list) {
      const cell = order(rows).find((c) => free.has(c));
      free.delete(cell);
      out.push({ ...u, cell });
    }
  };
  take(front, [2, 1, 0]);
  take(back, [0, 1, 2]);
  return { units: out, mult };
}

export function cellToField(team, cell) {
  const col = cell % COLS, row = Math.floor(cell / COLS);
  return { x: col + 0.5, y: (team === 'ally' ? ALLY_ROW0 : 0) + row + 0.5 };
}

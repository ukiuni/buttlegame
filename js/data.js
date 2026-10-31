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

export function deployLimit(stage) { return Math.min(15, 4 + Math.floor((stage - 1) / 2)); }

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

// Enemy formation for a stage. cell = row*COLS+col in enemy zone (row 2 is the front line).
export function enemyWave(stage) {
  // Fixed unit sequence + per-unit rank rolls => strictly stronger waves as the stage rises.
  const rnd = mulberry32(24);
  const count = Math.min(15, 3 + Math.floor((stage - 1) * 0.6));
  const baseRank = Math.min(MAX_RANK, 1 + Math.floor((stage - 1) / 5));
  const mult = 0.8 + 0.05 * (stage - 1);
  const bonusChance = Math.min(0.9, 0.05 + stage * 0.02);
  const front = [], back = [];
  for (let i = 0; i < count; i++) {
    const r = rnd(), roll = rnd();
    let type;
    if (i === 0) type = 'sword';
    else if (r < 0.28) type = 'sword';
    else if (r < 0.46) type = 'archer';
    else if (r < 0.64) type = 'mage';
    else if (r < 0.82) type = 'shield';
    else type = 'healer';
    const rank = Math.min(MAX_RANK, baseRank + (roll < bonusChance ? 1 : 0));
    (type === 'sword' || type === 'shield' ? front : back).push({ type, rank });
  }
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

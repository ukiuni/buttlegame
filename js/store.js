// Persistent player state.
import { ITEMS, RECRUIT_COST, canEquip, itemStats, parseItem, itemKey, computeStats, SMALL_GRID, BIG_GRID, gridFor, centerCols, mergedRank, rewardCoins } from './data.js';

// Classes that fight up close go to the front rows when auto-arranging.
export const MELEE = new Set(['sword', 'shield', 'lancer', 'thief']);

const KEY = 'pixel_brigade_save_v1';

export function defaultSave() {
  const roster = [
    { id: 1, type: 'sword', rank: 1, equip: {} },
    { id: 2, type: 'shield', rank: 1, equip: {} },
    { id: 3, type: 'archer', rank: 1, equip: {} },
    { id: 4, type: 'healer', rank: 1, equip: {} },
    { id: 5, type: 'sword', rank: 1, equip: {} },
    { id: 6, type: 'mage', rank: 1, equip: {} },
  ];
  return {
    version: 1, coins: 100, stage: 1, nextId: 7, lang: null, bgm: true,
    roster, inventory: {},
    formation: { 1: 2, 2: 1, 3: 12, 4: 11 }, // small board: charId -> ally cell (row*5+col; row 0 = front line)
    formationBig: null,                         // big board (stage 100+): charId -> cell (row*10+col); made on first use
  };
}

export class Store {
  constructor(storage) {
    this.storage = storage;
    this.data = this.load();
  }
  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY);
      if (raw) return Store.migrate({ ...defaultSave(), ...JSON.parse(raw) });
    } catch (e) { /* ignore */ }
    return defaultSave();
  }
  // Old saves: weapons a class can no longer hold (e.g. a sword on a mage) go back to the bag.
  static migrate(d) {
    for (const c of d.roster || []) {
      const w = c.equip && c.equip.weapon;
      if (w && !canEquip(c.type, w)) { d.inventory[w] = (d.inventory[w] || 0) + 1; delete c.equip.weapon; }
    }
    return d;
  }
  save() { try { this.storage && this.storage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
  reset() { const { lang, bgm } = this.data; this.data = defaultSave(); this.data.lang = lang; this.data.bgm = bgm !== false; this.save(); }

  char(id) { return this.data.roster.find((c) => c.id === id); }

  addCoins(n) { this.data.coins += n; this.save(); }

  recruit(type) {
    const cost = RECRUIT_COST[type];
    if (this.data.coins < cost) return null;
    this.data.coins -= cost;
    const c = { id: this.data.nextId++, type, rank: 1, equip: {} };
    this.data.roster.push(c);
    this.save();
    return c;
  }

  // Recruit up to `n` units (stops when coins run out). Returns the number recruited.
  recruitMany(type, n) {
    let k = 0;
    while (k < n && this.data.coins >= RECRUIT_COST[type]) {
      this.data.coins -= RECRUIT_COST[type];
      this.data.roster.push({ id: this.data.nextId++, type, rank: 1, equip: {} });
      k++;
    }
    if (k) this.save();
    return k;
  }
  maxRecruitable(type) { return Math.floor(this.data.coins / RECRUIT_COST[type]); }

  // ---- undo ----
  snapshot() { return JSON.stringify(this.data); }
  restore(snap) { this.data = JSON.parse(snap); this.save(); }

  // ---- lock (locked characters are never used up by bulk merge / auto-arrange / merging) ----
  setLocked(charId, on) { const c = this.char(charId); if (c) { if (on) c.locked = true; else delete c.locked; this.save(); } }

  buyItem(itemId) { return this.buyItems(itemId, 1) === 1; }
  // Buy up to n copies (as many as the coins allow). Returns how many were bought.
  buyItems(itemId, n) {
    const it = ITEMS[itemId];
    if (!it) return 0;
    const k = Math.max(0, Math.min(n, this.maxBuyable(itemId)));
    if (!k) return 0;
    this.data.coins -= it.cost * k;
    this.data.inventory[itemId] = (this.data.inventory[itemId] || 0) + k;
    this.save();
    return k;
  }
  maxBuyable(itemId) { const it = ITEMS[itemId]; return it ? Math.floor(this.data.coins / it.cost) : 0; }

  // ---- equipment merge: all unequipped copies of an item become one item whose level is the sum ----
  itemGroup(itemId) {
    const keys = Object.keys(this.data.inventory).filter((k) => this.data.inventory[k] > 0 && parseItem(k)?.id === itemId);
    const count = keys.reduce((a, k) => a + this.data.inventory[k], 0);
    const lv = keys.reduce((a, k) => a + parseItem(k).lv * this.data.inventory[k], 0);
    return { keys, count, lv };
  }
  mergeItems(itemId) {
    const g = this.itemGroup(itemId);
    if (g.count < 2) return null;
    for (const k of g.keys) delete this.data.inventory[k];
    const key = itemKey(itemId, g.lv);
    this.data.inventory[key] = 1;
    this.save();
    return { key, lv: g.lv, count: g.count };
  }

  equip(charId, key) {
    const c = this.char(charId); const it = itemStats(key);
    if (!c || !it || !(this.data.inventory[key] > 0) || !canEquip(c.type, key)) return false;
    this.unequip(charId, it.slot, false);
    this.data.inventory[key]--;
    if (!this.data.inventory[key]) delete this.data.inventory[key];
    c.equip[it.slot] = key;
    this.save();
    return true;
  }

  unequip(charId, slot, persist = true) {
    const c = this.char(charId);
    if (!c || !c.equip[slot]) return false;
    const id = c.equip[slot];
    this.data.inventory[id] = (this.data.inventory[id] || 0) + 1;
    delete c.equip[slot];
    if (persist) this.save();
    return true;
  }

  // ---- formation ----
  grid() { return gridFor(this.data.stage); }
  // The formation for the current board. On first reaching the big board, the small-board
  // formation is carried over: same rows (front stays front), centred columns.
  get formation() {
    if (!this.grid().big) return this.data.formation;
    if (!this.data.formationBig) {
      const off = Math.floor((BIG_GRID.cols - SMALL_GRID.cols) / 2);
      const f = {};
      for (const [id, cell] of Object.entries(this.data.formation)) {
        const r = Math.floor(cell / SMALL_GRID.cols), c = cell % SMALL_GRID.cols;
        f[id] = r * BIG_GRID.cols + c + off;
      }
      this.data.formationBig = f;
    }
    return this.data.formationBig;
  }
  forgetChar(id) { delete this.data.formation[id]; if (this.data.formationBig) delete this.data.formationBig[id]; }
  placedCount() { return Object.keys(this.formation).length; }
  cellOf(charId) { const v = this.formation[charId]; return v == null ? null : v; }
  charAt(cell) {
    const e = Object.entries(this.formation).find(([, c]) => c === cell);
    return e ? this.char(+e[0]) : null;
  }
  // No deployment limit: every ally cell can be filled.
  place(charId, cell) {
    this.formation[charId] = cell; this.save(); return 'ok';
  }
  unplace(charId) { delete this.formation[charId]; this.save(); }
  swap(aId, bId) {
    const ca = this.cellOf(aId), cb = this.cellOf(bId);
    if (cb == null) return;
    if (ca == null) { delete this.formation[bId]; } else { this.formation[bId] = ca; }
    this.formation[aId] = cb;
    this.save();
  }
  // Merge source into target. Only identical character types can merge.
  merge(sourceId, targetId) {
    const s = this.char(sourceId), tg = this.char(targetId);
    if (!s || !tg || s === tg) return { ok: false, reason: 'invalid' };
    if (s.locked) return { ok: false, reason: 'locked' };
    if (s.type !== tg.type) return { ok: false, reason: 'type' };
    tg.rank = mergedRank(s.rank, tg.rank);
    for (const slot of Object.keys(s.equip)) this.unequip(s.id, slot, false);
    this.data.roster = this.data.roster.filter((c) => c !== s);
    this.forgetChar(s.id);
    this.save();
    return { ok: true, rank: tg.rank, target: tg };
  }

  // ---- bulk merge ----
  // Bench characters (not placed, not locked) of the same type that can be merged into `targetId`,
  // smallest first. Ranks have no cap, so all of them can be merged (`max` = list length).
  mergeCandidates(targetId) {
    const tg = this.char(targetId);
    if (!tg) return { list: [], max: 0 };
    const list = this.data.roster
      .filter((c) => c !== tg && c.type === tg.type && !c.locked && this.cellOf(c.id) == null)
      .sort((a, b) => a.rank - b.rank || a.id - b.id);
    return { list, max: list.length };
  }
  // Result of merging the first `n` candidates (without changing anything).
  previewBulk(targetId, n) {
    const tg = this.char(targetId); const { list, max } = this.mergeCandidates(targetId);
    const used = list.slice(0, Math.min(n, max));
    const equipped = used.filter((c) => Object.keys(c.equip).length).length;
    return { from: tg.rank, to: used.reduce((a, c) => a + c.rank, tg.rank), count: used.length, max, available: list.length, equipped, ids: used.map((c) => c.id) };
  }
  bulkMerge(targetId, n) {
    const pv = this.previewBulk(targetId, n);
    const tg = this.char(targetId);
    for (const id of pv.ids) {
      const s = this.char(id);
      tg.rank = mergedRank(tg.rank, s.rank);
      for (const slot of Object.keys(s.equip)) this.unequip(s.id, slot, false);
      this.data.roster = this.data.roster.filter((c) => c !== s);
      this.forgetChar(s.id);
    }
    this.save();
    return { count: pv.ids.length, rank: tg.rank };
  }

  // ---- auto arrange ----
  // Plan: 1) fill empty cells from the bench (strongest first, mixing classes; melee to the front,
  // ranged to the back), 2) merge the rest of the bench into placed units of the same class,
  // either 'even' (raise the weakest first) or 'front' (concentrate on front-row units).
  planAuto(mode = 'even') {
    const g = this.grid(), form = this.formation, colOrder = centerCols(g.cols);
    const placedIds = new Set(Object.keys(form).map(Number));
    const free = new Set(Array.from({ length: g.cells }, (_, i) => i));
    for (const c of Object.values(form)) free.delete(c);
    const bench = this.data.roster.filter((c) => !placedIds.has(c.id));
    // round-robin over classes, strongest of each class first
    const byType = {};
    for (const c of [...bench].sort((a, b) => b.rank - a.rank || a.id - b.id)) (byType[c.type] ||= []).push(c);
    const pickOrder = [];
    const queues = Object.values(byType).sort((a, b) => b[0].rank - a[0].rank || b.length - a.length);
    while (pickOrder.length < free.size && queues.some((q) => q.length)) for (const q of queues) if (q.length && pickOrder.length < free.size) pickOrder.push(q.shift());
    const cellsFor = (melee) => {
      const rows = Array.from({ length: g.zoneRows }, (_, i) => (melee ? i : g.zoneRows - 1 - i));
      const out = []; for (const r of rows) for (const col of colOrder) out.push(r * g.cols + col);
      return out;
    };
    const places = [];
    for (const melee of [true, false]) {
      for (const c of pickOrder.filter((x) => MELEE.has(x.type) === melee)) {
        const cell = cellsFor(melee).find((x) => free.has(x));
        free.delete(cell); places.push({ id: c.id, cell, type: c.type, rank: c.rank });
      }
    }
    // merging
    const placedNow = new Set(places.map((p) => p.id));
    const cellOf = (id) => (form[id] != null ? form[id] : places.find((p) => p.id === id).cell);
    const targets = this.data.roster.filter((c) => placedIds.has(c.id) || placedNow.has(c.id));
    const plannedRank = new Map(targets.map((c) => [c.id, c.rank]));
    const sources = bench.filter((c) => !placedNow.has(c.id) && !c.locked).sort((a, b) => b.rank - a.rank || a.id - b.id);
    const mergeMap = new Map();
    for (const src of sources) {
      let cand = targets.filter((tg) => tg.type === src.type);
      if (!cand.length) continue;
      if (mode === 'front') cand.sort((a, b) => Math.floor(cellOf(a.id) / g.cols) - Math.floor(cellOf(b.id) / g.cols) || plannedRank.get(b.id) - plannedRank.get(a.id) || cellOf(a.id) - cellOf(b.id));
      else cand.sort((a, b) => plannedRank.get(a.id) - plannedRank.get(b.id) || cellOf(a.id) - cellOf(b.id));
      const tg = cand[0];
      plannedRank.set(tg.id, plannedRank.get(tg.id) + src.rank);
      (mergeMap.get(tg.id) || mergeMap.set(tg.id, []).get(tg.id)).push(src.id);
    }
    const merges = [...mergeMap].map(([targetId, sourceIds]) => {
      const tg = this.char(targetId);
      return { targetId, type: tg.type, cell: cellOf(targetId), from: tg.rank, to: plannedRank.get(targetId), sourceIds };
    });
    const leftover = bench.length - places.length - merges.reduce((a, m) => a + m.sourceIds.length, 0);
    const equips = this.planEquip([...targets], plannedRank, merges);
    return { mode, places, merges, leftover, equips };
  }

  // Equipment for the units on the field (after the planned merges). Items pool = spare items in the
  // inventory + items freed by the merges + what those units already wear. For each slot, greedily give the
  // item that adds the most fighting strength (damage per second x effective HP) to the unit that gains most.
  planEquip(units, plannedRank, merges = []) {
    const inv = { ...this.data.inventory };
    const consumed = new Set(merges.flatMap((m) => m.sourceIds));
    for (const id of consumed) for (const k of Object.values(this.char(id).equip)) inv[k] = (inv[k] || 0) + 1;
    const power = (c, equip) => {
      const rank = plannedRank.get(c.id) ?? c.rank;
      const s = computeStats(c.type, rank, equip);
      const ref = computeStats('sword', rank).atk;
      // mage classes: everything they do scales with magic power; the others with attack
      const dps = (s.magBase ? s.mag : s.atk) / s.interval;
      return dps * s.maxHp * (1 + s.def / ref) * (1 + 0.5 * s.mres);
    };
    const plan = new Map(units.map((c) => [c.id, { ...c.equip }]));
    const SLOT_NAMES = [...new Set(Object.values(ITEMS).map((it) => it.slot))];
    for (const slot of SLOT_NAMES) {
      // pool: spare items + what the field units wear in this slot (they may be handed to someone stronger)
      const pool = [];
      for (const [k, n] of Object.entries(inv)) if (itemStats(k)?.slot === slot) for (let i = 0; i < n; i++) pool.push(k);
      for (const c of units) if (c.equip[slot]) pool.push(c.equip[slot]);
      pool.sort();   // identical items next to each other (each is evaluated once)
      for (const c of units) delete plan.get(c.id)[slot];
      const open = new Set(units.map((c) => c.id));
      while (pool.length && open.size) {
        let best = null;
        for (const id of open) {
          const c = units.find((u) => u.id === id); const base = power(c, plan.get(id));
          for (let i = 0; i < pool.length; i++) {
            if (i && pool[i] === pool[i - 1]) continue;
            if (!canEquip(c.type, pool[i])) continue;   // bows only for archers, staves only for mages, ...
            const gain = power(c, { ...plan.get(id), [slot]: pool[i] }) - base;
            if (gain > 0 && (!best || gain > best.gain)) best = { id, i, gain };
          }
        }
        if (!best) break;
        plan.get(best.id)[slot] = pool[best.i]; pool.splice(best.i, 1); open.delete(best.id);
      }
    }
    const equips = [];
    for (const c of units) {
      for (const slot of SLOT_NAMES) {
        const to = plan.get(c.id)[slot] || null, from = c.equip[slot] || null;
        if (to !== from) equips.push({ charId: c.id, type: c.type, rank: plannedRank.get(c.id) ?? c.rank, slot, from, to });
      }
    }
    return equips;
  }
  applyPlan(plan) {
    for (const p of plan.places) this.formation[p.id] = p.cell;
    for (const m of plan.merges) {
      const tg = this.char(m.targetId);
      for (const id of m.sourceIds) {
        const s = this.char(id); if (!s) continue;
        tg.rank = mergedRank(tg.rank, s.rank);
        for (const slot of Object.keys(s.equip)) this.unequip(s.id, slot, false);
        this.data.roster = this.data.roster.filter((c) => c !== s);
        this.forgetChar(s.id);
      }
    }
    // equipment: take off everything that changes first, then put the new items on
    for (const e of plan.equips || []) this.unequip(e.charId, e.slot, false);
    for (const e of plan.equips || []) if (e.to) this.equip(e.charId, e.to);
    this.save();
  }

  // ---- results ----
  finishBattle(win) {
    const stage = this.data.stage;
    const coins = rewardCoins(stage, win);
    this.data.coins += coins;
    if (win) this.data.stage = stage + 1;
    this.save();
    return coins;
  }
}

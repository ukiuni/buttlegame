// Persistent player state.
import { ITEMS, RECRUIT_COST, MAX_RANK, mergedRank, rewardCoins } from './data.js';

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
    version: 1, coins: 100, stage: 1, nextId: 7, lang: null,
    roster, inventory: {},
    formation: { 1: 2, 2: 1, 3: 12, 4: 11 }, // charId -> ally cell (row*5+col; row 0 = front line)
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
      if (raw) return { ...defaultSave(), ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return defaultSave();
  }
  save() { try { this.storage && this.storage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
  reset() { const lang = this.data.lang; this.data = defaultSave(); this.data.lang = lang; this.save(); }

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

  buyItem(itemId) {
    const it = ITEMS[itemId];
    if (!it || this.data.coins < it.cost) return false;
    this.data.coins -= it.cost;
    this.data.inventory[itemId] = (this.data.inventory[itemId] || 0) + 1;
    this.save();
    return true;
  }

  equip(charId, itemId) {
    const c = this.char(charId); const it = ITEMS[itemId];
    if (!c || !it || !(this.data.inventory[itemId] > 0)) return false;
    this.unequip(charId, it.slot, false);
    this.data.inventory[itemId]--;
    if (!this.data.inventory[itemId]) delete this.data.inventory[itemId];
    c.equip[it.slot] = itemId;
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
  placedCount() { return Object.keys(this.data.formation).length; }
  cellOf(charId) { const v = this.data.formation[charId]; return v == null ? null : v; }
  charAt(cell) {
    const e = Object.entries(this.data.formation).find(([, c]) => c === cell);
    return e ? this.char(+e[0]) : null;
  }
  // No deployment limit: every ally cell can be filled.
  place(charId, cell) {
    this.data.formation[charId] = cell; this.save(); return 'ok';
  }
  unplace(charId) { delete this.data.formation[charId]; this.save(); }
  swap(aId, bId) {
    const ca = this.cellOf(aId), cb = this.cellOf(bId);
    if (cb == null) return;
    if (ca == null) { delete this.data.formation[bId]; } else { this.data.formation[bId] = ca; }
    this.data.formation[aId] = cb;
    this.save();
  }
  // Merge source into target. Only identical character types can merge.
  merge(sourceId, targetId) {
    const s = this.char(sourceId), tg = this.char(targetId);
    if (!s || !tg || s === tg) return { ok: false, reason: 'invalid' };
    if (s.type !== tg.type) return { ok: false, reason: 'type' };
    if (tg.rank >= MAX_RANK || s.rank >= MAX_RANK) return { ok: false, reason: 'max' };
    tg.rank = mergedRank(s.rank, tg.rank);
    for (const slot of Object.keys(s.equip)) this.unequip(s.id, slot, false);
    this.data.roster = this.data.roster.filter((c) => c !== s);
    delete this.data.formation[s.id];
    this.save();
    return { ok: true, rank: tg.rank, target: tg };
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

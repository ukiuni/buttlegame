import { TYPES, MONSTER_TYPES, ITEMS, SLOTS, RECRUIT_COST, fmtRank, gridFor, SMALL_GRID, itemStats, parseItem,
  computeStats, enemyWave, cellToField, rewardCoins } from './data.js';
import { Battle, makeUnit, HIT_TIME } from './battle.js';
import { Store } from './store.js';
import { t, setLang, getLang, detectLang, LANGS } from './i18n.js';
import { sheet, spriteKey, icon, FRAMES } from './sprites.js';
import { Bgm } from './audio.js';

const OY = 0.4; // top padding (cells) so front sprites are not clipped
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, attrs = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

const store = new Store(window.localStorage);
setLang(store.data.lang || detectLang(navigator.language));
const bgm = new Bgm();
bgm.enabled = store.data.bgm !== false;

const G = {
  screen: 'title',
  phase: null,          // 'prep' | 'battle'
  battle: null,
  speed: 1,
  cs: 48,
  selected: null,       // charId selected during prep
  unitEls: new Map(),
  rafId: 0,
  lastResult: null,
  grid: SMALL_GRID,     // board for the current stage (5x3, or 10x5 from stage 100)
  magicCircles: new Map(), // caster uid -> rune circle shown while the spell is cast
  auraEls: new Map(),      // warder uid -> barrier dome element
};

// ---------------- helpers ----------------
function charName(type, team = 'ally') { return t((team === 'ally' ? 'char.' : 'mon.') + type); }
function setFrame(spriteEl, frame) {
  spriteEl.style.backgroundPosition = `${(frame * 100) / (FRAMES - 1)}% 0`;
}
function spriteEl(team, type, frame = 0) {
  const s = el('div', 'sprite');
  s.style.backgroundImage = `url(${sheet(spriteKey(team, type))})`;
  setFrame(s, frame);
  return s;
}
let toastTimer = 0;
function toast(msg) {
  const tEl = $('#toast'); tEl.textContent = msg; tEl.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => tEl.classList.add('hidden'), 1800);
}
function applyI18n() {
  document.documentElement.lang = getLang();
  $$('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  $$('.lang-select').forEach((s) => { s.value = getLang(); });
  document.title = t('game.title');
  refresh();
}
function refresh() {
  if (G.screen === 'home') renderHome();
  if (G.screen === 'battle') { renderTopbar(); if (G.phase === 'prep') renderPrep(); else updateBattleInfo(); }
  if (!$('#modal').classList.contains('hidden') && G.modalRender) G.modalRender();
  if (!$('#overlay-result').classList.contains('hidden') && G.lastResult) renderResult(G.lastResult);
}

function showScreen(name) {
  G.screen = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  document.body.dataset.screen = name;
}

// ---------------- undo ----------------
let undoTimer = 0;
function showUndo(msg, snap) {
  $('#undo-msg').textContent = msg;
  const bar = $('#undo-bar'); bar.classList.remove('hidden');
  G.undoSnap = snap;
  clearTimeout(undoTimer); undoTimer = setTimeout(hideUndo, 6000);
}
function hideUndo() { $('#undo-bar').classList.add('hidden'); G.undoSnap = null; }
function doUndo() {
  if (!G.undoSnap) return;
  store.restore(G.undoSnap); hideUndo();
  G.selected = null;
  if (!$('#modal').classList.contains('hidden')) { if (G.modalRender) G.modalRender(); }
  refresh(); renderTopbar();
  toast(t('undo.done'));
}

// ---------------- bulk merge ----------------
function openBulkMerge(targetId) {
  let n = null;
  openModal(() => {
    const tg = store.char(targetId); const box = $('#modal-content'); box.innerHTML = '';
    if (!tg) { closeModal(); return; }
    box.dataset.testid = 'bulk-merge';
    const all = store.previewBulk(targetId, Infinity);
    if (n == null) n = all.max;
    n = Math.max(Math.min(n, all.max), all.max ? 1 : 0);
    const pv = store.previewBulk(targetId, n);
    const h = el('h3'); h.textContent = t('bulk.title'); box.appendChild(h);
    const head = el('div', 'bulk-head'); head.appendChild(spriteEl('ally', tg.type));
    const prv = el('div', 'bulk-preview', { 'data-testid': 'bulk-preview' }); prv.textContent = t('bulk.preview', { name: charName(tg.type), from: pv.from, to: pv.to });
    head.appendChild(prv); box.appendChild(head);
    if (!all.max) {
      const p = el('p', 'note warn'); p.textContent = t('bulk.none'); box.appendChild(p);
      return;
    }
    const st = el('div', 'stepper');
    const minus = el('button', 'btn small', { 'data-bulk': 'minus' }); minus.textContent = '−';
    const num = el('span', 'num', { 'data-testid': 'bulk-count' }); num.textContent = n;
    const plus = el('button', 'btn small', { 'data-bulk': 'plus' }); plus.textContent = '+';
    const range = el('input', '', { type: 'range', min: 1, max: all.max, value: n, 'data-bulk': 'range' });
    const mx = el('button', 'btn small', { 'data-bulk': 'max' }); mx.textContent = t('bulk.max');
    minus.disabled = n <= 1; plus.disabled = n >= all.max;
    minus.addEventListener('click', () => { n--; G.modalRender(); });
    plus.addEventListener('click', () => { n++; G.modalRender(); });
    mx.addEventListener('click', () => { n = all.max; G.modalRender(); });
    range.addEventListener('input', () => { n = +range.value; const q = store.previewBulk(targetId, n); num.textContent = n; prv.textContent = t('bulk.preview', { name: charName(tg.type), from: q.from, to: q.to }); use.textContent = t('bulk.use', { name: charName(tg.type), n, avail: all.available }); });
    range.addEventListener('change', () => G.modalRender());
    st.append(minus, num, plus, range, mx); box.appendChild(st);
    const use = el('p', 'note'); use.textContent = t('bulk.use', { name: charName(tg.type), n: pv.count, avail: all.available }); box.appendChild(use);
    if (pv.equipped) { const p = el('p', 'note'); p.textContent = t('bulk.equipNote', { n: pv.equipped }); box.appendChild(p); }
    const ok = el('button', 'btn primary', { 'data-testid': 'bulk-confirm' }); ok.textContent = t('bulk.confirm');
    ok.addEventListener('click', () => {
      const snap = store.snapshot();
      const r = store.bulkMerge(targetId, n);
      closeModal();
      if (G.screen === 'battle' && G.phase === 'prep') { renderPrep(); flashMerged(targetId); }
      showUndo(t('bulk.done', { name: charName(tg.type), rank: r.rank, n: r.count }), snap);
    });
    box.appendChild(ok);
  });
}

// ---------------- auto arrange ----------------
const rowName = (cell) => {
  const r = Math.floor(cell / G.grid.cols), last = G.grid.zoneRows - 1;
  return t('row.' + (r === 0 ? 0 : r === last ? 2 : 1));
};
function openAutoArrange() {
  let mode = 'even';
  openModal(() => {
    const box = $('#modal-content'); box.innerHTML = ''; box.dataset.testid = 'auto-arrange';
    const h = el('h3'); h.textContent = t('auto.title'); box.appendChild(h);
    const d = el('p', 'note'); d.textContent = t('auto.desc'); box.appendChild(d);
    const seg = el('div', 'seg');
    for (const m of ['even', 'front']) {
      const b = el('button', 'btn small' + (mode === m ? ' active' : ''), { 'data-mode': m }); b.textContent = t('auto.' + m);
      b.addEventListener('click', () => { mode = m; G.modalRender(); }); seg.appendChild(b);
    }
    box.appendChild(seg);
    const plan = store.planAuto(mode);
    const mergedN = plan.merges.reduce((a, m) => a + m.sourceIds.length, 0);
    const sum = el('p', 'note', { 'data-testid': 'auto-summary' });
    sum.textContent = t('auto.summary', { p: plan.places.length, m: mergedN }) + (plan.equips.length ? ' ' + t('auto.summaryEquip', { e: plan.equips.filter((x) => x.to).length }) : '');
    box.appendChild(sum);
    const ul = el('ul', 'plan-list', { 'data-testid': 'auto-plan' });
    for (const p of plan.places) { const li = el('li'); li.textContent = t('auto.place', { name: charName(p.type), rank: p.rank, row: rowName(p.cell) }); ul.appendChild(li); }
    for (const m of plan.merges) { const li = el('li'); li.textContent = t('auto.merge', { name: charName(m.type), row: rowName(m.cell), from: m.from, to: m.to, n: m.sourceIds.length }); ul.appendChild(li); }
    for (const e of plan.equips) {
      const li = el('li', 'plan-equip');
      li.textContent = e.to ? t('auto.equip', { name: charName(e.type), rank: e.rank, item: itemName(e.to) })
        : t('auto.unequip', { name: charName(e.type), rank: e.rank, item: itemName(e.from) });
      ul.appendChild(li);
    }
    const nothing = !plan.places.length && !plan.merges.length && !plan.equips.length;
    if (nothing) { const li = el('li'); li.textContent = t('auto.nothing'); ul.appendChild(li); }
    box.appendChild(ul);
    if (plan.leftover > 0) { const p = el('p', 'note'); p.textContent = t('auto.left', { n: plan.leftover }); box.appendChild(p); }
    const ok = el('button', 'btn primary', { 'data-testid': 'auto-confirm' }); ok.textContent = t('auto.confirm');
    ok.disabled = nothing;
    ok.addEventListener('click', () => {
      const snap = store.snapshot();
      store.applyPlan(plan);
      closeModal(); G.selected = null; renderPrep();
      showUndo(t('auto.done'), snap);
    });
    box.appendChild(ok);
  });
}

// ---------------- title ----------------
function initTitle() {
  const box = $('#title-sprites');
  const sprites = [];
  for (const [team, types] of [['ally', TYPES], ['enemy', MONSTER_TYPES]]) for (const type of types) {
    const s = spriteEl(team, type, 0);
    if (team === 'enemy') s.style.transform = 'scaleX(-1)';
    box.appendChild(s); sprites.push(s);
  }
  let f = 0;
  setInterval(() => { f++; sprites.forEach((s, i) => setFrame(s, (f + i) % 2 ? 1 : 2)); }, 260);
  $('#btn-title-start').addEventListener('click', () => goHome());
  for (const sel of $$('.lang-select')) {
    for (const [code, label] of Object.entries(LANGS)) { const o = el('option'); o.value = code; o.textContent = label; sel.appendChild(o); }
    sel.addEventListener('change', () => { setLang(sel.value); store.data.lang = sel.value; store.save(); applyI18n(); });
  }
  $$('img[data-icon]').forEach((i) => { i.src = icon(i.dataset.icon); });
  renderSoundButtons();
}

// ---------------- BGM ----------------
// Calm theme on title / home / formation, battle theme while fighting, jingle on the result.
function renderSoundButtons() {
  const on = bgm.enabled;
  $$('.btn-sound').forEach((b) => {
    b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on);
    b.title = t(on ? 'common.bgmOn' : 'common.bgmOff'); b.setAttribute('aria-label', b.title);
    b.querySelector('img').src = icon(on ? 'soundOn' : 'soundOff');
  });
}
function toggleSound() {
  store.data.bgm = !bgm.enabled; store.save();
  bgm.setEnabled(store.data.bgm);
  renderSoundButtons();
}
function initSound() {
  // Mobile browsers only allow audio after a user gesture: unlock on the first touch / click / key.
  const unlock = () => bgm.unlock();
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => bgm.setHidden(document.hidden));
  $$('.btn-sound').forEach((b) => b.addEventListener('click', toggleSound));
  bgm.play('home');
}

// ---------------- home ----------------
function goHome() {
  stopLoop();
  G.battle = null; G.phase = null;
  $('#overlay-result').classList.add('hidden');
  showScreen('home');
  bgm.play('home');
  renderHome();
}

function renderHome() {
  $('#home-coins').textContent = store.data.coins;
  $('#home-stage').textContent = t('common.stage', { n: store.data.stage });
  $('#roster-title').textContent = t('home.roster', { n: store.data.roster.length });
  const roster = $('#roster'); roster.innerHTML = '';
  const sorted = [...store.data.roster].sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.rank - a.rank);
  for (const c of sorted) {
    const card = el('div', 'roster-card', { 'data-char-id': c.id, 'data-type': c.type, 'data-rank': c.rank, 'data-testid': 'roster-card' });
    card.appendChild(spriteEl('ally', c.type));
    const nm = el('div', 'name'); nm.textContent = charName(c.type); card.appendChild(nm);
    const rk = el('span', 'rank-badge'); rk.textContent = `★${fmtRank(c.rank)}`; card.appendChild(rk);
    if (c.locked) { const lk = el('span', 'lock-mark'); lk.textContent = '🔒'; card.appendChild(lk); }
    const eq = el('div', 'equip-icons');
    for (const slot of SLOTS) if (c.equip[slot]) { const im = el('img'); im.src = icon(slot); im.title = itemName(c.equip[slot]); eq.appendChild(im); }
    card.appendChild(eq);
    card.addEventListener('click', () => openCharDetail(c.id));
    roster.appendChild(card);
  }
  const inv = $('#inventory'); inv.innerHTML = '';
  const entries = Object.entries(store.data.inventory).filter(([k, n]) => n > 0 && parseItem(k))
    .sort(([a], [b]) => Object.keys(ITEMS).indexOf(parseItem(a).id) - Object.keys(ITEMS).indexOf(parseItem(b).id) || parseItem(b).lv - parseItem(a).lv);
  if (!entries.length) { const p = el('p', 'hint'); p.textContent = t('home.noItems'); inv.appendChild(p); }
  const shownMerge = new Set();
  for (const [key, n] of entries) {
    const { id } = parseItem(key);
    const d = el('div', 'inv-item', { 'data-item': key });
    const im = el('img'); im.src = icon(ITEMS[id].slot); d.appendChild(im);
    const tx = el('span', 'inv-name'); tx.textContent = `${itemName(key)} ×${n}`; tx.title = itemDesc(key); d.appendChild(tx);
    // merge: all unequipped copies of this item into one (levels add up); shown once per item kind
    const g = store.itemGroup(id);
    if (g.count >= 2 && !shownMerge.has(id)) {
      shownMerge.add(id);
      const mb = el('button', 'btn small primary', { 'data-merge-item': id });
      mb.textContent = t('item.merge', { n: g.count, lv: g.lv });
      mb.addEventListener('click', () => {
        const snap = store.snapshot(); const r = store.mergeItems(id);
        if (r) { renderHome(); showUndo(t('item.merged', { name: itemName(r.key), n: r.count }), snap); }
      });
      d.appendChild(mb);
    }
    inv.appendChild(d);
  }
}

// "Bronze Sword", "Bronze Sword +3"
function itemName(key) { const p = parseItem(key); return p ? t('item.' + p.id) + (p.lv > 1 ? ` +${p.lv}` : '') : ''; }
function itemDesc(key) {
  const it = itemStats(key); const parts = [];
  if (it.atk) parts.push(`${t('stat.atk')}+${it.atk}`);
  if (it.hp) parts.push(`${t('stat.hp')}+${it.hp}`);
  if (it.def) parts.push(`${t('stat.def')}+${it.def}`);
  if (it.haste) parts.push(`${t('stat.interval')}-${Math.round(it.haste * 100)}%`);
  return `${t('slot.' + it.slot)}: ${parts.join(' ')}`;
}

function openModal(render) {
  hideUndo(); // a new dialog starts a new context
  G.modalRender = render; render();
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); G.modalRender = null; if (G.screen === 'home') renderHome(); }

function openCharDetail(id) {
  openModal(() => {
    const c = store.char(id); const box = $('#modal-content'); box.innerHTML = '';
    if (!c) { closeModal(); return; }
    box.dataset.testid = 'char-detail';
    const head = el('div', 'detail-head'); head.appendChild(spriteEl('ally', c.type));
    const h = el('h3'); h.textContent = `${charName(c.type)}  ★${c.rank}`; head.appendChild(h); box.appendChild(head);
    const s = computeStats(c.type, c.rank, c.equip);
    const tbl = el('table', 'stat-table');
    const rows = [['stat.hp', s.maxHp], ['stat.atk', s.atk], ['stat.def', s.def], ['stat.range', s.range], ['stat.interval', s.interval + 's']];
    if (s.heal) rows.push(['stat.heal', s.heal]);
    // magic: share of the target's max HP per hit (weapons raise it in proportion to the attack they add)
    // defence: how much of a same-rank swordsman's hit still gets through (dmg = atk^2 / (atk + def))
    const swAtk = computeStats('sword', c.rank).atk;
    rows.push(['stat.defCut', Math.round((100 * swAtk) / (swAtk + s.def)) + '%']);
    if (s.guard) rows.push(['stat.guard', `+${Math.round(s.def * s.guard.share)}`]);
    if (s.ward) rows.push(['stat.ward', s.ward.radius.toFixed(2)]);
    if (s.magic) rows.push(['stat.magic', (s.magic.pct * s.atk / computeStats(c.type, c.rank).atk * 100).toFixed(1) + '%']);
    for (const [k, v] of rows) { const tr = el('tr'); tr.innerHTML = `<td>${t(k)}</td><td data-stat="${k}">${v}</td>`; tbl.appendChild(tr); }
    box.appendChild(tbl);
    const acts = el('div', 'seg');
    const lock = el('button', 'btn small' + (c.locked ? ' active' : ''), { 'data-testid': 'btn-lock' });
    lock.textContent = t(c.locked ? 'lock.on' : 'lock.off');
    lock.addEventListener('click', () => { store.setLocked(c.id, !c.locked); G.modalRender(); });
    const cand = store.mergeCandidates(c.id);
    const bulk = el('button', 'btn small primary', { 'data-testid': 'btn-bulk' });
    bulk.textContent = t('bulk.open', { n: cand.list.length });
    bulk.disabled = cand.max === 0;
    bulk.addEventListener('click', () => openBulkMerge(c.id));
    acts.append(lock, bulk); box.appendChild(acts);
    const eh = el('h3'); eh.textContent = t('equip.title'); box.appendChild(eh);
    for (const slot of SLOTS) {
      const row = el('div', 'slot-row');
      const lb = el('span'); lb.textContent = t('slot.' + slot); row.appendChild(lb);
      const sel = el('select', '', { 'data-slot': slot });
      const none = el('option'); none.value = ''; none.textContent = t('equip.none'); sel.appendChild(none);
      const ids = new Set(Object.keys(store.data.inventory).filter((i) => itemStats(i)?.slot === slot && store.data.inventory[i] > 0));
      if (c.equip[slot]) ids.add(c.equip[slot]);
      const sorted = [...ids].sort((a, b) => parseItem(a).id.localeCompare(parseItem(b).id) || parseItem(b).lv - parseItem(a).lv);
      for (const i of sorted) { const o = el('option'); o.value = i; o.textContent = `${itemName(i)} (${itemDesc(i)})`; sel.appendChild(o); }
      sel.value = c.equip[slot] || '';
      sel.addEventListener('change', () => {
        if (sel.value) store.equip(c.id, sel.value); else store.unequip(c.id, slot);
        G.modalRender();
      });
      row.appendChild(sel); box.appendChild(row);
    }
  });
}

function openShop(tab = 'recruit') {
  let cur = tab;
  openModal(() => {
    const box = $('#modal-content'); box.innerHTML = ''; box.dataset.testid = 'shop';
    const h = el('h3'); h.innerHTML = `${t('shop.title')} — <img class="px-icon" src="${icon('coin')}" alt=""> <span data-testid="shop-coins">${store.data.coins}</span>`; box.appendChild(h);
    const tabs = el('div', 'tabs');
    for (const [k, label] of [['recruit', 'shop.recruit'], ['equipment', 'shop.equipment']]) {
      const b = el('button', 'btn small' + (cur === k ? ' active' : ''), { 'data-tab': k }); b.textContent = t(label);
      b.addEventListener('click', () => { cur = k; G.modalRender(); }); tabs.appendChild(b);
    }
    box.appendChild(tabs);
    const list = el('div', 'shop-list'); box.appendChild(list);
    if (cur === 'recruit') {
      for (const type of TYPES) {
        const row = el('div', 'shop-item');
        row.appendChild(spriteEl('ally', type));
        const s = computeStats(type, 1);
        const nm = el('div', 'name'); nm.innerHTML = `${charName(type)}<div class="desc">${t('stat.hp')} ${s.maxHp} / ${t('stat.atk')} ${s.atk} / ${t('stat.range')} ${s.range}</div><div class="desc ability">${t('charDesc.' + type)}</div>`; row.appendChild(nm);
        const grp = el('div', 'buy-group');
        const b = el('button', 'btn small primary', { 'data-buy-char': type }); b.textContent = t('shop.buy', { n: RECRUIT_COST[type] });
        b.disabled = store.data.coins < RECRUIT_COST[type];
        b.addEventListener('click', () => {
          if (store.recruit(type)) toast(t('shop.recruited', { name: charName(type) })); else toast(t('shop.notEnough'));
          G.modalRender(); renderHome();
        });
        const many = (k) => {
          const snap = store.snapshot(); const got = store.recruitMany(type, k);
          if (got) showUndo(t('shop.recruitedMany', { name: charName(type), n: got }), snap); else toast(t('shop.notEnough'));
          G.modalRender(); renderHome();
        };
        const b10 = el('button', 'btn small', { 'data-buy-char10': type }); b10.textContent = t('shop.buy10', { n: RECRUIT_COST[type] * 10 });
        b10.disabled = store.maxRecruitable(type) < 10;
        b10.addEventListener('click', () => many(10));
        const mxN = store.maxRecruitable(type);
        const bm = el('button', 'btn small', { 'data-buy-charmax': type }); bm.textContent = t('shop.buyMax', { k: mxN });
        bm.disabled = mxN < 1;
        bm.addEventListener('click', () => many(store.maxRecruitable(type)));
        grp.append(b, b10, bm);
        row.appendChild(grp); list.appendChild(row);
      }
    } else {
      for (const [id, it] of Object.entries(ITEMS)) {
        const row = el('div', 'shop-item');
        const im = el('img'); im.src = icon(it.slot); row.appendChild(im);
        const nm = el('div', 'name'); nm.innerHTML = `${t('item.' + id)}<div class="desc">${itemDesc(id)}</div>`; row.appendChild(nm);
        const grp = el('div', 'buy-group');
        const b = el('button', 'btn small primary', { 'data-buy-item': id }); b.textContent = t('shop.buy', { n: it.cost });
        b.disabled = store.data.coins < it.cost;
        b.addEventListener('click', () => {
          if (store.buyItem(id)) toast(t('shop.bought', { name: t('item.' + id) })); else toast(t('shop.notEnough'));
          G.modalRender(); renderHome();
        });
        const many = (k) => {
          const snap = store.snapshot(); const got = store.buyItems(id, k);
          if (got) showUndo(t('shop.boughtMany', { name: t('item.' + id), n: got }), snap); else toast(t('shop.notEnough'));
          G.modalRender(); renderHome();
        };
        const b10 = el('button', 'btn small', { 'data-buy-item10': id }); b10.textContent = t('shop.buy10', { n: it.cost * 10 });
        b10.disabled = store.maxBuyable(id) < 10;
        b10.addEventListener('click', () => many(10));
        const mxN = store.maxBuyable(id);
        const bm = el('button', 'btn small', { 'data-buy-itemmax': id }); bm.textContent = t('shop.buyMax', { k: mxN });
        bm.disabled = mxN < 1;
        bm.addEventListener('click', () => many(store.maxBuyable(id)));
        grp.append(b, b10, bm);
        row.appendChild(grp); list.appendChild(row);
      }
    }
  });
}

// ---------------- field layout ----------------
function layoutField() {
  const g = G.grid = gridFor(store.data.stage);
  document.body.classList.toggle('big-board', g.big); // before measuring: hides the prep hint on the big board
  const wrap = $('#field-wrap');
  const w = wrap.clientWidth - 8, h = wrap.clientHeight - 8;
  const cs = Math.max(g.big ? 18 : 24, Math.floor(Math.min(w / g.cols, h / (g.fieldRows + OY))));
  G.cs = cs;
  const f = $('#field'); f.style.width = cs * g.cols + 'px'; f.style.height = Math.round(cs * (g.fieldRows + OY)) + 'px';
  f.classList.toggle('big', g.big); f.dataset.cols = g.cols;
  const cells = $('#cells'); cells.innerHTML = '';
  for (let r = 0; r < g.fieldRows; r++) for (let c = 0; c < g.cols; c++) {
    const isEnemy = r < g.zoneRows, isAlly = r >= g.allyRow0;
    if (!isEnemy && !isAlly) continue;
    const cell = el('div', 'cell ' + (isAlly ? 'ally' : 'enemy'));
    if (isAlly) { cell.dataset.cell = (r - g.allyRow0) * g.cols + c; cell.dataset.testid = 'cell'; }
    Object.assign(cell.style, { left: c * cs + 'px', top: Math.round((r + OY) * cs) + 'px', width: cs + 'px', height: cs + 'px' });
    cells.appendChild(cell);
  }
  const line = el('div', 'mid-line'); line.style.top = Math.round((g.fieldRows / 2 + OY) * cs) + 'px'; cells.appendChild(line);
}

function unitSize() { return Math.round(G.cs * 1.15); }

function makeUnitEl(team, type, rank) {
  const size = unitSize();
  const u = el('div', `unit team-${team}`);
  u.style.width = size + 'px'; u.style.height = size + 'px';
  u.appendChild(el('div', 'shadow'));
  const s = spriteEl(team, type); u.appendChild(s);
  const hp = el('div', 'hpbar'); const fill = el('div', 'fill'); fill.style.width = '100%'; hp.appendChild(fill); u.appendChild(hp);
  u.appendChild(el('div', 'guard-mark'));   // shown while a shielder guards this unit
  const rk = el('div', 'rank'); rk.textContent = `★${fmtRank(rank)}`; if (rk.textContent.length >= 5) rk.classList.add('long'); u.appendChild(rk);
  u.dataset.team = team; u.dataset.type = type; u.dataset.rank = rank;
  u._sprite = s; u._fill = fill;
  if (team === 'enemy') u.classList.add('facing-left');
  return u;
}
function positionEl(u, x, y) {
  const size = unitSize();
  u.style.transform = `translate(${Math.round(x * G.cs - size / 2)}px, ${Math.round((y + OY) * G.cs - size * 0.62)}px)`;
  u.style.zIndex = Math.round(y * 10);
}

// ---------------- prep (formation) ----------------
function enterPrep() {
  stopLoop();
  G.battle = null; G.phase = 'prep'; G.selected = null;
  $('#overlay-result').classList.add('hidden');
  showScreen('battle');
  bgm.play('home');
  $('#field').classList.remove('fighting');
  $('#prep-panel').classList.remove('hidden');
  $('#battle-panel').classList.add('hidden');
  document.body.dataset.phase = 'prep';
  layoutField();
  renderPrep();
}

function renderTopbar() {
  $('#battle-stage').textContent = t('common.stage', { n: store.data.stage });
  $('#battle-coins').textContent = store.data.coins;
}

function renderPrep() {
  renderTopbar();
  const units = $('#units'); units.innerHTML = ''; clearAuras();
  // enemy preview
  const wave = enemyWave(store.data.stage);
  for (const e of wave.units) {
    const u = makeUnitEl('enemy', e.type, e.rank); u.classList.add('preview');
    const p = cellToField('enemy', e.cell, G.grid); positionEl(u, p.x, p.y);
    units.appendChild(u);
    const est = computeStats(e.type, e.rank);
    if (est.guard) { const r = makeGuardRing(est.guard.radius, 'enemy'); placeAura(r, p.x, p.y); $('#auras').appendChild(r); }
    if (est.ward) { const a = makeAura(est.ward.radius, 'enemy'); placeAura(a, p.x, p.y); $('#auras').appendChild(a); }
  }
  // placed allies
  for (const [cid, cell] of Object.entries(store.formation)) {
    const c = store.char(+cid); if (!c) { delete store.formation[cid]; continue; }
    const u = makeUnitEl('ally', c.type, c.rank);
    u.classList.add('placed'); u.dataset.charId = c.id; u.dataset.cell = cell; u.dataset.testid = 'placed-unit';
    if (G.selected === c.id) u.classList.add('selected');
    const p = cellToField('ally', cell, G.grid); positionEl(u, p.x, p.y);
    units.appendChild(u);
    const st = computeStats(c.type, c.rank, c.equip);
    if (st.ward) { const a = makeAura(st.ward.radius); placeAura(a, p.x, p.y); $('#auras').appendChild(a); }
    if (st.guard) { const r = makeGuardRing(st.guard.radius, 'ally'); placeAura(r, p.x, p.y); $('#auras').appendChild(r); }
  }
  // bench
  $('#bench-list').innerHTML = '';
  // one stacked card per class; the card represents its strongest member
  const benchChars = store.data.roster.filter((c) => store.cellOf(c.id) == null);
  const groups = new Map();
  for (const c of benchChars.sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.rank - a.rank || a.id - b.id)) {
    if (!groups.has(c.type)) groups.set(c.type, []);
    groups.get(c.type).push(c);
  }
  // keep the selected character as the face of its stack
  for (const list of groups.values()) {
    const i = list.findIndex((c) => c.id === G.selected);
    if (i > 0) list.unshift(...list.splice(i, 1));
  }
  for (const [type, list] of groups) {
    const c = list[0];
    const card = el('div', 'bench-card' + (list.length > 1 ? ' stack' : '') + (list.some((x) => x.id === G.selected) ? ' selected' : ''),
      { 'data-char-id': c.id, 'data-type': type, 'data-rank': c.rank, 'data-count': list.length, 'data-testid': 'bench-card' });
    card.appendChild(spriteEl('ally', type));
    const rk = el('span', 'rank-badge'); rk.textContent = `★${fmtRank(c.rank)}`; card.appendChild(rk);
    if (list.length > 1) { const n = el('span', 'count-badge'); n.textContent = `×${list.length}`; card.appendChild(n); }
    if (c.locked) { const lk = el('span', 'lock-mark'); lk.textContent = '🔒'; card.appendChild(lk); }
    $('#bench-list').appendChild(card);
  }
  $('#info-left').textContent = '';
  $('#info-right').textContent = t('battle.enemies', { n: wave.units.length });
  $('#btn-fight').disabled = store.placedCount() === 0;
}

function flashMerged(charId) {
  const u = $(`.unit.placed[data-char-id="${charId}"]`);
  if (u) { u.classList.add('merge-flash'); setTimeout(() => u.classList.remove('merge-flash'), 650); }
}

// Move/merge/swap character `charId` onto ally cell.
function dropOnCell(charId, cell) {
  const c = store.char(charId); if (!c) return;
  const occ = store.charAt(cell);
  if (!occ) {
    store.place(charId, cell);
  } else if (occ.id === charId) {
    // nothing
  } else if (occ.type === c.type) {
    const r = store.merge(charId, occ.id);
    if (r.ok) { G.selected = null; renderPrep(); flashMerged(occ.id); toast(t('prep.merged', { name: charName(occ.type), rank: r.rank })); return; }
    toast(r.reason === 'locked' ? t('prep.locked') : t('prep.cannotMerge'));
  } else {
    toast(t('prep.cannotMerge'));
    store.swap(charId, occ.id);
  }
  G.selected = null;
  renderPrep();
}
function dropOnBench(charId) {
  if (store.cellOf(charId) != null) store.unplace(charId);
  G.selected = null; renderPrep();
}

function cellFromPoint(x, y) {
  const r = $('#field').getBoundingClientRect();
  const fx = (x - r.left - 3) / G.cs, fy = (y - r.top - 3) / G.cs - OY;
  const g = G.grid;
  if (fx < 0 || fx >= g.cols || fy < g.allyRow0 || fy >= g.fieldRows) return null;
  return (Math.floor(fy) - g.allyRow0) * g.cols + Math.floor(fx);
}
// Tapping an enemy in the preview shows its name and attack style.
function showEnemyInfo(x, y) {
  const r = $('#field').getBoundingClientRect();
  const fx = (x - r.left - 3) / G.cs, fy = (y - r.top - 3) / G.cs - OY;
  const g = G.grid;
  if (fx < 0 || fx >= g.cols || fy < 0 || fy >= g.zoneRows) return;
  const cell = Math.floor(fy) * g.cols + Math.floor(fx);
  const e = enemyWave(store.data.stage).units.find((u) => u.cell === cell);
  if (e) toast(t('prep.enemyInfo', { name: charName(e.type, 'enemy'), rank: e.rank, desc: t('monDesc.' + e.type) }));
}
function inBench(x, y) { const r = $('#bench').getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

function initPrepInput() {
  let drag = null;
  const start = (e, charId) => {
    drag = { id: e.pointerId, charId, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, startCell: cellFromPoint(e.clientX, e.clientY) };
  };
  const field = $('#field');
  field.addEventListener('pointerdown', (e) => {
    if (G.phase !== 'prep') return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    const occ = cell != null ? store.charAt(cell) : null;
    start(e, occ ? occ.id : null);
    drag.from = 'field'; drag.cell = cell;
  });
  $('#bench').addEventListener('pointerdown', (e) => {
    if (G.phase !== 'prep') return;
    const card = e.target.closest('.bench-card');
    start(e, card ? +card.dataset.charId : null);
    drag.from = 'bench';
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || drag.charId == null) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 10) {
      drag.moved = true;
      const c = store.char(drag.charId);
      drag.ghost = makeUnitEl('ally', c.type, c.rank); drag.ghost.classList.add('ghost');
      drag.ghost.style.position = 'fixed';
      document.body.appendChild(drag.ghost);
    }
    if (drag.moved) {
      const size = unitSize();
      drag.ghost.style.transform = `translate(${e.clientX - size / 2}px, ${e.clientY - size * 0.7}px)`;
      const cell = cellFromPoint(e.clientX, e.clientY);
      $$('.cell.ally').forEach((c) => c.classList.toggle('drop-hover', +c.dataset.cell === cell));
      $('#bench').classList.toggle('drop-hover', inBench(e.clientX, e.clientY));
    }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    $$('.drop-hover').forEach((c) => c.classList.remove('drop-hover'));
    if (d.ghost) d.ghost.remove();
    if (G.phase !== 'prep' || e.type === 'pointercancel') return;
    if (d.moved) {
      const cell = cellFromPoint(e.clientX, e.clientY);
      const occ = cell != null ? store.charAt(cell) : null;
      const src = store.char(d.charId);
      if (d.from === 'bench' && occ && src && occ.type === src.type && store.mergeCandidates(occ.id).list.length > 1) {
        G.selected = null; renderPrep(); openBulkMerge(occ.id); return;
      }
      if (cell != null) dropOnCell(d.charId, cell);
      else if (inBench(e.clientX, e.clientY)) dropOnBench(d.charId);
      return;
    }
    // tap
    if (d.from === 'field') {
      if (d.cell == null) { showEnemyInfo(e.clientX, e.clientY); return; }
      if (G.selected != null && G.selected !== d.charId) { dropOnCell(G.selected, d.cell); return; }
      G.selected = (d.charId != null && G.selected !== d.charId) ? d.charId : null;
      renderPrep();
    } else {
      if (d.charId != null) {
        G.selected = G.selected === d.charId ? null : d.charId; renderPrep();
      } else if (G.selected != null) dropOnBench(G.selected);
    }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

// ---------------- battle ----------------
function startBattle() {
  if (store.placedCount() === 0) { toast(t('prep.needUnit')); return; }
  hideUndo(); // results of a battle can't be undone
  const grid = G.grid = gridFor(store.data.stage);
  const allies = Object.entries(store.formation).map(([cid, cell]) => {
    const c = store.char(+cid);
    return makeUnit({ team: 'ally', type: c.type, rank: c.rank, equip: c.equip, cell, charId: c.id, grid });
  });
  const wave = enemyWave(store.data.stage);
  const enemies = wave.units.map((e) => makeUnit({ team: 'enemy', type: e.type, rank: e.rank, equip: {}, cell: e.cell, mult: wave.mult, grid }));
  G.battle = new Battle({ allies, enemies, seed: store.data.stage * 31 + 7, grid });
  if (G.traceEnabled) G.battle.trace = [];
  G.phase = 'battle'; G.selected = null;
  bgm.play('battle');
  document.body.dataset.phase = 'battle';
  $('#field').classList.add('fighting');
  $('#prep-panel').classList.add('hidden');
  $('#battle-panel').classList.remove('hidden');
  $('#btn-speed').textContent = t('battle.speed', { n: G.speed });
  $('#units').innerHTML = ''; $('#fx').innerHTML = ''; clearAuras();
  G.unitEls.clear();
  layoutField();
  renderBattle();
  startLoop();
}

function startLoop() {
  stopLoop();
  let last = performance.now(), acc = 0, endTimer = null;
  const STEP = 1 / 60;
  const frame = (now) => {
    const b = G.battle; if (!b) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt * G.speed;
    let n = 0;
    while (acc >= STEP && !b.over && n < 600) { b.step(STEP); acc -= STEP; n++; handleEvents(b); }
    renderBattle();
    if (b.over && endTimer == null) { endTimer = setTimeout(() => finishBattle(b), 500); }
    G.rafId = requestAnimationFrame(frame);
  };
  G.rafId = requestAnimationFrame(frame);
}
function stopLoop() { cancelAnimationFrame(G.rafId); G.rafId = 0; G.magicCircles.clear(); }

function fxAt(cls, x, y, text) {
  const e = el('div', cls); e.style.left = x * G.cs + 'px'; e.style.top = (y + OY) * G.cs + 'px';
  if (text != null) e.textContent = text;
  $('#fx').appendChild(e); setTimeout(() => e.remove(), 900);
  return e;
}

// ---- warder barrier: a translucent dome on the ground showing where magic is nullified ----
function makeAura(radius, team = 'ally') {
  const a = el('div', 'ward-dome' + (team === 'enemy' ? ' enemy' : ''), { 'data-testid': 'ward-dome' });
  a.appendChild(el('div', 'hex'));
  sizeAura(a, radius);
  return a;
}
// shielder's guard: a dotted silver ring (allies inside gain part of the shielder's defence)
function makeGuardRing(radius, team) {
  const a = el('div', 'guard-ring' + (team === 'enemy' ? ' enemy' : ''), { 'data-testid': 'guard-ring' });
  sizeAura(a, radius);
  return a;
}
function sizeAura(a, radius) {
  const w = radius * 2 * G.cs;
  if (a.dataset.r == radius && a.dataset.cs == G.cs) return;
  // true circle: the board is a top-down grid, so the protected area reaches as far up/down as sideways
  Object.assign(a.style, { width: w + 'px', height: w + 'px', margin: `${-w / 2}px 0 0 ${-w / 2}px` });
  a.dataset.r = radius; a.dataset.cs = G.cs;
}
function placeAura(a, x, y) { a.style.transform = `translate(${Math.round(x * G.cs)}px, ${Math.round((y + OY) * G.cs)}px)`; }
function clearAuras() { $('#auras').innerHTML = ''; G.auraEls.clear(); }

// ---- magic FX: rune circle over the area while casting, then a pillar of light on impact ----
// colour per caster: our mage = gold, enemy mage = violet, lich = green, summoner = cyan
function magicColor(a) {
  if (!a) return 'gold';
  return a.type === 'lich' ? 'necro' : a.type === 'summoner' ? 'arcane' : a.team === 'enemy' ? 'violet' : 'gold';
}
// element at field position with a lifetime scaled by the battle speed
// (at x2 / x4 the effects speed up too, but never more than 2x, so the area stays readable)
const fxMs = (ms) => ms / Math.min(G.speed, 2);
function fxTimed(cls, x, y, ms) {
  const e = el('div', cls); e.style.left = x * G.cs + 'px'; e.style.top = (y + OY) * G.cs + 'px';
  $('#fx').appendChild(e); fxLife(e, ms);
  return e;
}
// (re)start an effect's lifetime: its CSS animation runs for `ms`, then it is removed
function fxLife(e, ms) {
  e.style.setProperty('--dur', fxMs(ms) + 'ms');
  clearTimeout(e._t); e._t = setTimeout(() => e.remove(), fxMs(ms) + 50);
}
function sizeCircle(e, r) {
  const w = r * 2 * G.cs;
  Object.assign(e.style, { width: w + 'px', height: w + 'px', margin: `${-w / 2}px 0 0 ${-w / 2}px` });   // exact area
}
const MAGIC_AREA_MS = 1100;   // how long the area stays visible after the hit (at x1)
// cast start: mark the area around the target
function magicCast(a, tg) {
  // stays up until the impact (which restarts its lifetime); the fallback covers a cancelled cast
  const c = fxTimed(`magic-circle ${magicColor(a)}`, tg.x, tg.y, (HIT_TIME * 1000) + 900);
  sizeCircle(c, a.magic.radius);
  c.appendChild(el('div', 'rune'));
  G.magicCircles.set(a.uid, c);
  fxTimed(`cast-glow ${magicColor(a)}`, a.x, a.y - 0.35, 500);
}
// impact: snap the circle onto the real centre, flash it, and drop a pillar of light
function magicImpact(ev, a) {
  const color = magicColor(a);
  let c = G.magicCircles.get(ev.uid); G.magicCircles.delete(ev.uid);
  if (!c || !c.isConnected) { c = fxTimed(`magic-circle ${color}`, ev.x, ev.y, MAGIC_AREA_MS); c.appendChild(el('div', 'rune')); }
  c.style.left = ev.x * G.cs + 'px'; c.style.top = (ev.y + OY) * G.cs + 'px';
  sizeCircle(c, ev.r); c.classList.add('impact');
  fxLife(c, MAGIC_AREA_MS);   // keep the area visible for a while after the hit
  const p = fxTimed(`light-pillar ${color}`, ev.x, ev.y, 650);
  const w = Math.max(14, ev.r * G.cs * 0.9), h = G.cs * 3.2;
  Object.assign(p.style, { width: w + 'px', height: h + 'px', margin: `${-h}px 0 0 ${-w / 2}px` });
}

function handleEvents(b) {
  for (const ev of b.events) {
    const u = ev.uid ? (b.get(ev.uid) || b.removed.find((r) => r.uid === ev.uid)) : null;
    switch (ev.type) {
      case 'attack': {
        const a = b.get(ev.uid), tg = b.get(ev.target); if (!a || !tg) break;
        const travel = (HIT_TIME / G.speed) * 1000;
        const hy = -0.35;
        if (ev.action === 'summon') { fxAt('summon-circle', a.x, a.y + 0.2); break; }
        if (ev.action === 'buff') { fxAt('buff-ring', a.x, a.y + 0.1); break; }
        if (ev.action === 'charge') break; // lancer wind-up is shown by its pose
        if (a.type === 'dragon') break; // breath is drawn on the 'breath' event
        if (a.magic && ev.action === 'attack') { magicCast(a, tg); break; } // area magic: rune circle, then light pillar
        if (['archer', 'mage', 'healer', 'lich', 'summoner', 'enchanter', 'warder'].includes(a.type)) {
          let kind = a.type === 'archer' ? 'arrow' : a.type === 'mage' ? (a.team === 'ally' ? 'fire' : 'dark') : a.type === 'lich' ? 'necro'
            : a.type === 'summoner' || a.type === 'warder' ? 'arcane' : a.type === 'enchanter' ? 'spark' : 'heal';
          const p = fxAt('proj ' + kind, a.x, a.y + hy);
          if (kind === 'arrow') p.style.transform = `rotate(${Math.atan2(tg.y - a.y, tg.x - a.x)}rad)`;
          p.style.transitionDuration = travel + 'ms';
          requestAnimationFrame(() => requestAnimationFrame(() => { p.style.left = tg.x * G.cs + 'px'; p.style.top = (tg.y + hy + OY) * G.cs + 'px'; }));
        } else {
          setTimeout(() => fxAt('slash', tg.x, tg.y + hy), travel);
        }
        break;
      }
      case 'damage': {
        if (!u) break;
        fxAt(ev.kind === 'poison' ? 'dmg poison' : ev.kind === 'magic' ? 'dmg magic' : 'dmg', u.x, u.y - 0.9, ev.amount);
        const ue = G.unitEls.get(ev.uid);
        if (ue) { ue.classList.add('hit'); setTimeout(() => ue.classList.remove('hit'), 120); }
        if (ev.kind === 'magic') {   // a thin pillar of light on everyone caught in the spell
          const att = b.get(ev.from) || b.removed.find((r) => r.uid === ev.from);
          const p = fxTimed(`light-pillar mini ${magicColor(att)}`, u.x, u.y, 500);
          const h = G.cs * 1.6; Object.assign(p.style, { width: G.cs * 0.4 + 'px', height: h + 'px', margin: `${-h}px 0 0 ${-G.cs * 0.2}px` });
        }
        break;
      }
      case 'breath': {
        const a = b.get(ev.uid); if (!a) break;
        const len = Math.hypot(ev.x2 - a.x, ev.y2 - a.y);
        const e = fxAt('breath', a.x, a.y - 0.35);
        e.style.width = len * G.cs + 'px';
        e.style.transform = `rotate(${Math.atan2(ev.y2 - a.y, ev.x2 - a.x)}rad)`;
        break;
      }
      case 'slam': fxAt('quake', ev.x, ev.y); break;
      case 'nullify': {   // magic hit a barrier: the dome flashes and the target shows "NULL"
        const a = G.auraEls.get(ev.warder);
        if (a) { a.classList.remove('block'); void a.offsetWidth; a.classList.add('block'); }
        if (u) { fxAt('dmg null', u.x, u.y - 0.9, t('battle.nullified')); fxAt('ward-flash', u.x, u.y - 0.35); }
        break;
      }
      case 'magic': magicImpact(ev, b.get(ev.uid) || b.removed.find((r) => r.uid === ev.uid)); break;
      case 'charge': if (u) fxAt('dust', u.x, u.y); break;
      case 'chant': break; // shown by the .state-cast magic circle
      case 'summon': if (u) fxAt('burst necro-burst', u.x, u.y - 0.35); break;
      case 'heal': if (u && ev.amount > 0) fxAt('dmg heal', u.x, u.y - 0.9, '+' + ev.amount); break;
      case 'removed': {
        const ue = G.unitEls.get(ev.uid); if (ue) ue.remove(); G.unitEls.delete(ev.uid); break;
      }
    }
  }
  b.events.length = 0;
}

function unitFrame(u) {
  switch (u.state) {
    case 'walk': return Math.floor(u.animTime / 0.18) % 2 ? 2 : 1;
    case 'attack': return u.stateTime < HIT_TIME ? 3 : 4;
    case 'windup': return 3;
    case 'charge': return 4;
    case 'cast': return Math.floor(u.stateTime / 0.4) % 2 ? 3 : 0;
    case 'dying': case 'dead': return u.stateTime < 0.3 ? 5 : 6;
    default: return 0;
  }
}

function renderBattle() {
  const b = G.battle; if (!b) return;
  const layer = $('#units');
  for (const u of b.units) {
    let ue = G.unitEls.get(u.uid);
    if (!ue) {
      ue = makeUnitEl(u.team, u.type, u.rank);
      ue.dataset.uid = u.uid; ue.dataset.testid = 'battle-unit';
      layer.appendChild(ue); G.unitEls.set(u.uid, ue);
    }
    positionEl(ue, u.x, u.y);
    ue.classList.toggle('facing-left', u.facing < 0);
    if (ue.dataset.state !== u.state) {
      ue.classList.remove('state-idle', 'state-walk', 'state-attack', 'state-dying', 'state-cast', 'state-windup', 'state-charge');
      // restart CSS animation for repeated attacks
      void ue.offsetWidth;
      ue.classList.add('state-' + u.state);
      ue.dataset.state = u.state;
    }
    const fr = unitFrame(u);
    if (+ue.dataset.frame !== fr) { setFrame(ue._sprite, fr); ue.dataset.frame = fr; }
    ue.classList.toggle('poisoned', u.poisonUntil > b.time && u.state !== 'dying');
    ue.classList.toggle('buffed', u.buffUntil > b.time && u.state !== 'dying');
    ue.classList.toggle('stunned', u.stunUntil > b.time && u.state !== 'dying');
    ue.classList.toggle('guarded', u.state !== 'dying' && !!b.guardOf(u));   // a shielder's guard covers it
    ue.dataset.hp = u.hp;
    ue._fill.style.width = `${(100 * u.hp) / u.maxHp}%`;
  }
  for (const [uid, ue] of G.unitEls) if (!b.units.some((u) => u.uid === uid)) { ue.remove(); G.unitEls.delete(uid); }
  // warder barriers / shielder guard rings follow their unit and vanish when it falls
  const live = new Set();
  for (const u of b.units) {
    const area = u.ward || u.guard; if (!area) continue;
    if (u.state === 'dying' || u.hp <= 0) continue;
    live.add(u.uid);
    let a = G.auraEls.get(u.uid);
    if (!a) { a = u.ward ? makeAura(area.radius, u.team) : makeGuardRing(area.radius, u.team); a.dataset.uid = u.uid; $('#auras').appendChild(a); G.auraEls.set(u.uid, a); }
    sizeAura(a, area.radius); placeAura(a, u.x, u.y);
  }
  for (const [uid, a] of G.auraEls) if (!live.has(uid)) { a.remove(); G.auraEls.delete(uid); }
  updateBattleInfo();
}

function updateBattleInfo() {
  const b = G.battle; if (!b) return;
  $('#info-left').textContent = t('battle.allies', { n: b.units.filter((u) => u.team === 'ally').length });
  $('#info-right').textContent = t('battle.enemies', { n: b.units.filter((u) => u.team === 'enemy').length });
  $('#btn-speed').textContent = t('battle.speed', { n: G.speed });
}

function finishBattle(b) {
  if (G.battle !== b) return;
  stopLoop();
  const win = b.winner === 'ally';
  const stage = store.data.stage;
  const coins = store.finishBattle(win);
  G.lastResult = { win, coins, stage };
  bgm.jingle(win ? 'win' : 'lose', 'home');
  renderTopbar();
  renderResult(G.lastResult);
  $('#overlay-result').classList.remove('hidden');
}

function renderResult(r) {
  const o = $('#overlay-result');
  o.classList.toggle('win', r.win); o.classList.toggle('lose', !r.win);
  o.dataset.result = r.win ? 'win' : 'lose';
  $('#result-title').textContent = t(r.win ? 'result.win' : 'result.lose');
  $('#result-coins').textContent = t('result.coins', { n: r.coins });
  $('#btn-next').classList.toggle('hidden', !r.win);
  $('#btn-retry').classList.toggle('hidden', r.win);
}

// ---------------- wiring ----------------
function init() {
  initTitle();
  initPrepInput();
  initSound();
  $('#btn-home-start').addEventListener('click', enterPrep);
  $('#btn-home-shop').addEventListener('click', () => openShop());
  $('#btn-modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#btn-reset').addEventListener('click', () => { if (confirm(t('home.resetConfirm'))) { store.reset(); renderHome(); } });
  $('#btn-fight').addEventListener('click', startBattle);
  $('#btn-auto').addEventListener('click', openAutoArrange);
  $('#btn-undo').addEventListener('click', doUndo);
  $('#btn-battle-home').addEventListener('click', goHome);
  $('#btn-speed').addEventListener('click', () => { G.speed = G.speed >= 4 ? 1 : G.speed * 2; updateBattleInfo(); });
  $('#btn-next').addEventListener('click', enterPrep);
  $('#btn-retry').addEventListener('click', enterPrep);
  $('#btn-result-home').addEventListener('click', goHome);
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (G.screen !== 'battle') return;
      layoutField();
      if (G.phase === 'prep') renderPrep();
      else { for (const ue of G.unitEls.values()) ue.remove(); G.unitEls.clear(); clearAuras(); renderBattle(); }
    }, 120);
  });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  applyI18n();
}

// Test / debug hooks
window.__game = {
  store, G, t, rewardCoins, bgm,
  get battle() { return G.battle; },
  get screen() { return G.screen; },
  get phase() { return G.phase; },
  setSpeed(n) { G.speed = n; },
  enableTrace() { G.traceEnabled = true; if (G.battle && !G.battle.trace) G.battle.trace = []; },
  setStage(n) { store.data.stage = n; store.save(); if (G.screen === 'battle' && G.phase === 'prep') layoutField(); refresh(); },
  setCoins(n) { store.data.coins = n; store.save(); refresh(); },
  refresh,
};

init();

// PWA: register the service worker (installable, works offline). Needs https or localhost.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

// PWA install button. Chromium fires beforeinstallprompt; iOS / iPadOS Safari never prompts, so we show
// the "Share → Add to Home Screen" steps instead. iPadOS reports a Mac user agent, hence the touch check.
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let installPrompt = null;
function showInstallGuide() {
  openModal(() => {
    const box = $('#modal-content'); box.innerHTML = ''; box.dataset.testid = 'install-guide';
    const h = el('h3'); h.textContent = t('pwa.title'); box.appendChild(h);
    const ol = el('ol', 'install-steps');
    for (const k of ['pwa.step1', 'pwa.step2', 'pwa.step3']) { const li = el('li'); li.textContent = t(k); ol.appendChild(li); }
    box.appendChild(ol);
  });
}
const btnInstall = $('#btn-install');
if (!isStandalone() && isIOS()) btnInstall.classList.remove('hidden');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; btnInstall.classList.remove('hidden'); });
window.addEventListener('appinstalled', () => { installPrompt = null; btnInstall.classList.add('hidden'); });
btnInstall.addEventListener('click', async () => {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; btnInstall.classList.add('hidden'); }
  else showInstallGuide();
});

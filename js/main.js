import { TYPES, ITEMS, SLOTS, RECRUIT_COST, COLS, FIELD_ROWS, ALLY_ROW0, ZONE_ROWS, MAX_RANK,
  computeStats, enemyWave, cellToField, rewardCoins } from './data.js';
import { Battle, makeUnit, HIT_TIME } from './battle.js';
import { Store } from './store.js';
import { t, setLang, getLang, detectLang, LANGS } from './i18n.js';
import { sheet, spriteKey, icon, FRAMES } from './sprites.js';

const OY = 0.4; // top padding (cells) so front sprites are not clipped
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, attrs = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

const store = new Store(window.localStorage);
setLang(store.data.lang || detectLang(navigator.language));

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

// ---------------- title ----------------
function initTitle() {
  const box = $('#title-sprites');
  const sprites = [];
  for (const team of ['ally', 'enemy']) for (const type of TYPES) {
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
}

// ---------------- home ----------------
function goHome() {
  stopLoop();
  G.battle = null; G.phase = null;
  $('#overlay-result').classList.add('hidden');
  showScreen('home');
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
    const rk = el('span', 'rank-badge'); rk.textContent = `★${c.rank}`; card.appendChild(rk);
    const eq = el('div', 'equip-icons');
    for (const slot of SLOTS) if (c.equip[slot]) { const im = el('img'); im.src = icon(slot); im.title = t('item.' + c.equip[slot]); eq.appendChild(im); }
    card.appendChild(eq);
    card.addEventListener('click', () => openCharDetail(c.id));
    roster.appendChild(card);
  }
  const inv = $('#inventory'); inv.innerHTML = '';
  const entries = Object.entries(store.data.inventory).filter(([, n]) => n > 0);
  if (!entries.length) { const p = el('p', 'hint'); p.textContent = t('home.noItems'); inv.appendChild(p); }
  for (const [id, n] of entries) {
    const d = el('div', 'inv-item', { 'data-item': id });
    const im = el('img'); im.src = icon(ITEMS[id].slot); d.appendChild(im);
    d.appendChild(document.createTextNode(`${t('item.' + id)} ×${n}`));
    inv.appendChild(d);
  }
}

function itemDesc(id) {
  const it = ITEMS[id]; const parts = [];
  if (it.atk) parts.push(`${t('stat.atk')}+${it.atk}`);
  if (it.hp) parts.push(`${t('stat.hp')}+${it.hp}`);
  if (it.def) parts.push(`${t('stat.def')}+${it.def}`);
  if (it.haste) parts.push(`${t('stat.interval')}-${Math.round(it.haste * 100)}%`);
  return `${t('slot.' + it.slot)}: ${parts.join(' ')}`;
}

function openModal(render) {
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
    const h = el('h3'); h.textContent = `${charName(c.type)}  ★${c.rank}/${MAX_RANK}`; head.appendChild(h); box.appendChild(head);
    const s = computeStats(c.type, c.rank, c.equip);
    const tbl = el('table', 'stat-table');
    const rows = [['stat.hp', s.maxHp], ['stat.atk', s.atk], ['stat.def', s.def], ['stat.range', s.range], ['stat.interval', s.interval + 's']];
    if (s.heal) rows.push(['stat.heal', s.heal]);
    for (const [k, v] of rows) { const tr = el('tr'); tr.innerHTML = `<td>${t(k)}</td><td data-stat="${k}">${v}</td>`; tbl.appendChild(tr); }
    box.appendChild(tbl);
    const eh = el('h3'); eh.textContent = t('equip.title'); box.appendChild(eh);
    for (const slot of SLOTS) {
      const row = el('div', 'slot-row');
      const lb = el('span'); lb.textContent = t('slot.' + slot); row.appendChild(lb);
      const sel = el('select', '', { 'data-slot': slot });
      const none = el('option'); none.value = ''; none.textContent = t('equip.none'); sel.appendChild(none);
      const ids = new Set(Object.keys(store.data.inventory).filter((i) => ITEMS[i].slot === slot && store.data.inventory[i] > 0));
      if (c.equip[slot]) ids.add(c.equip[slot]);
      for (const i of ids) { const o = el('option'); o.value = i; o.textContent = `${t('item.' + i)} (${itemDesc(i)})`; sel.appendChild(o); }
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
        const nm = el('div', 'name'); nm.innerHTML = `${charName(type)}<div class="desc">${t('stat.hp')} ${s.maxHp} / ${t('stat.atk')} ${s.atk} / ${t('stat.range')} ${s.range}</div>`; row.appendChild(nm);
        const b = el('button', 'btn small primary', { 'data-buy-char': type }); b.textContent = t('shop.buy', { n: RECRUIT_COST[type] });
        b.disabled = store.data.coins < RECRUIT_COST[type];
        b.addEventListener('click', () => {
          if (store.recruit(type)) toast(t('shop.recruited', { name: charName(type) })); else toast(t('shop.notEnough'));
          G.modalRender(); renderHome();
        });
        row.appendChild(b); list.appendChild(row);
      }
    } else {
      for (const [id, it] of Object.entries(ITEMS)) {
        const row = el('div', 'shop-item');
        const im = el('img'); im.src = icon(it.slot); row.appendChild(im);
        const nm = el('div', 'name'); nm.innerHTML = `${t('item.' + id)}<div class="desc">${itemDesc(id)}</div>`; row.appendChild(nm);
        const b = el('button', 'btn small primary', { 'data-buy-item': id }); b.textContent = t('shop.buy', { n: it.cost });
        b.disabled = store.data.coins < it.cost;
        b.addEventListener('click', () => {
          if (store.buyItem(id)) toast(t('shop.bought', { name: t('item.' + id) })); else toast(t('shop.notEnough'));
          G.modalRender(); renderHome();
        });
        row.appendChild(b); list.appendChild(row);
      }
    }
  });
}

// ---------------- field layout ----------------
function layoutField() {
  const wrap = $('#field-wrap');
  const w = wrap.clientWidth - 8, h = wrap.clientHeight - 8;
  const cs = Math.max(24, Math.floor(Math.min(w / COLS, h / (FIELD_ROWS + OY))));
  G.cs = cs;
  const f = $('#field'); f.style.width = cs * COLS + 'px'; f.style.height = Math.round(cs * (FIELD_ROWS + OY)) + 'px';
  const cells = $('#cells'); cells.innerHTML = '';
  for (let r = 0; r < FIELD_ROWS; r++) for (let c = 0; c < COLS; c++) {
    const isEnemy = r < ZONE_ROWS, isAlly = r >= ALLY_ROW0;
    if (!isEnemy && !isAlly) continue;
    const cell = el('div', 'cell ' + (isAlly ? 'ally' : 'enemy'));
    if (isAlly) { cell.dataset.cell = (r - ALLY_ROW0) * COLS + c; cell.dataset.testid = 'cell'; }
    Object.assign(cell.style, { left: c * cs + 'px', top: Math.round((r + OY) * cs) + 'px', width: cs + 'px', height: cs + 'px' });
    cells.appendChild(cell);
  }
  const line = el('div', 'mid-line'); line.style.top = Math.round((FIELD_ROWS / 2 + OY) * cs) + 'px'; cells.appendChild(line);
}

function unitSize() { return Math.round(G.cs * 1.15); }

function makeUnitEl(team, type, rank) {
  const size = unitSize();
  const u = el('div', `unit team-${team}`);
  u.style.width = size + 'px'; u.style.height = size + 'px';
  u.appendChild(el('div', 'shadow'));
  const s = spriteEl(team, type); u.appendChild(s);
  const hp = el('div', 'hpbar'); const fill = el('div', 'fill'); fill.style.width = '100%'; hp.appendChild(fill); u.appendChild(hp);
  const rk = el('div', 'rank'); rk.textContent = `★${rank}`; u.appendChild(rk);
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
  const units = $('#units'); units.innerHTML = '';
  // enemy preview
  const wave = enemyWave(store.data.stage);
  for (const e of wave.units) {
    const u = makeUnitEl('enemy', e.type, e.rank); u.classList.add('preview');
    const p = cellToField('enemy', e.cell); positionEl(u, p.x, p.y);
    units.appendChild(u);
  }
  // placed allies
  for (const [cid, cell] of Object.entries(store.data.formation)) {
    const c = store.char(+cid); if (!c) { delete store.data.formation[cid]; continue; }
    const u = makeUnitEl('ally', c.type, c.rank);
    u.classList.add('placed'); u.dataset.charId = c.id; u.dataset.cell = cell; u.dataset.testid = 'placed-unit';
    if (G.selected === c.id) u.classList.add('selected');
    const p = cellToField('ally', cell); positionEl(u, p.x, p.y);
    units.appendChild(u);
  }
  // bench
  const list = $('#bench-list'); list.innerHTML = '';
  const bench = store.data.roster.filter((c) => store.cellOf(c.id) == null)
    .sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.rank - a.rank);
  for (const c of bench) {
    const card = el('div', 'bench-card' + (G.selected === c.id ? ' selected' : ''), { 'data-char-id': c.id, 'data-type': c.type, 'data-rank': c.rank, 'data-testid': 'bench-card' });
    card.appendChild(spriteEl('ally', c.type));
    const rk = el('span', 'rank-badge'); rk.textContent = `★${c.rank}`; card.appendChild(rk);
    list.appendChild(card);
  }
  $('#info-left').textContent = t('prep.deploy', { n: store.placedCount(), max: store.limit() });
  $('#info-left').dataset.testid = 'deploy-count';
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
    if (store.place(charId, cell) === 'limit') toast(t('prep.limit'));
  } else if (occ.id === charId) {
    // nothing
  } else if (occ.type === c.type) {
    const r = store.merge(charId, occ.id);
    if (r.ok) { G.selected = null; renderPrep(); flashMerged(occ.id); toast(t('prep.merged', { name: charName(occ.type), rank: r.rank })); return; }
    toast(t(r.reason === 'max' ? 'prep.maxRank' : 'prep.cannotMerge'));
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
  if (fx < 0 || fx >= COLS || fy < ALLY_ROW0 || fy >= FIELD_ROWS) return null;
  return (Math.floor(fy) - ALLY_ROW0) * COLS + Math.floor(fx);
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
      if (cell != null) dropOnCell(d.charId, cell);
      else if (inBench(e.clientX, e.clientY)) dropOnBench(d.charId);
      return;
    }
    // tap
    if (d.from === 'field') {
      if (d.cell == null) return;
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
  const allies = Object.entries(store.data.formation).map(([cid, cell]) => {
    const c = store.char(+cid);
    return makeUnit({ team: 'ally', type: c.type, rank: c.rank, equip: c.equip, cell, charId: c.id });
  });
  const wave = enemyWave(store.data.stage);
  const enemies = wave.units.map((e) => makeUnit({ team: 'enemy', type: e.type, rank: e.rank, equip: {}, cell: e.cell, mult: wave.mult }));
  G.battle = new Battle({ allies, enemies, seed: store.data.stage * 31 + 7 });
  if (G.traceEnabled) G.battle.trace = [];
  G.phase = 'battle'; G.selected = null;
  document.body.dataset.phase = 'battle';
  $('#field').classList.add('fighting');
  $('#prep-panel').classList.add('hidden');
  $('#battle-panel').classList.remove('hidden');
  $('#btn-speed').textContent = t('battle.speed', { n: G.speed });
  $('#units').innerHTML = ''; $('#fx').innerHTML = '';
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
function stopLoop() { cancelAnimationFrame(G.rafId); G.rafId = 0; }

function fxAt(cls, x, y, text) {
  const e = el('div', cls); e.style.left = x * G.cs + 'px'; e.style.top = (y + OY) * G.cs + 'px';
  if (text != null) e.textContent = text;
  $('#fx').appendChild(e); setTimeout(() => e.remove(), 900);
  return e;
}

function handleEvents(b) {
  for (const ev of b.events) {
    const u = ev.uid ? (b.get(ev.uid) || b.removed.find((r) => r.uid === ev.uid)) : null;
    switch (ev.type) {
      case 'attack': {
        const a = b.get(ev.uid), tg = b.get(ev.target); if (!a || !tg) break;
        const travel = (HIT_TIME / G.speed) * 1000;
        const hy = -0.35;
        if (['archer', 'mage', 'healer'].includes(a.type)) {
          let kind = a.type === 'archer' ? 'arrow' : a.type === 'mage' ? (a.team === 'ally' ? 'fire' : 'dark') : 'heal';
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
        fxAt('dmg', u.x, u.y - 0.9, ev.amount);
        const ue = G.unitEls.get(ev.uid);
        if (ue) { ue.classList.add('hit'); setTimeout(() => ue.classList.remove('hit'), 120); }
        const att = b.get(ev.from); if (att && att.type === 'mage') fxAt('burst', u.x, u.y - 0.35);
        break;
      }
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
      ue.classList.remove('state-idle', 'state-walk', 'state-attack', 'state-dying');
      // restart CSS animation for repeated attacks
      void ue.offsetWidth;
      ue.classList.add('state-' + u.state);
      ue.dataset.state = u.state;
    }
    const fr = unitFrame(u);
    if (+ue.dataset.frame !== fr) { setFrame(ue._sprite, fr); ue.dataset.frame = fr; }
    ue.dataset.hp = u.hp;
    ue._fill.style.width = `${(100 * u.hp) / u.maxHp}%`;
  }
  for (const [uid, ue] of G.unitEls) if (!b.units.some((u) => u.uid === uid)) { ue.remove(); G.unitEls.delete(uid); }
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
  $('#btn-home-start').addEventListener('click', enterPrep);
  $('#btn-home-shop').addEventListener('click', () => openShop());
  $('#btn-modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#btn-reset').addEventListener('click', () => { if (confirm(t('home.resetConfirm'))) { store.reset(); renderHome(); } });
  $('#btn-fight').addEventListener('click', startBattle);
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
      else { for (const ue of G.unitEls.values()) ue.remove(); G.unitEls.clear(); renderBattle(); }
    }, 120);
  });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  applyI18n();
}

// Test / debug hooks
window.__game = {
  store, G, t, rewardCoins,
  get battle() { return G.battle; },
  get screen() { return G.screen; },
  get phase() { return G.phase; },
  setSpeed(n) { G.speed = n; },
  enableTrace() { G.traceEnabled = true; if (G.battle && !G.battle.trace) G.battle.trace = []; },
  setStage(n) { store.data.stage = n; store.save(); refresh(); },
  setCoins(n) { store.data.coins = n; store.save(); refresh(); },
};

init();

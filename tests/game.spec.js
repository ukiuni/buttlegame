// E2E tests for Pixel Brigade — covers every requirement listed in prompt.md.
import { test, expect } from '@playwright/test';
import { STRINGS, LANGS } from '../js/i18n.js';
import { rewardCoins, TYPES } from '../js/data.js';

test.use({ locale: 'ja-JP' });
const JA = STRINGS.ja;

// ---------- helpers ----------
async function gotoHome(page) {
  await page.goto('/index.html');
  await expect(page.locator('#screen-title')).toBeVisible();
  await page.click('#btn-title-start');
  await expect(page.locator('#screen-home')).toBeVisible();
}
async function gotoPrep(page, { stage } = {}) {
  await gotoHome(page);
  if (stage) await page.evaluate((s) => __game.setStage(s), stage);
  await page.click('#btn-home-start');
  await expect(page.locator('#screen-battle')).toBeVisible();
  await expect(page.locator('#prep-panel')).toBeVisible();
}
const placed = (page, sel = '') => page.locator(`.unit.placed${sel}`);
const cell = (page, i) => page.locator(`.cell.ally[data-cell="${i}"]`);
// Tap the centre of an ally tile (works whether or not a unit stands on it).
async function tapCell(page, i) {
  const b = await cell(page, i).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const bench = (page, sel = '') => page.locator(`.bench-card${sel}`);

// Install recorder of DOM unit states/frames and removals.
async function installRecorder(page) {
  await page.evaluate(() => {
    const rec = { frames: {}, dyingUids: new Set(), removedUids: new Set(), dyingSeenAt: {}, removedAt: {} };
    window.__rec = rec;
    const layer = document.querySelector('#units');
    const note = (n) => {
      if (!n.dataset || !n.dataset.uid) return;
      const key = `${n.dataset.state}:${n.dataset.frame}`;
      rec.frames[key] = (rec.frames[key] || 0) + 1;
      if (n.dataset.state === 'dying') { rec.dyingUids.add(n.dataset.uid); rec.dyingSeenAt[n.dataset.uid] ??= performance.now(); }
    };
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes') note(m.target);
        for (const r of m.removedNodes || []) if (r.dataset && r.dataset.uid) { rec.removedUids.add(r.dataset.uid); rec.removedAt[r.dataset.uid] = performance.now(); }
      }
    }).observe(layer, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'data-frame'] });
  });
}
async function startBattle(page, { speed = 1, trace = true } = {}) {
  await page.evaluate(({ speed, trace }) => { __game.setSpeed(speed); if (trace) __game.enableTrace(); }, { speed, trace });
  await page.click('#btn-fight');
  await expect(page.locator('#battle-panel')).toBeVisible();
  await installRecorder(page);
}
async function waitResult(page) {
  await expect(page.locator('#overlay-result')).toBeVisible({ timeout: 60_000 });
}

// =============== Title / Home ===============
test('タイトル画面からホーム画面に移動できる', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#screen-title')).toBeVisible();
  await expect(page.locator('#screen-title .logo')).toHaveText(JA['game.title']);
  await page.click('#btn-title-start');
  await expect(page.locator('#screen-home')).toBeVisible();
  await expect(page.locator('#screen-title')).toBeHidden();
});

test('ホーム画面で保持キャラクタとコインを確認できる', async ({ page }) => {
  await gotoHome(page);
  await expect(page.locator('#home-coins')).toHaveText('100');
  const cards = page.locator('[data-testid="roster-card"]');
  await expect(cards).toHaveCount(6);
  for (const type of TYPES.slice(0, 5)) await expect(page.locator(`.roster-card[data-type="${type}"]`).first()).toBeVisible();
  await expect(page.locator('.roster-card[data-type="sword"]').first()).toContainText(JA['char.sword']);
  await expect(page.locator('#roster-title')).toHaveText(JA['home.roster'].replace('{n}', '6'));
  // sprites are generated pixel-art images
  const bg = await page.locator('.roster-card .sprite').first().evaluate((e) => e.style.backgroundImage);
  expect(bg).toContain('data:image/png');
});

test('ホーム画面からゲームスタートできる', async ({ page }) => {
  await gotoHome(page);
  await page.click('#btn-home-start');
  await expect(page.locator('#screen-battle')).toBeVisible();
  await expect(page.locator('#prep-panel')).toBeVisible();
  await expect(page.locator('#battle-stage')).toHaveText(JA['common.stage'].replace('{n}', '1'));
  await expect(page.locator('.cell.ally')).toHaveCount(15);
});

// =============== Placement / merge ===============
test('ゲームをスタートすると各種キャラクタを配置できる（タップ・ドラッグ）', async ({ page }) => {
  await gotoPrep(page);
  // return everything to the bench
  for (let i = 0; i < 4; i++) {
    await placed(page).first().click();
    await page.locator('.bench-label').click();
  }
  await expect(placed(page)).toHaveCount(0);
  // the bench shows one stacked card per class (2 swordsmen -> one card ×2)
  await expect(bench(page)).toHaveCount(5);
  await expect(bench(page, '[data-type="sword"]')).toHaveAttribute('data-count', '2');
  // place each type by tap: select bench card -> tap cell
  const cells = [0, 1, 2, 3];
  for (const [i, type] of ['sword', 'mage', 'archer', 'shield'].entries()) {
    await bench(page, `[data-type="${type}"]`).first().click();
    await expect(bench(page, `[data-type="${type}"]`).first()).toHaveClass(/selected/);
    await tapCell(page, cells[i]);
    await expect(placed(page, `[data-type="${type}"][data-cell="${cells[i]}"]`)).toHaveCount(1);
  }
  // place healer by drag & drop
  const src = bench(page, '[data-type="healer"]').first();
  const dst = cell(page, 12);
  const sb = await src.boundingBox(); const db = await dst.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 20, sb.y + sb.height / 2 - 20, { steps: 3 });
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(placed(page, '[data-type="healer"][data-cell="12"]')).toHaveCount(1);
  for (const type of TYPES.slice(0, 5)) await expect(placed(page, `[data-type="${type}"]`)).toHaveCount(1);
  // no deployment limit and no limit display: the 6th unit can be placed too
  await expect(page.locator('#info-left')).toHaveText('');
  await bench(page, '[data-type="sword"]').first().click();
  await tapCell(page, 14);
  await expect(placed(page)).toHaveCount(6);
  await expect(placed(page, '[data-type="sword"][data-cell="14"]')).toHaveCount(1);
  await expect(bench(page)).toHaveCount(0);
  // moving a placed unit to an empty cell
  await placed(page, '[data-type="archer"]').click();
  await tapCell(page, 7);
  await expect(placed(page, '[data-type="archer"][data-cell="7"]')).toHaveCount(1);
});

test('同一のキャラクタは合体できる（ランクアップ）', async ({ page }) => {
  await gotoPrep(page);
  await expect(placed(page, '[data-type="sword"]')).toHaveCount(1);
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '1');
  // tap merge: bench sword -> placed sword
  await bench(page, '[data-type="sword"]').click();
  const swordCell = await placed(page, '[data-type="sword"]').getAttribute('data-cell');
  await tapCell(page, swordCell);
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '2');
  await expect(bench(page, '[data-type="sword"]')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('2');
  let roster = await page.evaluate(() => __game.store.data.roster.map((c) => `${c.type}:${c.rank}`));
  expect(roster.filter((r) => r.startsWith('sword'))).toEqual(['sword:2']);
  expect(roster).toHaveLength(5);
  // bulk merge: drag the bench stack onto the placed swordsman -> choose how many to use
  await page.evaluate(() => { const s = __game.store; s.data.coins = 10000; s.recruitMany('sword', 9); });
  await page.click('#btn-battle-home');
  await page.click('#btn-home-start');
  await expect(bench(page, '[data-type="sword"]')).toHaveAttribute('data-count', '9');
  const dragStack = async () => {
    const sb = await bench(page, '[data-type="sword"]').boundingBox(); const db = await placed(page, '[data-type="sword"]').boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(db.x + db.width / 2, db.y + db.height * 0.7, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('[data-testid="bulk-merge"]')).toBeVisible();
  };
  await dragStack();
  await expect(page.locator('[data-testid="bulk-count"]')).toHaveText('9');           // defaults to max
  await expect(page.locator('[data-testid="bulk-preview"]')).toContainText('★2 → ★11');
  await page.click('[data-bulk="minus"]'); await page.click('[data-bulk="minus"]');
  await expect(page.locator('[data-testid="bulk-count"]')).toHaveText('7');
  await expect(page.locator('[data-testid="bulk-preview"]')).toContainText('★2 → ★9');
  await page.click('[data-testid="bulk-confirm"]');
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '9');
  await expect(bench(page, '[data-type="sword"]')).toHaveAttribute('data-count', '2');
  // undo restores everything
  await expect(page.locator('[data-testid="undo-bar"]')).toBeVisible();
  await page.click('#btn-undo');
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '2');
  await expect(bench(page, '[data-type="sword"]')).toHaveAttribute('data-count', '9');
  await dragStack();
  await page.click('[data-bulk="max"]');
  await page.click('[data-testid="bulk-confirm"]');
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '11');
  await expect(bench(page, '[data-type="sword"]')).toHaveCount(0);
  // ranks add up when merging (★11 + ★5 = ★16)
  await page.evaluate(() => { const s = __game.store; s.recruit('sword').rank = 5; s.save(); __game.refresh(); });
  await bench(page, '[data-type="sword"]').first().click();
  await tapCell(page, await placed(page, '[data-type="sword"]').getAttribute('data-cell'));
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '16');
  // no rank cap: ★16 + ★90 = ★106, and a ★100+ character keeps merging
  await page.evaluate(() => { const s = __game.store; s.recruit('sword').rank = 90; s.save(); __game.refresh(); });
  await bench(page, '[data-type="sword"]').first().click();
  await tapCell(page, await placed(page, '[data-type="sword"]').getAttribute('data-cell'));
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '106');
  await page.evaluate(() => { const s = __game.store; s.recruit('sword').rank = 12239; s.save(); __game.refresh(); });
  await bench(page, '[data-type="sword"]').first().click();
  await tapCell(page, await placed(page, '[data-type="sword"]').getAttribute('data-cell'));
  const big = placed(page, '[data-type="sword"]');
  await expect(big).toHaveAttribute('data-rank', '12345');
  await expect(big.locator('.rank')).toHaveText('★12K');   // huge ranks are shortened on the badge
});

test('ステージ100からは自陣・敵陣が10×5の50マスになる', async ({ page }) => {
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await gotoPrep(page, { stage: 99 });
  await expect(page.locator('.cell.ally')).toHaveCount(15);
  await expect(page.locator('.cell.enemy')).toHaveCount(15);
  await page.click('#btn-battle-home');
  await page.evaluate(() => { const s = __game.store; s.data.coins = 1e6; s.recruitMany('sword', 60); s.data.roster.forEach((c) => { c.rank = 100; }); s.save(); __game.setStage(100); });
  await page.click('#btn-home-start');
  await expect(page.locator('.cell.ally')).toHaveCount(50);
  await expect(page.locator('.cell.enemy')).toHaveCount(50);
  // the 4 units placed on the small board were carried over (same rows, centred)
  await expect(placed(page)).toHaveCount(4);
  await expect(placed(page, '[data-cell="4"]')).toHaveCount(1);
  // tiles beyond the old 5x3 area can be used
  await bench(page, '[data-type="sword"]').click();
  await tapCell(page, 49);
  await expect(placed(page, '[data-cell="49"]')).toHaveCount(1);
  // auto arrange fills all 50 tiles
  await page.click('#btn-auto');
  await page.click('[data-testid="auto-confirm"]');
  await expect(placed(page)).toHaveCount(50);
  // the field fits on screen
  const fb = await page.locator('#field').boundingBox(); const vp = page.viewportSize();
  expect(fb.x).toBeGreaterThanOrEqual(0); expect(fb.x + fb.width).toBeLessThanOrEqual(vp.width + 1);
  // fight on the big board
  await page.click('#btn-fight');
  await expect(page.locator('[data-testid="battle-unit"]')).toHaveCount(50 + 15);
  await page.evaluate(() => __game.setSpeed(8));
  await expect(page.locator('#overlay-result')).toBeVisible({ timeout: 60000 });
  expect(errs).toEqual([]);
});

test('おまかせ編成：空きマスを埋めて残りを合体し、元に戻せる', async ({ page }) => {
  await gotoHome(page);
  await page.evaluate(() => { const s = __game.store; s.data.coins = 100000; s.recruitMany('sword', 20); s.recruitMany('archer', 6); s.save(); });
  await page.click('#btn-home-start');
  const before = await page.evaluate(() => __game.store.snapshot());
  await page.click('#btn-auto');
  await expect(page.locator('[data-testid="auto-arrange"]')).toBeVisible();
  await expect(page.locator('[data-testid="auto-plan"] li').first()).toBeVisible();
  // switch strategy -> preview changes
  const evenText = await page.locator('[data-testid="auto-plan"]').textContent();
  await page.click('[data-mode="front"]');
  await expect(page.locator('[data-testid="auto-plan"]')).not.toHaveText(evenText);
  await page.click('[data-mode="even"]');
  await page.click('[data-testid="auto-confirm"]');
  await expect(placed(page)).toHaveCount(15);                    // every tile filled
  await expect(bench(page)).toHaveCount(0);                      // the rest merged
  const total = await page.evaluate(() => __game.store.data.roster.reduce((a, c) => a + c.rank, 0));
  expect(total).toBe(32);                                        // ranks are conserved (6 + 26 recruits)
  // melee in front, ranged in back
  const front = await placed(page, '[data-type="sword"]').evaluateAll((els) => els.map((e) => +e.dataset.cell));
  expect(Math.min(...front)).toBeLessThan(5);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => __game.store.snapshot())).toBe(before);
  await expect(placed(page)).toHaveCount(4);
});

test('キャラ詳細から一括合体・ロック（ロック中は素材にならない）', async ({ page }) => {
  await gotoHome(page);
  await page.evaluate(() => { const s = __game.store; s.data.coins = 10000; s.recruitMany('archer', 4); s.save(); __game.refresh(); });
  const placedArcherId = await page.evaluate(() => { const s = __game.store; return s.data.roster.find((c) => c.type === 'archer' && s.cellOf(c.id) != null).id; });
  // lock one benched archer
  const lockedId = await page.evaluate(() => { const s = __game.store; const c = s.data.roster.find((x) => x.type === 'archer' && s.cellOf(x.id) == null); return c.id; });
  await page.locator(`.roster-card[data-char-id="${lockedId}"]`).click();
  await page.click('[data-testid="btn-lock"]');
  await expect(page.locator('[data-testid="btn-lock"]')).toHaveText(JA['lock.on']);
  await page.click('#btn-modal-close');
  await expect(page.locator(`.roster-card[data-char-id="${lockedId}"] .lock-mark`)).toBeVisible();
  // bulk merge from the placed archer's detail screen
  await page.locator(`.roster-card[data-char-id="${placedArcherId}"]`).click();
  await expect(page.locator('[data-testid="btn-bulk"]')).toHaveText(JA['bulk.open'].replace('{n}', '3'));
  await page.click('[data-testid="btn-bulk"]');
  await expect(page.locator('[data-testid="bulk-count"]')).toHaveText('3');
  await page.click('[data-testid="bulk-confirm"]');
  const st = await page.evaluate(([p, l]) => { const s = __game.store; return { rank: s.char(p).rank, locked: !!s.char(l) }; }, [placedArcherId, lockedId]);
  expect(st).toEqual({ rank: 4, locked: true });
  // a locked unit can't be merged by hand either
  await page.click('#btn-home-start');
  await page.evaluate(() => { __game.G.selected = null; });
  await bench(page, '[data-type="archer"]').click();
  await tapCell(page, await placed(page, `[data-char-id="${placedArcherId}"]`).getAttribute('data-cell'));
  await expect(page.locator('#toast')).toHaveText(JA['prep.locked']);
});

test('ショップで×10・最大まとめて雇用でき、元に戻せる', async ({ page }) => {
  await gotoHome(page);
  await page.evaluate(() => __game.setCoins(1000));
  await page.click('#btn-home-shop');
  await page.click('[data-buy-char10="sword"]');                  // 10 x 50
  await expect(page.locator('[data-testid="shop-coins"]')).toHaveText('500');
  await expect(page.locator('[data-buy-charmax="lancer"]')).toHaveText(JA['shop.buyMax'].replace('{k}', '7'));
  await page.click('[data-buy-charmax="lancer"]');                // 7 x 70 = 490
  await expect(page.locator('[data-testid="shop-coins"]')).toHaveText('10');
  await expect(page.locator('[data-buy-char10="sword"]')).toBeDisabled();
  let n = await page.evaluate(() => __game.store.data.roster.length);
  expect(n).toBe(6 + 10 + 7);
  await page.click('#btn-undo');
  await expect(page.locator('[data-testid="shop-coins"]')).toHaveText('500');
  n = await page.evaluate(() => __game.store.data.roster.length);
  expect(n).toBe(16);
});

test('別のキャラクタは合体できない', async ({ page }) => {
  await gotoPrep(page);
  const before = await page.evaluate(() => JSON.stringify(__game.store.data.roster.map((c) => [c.id, c.type, c.rank])));
  // bench mage onto placed sword
  await bench(page, '[data-type="mage"]').click();
  const swordCell = await placed(page, '[data-type="sword"]').getAttribute('data-cell');
  await tapCell(page, swordCell);
  await expect(page.locator('#toast')).toHaveText(JA['prep.cannotMerge']);
  // placed archer onto placed healer
  await placed(page, '[data-type="archer"]').click();
  await tapCell(page, await placed(page, '[data-type="healer"]').getAttribute('data-cell'));
  await expect(page.locator('#toast')).toHaveText(JA['prep.cannotMerge']);
  const after = await page.evaluate(() => JSON.stringify(__game.store.data.roster.map((c) => [c.id, c.type, c.rank])));
  expect(after).toBe(before); // nobody consumed, no rank changes
  const ranks = await page.locator('.unit.placed, .bench-card').evaluateAll((els) => els.map((e) => e.dataset.rank));
  expect(ranks.every((r) => r === '1')).toBe(true);
});

// =============== Battle ===============
test('ゲームを開始できる', async ({ page }) => {
  await gotoPrep(page);
  await startBattle(page);
  expect(await page.evaluate(() => __game.phase)).toBe('battle');
  await expect(page.locator('[data-testid="battle-unit"][data-team="ally"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="battle-unit"][data-team="enemy"]')).toHaveCount(3);
  await expect(page.locator('#prep-panel')).toBeHidden();
});

test('開始すると自分と敵のキャラが戦い始め、射程に入るまで移動モーションで移動する', async ({ page }) => {
  await gotoPrep(page);
  const start = await page.evaluate(() => null);
  await startBattle(page, { speed: 1 });
  const initial = await page.evaluate(() => __game.battle.units.map((u) => ({ uid: u.uid, x: u.x, y: u.y })));
  // a walking unit in the DOM shows walk frames (1/2)
  await expect(page.locator('[data-testid="battle-unit"][data-state="walk"]').first()).toBeVisible();
  await page.waitForFunction(() => window.__rec.frames['walk:1'] > 0 && window.__rec.frames['walk:2'] > 0);
  // both teams start fighting
  await page.waitForFunction(() => {
    const tr = __game.battle.trace;
    return tr.some((e) => e.kind === 'attack' && e.team === 'ally') && tr.some((e) => e.kind === 'attack' && e.team === 'enemy');
  }, null, { timeout: 30_000 });
  const res = await page.evaluate((initial) => {
    const tr = __game.battle.trace;
    const moved = initial.filter((i) => { const u = __game.battle.get(i.uid); return u && Math.hypot(u.x - i.x, u.y - i.y) > 0.3; }).length;
    return {
      moved,
      walks: tr.filter((e) => e.kind === 'walk'),
      attacks: tr.filter((e) => e.kind === 'attack'),
    };
  }, initial);
  expect(res.moved).toBeGreaterThan(0);
  // walking only while target is out of range; attacking only when in range
  expect(res.walks.length).toBeGreaterThan(0);
  for (const w of res.walks) expect(w.dist).toBeGreaterThan(w.range);
  for (const a of res.attacks) expect(a.dist).toBeLessThanOrEqual(a.range + 1e-9);
  // ranges differ per character: archers (4.2) start attacking from further away than swords (1.1)
  const ranges = Object.fromEntries((await page.evaluate(() => __game.battle.units.map((u) => [u.type, u.range]))));
  expect(ranges.archer).toBeGreaterThan(ranges.sword);
  void start;
});

test('攻撃可能範囲に入ると攻撃モーションを取り、相手チームに攻撃する', async ({ page }) => {
  await gotoPrep(page);
  await startBattle(page, { speed: 1 });
  await page.waitForFunction(() => window.__rec.frames['attack:3'] > 0 && window.__rec.frames['attack:4'] > 0, null, { timeout: 30_000 });
  await expect(page.locator('[data-testid="battle-unit"].state-attack').first()).toBeAttached({ timeout: 15_000 });
  const tr = await page.evaluate(() => __game.battle.trace);
  const attacks = tr.filter((e) => e.kind === 'attack' && e.action === 'attack');
  expect(attacks.length).toBeGreaterThan(0);
  for (const a of attacks) expect(a.targetTeam).not.toBe(a.team);
  const dmg = tr.filter((e) => e.kind === 'damage');
  expect(dmg.length).toBeGreaterThan(0);
});

test('味方同士・敵同士の攻撃はダメージを与えない', async ({ page }) => {
  await gotoPrep(page);
  await startBattle(page, { speed: 0 });
  const r = await page.evaluate(() => {
    const b = __game.battle;
    const allies = b.units.filter((u) => u.team === 'ally');
    const enemies = b.units.filter((u) => u.team === 'enemy');
    const hp = (u) => u.hp;
    const out = {};
    const a0 = hp(allies[1]); out.aa = b.applyDamage(allies[0], allies[1]); out.aaHp = [a0, hp(allies[1])];
    const e0 = hp(enemies[1]); out.ee = b.applyDamage(enemies[0], enemies[1], 999); out.eeHp = [e0, hp(enemies[1])];
    const x0 = hp(enemies[0]); out.ae = b.applyDamage(allies[0], enemies[0]); out.aeHp = [x0, hp(enemies[0])];
    return out;
  });
  expect(r.aa).toBe(0); expect(r.aaHp[1]).toBe(r.aaHp[0]);
  expect(r.ee).toBe(0); expect(r.eeHp[1]).toBe(r.eeHp[0]);
  expect(r.ae).toBeGreaterThan(0); expect(r.aeHp[1]).toBeLessThan(r.aeHp[0]);
  // full battle: every damage event crosses teams (including area magic)
  await page.evaluate(() => __game.setSpeed(8));
  await waitResult(page);
  const bad = await page.evaluate(() => {
    const b = __game.battle; const all = [...b.units, ...b.removed];
    const team = (uid) => all.find((u) => u.uid === uid).team;
    return b.trace.filter((e) => e.kind === 'damage' && team(e.from) === team(e.to)).length;
  });
  expect(bad).toBe(0);
});

test('攻撃が当たるとHPが減る', async ({ page }) => {
  await gotoPrep(page);
  await startBattle(page, { speed: 1 });
  await page.waitForFunction(() => __game.battle.trace.some((e) => e.kind === 'damage'), null, { timeout: 30_000 });
  const d = await page.evaluate(() => {
    const e = __game.battle.trace.find((x) => x.kind === 'damage');
    const u = __game.battle.get(e.to) || __game.battle.removed.find((r) => r.uid === e.to);
    return { ...e, maxHp: u.maxHp };
  });
  expect(d.amount).toBeGreaterThan(0);
  expect(d.hp).toBe(d.maxHp - d.amount);
  // HP bar in the DOM shrinks
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="battle-unit"] .hpbar .fill')].some((f) => parseFloat(f.style.width) < 100));
});

test('HPが0になると倒れるモーションの後にキャラクタが消える', async ({ page }) => {
  await gotoPrep(page);
  await startBattle(page, { speed: 1 });
  await page.waitForFunction(() => __game.battle.trace.some((e) => e.kind === 'removed'), null, { timeout: 45_000 });
  const r = await page.evaluate(() => {
    const tr = __game.battle.trace;
    const rem = tr.find((e) => e.kind === 'removed');
    const dying = tr.find((e) => e.kind === 'dying' && e.uid === rem.uid);
    const dmgToZero = tr.find((e) => e.kind === 'damage' && e.to === rem.uid && e.hp === 0);
    return {
      uid: String(rem.uid), dyingT: dying && dying.t, removedT: rem.t, hp0: !!dmgToZero,
      inUnits: !!__game.battle.get(rem.uid),
      domExists: !!document.querySelector(`[data-uid="${rem.uid}"]`),
      rec: { dying: [...window.__rec.dyingUids], removed: [...window.__rec.removedUids], frames: window.__rec.frames },
    };
  });
  expect(r.hp0).toBe(true);
  expect(r.dyingT).toBeDefined();
  expect(r.removedT - r.dyingT).toBeGreaterThanOrEqual(0.85); // falling motion played first
  expect(r.inUnits).toBe(false);
  expect(r.domExists).toBe(false);
  expect(r.rec.dying).toContain(r.uid);       // DOM showed the dying state
  expect(r.rec.removed).toContain(r.uid);     // then the element was removed
  expect(r.rec.frames['dying:6']).toBeGreaterThan(0); // fallen-down frame displayed
});

// =============== Results ===============
test('敵が全滅するとゲーム終了し、勝利画面がオーバーレイ → 次のステージへ進める', async ({ page }) => {
  await gotoPrep(page);
  await startBattle(page, { speed: 8 });
  await waitResult(page);
  const st = await page.evaluate(() => ({ over: __game.battle.over, winner: __game.battle.winner,
    allies: __game.battle.units.filter((u) => u.team === 'ally').length, enemies: __game.battle.units.filter((u) => u.team === 'enemy').length }));
  expect(st.over).toBe(true);
  expect(st.winner).toBe('ally');
  expect(st.enemies).toBe(0);
  expect(st.allies).toBeGreaterThan(0);
  await expect(page.locator('#overlay-result')).toHaveAttribute('data-result', 'win');
  await expect(page.locator('#result-title')).toHaveText(JA['result.win']);
  await expect(page.locator('#screen-battle')).toBeVisible(); // overlay on top of the battle field
  await expect(page.locator('#btn-next')).toBeVisible();
  await expect(page.locator('#btn-retry')).toBeHidden();
  await page.click('#btn-next');
  await expect(page.locator('#overlay-result')).toBeHidden();
  await expect(page.locator('#prep-panel')).toBeVisible();
  await expect(page.locator('#battle-stage')).toHaveText(JA['common.stage'].replace('{n}', '2'));
});

test('味方が全滅するとゲーム終了し、敗北画面がオーバーレイ → リトライできる', async ({ page }) => {
  await gotoPrep(page, { stage: 60 });
  await startBattle(page, { speed: 8 });
  await waitResult(page);
  const st = await page.evaluate(() => ({ winner: __game.battle.winner, allies: __game.battle.units.filter((u) => u.team === 'ally').length,
    enemies: __game.battle.units.filter((u) => u.team === 'enemy').length }));
  expect(st.winner).toBe('enemy');
  expect(st.allies).toBe(0);
  expect(st.enemies).toBeGreaterThan(0);
  await expect(page.locator('#overlay-result')).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#result-title')).toHaveText(JA['result.lose']);
  await expect(page.locator('#btn-retry')).toBeVisible();
  await expect(page.locator('#btn-next')).toBeHidden();
  await page.click('#btn-retry');
  await expect(page.locator('#overlay-result')).toBeHidden();
  await expect(page.locator('#prep-panel')).toBeVisible();
  await expect(page.locator('#battle-stage')).toHaveText(JA['common.stage'].replace('{n}', '60'));
  // retry actually restarts the battle
  await startBattle(page, { speed: 8 });
  await waitResult(page);
});

test('勝利画面・敗北画面からホーム画面に移動できる', async ({ page }) => {
  await gotoPrep(page);
  await startBattle(page, { speed: 8 });
  await waitResult(page);
  await expect(page.locator('#overlay-result')).toHaveAttribute('data-result', 'win');
  await page.click('#btn-result-home');
  await expect(page.locator('#screen-home')).toBeVisible();
  await expect(page.locator('#overlay-result')).toBeHidden();

  await page.evaluate(() => __game.setStage(60));
  await page.click('#btn-home-start');
  await startBattle(page, { speed: 8 });
  await waitResult(page);
  await expect(page.locator('#overlay-result')).toHaveAttribute('data-result', 'lose');
  await page.click('#btn-result-home');
  await expect(page.locator('#screen-home')).toBeVisible();
  await expect(page.locator('#overlay-result')).toBeHidden();
});

test('勝利すると多いコイン、敗北すると少ないコインを獲得する', async ({ page }) => {
  // win at stage 1
  await gotoPrep(page);
  const c0 = await page.evaluate(() => __game.store.data.coins);
  await startBattle(page, { speed: 8 });
  await waitResult(page);
  await expect(page.locator('#overlay-result')).toHaveAttribute('data-result', 'win');
  const c1 = await page.evaluate(() => __game.store.data.coins);
  const winGain = c1 - c0;
  expect(winGain).toBe(rewardCoins(1, true));
  await expect(page.locator('#result-coins')).toContainText(String(winGain));
  await page.click('#btn-result-home');
  await expect(page.locator('#home-coins')).toHaveText(String(c1));

  // lose at stage 1 (same stage, only a lone healer deployed)
  await page.evaluate(() => {
    const s = __game.store; s.data.stage = 1;
    s.data.formation = {}; const h = s.data.roster.find((c) => c.type === 'healer'); s.data.formation[h.id] = 12; s.save();
  });
  await page.click('#btn-home-start');
  await startBattle(page, { speed: 8 });
  await waitResult(page);
  await expect(page.locator('#overlay-result')).toHaveAttribute('data-result', 'lose');
  const c2 = await page.evaluate(() => __game.store.data.coins);
  const loseGain = c2 - c1;
  expect(loseGain).toBe(rewardCoins(1, false));
  expect(loseGain).toBeGreaterThan(0);
  expect(winGain).toBeGreaterThan(loseGain);
  await expect(page.locator('#result-coins')).toContainText(String(loseGain));
});

test('ステージを進むごとに敵が強くなる', async ({ page }) => {
  await gotoHome(page);
  const power = await page.evaluate(async () => {
    const { enemyWave, wavePower } = await import('/js/data.js');
    return [1, 5, 10, 20, 50, 100].map((s) => { const w = enemyWave(s); return wavePower(w.units, w.mult); });
  });
  for (let i = 1; i < power.length; i++) expect(power[i]).toBeGreaterThan(power[i - 1]);
});

// =============== Coins → characters / equipment ===============
test('コインでキャラクタを追加し、装備をつけられる', async ({ page }) => {
  await gotoHome(page);
  await page.click('#btn-home-shop');
  await page.click('[data-buy-char="archer"]');
  await expect(page.locator('#home-coins')).toHaveText('40');
  await expect(page.locator('[data-testid="roster-card"]')).toHaveCount(7);
  await page.click('[data-tab="equipment"]');
  await page.click('[data-buy-item="bronze_sword"]');
  await expect(page.locator('[data-testid="shop-coins"]')).toHaveText('0');
  await expect(page.locator('[data-buy-item="leather_armor"]')).toBeDisabled();
  await page.click('#btn-modal-close');
  await expect(page.locator('#inventory [data-item="bronze_sword"]')).toBeVisible();
  // equip the sword to the swordsman
  await page.locator('.roster-card[data-type="sword"]').first().click();
  const atk0 = Number(await page.locator('[data-stat="stat.atk"]').textContent());
  await page.selectOption('select[data-slot="weapon"]', 'bronze_sword');
  await expect(page.locator('[data-stat="stat.atk"]')).toHaveText(String(atk0 + 5));
  await page.click('#btn-modal-close');
  await expect(page.locator('#inventory [data-item="bronze_sword"]')).toHaveCount(0);
  await expect(page.locator('.roster-card[data-type="sword"] .equip-icons img').first()).toBeVisible();
  // persisted after reload
  await page.reload();
  const saved = await page.evaluate(() => __game.store.data);
  expect(saved.roster.some((c) => c.equip.weapon === 'bronze_sword')).toBe(true);
  expect(saved.coins).toBe(0);
});

// =============== i18n ===============
test('多言語対応している（日本語/英語/中国語/韓国語）', async ({ page }) => {
  // every language defines every key
  const keys = Object.keys(STRINGS.ja);
  for (const l of Object.keys(LANGS)) expect(Object.keys(STRINGS[l]).sort()).toEqual([...keys].sort());

  await page.goto('/index.html');
  await expect(page.locator('#btn-title-start')).toHaveText(STRINGS.ja['title.tap']);
  for (const l of ['en', 'zh', 'ko', 'ja']) {
    await page.selectOption('[data-testid="lang-select"]', l);
    await expect(page.locator('#btn-title-start')).toHaveText(STRINGS[l]['title.tap']);
    await expect(page.locator('html')).toHaveAttribute('lang', l);
  }
  await page.selectOption('[data-testid="lang-select"]', 'en');
  await page.click('#btn-title-start');
  await expect(page.locator('#btn-home-start')).toHaveText(STRINGS.en['home.start']);
  await expect(page.locator('.roster-card[data-type="mage"]')).toContainText(STRINGS.en['char.mage']);
  await page.selectOption('[data-testid="lang-select-home"]', 'ko');
  await expect(page.locator('#btn-home-start')).toHaveText(STRINGS.ko['home.start']);
  await expect(page.locator('.roster-card[data-type="mage"]')).toContainText(STRINGS.ko['char.mage']);
  // choice persists
  await page.reload();
  await expect(page.locator('#btn-title-start')).toHaveText(STRINGS.ko['title.tap']);
  // battle UI is localized too
  await page.click('#btn-title-start');
  await page.selectOption('[data-testid="lang-select-home"]', 'en');
  await page.click('#btn-home-start');
  await expect(page.locator('#btn-fight')).toHaveText(STRINGS.en['prep.start']);
  await startBattle(page, { speed: 8 });
  await waitResult(page);
  await expect(page.locator('#result-title')).toHaveText(STRINGS.en['result.win']);
});

test('BGM: ホームは待機曲、バトル中はバトル曲が鳴り、オフにできる', async ({ page }) => {
  const cur = () => page.evaluate(() => __game.bgm.current);
  await gotoHome(page);
  // the tap on the title unlocked audio and started the calm home theme
  await expect.poll(() => page.evaluate(() => __game.bgm.unlocked)).toBe(true);
  await expect.poll(cur).toBe('home');
  await page.click('#btn-home-start');
  await expect(page.locator('#prep-panel')).toBeVisible();
  await expect.poll(cur).toBe('home');                 // formation keeps the waiting music
  await startBattle(page, { speed: 8 });
  await expect.poll(cur).toBe('battle');               // fighting switches to the battle theme
  await waitResult(page);
  const r = await page.locator('#overlay-result').getAttribute('data-result');
  expect(['win', 'lose', 'home']).toContain(await cur());  // result jingle, then back to the calm theme
  await expect.poll(cur, { timeout: 15_000 }).toBe('home');
  expect(['win', 'lose']).toContain(r);
  // mute: stops the music and is remembered after a reload
  await page.click('#btn-result-home');
  await page.click('[data-testid="btn-sound"]');
  await expect(page.locator('[data-testid="btn-sound"]')).toHaveClass(/off/);
  await expect.poll(cur).toBe(null);
  expect(await page.evaluate(() => __game.store.data.bgm)).toBe(false);
  await page.reload();
  await expect(page.locator('[data-testid="btn-sound-title"]')).toHaveClass(/off/);
  await page.click('#btn-title-start');
  await page.click('#btn-home-start');
  await startBattle(page, { speed: 1 });
  expect(await cur()).toBe(null);                      // stays silent in battle too
  await page.click('[data-testid="btn-sound-battle"]');
  await expect.poll(cur).toBe('battle');               // turning it on plays the right track
});

test('BGM: 曲を実際に音声として合成でき、無音でも音割れでもない', async ({ page }) => {
  await page.goto('/index.html');
  const lv = await page.evaluate(async () => {
    const { Bgm } = await import('./js/audio.js');
    const out = {};
    for (const [n, s] of [['home', 6], ['battle', 6], ['win', 3], ['lose', 5]]) {
      const d = (await Bgm.render(n, s, 22050)).getChannelData(0);
      let peak = 0, sum = 0; for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      out[n] = { peak, rms: Math.sqrt(sum / d.length) };
    }
    return out;
  });
  for (const [n, { peak, rms }] of Object.entries(lv)) {
    expect(rms, `${n} is audible`).toBeGreaterThan(0.02);
    expect(peak, `${n} does not clip`).toBeLessThan(0.95);
  }
  expect(lv.battle.rms).toBeGreaterThan(lv.home.rms);    // the battle theme is more energetic
});

// =============== PWA ===============
test('PWA: マニフェストとアイコンが有効で、Service Worker によりオフラインでも起動できる', async ({ page, context, browserName }) => {
  await page.goto('/index.html');
  const man = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const m = await (await fetch(href)).json();
    const icons = await Promise.all(m.icons.map(async (i) => {
      const img = new Image(); img.src = new URL(i.src, href).href; await img.decode();
      return { sizes: i.sizes, purpose: i.purpose, w: img.naturalWidth, h: img.naturalHeight };
    }));
    return { ...m, icons };
  });
  expect(man.name).toBeTruthy();
  expect(man.display).toBe('standalone');
  expect(man.start_url).toBeTruthy();
  for (const i of man.icons) expect(`${i.w}x${i.h}`).toBe(i.sizes);
  expect(man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  expect(man.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBe(1);

  test.skip(browserName !== 'chromium', 'offline check uses Chromium (the service worker itself is the same on every browser)');
  // service worker installs, precaches the app and takes control
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('pixel-brigade-')))).toBe(true);
  // offline: the game still starts and can be played
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#screen-title')).toBeVisible();
  await page.click('#btn-title-start');
  await expect(page.locator('#screen-home')).toBeVisible();
  await page.click('#btn-home-start');
  await expect(page.locator('#prep-panel')).toBeVisible();
  await context.setOffline(false);
});

test('魔法：敵も魔法を使い、範囲内の相手の最大HPの割合でダメージを与える', async ({ page }) => {
  await gotoPrep(page, { stage: 2 });
  // stage 2 already has an enemy mage
  await expect(page.locator('.unit.team-enemy[data-type="mage"]')).toHaveCount(1);
  // put our mage on the field too
  await page.evaluate(() => { const s = __game.store; const m = s.data.roster.find((c) => c.type === 'mage'); s.place(m.id, 7); __game.refresh(); });
  await expect(page.locator('.unit.placed[data-type="mage"]')).toHaveCount(1);
  await startBattle(page, { speed: 1 });
  // both sides cast: a rune circle marks the area while casting (gold = ours, violet = enemy),
  // then a pillar of light strikes on impact (plus thin pillars on everyone hit)
  await page.waitForSelector('.magic-circle.violet .rune', { state: 'attached', timeout: 20_000 });
  await page.waitForSelector('.magic-circle.gold .rune', { state: 'attached', timeout: 20_000 });
  await page.waitForSelector('.magic-circle.impact', { state: 'attached', timeout: 20_000 });
  await page.waitForSelector('.light-pillar:not(.mini)', { state: 'attached', timeout: 20_000 });
  await page.waitForSelector('.light-pillar.mini', { state: 'attached', timeout: 20_000 });
  await page.waitForSelector('.dmg.magic', { state: 'attached' });
  // our own spell's area stays clearly visible for a while after the hit (not just a quick flash)
  const stillVisible = await page.evaluate(() => new Promise((resolve) => {
    // catch one of our circles at the moment of the hit, then look again 0.6 s later
    new MutationObserver((muts, obs) => {
      for (const m of muts) {
        const c = m.target;
        if (c.classList && c.classList.contains('gold') && c.classList.contains('impact')) {
          obs.disconnect();
          setTimeout(() => resolve(c.isConnected && +getComputedStyle(c).opacity > 0.5), 600);
          return;
        }
      }
    }).observe(document.querySelector('#fx'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  }));
  expect(stillVisible).toBe(true);
  // the circle matches the spell's radius (2 x radius cells wide)
  const ratio = await page.evaluate(() => { const c = document.querySelector('.magic-circle'); return parseFloat(c.style.width) / __game.G.cs; });
  expect([2.5, 2.0, 1.8]).toContainEqual(Math.round(ratio * 10) / 10);
  const hits = await page.evaluate(() => __game.battle.trace.filter((x) => x.magic).map((x) => {
    const b = __game.battle; const all = [...b.units, ...b.removed];
    const from = all.find((u) => u.uid === x.from), to = all.find((u) => u.uid === x.to);
    return { from: from.team, to: to.team, ratio: x.amount / to.maxHp, pct: from.magic.pct };
  }));
  expect(hits.some((h) => h.from === 'enemy')).toBe(true);
  for (const h of hits) {
    expect(h.from).not.toBe(h.to);
    expect(Math.abs(h.ratio - h.pct)).toBeLessThan(0.02);   // share of the target's max HP
  }
});

test('魔法防御師：結界の範囲が表示され、範囲内の味方への敵の魔法を無効化する', async ({ page }) => {
  await gotoHome(page);
  await page.evaluate(() => __game.setCoins(1000));
  await page.click('#btn-home-shop');
  await page.click('[data-buy-char="warder"]');
  await page.click('#btn-modal-close');
  await expect(page.locator('.roster-card[data-type="warder"]')).toHaveCount(1);
  await page.evaluate(() => __game.setStage(2));            // stage 2 has an enemy mage
  await page.click('#btn-home-start');
  // place the warder (strong barrier) in the middle of our formation
  await page.evaluate(() => { const s = __game.store; const w = s.data.roster.find((c) => c.type === 'warder'); w.rank = 100; s.place(w.id, 7); s.save(); __game.refresh(); });
  await expect(page.locator('.unit.placed[data-type="warder"]')).toHaveCount(1);
  // the barrier is already visible while arranging the formation, sized by its radius
  const dome = page.locator('#auras [data-testid="ward-dome"]');
  await expect(dome).toHaveCount(1);
  const r = await page.evaluate(() => parseFloat(document.querySelector('.ward-dome').style.width) / __game.G.cs / 2);
  expect(r).toBeCloseTo(1.6 + 0.004 * 99, 2);
  // drawn as a true circle, matching the real (top-down) protected area
  expect(await page.evaluate(() => { const d = document.querySelector('.ward-dome'); return d.style.width === d.style.height; })).toBe(true);
  await startBattle(page, { speed: 2 });
  await expect(dome).toHaveCount(1);                         // follows the warder in battle
  // the enemy mage's spell is nullified: "無効" pops up and no ally inside took magic damage
  await page.waitForSelector('.dmg.null', { state: 'attached', timeout: 30_000 });
  await expect(page.locator('.dmg.null').first()).toHaveText(JA['battle.nullified']);
  const res = await page.evaluate(() => {
    const b = __game.battle; const all = [...b.units, ...b.removed];
    const get = (id) => all.find((u) => u.uid === id);
    return { nullified: b.trace.filter((x) => x.kind === 'nullify').length,
      magicOnAllies: b.trace.filter((x) => x.magic && get(x.to).team === 'ally').length };
  });
  expect(res.nullified).toBeGreaterThan(0);
  expect(res.magicOnAllies).toBe(0);
});

test('シールダー：防御力でダメージを軽減し、近くの味方の防御力を上げる（範囲とマークが見える）', async ({ page }) => {
  await gotoHome(page);
  // detail screen: shows how much damage gets through and the guard bonus
  await page.locator('.roster-card[data-type="shield"]').first().click();
  await expect(page.locator('[data-stat="stat.defCut"]')).toHaveText(/^\d+%$/);
  await expect(page.locator('[data-stat="stat.guard"]')).toHaveText(/^\+\d+$/);
  const cutShield = parseInt(await page.locator('[data-stat="stat.defCut"]').textContent(), 10);
  await page.click('#btn-modal-close');
  await page.locator('.roster-card[data-type="mage"]').first().click();
  const cutMage = parseInt(await page.locator('[data-stat="stat.defCut"]').textContent(), 10);
  expect(cutShield).toBeLessThan(cutMage);            // the shielder takes much less damage
  await expect(page.locator('[data-stat="stat.guard"]')).toHaveCount(0);
  await page.click('#btn-modal-close');
  // formation: the placed shielder shows its guard ring (radius 1.5)
  await page.click('#btn-home-start');
  await expect(page.locator('.unit.placed[data-type="shield"]')).toHaveCount(1);
  const ring = page.locator('#auras .guard-ring:not(.enemy)');
  await expect(ring).toHaveCount(1);
  const r = await page.evaluate(() => parseFloat(document.querySelector('.guard-ring:not(.enemy)').style.width) / __game.G.cs / 2);
  expect(r).toBeCloseTo(1.5, 2);
  // battle: allies next to the shielder carry the guard mark, and really get the bonus
  await startBattle(page, { speed: 1 });
  await expect(page.locator('.unit.team-ally.guarded').first()).toBeVisible();
  const ok = await page.evaluate(() => {
    const b = __game.battle; const g = b.units.filter((u) => u.team === 'ally' && b.guardOf(u));
    return g.length > 0 && g.every((u) => b.defOf(u) > u.def);
  });
  expect(ok).toBe(true);
});

test('装備：まとめ買い・合体（レベル加算、元に戻せる）・おまかせ編成で装着', async ({ page }) => {
  await gotoHome(page);
  await page.evaluate(() => __game.setCoins(1000));
  // buy 10 bronze swords at once
  await page.click('#btn-home-shop');
  await page.click('[data-tab="equipment"]');
  await page.click('[data-buy-item10="bronze_sword"]');
  await page.click('#btn-modal-close');
  await expect(page.locator('#home-coins')).toHaveText('600');
  await expect(page.locator('.inv-item[data-item="bronze_sword"]')).toContainText('×10');
  // merge them into one +10 sword
  const mb = page.locator('[data-merge-item="bronze_sword"]');
  await expect(mb).toContainText('+10');
  await mb.click();
  await expect(page.locator('.inv-item[data-item="bronze_sword+10"]')).toContainText('×1');
  await expect(page.locator('.inv-item[data-item="bronze_sword"]')).toHaveCount(0);
  // undo brings the 10 swords back
  await page.click('#btn-undo');
  await expect(page.locator('.inv-item[data-item="bronze_sword"]')).toContainText('×10');
  await mb.click();
  // auto arrange equips the +10 sword on a unit on the field
  await page.click('#btn-home-start');
  await page.click('#btn-auto');
  await expect(page.locator('[data-testid="auto-plan"] .plan-equip').first()).toContainText(JA['item.bronze_sword'] + ' +10');
  await page.click('[data-testid="auto-confirm"]');
  const worn = await page.evaluate(() => { const s = __game.store; return Object.keys(s.formation).map((id) => s.char(+id).equip.weapon).filter(Boolean); });
  expect(worn).toContain('bronze_sword+10');
  expect(await page.evaluate(() => __game.store.data.inventory['bronze_sword+10'] || 0)).toBe(0);
});

test('結界インプ：ステージ25から登場し、敵側の結界（ピンク）が見え、こちらの魔法を無効化する', async ({ page }) => {
  await gotoPrep(page, { stage: 25 });
  const imp = page.locator('.unit.team-enemy[data-type="warder"]');
  await expect(imp).toHaveCount(1);
  // the enemy barrier is shown in its own colour while arranging the formation
  await expect(page.locator('#auras .ward-dome.enemy')).toHaveCount(1);
  // tapping it explains what it does
  await imp.click({ force: true });
  await expect(page.locator('#toast')).toContainText(JA['mon.warder']);
  await expect(page.locator('#toast')).toContainText(JA['monDesc.warder']);
  // our mages' spells that land in the barrier are nullified
  await page.evaluate(() => {
    const s = __game.store; s.data.coins = 1e5; s.recruitMany('mage', 2);   // 3 mages in total
    // an evenly matched fight, so the battle lasts long enough for spells to reach the imp's barrier
    s.data.roster.filter((c) => c.type === 'mage').forEach((m, i) => { m.rank = 5; s.place(m.id, [10, 13, 14][i]); });
    s.data.roster.filter((c) => c.type !== 'mage').forEach((c) => { c.rank = 2; });
    s.save(); __game.refresh();
  });
  await startBattle(page, { speed: 4 });
  await expect.poll(() => page.evaluate(() => __game.battle.trace.some((x) => x.kind === 'nullify'
    && [...__game.battle.units, ...__game.battle.removed].find((u) => u.uid === x.warder).team === 'enemy')), { timeout: 30_000 }).toBe(true);
});

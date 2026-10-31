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
  for (const type of TYPES) await expect(page.locator(`.roster-card[data-type="${type}"]`).first()).toBeVisible();
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
  await expect(bench(page)).toHaveCount(6);
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
  for (const type of TYPES) await expect(placed(page, `[data-type="${type}"]`)).toHaveCount(1);
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
  // drag merge with recruited units, up to max rank 10
  await page.evaluate(() => { const s = __game.store; s.data.coins = 10000; for (let i = 0; i < 9; i++) s.recruit('sword'); __game.G; });
  await page.click('#btn-battle-home');
  await page.click('#btn-home-start');
  for (let r = 3; r <= 10; r++) {
    const src = bench(page, '[data-type="sword"]').first();
    const dst = placed(page, '[data-type="sword"]');
    const sb = await src.boundingBox(); const db = await dst.boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(db.x + db.width / 2, db.y + db.height * 0.7, { steps: 6 });
    await page.mouse.up();
    await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', String(r));
  }
  // already max (10): further merge refused
  await bench(page, '[data-type="sword"]').first().click();
  await tapCell(page, await placed(page, '[data-type="sword"]').getAttribute('data-cell'));
  await expect(page.locator('#toast')).toHaveText(JA['prep.maxRank']);
  await expect(placed(page, '[data-type="sword"]')).toHaveAttribute('data-rank', '10');
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
  // full battle: every damage event crosses teams (including mage splash)
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
    const { enemyWave, computeStats } = await import('/js/data.js');
    return [1, 5, 10, 20].map((s) => { const w = enemyWave(s); return w.units.reduce((a, u) => { const st = computeStats(u.type, u.rank, {}, w.mult); return a + st.maxHp * st.atk; }, 0); });
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

// Smoke test: full flow without JS errors + screenshots per device (written to shots/).
import { test, expect } from '@playwright/test';
test.use({ locale: 'ja-JP' });
test('全画面をエラーなく表示できる（スクリーンショット保存）', async ({ page }, info) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const shot = (n) => page.screenshot({ path: `shots/${info.project.name}-${n}.png` });
  await page.goto('/index.html'); await shot('1-title');
  await page.click('#btn-title-start'); await shot('2-home');
  await page.click('#btn-home-shop'); await shot('3-shop'); await page.click('#btn-modal-close');
  await page.click('#btn-home-start'); await shot('4-prep');
  await page.click('#btn-fight'); await page.waitForTimeout(2500); await shot('5-battle');
  await page.evaluate(() => __game.setSpeed(8));
  await expect(page.locator('#overlay-result')).toBeVisible({ timeout: 60000 }); await page.waitForTimeout(400); await shot('6-result');
  // field fits inside the viewport
  const fb = await page.locator('#field').boundingBox(); const vp = page.viewportSize();
  expect(fb.x).toBeGreaterThanOrEqual(0); expect(fb.x + fb.width).toBeLessThanOrEqual(vp.width + 1);
  expect(fb.y + fb.height).toBeLessThanOrEqual(vp.height + 1);
  expect(errs).toEqual([]);
});

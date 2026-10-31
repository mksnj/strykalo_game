import { expect, test } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

let production: PreviewServer;
test.beforeAll(async () => {
  production = await preview({ configFile: resolve('vite.config.ts'), preview: { host: '127.0.0.1', port: 5176, strictPort: true } });
  await mkdir('docs/previews/residual-adjustments', { recursive: true });
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => production.httpServer.close(error => error ? reject(error) : resolve())); });

for (const [width, height] of [[1899, 865], [1230, 540], [960, 540], [375, 667], [667, 375], [568, 320]]) {
  test(`production stage picker and pipe heading centred at top ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5176/');
    await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
    await expect(page.locator('.brand')).toContainText('2016—∞');
    const picker = page.getByLabel('Выбор этапа');
    await expect(picker).toBeVisible();
    expect(await picker.locator('option').count()).toBe(7);
    await expect(page.locator('.debug-menu')).toHaveCount(0);
    await page.screenshot({ path: `docs/previews/residual-adjustments/menu-${width}x${height}.png` });
    await picker.selectOption('second-run');
    await page.getByRole('button', { name: 'Начать этап →' }).click();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
    await expect(page.locator('.distance')).toContainText(/20\d\s*\/\s*700/);
    await expect(page.locator('.developer-badge')).toHaveCount(0);
    await page.getByRole('button', { name: 'К этапам', exact: true }).click();
    await picker.selectOption('balance');
    await page.getByRole('button', { name: 'Начать этап →' }).click();
    await page.getByRole('button', { name: 'Понятно, пошатываемся' }).click();
    await expect(page.locator('.balance-instructions')).toBeVisible();
    const heading = (await page.locator('.balance-instructions p').boundingBox())!;
    const subtitle = (await page.locator('.balance-instructions>span').boundingBox())!;
    const brand = (await page.locator('.brand').boundingBox())!;
    expect(Math.abs(heading.x + heading.width / 2 - width / 2)).toBeLessThan(1);
    expect(heading.y).toBeLessThan(25);
    expect(subtitle.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    const title = { x: Math.min(heading.x, subtitle.x), y: heading.y,
      width: Math.max(heading.x + heading.width, subtitle.x + subtitle.width) - Math.min(heading.x, subtitle.x),
      height: subtitle.y + subtitle.height - heading.y };
    const counters = (await page.locator('.hud-status').boundingBox())!;
    const distance = (await page.locator('.distance').boundingBox())!;
    const intersects = (a: typeof title, b: typeof title) => a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
    expect(intersects(title, counters)).toBe(false); expect(intersects(title, distance)).toBe(false);
    expect(intersects(title, brand)).toBe(false);
    const controls = await page.locator('.system-controls').boundingBox();
    const overlaps = controls && title.x < controls.x + controls.width && title.x + title.width > controls.x &&
      title.y < controls.y + controls.height && title.y + title.height > controls.y;
    expect(overlaps).toBe(false);
    await page.screenshot({ path: `docs/previews/residual-adjustments/pipe-${width}x${height}.png` });
  });
}

test('infinite anniversary range also appears on the final result', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Выбор этапа').selectOption('first-run');
  await page.getByRole('button', { name: 'Начать этап →' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-screen', 'playing');
  await page.evaluate(async () => {
    const path = '/src/game/state/store.ts';
    const { gameStore } = await import(/* @vite-ignore */ path);
    gameStore.finish({ reason: 'completed', score: 0, distance: 700 });
  });
  await expect(page.locator('.result .eyebrow')).toContainText('2016—∞');
  await expect(page.locator('main')).not.toContainText('2016—2026');
});

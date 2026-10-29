import { test, expect } from '@playwright/test';
import { opening } from './runnerScenario';

test('иллюстрированный первый район: ресурсы, прыжок и два размера экрана', async ({ page }) => {
  const errors: string[] = [];
  const loaded = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => {
    if (/\/assets\/runner-v1\/|\/assets\/provided-v4\/(barrier|broken-block|debris|rubble)\.webp/.test(response.url())) {
      if (response.ok()) loaded.add(response.url());
      else errors.push(`Ресурс: ${response.status()} ${response.url()}`);
    }
  });
  await page.clock.install();
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array.fill(1); return array; } });
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 40);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/assets/runner-v1/cassette.webp');
  expect(loaded.size).toBe(10);
  expect([...loaded].some(url => url.endsWith('/cassette.webp'))).toBe(true);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  await page.getByRole('button', { name: 'Понятно, в путь' }).click({ force: true });
  const advanceTo = async (distance: number) => {
    for (let i = 0; i < 250; i++) {
      const current = Number((await page.locator('.distance span').textContent())?.split('/')[0]);
      if (current >= distance) return;
      // Sample the approach every render frame; 200ms could skip the jump window.
      await page.clock.runFor(40);
    }
    throw new Error(`Игра не достигла дистанции ${distance}`);
  };
  await advanceTo(7);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
  await expect(page.locator('.score img')).toHaveAttribute('src', '/assets/runner-v1/cassette.webp');
  await expect(page.locator('.score')).toContainText('кассет');
  await page.screenshot({ path: 'docs/previews/runner-art-desktop.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.runFor(600); // Allow Phaser's resize debounce to settle.
  const canvas = (await page.locator('canvas').boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(391);
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(845);
  await page.screenshot({ path: 'docs/previews/runner-art-mobile.png' });
  // Jump through the first hazard with the new artwork, using real input and physics.
  await advanceTo(opening.jumpAt);
  await page.keyboard.down('Space');
  await advanceTo(opening.clearAt);
  await page.keyboard.up('Space');
  await expect(page.getByRole('heading', { name: 'Не в этот раз' })).not.toBeVisible();
  expect(Number(await page.locator('.score strong').textContent())).toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/previews/runner-art-jump.png' });
  expect(errors).toEqual([]);
});

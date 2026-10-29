import { test, expect, type Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(async () => {
  const path = '/src/game/state/store.ts';
  return (await import(/* @vite-ignore */ path)).gameStore.getSnapshot();
});

test('туториал ждёт игрока, поддерживает возврат и клавиатуру; повторный старт сразу', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await expect(page.getByRole('heading', { name: 'Как играть', exact: true })).toBeFocused();
  await page.getByAltText('Бетонный блок').click();
  await page.keyboard.press('Space');
  await page.clock.runFor(8000);
  expect(await snapshot(page)).toMatchObject({ screen: 'menu', score: 0, distance: 0, runNumber: 0 });
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.clock.runFor(40);
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tutorial')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Понятно, в путь' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.clock.runFor(40);
  expect(await snapshot(page)).toMatchObject({ screen: 'playing', runNumber: 1 });
  await expect(page.locator('.tutorial')).toHaveCount(0);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'В меню', exact: true }).click();
  await page.getByRole('button', { name: 'Начать путь' }).click();
  expect(await snapshot(page)).toMatchObject({ screen: 'playing', runNumber: 2 });
  await expect(page.locator('.tutorial')).toHaveCount(0);
});

const sizes = [[360, 800], [375, 667], [390, 844], [568, 320], [667, 375], [844, 390], [915, 412], [1230, 372], [1920, 1080]];
for (const [width, height] of sizes) test(`туториал: изображения, читаемость и сенсорный старт ${width}×${height}`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 1000 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать путь' }).tap();
  const tutorial = page.locator('.tutorial');
  await expect(tutorial).toBeVisible();
  await expect(tutorial).toContainText('Коснитесь экрана, чтобы перепрыгнуть их.');
  await expect(tutorial).toContainText('Каждая кассета — одно очко.');
  expect(await tutorial.locator('img').evaluateAll(images => images.every(image =>
    (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const bar = (await page.locator('.top-bar').boundingBox())!;
  for (const locator of [tutorial.locator('h1'), ...await tutorial.locator('article').all(), tutorial.locator('.tutorial-actions')]) {
    const box = (await locator.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  }
  await page.screenshot({ path: `test-results/tutorial-${width}x${height}.png` });
  await page.getByRole('button', { name: 'Понятно, в путь' }).tap();
  await page.clock.runFor(40);
  expect(await snapshot(page)).toMatchObject({ screen: 'playing', runNumber: 1, score: 0, distance: 0 });
  expect(errors).toEqual([]);
  await context.close();
});

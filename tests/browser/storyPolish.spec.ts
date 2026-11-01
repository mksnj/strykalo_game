import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';

const directory = 'docs/previews/story-polish';

for (const [width, height] of [[1880, 869], [960, 540], [375, 667], [1230, 372]]) {
test(`final approach keeps a single continuous facade ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await bootRhythm(page, false);
  await mkdir(directory, { recursive: true });
  for (const distance of [640, 670, 690, 698, 700]) {
    await page.evaluate(async distance => {
      const path = '/src/game/runner/engine.ts';
      const { RunnerEngine } = await import(/* @vite-ignore */ path);
      const session = (window as any).rhythmScene.session;
      session.runner = new RunnerEngine(42, { start: 600, end: 700, empty: true });
      session.runner.travel = distance * 60;
      session.phase = distance === 700 ? 'ending' : 'final-run';
      session.phaseTime = 0;
      session.weatherStarted = false;
    }, distance);
    await page.clock.runFor(40);
    const margins = await page.evaluate(() => {
      const scene = (window as any).rhythmScene;
      return { width: scene.scale.width, wings: scene.endingView.wings.map((wing: any) => ({
        visible: wing.visible, width: wing.width, tileScaleX: wing.tileScaleX,
      })) };
    });
    for (const wing of margins.wings) {
      expect(wing.visible).toBe(margins.width > 960);
      if (wing.visible) {
        expect(wing.width).toBeCloseTo((margins.width - 960) / 2);
        expect(wing.width / wing.tileScaleX).toBeLessThanOrEqual(192.001);
      }
    }
    await page.screenshot({ path: `${directory}/final-${distance}-${width}x${height}.png` });
  }
});
}

for (const [width, height] of [[1880, 869], [1230, 540], [960, 540], [901, 540], [915, 412], [844, 390], [375, 667], [320, 568], [667, 375], [568, 320]]) {
test(`all three titles share the top interface row ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await bootRhythm(page, false);
  await mkdir(directory, { recursive: true });
  for (const point of ['balance', 'stars', 'waiting']) {
    await page.evaluate(async point => {
      const path = '/src/game/state/store.ts';
      const { gameStore } = await import(/* @vite-ignore */ path);
      gameStore.menu();
      gameStore.startStage(point, 42);
    }, point);
    await page.clock.runFor(80);
    if (point === 'balance') await page.getByRole('button', { name: 'Понятно, пошатываемся' }).click({ force: true });
    if (point === 'stars') await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true });
    await page.clock.runFor(40);
    const title = page.locator('.minigame-heading');
    await expect(title).toHaveCount(1);
    await expect(title).toContainText({ balance: 'Делать это трезвым', stars: 'Бесполезно', waiting: 'Решится само собой' }[point]!);
    const box = (await title.boundingBox())!;
    if (width > height) expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(1);
    expect(box.y).toBeLessThan(25);
    const brand = (await page.locator('.brand').boundingBox())!;
    expect(brand.y).toBeLessThan(box.y + box.height);
    expect(brand.y + brand.height).toBeGreaterThan(box.y);
    const controls = (await page.locator('.system-controls').boundingBox())!;
    if (width > height) {
      expect(controls.y).toBeLessThan(box.y + box.height);
      expect(controls.y + controls.height).toBeGreaterThan(box.y);
    }
    const hud = (await page.locator('.hud').boundingBox())!;
    expect(controls.y + controls.height).toBeLessThanOrEqual(hud.y);
    for (const button of await page.locator('.system-controls > button, .system-controls summary').all()) {
      const control = (await button.boundingBox())!;
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width).toBeLessThanOrEqual(width);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
    for (const selector of ['.brand', '.system-controls', '.hud-status', '.distance']) {
      const other = (await page.locator(selector).boundingBox())!;
      expect(box.x < other.x + other.width && box.x + box.width > other.x &&
        box.y < other.y + other.height && box.y + box.height > other.y, selector).toBe(false);
    }
    await page.screenshot({ path: `tmp/mobile-heading/${point}-${width}x${height}.png` });
  }
});
}

test('waiting completion starts the finale immediately and keeps it through the final run', async ({ page }) => {
  test.setTimeout(35000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function (...args: any[]) {
      (window as any).polishScene = (this as any).scene;
      return render.apply(this, args as any);
    };
  });
  await page.getByLabel('Выбор этапа').selectOption('waiting');
  await page.getByRole('button', { name: 'Начать этап →' }).click();
  await page.waitForFunction(() => (window as any).polishScene?.audio.status.music.some((v: any) => v.started && v.gain > .7));
  const old = await page.evaluate(() => {
    const scene = (window as any).polishScene;
    const voice = scene.audio.status.music[0];
    for (let tick = 0; tick < 120 * 90 - 2; tick++) scene.session.waiting.step();
    return voice;
  });
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'room-rest');
  await page.waitForFunction(id => (window as any).polishScene.audio.status.music.some((v: any) => v.id === id && v.fading), old.id);
  const boundary = await page.evaluate(() => ({ phase: (window as any).polishScene.session.phase, status: (window as any).polishScene.audio.status }));
  expect(boundary.phase).toBe('room-rest');
  expect(old.url).toContain('07-reshitsya');
  const incoming = boundary.status.music.find((v: any) => !v.fading && v.started);
  expect(incoming.url).toContain('08-podvorotnya');
  const outgoing = boundary.status.music.find((v: any) => v.id === old.id);
  expect(outgoing.paused).toBe(false);
  expect(outgoing.fadeOutEndsAt - outgoing.fadeOutStartedAt).toBeCloseTo(6);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'final-run', { timeout: 10000 });
  await expect.poll(() => page.evaluate(() => (window as any).polishScene.audio.status.music.length), { timeout: 8000 }).toBe(1);
  const final = await page.evaluate(() => (window as any).polishScene.audio.status.music[0]);
  expect(final.id).toBe(incoming.id);
  expect(final.position).toBeGreaterThan(incoming.position + 3);
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/room-music.json`, JSON.stringify({ old, boundary, final }, null, 2));
});

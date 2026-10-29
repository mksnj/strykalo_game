import { test, expect } from '@playwright/test';

test('90 секунд в комнате: пять сбросов, системный ввод, пауза и поворот', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.addInitScript(() => {
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 40);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  await page.getByRole('button', { name: 'Понятно, в путь' }).click({ force: true });
  await page.clock.runFor(5000);
  // Capture the existing scene through a test-only method wrapper; production has no new debug API.
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: unknown[]) {
      (window as any).testRoomScene = this.scene; render.apply(this, args);
    };
  });
  await page.clock.runFor(40);
  await page.evaluate(async () => {
    const path = '/src/game/minigames/waiting/WaitingEngine.ts';
    const { WaitingEngine } = await import(/* @vite-ignore */ path);
    const scene = (window as any).testRoomScene;
    scene.session.phase = 'waiting'; scene.session.waiting = new WaitingEngine(); scene.lastPhase = 'waiting';
    scene.session.runner.travel = 60000;
  });
  const read = () => page.evaluate(() => {
    const scene = (window as any).testRoomScene;
    return { elapsed: scene.session.waiting.elapsed, active: scene.session.waiting.activeTime,
      resets: scene.session.waiting.resets, phase: scene.session.phase };
  });
  await page.setViewportSize({ width: 844, height: 390 }); await page.clock.runFor(40);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    });
    await page.clock.runFor(1000);
  }
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width * .5, canvas.y + canvas.height * .6);
  await page.clock.runFor(1000);
  await page.mouse.click(canvas.x + canvas.width * .5, canvas.y + canvas.height * .6);
  await page.clock.runFor(47_540);
  const before = await read(); expect(before.resets).toBe(5);
  await page.getByRole('button', { name: /Выключить звук|Включить звук/ }).click({ force: true });
  await page.keyboard.press('Space');
  expect((await read()).resets).toBe(5);
  await page.locator('.audio-settings summary').click({ force: true });
  await page.locator('.audio-settings summary').press('Space');
  expect((await read()).resets).toBe(5);
  await page.locator('.audio-settings summary').press('Space');
  await page.getByRole('slider', { name: 'Громкость музыки' }).fill('0.25');
  await page.getByRole('slider', { name: 'Громкость эффектов' }).fill('0.8');
  await page.getByRole('slider', { name: 'Громкость окружения' }).fill('0.2');
  await page.getByRole('slider', { name: 'Громкость окружения' }).press('ArrowUp');
  await page.getByRole('slider', { name: 'Громкость музыки' }).press('ArrowUp');
  expect((await read()).resets).toBe(5);
  await page.locator('.audio-settings summary').click({ force: true });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
  await page.clock.fastForward(120_000);
  expect((await read()).elapsed).toBe(before.elapsed);
  await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.fastForward(30_000);
  await page.setViewportSize({ width: 844, height: 390 }); await page.clock.runFor(80);
  await expect(page.getByRole('heading', { name: 'Поверните телефон' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click({ force: true }); await page.clock.runFor(40);
  await expect(page.getByRole('heading', { name: 'Пауза', exact: true })).not.toBeVisible();
  await page.clock.runFor(41_500);
  const after = await read();
  expect(after.resets).toBe(5); expect(after.phase).toBe('waiting');
  expect(after.elapsed - before.elapsed).toBeGreaterThan(41);
  expect(after.active).toBeGreaterThan(before.active);
  await page.clock.runFor(1200);
  expect((await read()).elapsed).toBe(90); expect((await read()).phase).toBe('room-rest');
  await page.clock.runFor(2100);
  expect((await read()).phase).toBe('room-exit');
});

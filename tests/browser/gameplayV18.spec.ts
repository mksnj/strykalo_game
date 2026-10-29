import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';
import { starsOpensAt } from '../../apps/web/src/game/state/starsAccess';
import { SHADOWS_SCORE } from '../../apps/web/src/game/config';

const directory = 'docs/previews/gameplay-v18';
// Phaser smooths large clock advances; step the 25 fps fixture one frame at a time.
async function advance(page: Page, milliseconds: number) {
  for (let time = 0; time < milliseconds; time += 40) await page.clock.runFor(Math.min(40, milliseconds - time));
}
async function until(page: Page, predicate: () => boolean, frames = 600) {
  for (let i = 0; i < frames; i++) {
    if (await page.evaluate(predicate)) return;
    await page.clock.runFor(40);
  }
  throw new Error('Simulation condition not reached: ' + JSON.stringify(await page.evaluate(() => {
    const scene = (window as any).rhythmScene, s = scene.session;
    return { phase: s.phase, time: s.phaseTime, tick: s.runner.tick, paused: document.querySelector('main')?.getAttribute('data-paused'), room: s.waiting?.activeTime };
  })));
}
async function direct(page: Page, label: string) {
  await page.getByRole('button', { name: 'К этапам', exact: true }).click();
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: label, exact: true }).click(); await page.clock.runFor(80);
}
async function gate(page: Page) {
  await bootRhythm(page, false);
  await page.clock.setSystemTime(starsOpensAt - 100000);
  await page.evaluate(async () => {
    const path = '/src/game/runner/engine.ts', { RunnerEngine } = await import(/* @vite-ignore */ path);
    const s = (window as any).rhythmScene.session;
    s.runner = new RunnerEngine(42, { start: 200, end: 400, score: 17 });
    s.runner.travel = 400 * 60 - 1; s.runner.objects = [];
  });
  await until(page, () => (window as any).rhythmScene.session.phase === 'stars-locked');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars-locked');
}

test('public gate checks scene access, freezes gameplay and opens at the exact release without reload', async ({ page }) => {
  await gate(page);
  await expect(page.getByRole('heading', { name: 'Звезд пока нет', exact: true })).toBeVisible();
  await expect(page.getByText('По прогнозам, звездопад начнется 30.10 в 08:00', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => { const s = (window as any).rhythmScene.session; return [s.startStars(), s.stars, s.score, s.distance]; }))
    .toEqual([false, undefined, 17, 400]);
  await mkdir(directory, { recursive: true }); await page.screenshot({ path: `${directory}/release-gate.png` });
  await page.clock.setSystemTime(starsOpensAt - 1000); await page.clock.runFor(40);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars-locked');
  await page.clock.setSystemTime(starsOpensAt); await page.clock.runFor(80);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars');
  await expect(page.locator('.stars-tutorial')).toBeVisible();
  expect(await page.evaluate(() => (window as any).rhythmScene.session.stars.elapsed)).toBe(0);
});

for (const action of ['Пройти на площадку на свой страх и риск', 'Пройти дальше']) test('release gate: ' + action, async ({ page }) => {
  await gate(page); await page.getByRole('button', { name: action, exact: true }).click(); await page.clock.runFor(80);
  await expect(page.locator('main')).toHaveAttribute('data-phase', action === 'Пройти дальше' ? 'stars-exit' : 'stars');
  expect(await page.locator('.score strong').innerText()).toBe('17');
  expect(await page.evaluate(() => (window as any).rhythmScene.session.distance)).toBe(400);
  if (action === 'Пройти дальше') {
    await until(page, () => (window as any).rhythmScene.session.phase === 'runner');
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
    expect(await page.evaluate(() => (window as any).rhythmScene.session.region)).toBe('shadows');
  } else {
    await page.getByRole('button', { name: 'Начать →', exact: true }).click(); await page.clock.runFor(80);
    await expect(page.locator('.rhythm-hud')).toBeVisible();
  }
});

test('public mini-game 2 shortcut shows the notice; the developer stage remains available', async ({ page }) => {
  await bootRhythm(page, false);
  await page.clock.setSystemTime(starsOpensAt - 100000);
  await page.getByRole('button', { name: 'К этапам', exact: true }).click();
  await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click(); await page.clock.runFor(80);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars-locked');
  await expect(page.getByRole('heading', { name: 'Звезд пока нет', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Пройти на площадку на свой страх и риск', exact: true }).click();
  await page.clock.runFor(80); await expect(page.locator('.stars-tutorial')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'К этапам', exact: true }).click();
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: 'Мини-игра со звёздами', exact: true }).click(); await page.clock.runFor(80);
  await expect(page.locator('.stars-tutorial')).toBeVisible();
  await expect(page.locator('.stars-gate')).toHaveCount(0);
});

test('the real retry button reinitializes the pipe three times without losing tapes or repeating the runner', async ({ page }) => {
  await bootRhythm(page, false);
  await page.evaluate(() => {
    const r = (window as any).rhythmScene.session.runner; r.objects = []; r.travel = 200 * 60 - 1; r.score = 17;
  });
  await until(page, () => (window as any).rhythmScene.session.phase === 'balance');
  for (let retry = 0; retry < 3; retry++) {
    await expect(page.locator('.balance-tutorial')).toBeVisible();
    await page.getByRole('button', { name: 'Понятно, пошатываемся' }).click(); await page.clock.runFor(80);
    await page.locator('main').focus(); await page.keyboard.down('KeyD');
    await until(page, () => !!(window as any).rhythmScene.session.result); await page.keyboard.up('KeyD');
    await expect(page.locator('main')).toHaveAttribute('data-screen', 'game-over');
    await page.getByRole('button', { name: 'Играть ещё раз', exact: true }).click(); await page.clock.runFor(80);
    expect(await page.evaluate(() => {
      const scene = (window as any).rhythmScene, s = scene.session;
      return [s.phase, s.score, s.distance, s.balance.elapsed, s.lives, scene.audio.status.scene, s.runner.inputs.length];
    })).toEqual(['balance', 17, 200, 0, 3, 'balance', 0]);
  }
});

for (const [width, height, name] of [[960, 540, 'desktop'], [375, 667, 'portrait'], [568, 320, 'landscape']] as const) {
  test('door reacts to mouse and touch without resetting the room; readable HUD: ' + name, async ({ page }) => {
    await page.setViewportSize({ width, height }); await bootRhythm(page);
    await direct(page, 'Мини-игра в комнате');
    await advance(page, 1000);
    const point = await page.evaluate(() => {
      const scene = (window as any).rhythmScene, room = scene.waitingView.composition, camera = scene.cameras.main;
      const p = camera.matrix.transformPoint(room.x + 802 * room.scaleX - camera.scrollX, room.y + 275 * room.scaleY - camera.scrollY);
      const rect = scene.game.canvas.getBoundingClientRect();
      return { x: rect.x + p.x / scene.scale.width * rect.width, y: rect.y + p.y / scene.scale.height * rect.height };
    });
    const read = () => page.evaluate(() => {
      const e = (window as any).rhythmScene.session.waiting;
      return { elapsed: e.elapsed, resets: e.resets, hint: e.hint, alpha: e.hintOpacity, presses: e.presses };
    });
    const before = await read();
    await page.mouse.click(point.x, point.y); await page.clock.runFor(80);
    const hint = page.getByText('Ты куда-то торопишься?', { exact: true }); await expect(hint).toBeVisible();
    expect((await read()).resets).toBe(0); expect((await read()).elapsed).toBeGreaterThan(before.elapsed);
    await until(page, () => (window as any).rhythmScene.session.waiting.hintOpacity < .8);
    expect((await read()).alpha).toBeLessThan(.8);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.clock.runFor(80);
    await expect(hint).toHaveCount(1); expect((await read()).alpha).toBe(1); expect((await read()).presses).toBe(2);
    await page.getByRole('button', { name: 'Пауза', exact: true }).click(); const frozen = await read();
    await page.clock.runFor(5000); expect(await read()).toEqual(frozen);
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await until(page, () => !(window as any).rhythmScene.session.waiting.hint); await expect(hint).toHaveCount(0);
    await mkdir(directory, { recursive: true }); await page.screenshot({ path: `${directory}/${name}-room-graffiti.png` });
    const counters = await page.locator('.hud-status').boundingBox();
    expect(counters!.x).toBeGreaterThanOrEqual(0); expect(counters!.x + counters!.width).toBeLessThanOrEqual(width);
    await direct(page, 'Первый забег · 0–200');
    await page.evaluate(() => {
      const e = (window as any).rhythmScene.session.runner;
      e.objects = [{ id: 'contact', kind: 'fence', x: e.travel + 180, y: 400, width: 80, height: 38 }]; e.score = 8;
    });
    await page.clock.runFor(80); await expect(page.locator('.lives')).toHaveAttribute('aria-label', 'Жизни: 2 из 3');
    await expect(page.locator('.score strong')).toHaveText('8');
    expect(await page.evaluate(() => {
      const h = (window as any).rhythmScene.runnerView.hero;
      return { visible: h.visible, texture: h.texture.key, onScreen: h.x > 0 && h.x < 960 && h.y > 0 && h.y < 540, alpha: h.alpha > 0 };
    })).toEqual({ visible: true, texture: 'night-hero', onScreen: true, alpha: true });
    await page.screenshot({ path: `${directory}/${name}-hud-hit.png` });
    await page.clock.runFor(400); await expect(page.locator('.lives')).toHaveAttribute('aria-label', 'Жизни: 2 из 3');
  });
}

test('the installed shadows music starts after the introduction and pause preserves its playhead', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const original = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) { (window as any).rhythmScene = (this as any).scene; return original.apply(this, args as any); };
  });
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: 'Третий забег · 400–600', exact: true }).click();
  await page.waitForFunction(offset => (window as any).rhythmScene?.audio.status.music.some((v: any) => v.url.includes('05-teni') && v.position > offset + .2), SHADOWS_SCORE.musicStartSeconds);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const read = () => page.evaluate(() => (window as any).rhythmScene.audio.status.music.find((v: any) => v.url.includes('05-teni') && !v.fading).position);
  const at = await read(); await page.waitForTimeout(300); expect(Math.abs(await read() - at)).toBeLessThan(.1);
});

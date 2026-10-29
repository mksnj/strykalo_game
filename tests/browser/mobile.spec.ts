import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fixedRunnerSeed, opening } from './runnerScenario';

async function start(page: Page, developer = true) {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  // Test-only observation of the real scene, without production debug globals.
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: unknown[]) {
      (window as any).mobileScene = this.scene; (this.scene as any).audio.musicPosition = () => undefined; render.apply(this, args);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  if (developer) await page.getByRole('checkbox', { name: 'Для разработчика' }).check();
  await page.getByRole('button', { name: 'Начать путь' }).tap();
  if (!developer) await page.getByRole('button', { name: 'Понятно, в путь' }).tap();
  await page.clock.runFor(40);
}
const read = (page: Page) => page.evaluate(() => {
  const scene = (window as any).mobileScene, session = scene.session;
  return { y: session.runner.player.y, grounded: session.runner.player.grounded,
    held: scene.inputController.held.size, distance: session.distance,
    starsX: session.stars?.x, starsY: session.stars?.y, phase: session.phase,
    camera: { width: scene.cameras.main.worldView.width, x: scene.cameras.main.worldView.x } };
});
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x = 0, y = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
}
async function phase(page: Page, name: 'balance' | 'stars' | 'waiting' | 'final-run') {
  await page.evaluate(async name => {
    const scene = (window as any).mobileScene, session = scene.session;
    scene.clearInput();
    if (name === 'balance') {
      const path = '/src/game/minigames/balance/BalanceEngine.ts';
      const { BalanceEngine } = await import(/* @vite-ignore */ path); session.balance = new BalanceEngine(1);
    } else if (name === 'stars') {
      const path = '/src/game/minigames/stars/StarsEngine.ts';
      const { StarsEngine } = await import(/* @vite-ignore */ path); session.stars = new StarsEngine(1);
    } else if (name === 'waiting') {
      const path = '/src/game/minigames/waiting/WaitingEngine.ts';
      const { WaitingEngine } = await import(/* @vite-ignore */ path); session.waiting = new WaitingEngine();
    }
    session.phase = name; session.phaseTime = 0;
  }, name);
  await page.clock.runFor(32);
}

const sizes = [[375, 667], [390, 844], [360, 800], [667, 375], [844, 390], [915, 412], [1230, 372], [1920, 1080]];
test('портретный раннер: настоящий прыжок через препятствие и читаемые кассеты', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await fixedRunnerSeed(page); await start(page, false);
  for (let i = 0; i < 100 && (await read(page)).distance < opening.jumpAt; i++) await page.clock.runFor(40);
  await expect(page.locator('main')).toHaveAttribute('data-screen', 'playing');
  await page.screenshot({ path: 'docs/previews/mobile/375x667-obstacle.png' });
  const cdp = await context.newCDPSession(page);
  await touch(cdp, 'touchStart', 280, 580);
  await touch(cdp, 'touchEnd'); // A complete short tap before the next simulation frame.
  await page.clock.runFor(180);
  expect((await read(page)).y).toBeLessThan(400);
  await page.screenshot({ path: 'docs/previews/mobile/375x667-jump.png' });
  for (let i = 0; i < 100 && (await read(page)).distance < opening.clearAt; i++) await page.clock.runFor(40);
  expect((await read(page)).distance).toBeGreaterThanOrEqual(opening.clearAt);
  await expect(page.locator('.result')).toHaveCount(0);
  expect((await read(page)).phase).toBe('runner'); await context.close();
});
for (const [width, height] of sizes) test(`мобильная компоновка и кадры ${width}×${height}`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 1000 });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('docs/previews/mobile', { recursive: true });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Начать путь' }); await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.y).toBeGreaterThan(55); expect(box.y + box.height).toBeLessThan(height);
  await page.screenshot({ path: `docs/previews/mobile/${width}x${height}-menu.png` });
  await start(page);
  for (const name of ['runner', 'balance', 'stars'] as const) {
    if (name !== 'runner') await phase(page, name);
    const canvas = (await page.locator('canvas').boundingBox())!;
    expect(canvas.x).toBeGreaterThanOrEqual(-1); expect(canvas.y).toBeGreaterThanOrEqual(0);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(width + 1);
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(height + 1);
    if (width / height >= 16 / 9) {
      expect(canvas.width).toBeGreaterThanOrEqual(width - 1);
      expect(canvas.height).toBeGreaterThanOrEqual(height - 1);
    }
    await expect(page.locator('.balance-buttons,.balance-button,.movement-buttons,.jump-guide span')).toHaveCount(0);
    if (width < height) {
      const hud = (await page.locator('.hud').boundingBox())!;
      expect(hud.y + hud.height).toBeLessThan(canvas.y);
      if (name === 'runner') {
        const camera = (await read(page)).camera;
        expect(camera.width).toBeCloseTo(720); expect(camera.x + camera.width - 180).toBeGreaterThan(550);
      }
    }
    for (const locator of [page.getByRole('button', { name: 'Пауза', exact: true })]) {
      const bounds = (await locator.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    if (name === 'stars') {
      for (const key of await page.locator('.rhythm-keys button').all()) {
        const bounds = (await key.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
        if (width < height) expect(bounds.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
      }
    }
    await page.screenshot({ path: `docs/previews/mobile/${width}x${height}-${name}.png` });
  }
  expect(errors).toEqual([]); await context.close();
});

test('касания всего экрана: высота, перенос пальца, cancel, capture, буфер перед приземлением', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await start(page);
  const cdp = await context.newCDPSession(page);
  const restart = async () => {
    await page.evaluate(async () => {
      const path = '/src/game/state/store.ts'; const { gameStore } = await import(/* @vite-ignore */ path);
      gameStore.menu(); gameStore.start(true);
    }); await page.clock.runFor(40);
  };
  // Passive HUD, space above/below the canvas and both sides use the same input.
  for (const [x, y] of [[20, 180], [370, 180], [40, 620], [350, 620], [24, 120]]) {
    await touch(cdp, 'touchStart', x, y); await page.clock.runFor(40);
    expect((await read(page)).grounded).toBe(false);
    await touch(cdp, 'touchEnd'); await page.clock.runFor(900);
  }
  // New attempt keeps the real developer route from reaching the pipe during input checks.
  await restart();
  await touch(cdp, 'touchStart', 250, 300); await page.clock.runFor(24); await touch(cdp, 'touchEnd');
  let shortY = 438;
  for (let i = 0; i < 15; i++) { await page.clock.runFor(40); shortY = Math.min(shortY, (await read(page)).y); }
  await page.clock.runFor(400);
  await touch(cdp, 'touchStart', 250, 300);
  let heldY = 438;
  for (let i = 0; i < 15; i++) { await page.clock.runFor(40); heldY = Math.min(heldY, (await read(page)).y); }
  expect(shortY).toBeLessThan(325); // A reliable full base jump, even on a short tap.
  expect(heldY).toBeLessThan(shortY - 15);
  await touch(cdp, 'touchMove', 15, 700); expect((await read(page)).held).toBe(1);
  await touch(cdp, 'touchEnd'); expect((await read(page)).held).toBe(0);
  await restart();
  await touch(cdp, 'touchStart', 200, 300); await page.clock.runFor(40); await touch(cdp, 'touchCancel');
  expect((await read(page)).held).toBe(0); await restart();
  await touch(cdp, 'touchStart', 200, 300); await page.clock.runFor(40);
  // Activate the pending capture before releasing it: without a subsequent
  // pointer event a browser may cancel pending capture without emitting lost.
  await touch(cdp, 'touchMove', 201, 301);
  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const held = [...(window as any).mobileScene.inputController.held] as string[];
    main.releasePointerCapture(Number(held.find(id => id.startsWith('pointer-'))!.slice(8)));
  });
  await touch(cdp, 'touchMove', 210, 300);
  expect((await read(page)).held).toBe(0); await touch(cdp, 'touchEnd'); await page.clock.runFor(700);
  // Use actual physics to approach landing, then issue a second real touch inside the buffer window.
  await restart();
  await touch(cdp, 'touchStart', 200, 300); await page.clock.runFor(40); await touch(cdp, 'touchEnd');
  await page.clock.runFor(150);
  let nearLanding = false;
  for (let i = 0; i < 140; i++) {
    const state = await page.evaluate(() => {
      const p = (window as any).mobileScene.session.runner.player; return { y: p.y, velocity: p.velocity };
    });
    if (state.velocity > 0 && state.y > 418) { nearLanding = true; break; }
    await page.clock.runFor(8);
  }
  expect(nearLanding).toBe(true); expect((await read(page)).grounded).toBe(false);
  await touch(cdp, 'touchStart', 200, 300); await touch(cdp, 'touchEnd');
  let bufferedJump = false;
  for (let i = 0; i < 20; i++) {
    await page.clock.runFor(16);
    bufferedJump = await page.evaluate(() => {
      const player = (window as any).mobileScene.session.runner.player;
      return !player.grounded && player.velocity < 0;
    });
    if (bufferedJump) break;
  }
  expect(bufferedJump).toBe(true);
  await context.close();
});

test('UI, пауза, поворот и другие сцены не вызывают прыжок и не оставляют удержание', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await start(page); const cdp = await context.newCDPSession(page);
  await page.getByRole('button', { name: 'Выключить звук' }).tap();
  await page.locator('.audio-settings summary').tap();
  await page.getByRole('slider', { name: 'Громкость музыки' }).fill('0.4');
  await page.locator('.audio-settings summary').tap(); await page.clock.runFor(32);
  expect((await read(page)).grounded).toBe(true);
  await touch(cdp, 'touchStart', 400, 220); await page.clock.runFor(40);
  await page.evaluate(async () => { const path = '/src/game/state/store.ts'; (await import(/* @vite-ignore */ path)).gameStore.pause(); });
  expect((await read(page)).held).toBe(0); await touch(cdp, 'touchEnd');
  const distance = (await read(page)).distance; await page.clock.runFor(1000); expect((await read(page)).distance).toBe(distance);
  await page.getByRole('button', { name: 'Продолжить' }).tap();
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(32);
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).tap(); await page.clock.runFor(40);
  expect((await read(page)).distance).toBeGreaterThanOrEqual(distance);
  for (const name of ['balance', 'stars', 'waiting', 'final-run'] as const) {
    await phase(page, name); await touch(cdp, 'touchStart', 260, 340); await page.clock.runFor(24); await touch(cdp, 'touchEnd');
    expect((await read(page)).held).toBe(0);
  }
  await context.close();
});

test('четыре сенсорных стрелки ритма не двигают героя и не вызывают прыжок', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await start(page); await phase(page, 'stars');
  const before = await read(page);
  const direction = await page.evaluate(() => {
    const e = (window as any).mobileScene.session.stars, n = e.notes[0]; e.tick = Math.round(n.at * 120); return n.direction;
  });
  await page.locator('[data-direction=' + direction + ']').tap(); await page.clock.runFor(40);
  expect(await page.evaluate(() => (window as any).mobileScene.session.stars.hits)).toBe(1);
  const after = await read(page); expect([after.starsX, after.starsY, after.held]).toEqual([before.starsX, before.starsY, 0]);
  await expect(page.locator('.joystick')).toHaveCount(0); await context.close();
});

test('труба: половины экрана вместо стрелок, перенос через центр, отмена и защита UI', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1230, height: 372 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await start(page); await phase(page, 'balance');
  const cdp = await context.newCDPSession(page);
  const direction = () => page.evaluate(async () => {
    const path = '/src/game/input/BalanceInput.ts';
    return (await import(/* @vite-ignore */ path)).balanceControls.direction;
  });
  await expect(page.locator('.balance-button,.balance-buttons')).toHaveCount(0);
  // Both the illustrated side extensions and passive HUD belong to the gesture area.
  for (const [x, y, expected] of [[30, 120, -1], [1200, 180, 1], [50, 340, -1], [1170, 340, 1]]) {
    await touch(cdp, 'touchStart', x, y); expect(await direction()).toBe(expected);
    await page.clock.runFor(24); await touch(cdp, 'touchEnd'); expect(await direction()).toBe(0);
  }
  await touch(cdp, 'touchStart', 300, 250); await touch(cdp, 'touchMove', 900, 250);
  expect(await direction()).toBe(1);
  await touch(cdp, 'touchCancel'); expect(await direction()).toBe(0);
  await touch(cdp, 'touchStart', 300, 250); await touch(cdp, 'touchMove', 301, 251);
  await page.evaluate(() => {
    const scene = (window as any).mobileScene;
    const id = [...scene.balanceInput.pointers][0] as number;
    document.querySelector('main')!.releasePointerCapture(id);
  });
  await touch(cdp, 'touchMove', 320, 250); expect(await direction()).toBe(0);
  await touch(cdp, 'touchEnd');
  await page.getByRole('button', { name: 'Выключить звук' }).tap(); expect(await direction()).toBe(0);
  await page.locator('.audio-settings summary').tap(); expect(await direction()).toBe(0);
  await page.getByRole('slider', { name: 'Громкость музыки' }).fill('0.4'); expect(await direction()).toBe(0);
  await page.locator('.audio-settings summary').tap();
  await touch(cdp, 'touchStart', 900, 250);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await direction()).toBe(0); await touch(cdp, 'touchEnd');
  await page.getByRole('button', { name: 'Продолжить' }).tap(); await page.clock.runFor(24);
  expect(await direction()).toBe(0);
  await page.keyboard.down('KeyA'); expect(await direction()).toBe(-1);
  await page.keyboard.up('KeyA'); expect(await direction()).toBe(0);
  await context.close();
});

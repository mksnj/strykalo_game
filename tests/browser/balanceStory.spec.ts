import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const directory = 'docs/previews/balance-story';
const beginBalance = (page: Page) => page.getByRole('button', { name: 'Понятно, пошатываемся' });

async function boot(page: Page, developer = false) {
  await page.clock.install();
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array.fill(1); return array; } });
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 40);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path), render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).balanceScene = (this as any).scene; return render.apply(this, args as any);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  if (developer) await page.getByRole('checkbox', { name: 'Для разработчика' }).check({ force: true });
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  if (!developer) await page.getByRole('button', { name: 'Понятно, в путь' }).click({ force: true });
  await page.clock.runFor(80);
  await page.evaluate(() => {
    const s = (window as any).balanceScene.session;
    s.runner.travel = s.route.balanceAt * 60 - 100;
  });
  await page.clock.runFor(40);
}

async function intro(page: Page) {
  // Advance the real session to its blocking state, then publish exactly as RunnerScene does.
  await page.evaluate(async () => {
    const path = '/src/game/state/store.ts', { gameStore } = await import(/* @vite-ignore */ path);
    const s = (window as any).balanceScene.session;
    for (let i = 0; i < 1500 && s.phase !== 'balance'; i++) s.step();
    gameStore.progress(s);
  });
  await page.clock.runFor(40);
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/game/input/BalanceInput.ts', { balanceControls } = await import(/* @vite-ignore */ path);
    const scene = (window as any).balanceScene, s = scene.session, b = scene.runnerView.beer;
    return { phase: s.phase, time: s.phaseTime, score: s.score, distance: s.distance, collected: s.beerCollected,
      elapsed: s.balance?.elapsed, position: s.balance?.position, velocity: s.balance?.velocity, wind: s.balance?.wind,
      direction: balanceControls.direction, pending: s.balanceIntroPending,
      bottle: { visible: b.visible, alpha: b.alpha, y: b.y, x: b.x, angle: b.angle }, heroAngle: scene.runnerView.hero.angle };
  });
}

for (const developer of [false, true]) {
  test(`бутылка → подбор → камера → обучение без хода времени, режим ${developer ? 'разработчика' : 'обычный'}`, async ({ page }) => {
    test.setTimeout(90000); const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await mkdir(directory, { recursive: true }); await boot(page, developer);
    const before = await state(page);
    expect(before.bottle.visible).toBe(true); expect(before.bottle.alpha).toBe(1);
    if (!developer) await page.screenshot({ path: `${directory}/bottle-before.png` });
    for (let i = 0; i < 60 && (await state(page)).phase === 'runner'; i++) await page.clock.runFor(80);
    expect((await state(page)).phase).toBe('beer-pickup');
    for (let i = 0; i < 30 && (await state(page)).time < .6; i++) await page.clock.runFor(40);
    const pickup = await state(page);
    expect(pickup.collected).toBe(true); expect(pickup.bottle.angle).toBeLessThan(0);
    expect(pickup.bottle.y).toBeLessThan(438); expect(pickup.heroAngle).toBeGreaterThan(0);
    expect(pickup.score).toBe(before.score);
    if (!developer) await page.screenshot({ path: `${directory}/bottle-pickup.png` });
    for (let i = 0; i < 80 && !(await state(page)).pending; i++) await page.clock.runFor(160);
    await expect(page.getByRole('dialog')).toBeVisible();
    const frozen = await state(page);
    expect(frozen.bottle.visible).toBe(false); expect(frozen.pending).toBe(true);
    expect([frozen.elapsed, frozen.position, frozen.velocity]).toEqual([0, 0, 0]);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.down('KeyD');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.clock.runFor(2000); await page.clock.fastForward(60_000);
    expect(await state(page)).toEqual(frozen);
    await expect(page.getByRole('heading', { name: 'Пауза', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'ДЕЛАТЬ ЭТО ТРЕЗВЫМ', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(beginBalance(page)).toBeFocused();
    await page.keyboard.press('Tab'); await expect(beginBalance(page)).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible();
    if (!developer) await page.screenshot({ path: `${directory}/onboarding-960x540.png` });
    await page.keyboard.press('Enter'); await page.clock.runFor(40);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', repeat: true, bubbles: true })));
    expect((await state(page)).direction).toBe(0); await page.keyboard.up('KeyD');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await state(page)).elapsed).toBeLessThan(.1);
    await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
    const paused = await state(page); await page.clock.runFor(3000); expect(await state(page)).toEqual(paused);
    await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
    await page.locator('main').focus();
    await page.keyboard.down('ArrowRight');
    for (let i = 0; i < 30 && Math.abs((await state(page)).position!) < .78; i++) await page.clock.runFor(80);
    await expect(page.locator('.balance-meter.unstable')).toBeVisible();
    if (!developer) await page.screenshot({ path: `${directory}/hud-critical.png` });
    await page.clock.runFor(2000); await page.keyboard.up('ArrowRight');
    await expect(page.getByRole('heading', { name: 'Не в этот раз' })).toBeVisible();
    await page.getByRole('button', { name: 'Играть ещё раз', exact: true }).click({ force: true }); await page.clock.runFor(40);
    const retry = await state(page);
    expect(retry.collected).toBe(true); expect(retry.phase).toBe('balance'); expect(retry.elapsed).toBe(0);
    expect(retry.distance).toBe(frozen.distance); expect(retry.score).toBe(frozen.score); expect(retry.pending).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('клавиши A/D и стрелки, реальные 50% и 100%, успешный выход и checkpoint', async ({ page }) => {
  test.setTimeout(120000); await boot(page, true); await intro(page); await beginBalance(page).click({ force: true });
  await page.clock.runFor(40); await page.locator('main').focus();
  for (const code of ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight']) {
    await page.evaluate(() => { const b = (window as any).balanceScene.session.balance; b.elapsed = 0; b.position = 0; b.velocity = 0; });
    await page.keyboard.down(code); await page.clock.runFor(320); await page.keyboard.up(code);
    expect(Math.sign((await state(page)).position!)).toBe(code === 'KeyA' || code === 'ArrowLeft' ? -1 : 1);
    expect((await state(page)).direction).toBe(0);
  }
  await page.evaluate(() => {
    const b = (window as any).balanceScene.session.balance; b.elapsed = 0; b.position = 0; b.velocity = 0;
    let held = '';
    const drive = () => {
      const s = (window as any).balanceScene.session, b = s.balance;
      const p = b ? b.position + b.velocity * .35 : 0;
      const next = s.phase === 'balance' && b && Math.abs(p) > .06 ? p > 0 ? 'KeyA' : 'KeyD' : '';
      if (held !== next) {
        if (held) window.dispatchEvent(new KeyboardEvent('keyup', { code: held }));
        if (next) window.dispatchEvent(new KeyboardEvent('keydown', { code: next }));
        held = next;
      }
      requestAnimationFrame(drive);
    }; requestAnimationFrame(drive);
  });
  await page.clock.runFor(18_000);
  for (let i = 0; i < 100 && (await state(page)).elapsed! < 17.99; i++) await page.clock.runFor(40);
  expect((await state(page)).elapsed).toBeCloseTo(18, 1);
  const progress = Number(await page.getByRole('progressbar', { name: /Труба пройдена/ }).getAttribute('aria-valuenow'));
  expect(Math.abs(progress - 50)).toBeLessThan(.15);
  expect(progress).toBeCloseTo((await state(page)).elapsed! / 36 * 100, 1);
  const marker = await page.locator('.balance-hero').evaluate(e => getComputedStyle(e).backgroundImage);
  expect(marker).toContain('/assets/journey-v1/idle.webp');
  await page.screenshot({ path: `${directory}/hud-normal-progress-50.png` });
  await page.clock.runFor(18_200);
  for (let i = 0; i < 100 && (await state(page)).phase === 'balance'; i++) await page.clock.runFor(80);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'pipe-exit');
  expect((await state(page)).elapsed).toBe(36);
  await expect(page.locator('.balance-hud')).toHaveCount(0);
  await page.screenshot({ path: `${directory}/progress-100.png` });
  await page.clock.runFor(2500); await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
  await page.evaluate(async () => {
    const s = (window as any).balanceScene.session; s.runner.lives = 0;
    s.result = { score: s.score, distance: s.distance, reason: 'collision' };
  });
  await page.clock.runFor(80);
  await page.getByRole('button', { name: 'Продолжить с 20' }).click({ force: true }); await page.clock.runFor(80);
  expect((await state(page)).distance).toBeGreaterThanOrEqual(20);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const [width, height] of [[360,800],[375,667],[390,844],[568,320],[667,375],[844,390],[915,412],[1230,372],[1920,1080]]) {
  test(`обучение, анимация, мобильный ввод и HUD помещаются: ${width}×${height}`, async ({ page }) => {
    test.setTimeout(60000); await page.setViewportSize({ width, height }); await boot(page, true); await intro(page);
    for (const target of [page.getByRole('dialog'), beginBalance(page), page.locator('.balance-demo')]) {
      const box = (await target.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    const demo = await page.locator('.demo-meter .meter-position').evaluate(e => {
      const a = e.getAnimations()[0]; a.pause(); a.currentTime = 2000;
      const right = e.getBoundingClientRect().x; a.currentTime = 6000;
      return { right, left: e.getBoundingClientRect().x };
    });
    expect(demo.right - demo.left).toBeGreaterThan(40);
    expect(await page.getByRole('dialog').evaluate(e => e.scrollHeight <= e.clientHeight)).toBe(true);
    await page.screenshot({ path: `${directory}/onboarding-${width}x${height}.png` });
    await beginBalance(page).click({ force: true }); await page.clock.runFor(40);
    const panel = (await page.locator('.balance-instruments').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.y + panel.height).toBeLessThanOrEqual(height);
    const progress = (await page.locator('.crossing-progress').boundingBox())!, meter = (await page.getByRole('meter').boundingBox())!;
    expect(meter.y + meter.height).toBeLessThan(progress.y);
    if (width < height) {
      const canvas = (await page.locator('canvas').boundingBox())!;
      expect(panel.y).toBeGreaterThan(canvas.y + canvas.height);
    }
    // Touch on the passive HUD also belongs to the corresponding screen half.
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width * .2, y: panel.y + 25, id: 1 }] });
    await page.clock.runFor(240); expect((await state(page)).direction).toBe(-1);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width * .8, y: panel.y + 25, id: 1 }] });
    await page.clock.runFor(240); expect((await state(page)).direction).toBe(1);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await state(page)).direction).toBe(0);
    await page.screenshot({ path: `${directory}/hud-${width}x${height}.png` });
  });
}

test('поворот телефона и удержания на обучении не запускают физику и окно паузы', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); await boot(page, true); await intro(page);
  const frozen = await state(page);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 330, y: 300, id: 1 }] });
  await page.clock.runFor(200); expect((await state(page)).direction).toBe(0);
  await page.setViewportSize({ width: 667, height: 375 }); await page.clock.runFor(500);
  expect(await state(page)).toEqual(frozen);
  await expect(page.getByRole('heading', { name: 'Пауза', exact: true })).toHaveCount(0);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await beginBalance(page).click({ force: true }); await page.clock.runFor(80);
  expect((await state(page)).direction).toBe(0);
  expect((await state(page)).elapsed).toBeLessThan(.1);
  await page.setViewportSize({ width: 375, height: 667 }); await page.clock.runFor(40);
  await expect(page.getByRole('heading', { name: 'Пауза', exact: true })).toBeVisible();
});

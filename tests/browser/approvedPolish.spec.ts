import { test, expect, type Page } from '@playwright/test';
import { JOURNEY, RUNNER } from '../../apps/web/src/game/config';
import { ENDING_DURATION } from '../../apps/web/src/game/views/endingTimeline';

async function start(page: Page) {
  await page.clock.install(); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: unknown[]) {
      (window as any).polishScene = this.scene; render.apply(this, args);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.getByRole('button', { name: 'Понятно, в путь' }).click(); await page.clock.runFor(40);
}

for (const [width, height, name] of [[960, 540, 'desktop'], [375, 667, 'mobile']] as const) {
  test(`читаемость четырёх препятствий и привязка к земле: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await start(page);
    await page.evaluate(() => {
      const r = (window as any).polishScene.session.runner;
      r.objects = [
        { id: 'audit-fence', kind: 'fence', x: r.travel + 280, y: 412, width: 80, height: 26 },
        { id: 'audit-broken-block', kind: 'broken-block', x: r.travel + 400, y: 404, width: 72, height: 34 },
        { id: 'audit-debris', kind: 'debris', x: r.travel + 520, y: 378, width: 100, height: 60 },
        { id: 'audit-rubble', kind: 'rubble', x: r.travel + 640, y: 381, width: 100, height: 57 },
      ];
    });
    await page.clock.runFor(40);
    const drawn = await page.evaluate(() => {
      const view = (window as any).polishScene.runnerView;
      return ['fence', 'broken-block', 'debris', 'rubble'].map(kind => {
        const image = view.objects.get(`audit-${kind}`);
        return { kind, width: image.displayWidth, top: image.y - image.displayHeight / 2,
          bottom: image.y + image.displayHeight / 2, key: image.texture.key,
          scaleX: image.scaleX, scaleY: image.scaleY };
      });
    });
    for (const image of drawn) {
      expect(image.bottom).toBe(440); expect(image.key).toBe(`night-${image.kind}`);
      expect(image.scaleX).toBe(image.scaleY);
    }
    expect(drawn[2].bottom - drawn[2].top).toBeGreaterThan(60);
    expect(drawn[3].bottom - drawn[3].top).toBeGreaterThan(60);
    await page.screenshot({ path: `docs/previews/polish-hazards-${name}.png` });
  });
}

for (const [width, height] of [[960, 540], [375, 667], [667, 375]]) test(`три жизни: контрольная точка → поражение → продолжение → повтор ${width}×${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  // Stage the existing balance simulation at its final tick, then use real scene/store/UI flow.
  await page.evaluate(async () => {
    const scene = (window as any).polishScene, s = scene.session;
    const enginePath = '/src/game/runner/engine.ts', balancePath = '/src/game/minigames/balance/BalanceEngine.ts';
    const { RunnerEngine } = await import(/* @vite-ignore */ enginePath);
    const { BalanceEngine } = await import(/* @vite-ignore */ balancePath);
    s.runner = new RunnerEngine(1, { start: 0, end: 200, score: 12, empty: true }); s.runner.travel = 12000;
    s.balance = new BalanceEngine(1); s.balance.elapsed = 36; s.balance.outcome = 'passed'; s.phase = 'balance';
  });
  await page.clock.runFor(40); await page.clock.runFor(2500);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', 'Жизни: 3 из 3');
  const lives = (await page.locator('.lives').boundingBox())!;
  const distance = (await page.locator('.distance').boundingBox())!;
  expect(lives.x).toBeGreaterThanOrEqual(0);
  expect(lives.x + lives.width).toBeLessThan(distance.x);
  expect(lives.y + lives.height).toBeLessThan(height > width ? (await page.locator('canvas').boundingBox())!.y : height);
  for (let hit = 1; hit <= 3; hit++) {
    await page.evaluate(hit => {
      const r = (window as any).polishScene.session.runner; r.score = 16;
      r.objects.push({ id: `test-collision-${hit}`, kind: 'fence', x: r.travel + 180, y: 400, width: 50, height: 38 });
    }, hit);
    await page.clock.runFor(40);
    if (hit < 3) {
      await expect(page.locator('.lives')).toHaveAttribute('aria-label', `Жизни: ${3 - hit} из 3`);
      await page.clock.runFor(160);
      await expect(page.locator('.lives .life-full')).toHaveCount(3 - hit);
      await expect(page.locator('main')).toHaveAttribute('data-screen', 'playing');
    }
  }
  await expect(page.getByRole('heading', { name: 'Не в этот раз' })).toBeVisible();
  await expect(page.locator('.result-numbers strong').first()).toHaveText('16');
  await page.getByRole('button', { name: 'Продолжить с 200' }).click(); await page.clock.runFor(40);
  await expect(page.locator('.score strong')).toHaveText('12');
  await expect(page.locator('.distance span')).toHaveText('200 / 700');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
  await expect(page.locator('.lives .life-full')).toHaveCount(3);
  expect(await page.evaluate(() => (window as any).polishScene.session.runner.player.grounded)).toBe(true);
  for (let hit = 1; hit <= 3; hit++) {
    await page.evaluate(hit => {
      const r = (window as any).polishScene.session.runner;
      r.objects.push({ id: `test-collision-again-${hit}`, kind: 'fence', x: r.travel + 180, y: 400, width: 50, height: 38 });
    }, hit);
    await page.clock.runFor(40);
  }
  await page.clock.runFor(40); await page.getByRole('button', { name: 'Ещё раз' }).click(); await page.clock.runFor(40);
  await expect(page.locator('.score strong')).toHaveText('0');
  await expect(page.locator('.distance span')).toHaveText('0 / 700');
  await expect(page.locator('.lives .life-full')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('финал в сцене: музыка у скамейки, отдых, подъём, вход и модалка после него', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await page.evaluate(async () => {
    const scene = (window as any).polishScene, s = scene.session;
    const path = '/src/game/runner/engine.ts'; const { RunnerEngine } = await import(/* @vite-ignore */ path);
    s.runner = new RunnerEngine(1, { start: 600, end: 700, score: 17, empty: true });
    s.runner.travel = 699 * 60; s.phase = 'final-run'; s.phaseTime = 0;
  });
  await page.clock.runFor(40);
  expect(await page.evaluate(() => (window as any).polishScene.audio.scene)).toBe('final-run');
  await page.clock.runFor(240);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'ending');
  expect(await page.evaluate(() => (window as any).polishScene.audio.scene)).toBe('ending');
  const state = () => page.evaluate(() => {
    const scene = (window as any).polishScene, v = scene.endingView;
    return { time: scene.session.phaseTime, x: v.hero.x, heroAlpha: v.hero.alpha,
      seatedAlpha: v.seated.container.alpha, seatedVisible: v.seated.container.visible, fade: v.fade.alpha };
  });
  const advanceTo = async (t: number) => {
    const current = await state(); await page.clock.runFor(Math.max(0, (t - current.time) * 1000));
  };
  await advanceTo(JOURNEY.endingSlowSeconds + JOURNEY.endingSitSeconds + 1);
  expect((await state()).seatedAlpha).toBeCloseTo(1); await page.screenshot({ path: 'docs/previews/polish-ending-rest.png' });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click(); const paused = await state();
  await page.clock.runFor(4000); expect(await state()).toEqual(paused);
  await page.getByRole('button', { name: 'Продолжить', exact: false }).click();
  const standEnd = JOURNEY.endingSlowSeconds + JOURNEY.endingSitSeconds + JOURNEY.endingRestSeconds + JOURNEY.endingStandSeconds;
  await advanceTo(standEnd + .1); expect((await state()).seatedVisible).toBe(false);
  expect((await state()).heroAlpha).toBeCloseTo(1);
  await advanceTo(standEnd + JOURNEY.endingWalkSeconds * .7); expect((await state()).x).toBeLessThan(640);
  await page.screenshot({ path: 'docs/previews/polish-ending-walk.png' });
  await advanceTo(standEnd + JOURNEY.endingWalkSeconds + JOURNEY.endingEnterSeconds * .8); expect((await state()).x).toBeCloseTo(480);
  expect((await state()).heroAlpha).toBeLessThan(.6);
  await page.screenshot({ path: 'docs/previews/polish-ending-enter.png' });
  await advanceTo(ENDING_DURATION - RUNNER.fixedStep * 3);
  await expect(page.locator('.result')).toHaveCount(0);
  await page.clock.runFor(120);
  await expect(page.getByRole('heading', { name: 'Путь домой завершён' })).toBeVisible();
  await expect(page.locator('.result-numbers strong').first()).toHaveText('17');
  expect(errors).toEqual([]);
});

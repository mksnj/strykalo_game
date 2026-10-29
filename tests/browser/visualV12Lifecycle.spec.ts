import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.clock.install(); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).lifecycleScene = (this as any).scene; return render.apply(this, args as any);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByLabel('Для разработчика', { exact: true }).check();
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true }); await page.clock.runFor(80);
}
test('fence selection survives seeds, real checkpoint restore and a fresh attempt', async ({ page }) => {
  await boot(page);
  for (const seed of [1, 88, 2026]) {
    await page.evaluate(async seed => {
      const a = '/src/game/state/RunSession.ts', b = '/src/game/runner/engine.ts';
      const { RunSession } = await import(/* @vite-ignore */ a), { RunnerEngine } = await import(/* @vite-ignore */ b);
      const s = new RunSession(seed, true);
      s.runner = new RunnerEngine(seed, { start: 20, end: 40, score: 17, distanceScale: 10, empty: true });
      s.checkpoint = Object.freeze({ start: 20, end: 40, score: 17, seed, empty: false });
      s.runner.travel = 34 * 60; s.runner.lives = 0;
      s.result = { reason: 'collision', distance: 34, score: 99 };
      if (!s.continueFromCheckpoint()) throw new Error('checkpoint did not restore');
      (window as any).lifecycleScene.session = s;
    }, seed);
    await page.clock.runFor(40);
    const restored = await page.evaluate(() => {
      const scene = (window as any).lifecycleScene, s = scene.session, art = scene.runnerView.nightArt;
      return { region: s.region, continued: s.continued, score: s.score, lives: s.lives,
        key: art.courtKey, far: art.farKey, seed: s.runner.seed };
    });
    expect(restored).toMatchObject({ region: 'autumn', continued: true, lives: 3, key: 'court-original', far: 'night-far-court-sky' });
    // Some early collectible may be picked up at the checkpoint; the losing score is never restored.
    expect(restored.score).toBeLessThan(20);
  }
  await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'В меню', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true }); await page.clock.runFor(80);
  expect(await page.evaluate(() => {
    const scene = (window as any).lifecycleScene;
    return [scene.session.starsIntroPending, scene.runnerView.nightArt.courtKey, scene.session.continued];
  })).toEqual([false, 'night-court', false]);
});

test('reduced motion, mute, orientation and repeat intro preserve state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await boot(page);
  await page.getByRole('button', { name: 'Выключить звук' }).click({ force: true });
  await page.evaluate(() => {
    const scene = (window as any).lifecycleScene; scene.session.weatherStarted = true; scene.session.weatherElapsed = 6.5;
  });
  await page.clock.runFor(40);
  expect(await page.evaluate(() => {
    const scene = (window as any).lifecycleScene; return [scene.stormView.glow.alpha, scene.audio.status.muted];
  })).toEqual([0, true]);
  await page.evaluate(async () => {
    const s = (window as any).lifecycleScene.session;
    s.phase = 'stars-approach'; s.phaseTime = 4.799;
  });
  await page.clock.runFor(80); await expect(page.getByRole('dialog')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(80);
  await page.setViewportSize({ width: 844, height: 390 }); await page.clock.runFor(80);
  expect(await page.evaluate(() => (window as any).lifecycleScene.session.stars.elapsed)).toBe(0);
  await expect(page.getByRole('heading', { name: 'Пауза', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true }); await page.clock.runFor(80);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'В меню', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true }); await page.clock.runFor(80);
  await page.evaluate(() => { const s = (window as any).lifecycleScene.session; s.phase = 'stars-approach'; s.phaseTime = 4.799; });
  await page.clock.runFor(80); await expect(page.getByRole('dialog')).toBeVisible();
});

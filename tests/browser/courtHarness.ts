import { expect, type Page } from '@playwright/test';

export async function startCourt(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-10-31T00:00:00Z') }); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).courtScene = (this as any).scene;
      return render.apply(this, args as any);
    };
  });
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.getByRole('button', { name: 'Понятно, в путь' }).click();
  await page.clock.runFor(80);
}
export async function placeCourt(page: Page, frozen = true): Promise<void> {
  await page.evaluate(async frozen => {
    const runnerPath = '/src/game/runner/engine.ts', starsPath = '/src/game/minigames/stars/StarsEngine.ts';
    const { RunnerEngine } = await import(/* @vite-ignore */ runnerPath);
    const { StarsEngine } = await import(/* @vite-ignore */ starsPath);
    const scene = (window as any).courtScene, s = scene.session;
    s.runner = new RunnerEngine(1, { start: 200, end: 400, score: 17, empty: true });
    s.runner.travel = 24000; s.stars = new StarsEngine(1);
    s.phase = 'stars-approach'; s.phaseTime = 0;
    if (frozen) s.step = () => {};
    scene.lastPhase = s.phase; scene.accumulator = 0;
  }, frozen);
}
export async function positionCourt(page: Page, phase: string, progress = 0): Promise<void> {
  await page.evaluate(({ phase, progress }) => {
    const s = (window as any).courtScene.session;
    s.phase = phase; s.phaseTime = progress * (phase === 'stars-exit' ? 4.6 : 4.8);
  }, { phase, progress });
  await page.clock.runFor(40);
}

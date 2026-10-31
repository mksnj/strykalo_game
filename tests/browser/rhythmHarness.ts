import { expect, type Page } from '@playwright/test';
import { RHYTHM } from '../../apps/web/src/game/config';
export async function bootRhythm(page: Page, developer = true) {
  await page.clock.install({ time: new Date('2026-10-31T00:00:00Z') });
  await page.addInitScript(() => {
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 40);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).rhythmScene = (this as any).scene;
      (window as any).rhythmScene.audio.musicPosition = () => undefined;
      return render.apply(this, args as any);
    };
  });
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  if (developer) await page.getByRole('checkbox', { name: 'Для разработчика' }).check();
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  if (!developer) await page.getByRole('button', { name: 'Понятно, в путь' }).click({ force: true });
  await page.clock.runFor(80);
}
export async function reachRhythm(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/game/runner/engine.ts', { RunnerEngine } = await import(/* @vite-ignore */ path);
    const s = (window as any).rhythmScene.session;
    s.runner = new RunnerEngine(7, { start: s.route.balanceAt, end: s.route.starsAt, score: 17, empty: true, distanceScale: s.route.scale });
    s.runner.travel = s.route.starsAt * 60 - 1;
    s.step();
    if (s.phase !== 'stars-approach') throw new Error('Unexpected storm before game 2');
    while (s.phase !== 'stars') s.step();
    const a = '/src/game/state/store.ts', { gameStore } = await import(/* @vite-ignore */ a); gameStore.progress(s);
  });
  await page.clock.runFor(40); await expect(page.getByRole('dialog')).toBeVisible();
}
export async function beginRhythm(page: Page) {
  await reachRhythm(page); await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true });
  await page.clock.runFor(40);
}
export async function targetNote(page: Page, index = 0, offset = 0) {
  return page.evaluate(({ index, offset }) => {
    const e = (window as any).rhythmScene.session.stars, n = e.notes[index];
    e.tick = Math.round((n.at + offset) * 120);
    return { ...n, key: ({ left: 'ArrowLeft', down: 'ArrowDown', up: 'ArrowUp', right: 'ArrowRight' } as any)[n.direction] };
  }, { index, offset });
}
export const readRhythm = (page: Page) => page.evaluate(() => {
  const scene = (window as any).rhythmScene, s = scene.session, e = s.stars;
  return { phase: s.phase, phaseTime: s.phaseTime, pending: s.starsIntroPending, elapsed: e?.elapsed,
    hits: e?.hits, misses: e?.misses, feedback: e?.feedback, actor: e ? [e.x, e.y] : [],
    score: s.score, lives: s.lives, distance: s.distance, checkpoint: s.checkpoint?.start, music: scene.audio.status.scene };
});

/** Finish all remaining rounds via the actual controller, for unrelated transition regressions. */
export async function finishRhythmRounds(page: Page, sceneName = 'rhythmScene') {
  await page.evaluate(({ sceneName, musicStart }) => {
    const s = (window as any)[sceneName].session;
    for (let work = 0; work < 3000 && s.phase !== 'stars-failure'; work++) {
      if (s.phase === 'stars') s.stars.step(musicStart + s.stars.elapsed + 20);
      s.step();
    }
    if (s.phase !== 'stars-failure') throw new Error('Rhythm rounds did not reach the narrative');
  }, { sceneName, musicStart: RHYTHM.musicStartSeconds });
}

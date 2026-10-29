import { test, expect } from '@playwright/test';
test('rhythm follows the real music playhead and preserves it across pause', async ({ page }) => {
  test.setTimeout(45000); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).musicRhythmScene = (this as any).scene; return render.apply(this, args as any);
    };
  });
  await page.getByRole('checkbox', { name: 'Для разработчика' }).check();
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.waitForFunction(() => !!(window as any).musicRhythmScene?.session);
  await page.evaluate(async () => {
    const scene = (window as any).musicRhythmScene, s = scene.session;
    s.phase = 'stars-approach'; s.phaseTime = 4.8 - 1 / 120;
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Начать →', exact: true }).click();
  await page.waitForFunction(() => (window as any).musicRhythmScene.session.stars.elapsed > .8);
  const read = () => page.evaluate(() => {
    const scene = (window as any).musicRhythmScene, s = scene.session;
    const voices = scene.audio.status.music.filter((v: any) => v.url.includes('06-bespolezno'));
    return { elapsed: s.stars.elapsed, hits: s.stars.hits, voices, errors: scene.audio.status.errors };
  });
  const live = await read(); expect(live.voices).toHaveLength(1);
  expect(Math.abs(live.elapsed - live.voices[0].position)).toBeLessThan(.09);
  await page.waitForFunction(() => {
    const e = (window as any).musicRhythmScene.session.stars; return e.elapsed >= e.notes[0].at - .03;
  });
  const key = await page.evaluate(() => {
    const d = (window as any).musicRhythmScene.session.stars.notes[0].direction;
    return ({ left: 'ArrowLeft', down: 'ArrowDown', up: 'ArrowUp', right: 'ArrowRight' } as any)[d];
  });
  await page.keyboard.press(key); await expect.poll(async () => (await read()).hits).toBe(1);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const frozen = await read(); await page.waitForTimeout(600);
  const later = await read(); expect(later.elapsed).toBe(frozen.elapsed);
  expect(Math.abs(later.voices[0].position - frozen.voices[0].position)).toBeLessThan(.08);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect.poll(async () => (await read()).elapsed).toBeGreaterThan(frozen.elapsed + .3);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const resumed = await read(); expect(resumed.voices).toHaveLength(1);
  expect(Math.abs(resumed.elapsed - resumed.voices[0].position)).toBeLessThan(.09);
  expect(resumed.errors).toEqual([]);
});

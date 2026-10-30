import { expect, test, type Page } from '@playwright/test';
import { AUTUMN_SCORE, JOURNEY, SHADOWS_SCORE } from '../../apps/web/src/game/config';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function (...args: any[]) {
      (window as any).musicScene = (this as any).scene;
      if ((window as any).clearRunnerObstacles) (this as any).scene.session.runner.objects = [];
      return render.apply(this, args as any);
    };
    const shadowPath = '/src/game/views/ShadowsEpisode.ts', { ShadowsEpisode } = await import(/* @vite-ignore */ shadowPath);
    const shadowRender = ShadowsEpisode.prototype.render;
    (window as any).shadowCues = [];
    ShadowsEpisode.prototype.render = function (...args: any[]) {
      shadowRender.apply(this, args as any);
      if (this.container.visible && !(window as any).shadowCues.length) {
        const scene = (window as any).musicScene;
        (window as any).shadowCues.push({ position: scene.audio.status.music.find((v: any) => !v.fading && v.url.includes('05-teni'))?.position,
          elapsed: scene.session.runner.tick / 120, distance: args[0] });
      }
    };
  });
  await page.getByText('Тестирование этапов', { exact: true }).click();
}

test('all six authored takeoffs follow the real MP3 through slow frames, buffering and pause', async ({ page }) => {
  test.setTimeout(65000);
  await page.route('**/03-92.mp3', async route => {
    await new Promise(resolve => setTimeout(resolve, 600)); await route.continue();
  });
  await open(page);
  await page.evaluate(async () => {
    const path = '/src/game/scenes/RunnerScene.ts', { RunnerScene } = await import(/* @vite-ignore */ path);
    const update = RunnerScene.prototype.update;
    // Reproduce discarded frame time while media continues on the real wall clock.
    RunnerScene.prototype.update = function (time: number, delta: number) {
      update.call(this, time, Math.min(delta, 8));
    };
    const enginePath = '/src/game/runner/engine.ts', { RunnerEngine } = await import(/* @vite-ignore */ enginePath);
    const step = RunnerEngine.prototype.step, jumped = new Set<string>();
    (window as any).takeoffs = [];
    RunnerEngine.prototype.step = function () {
      const next = this.objects.find((o: { kind: string; id: string; x: number }) => o.kind !== 'tape' && !jumped.has(o.id) && o.x - this.travel - 180 <= 90);
      if (next && this.player.grounded) {
        this.press(); this.release(); jumped.add(next.id);
        if (next.id.startsWith('autumn-')) {
          const scene = (window as any).musicScene;
          const voice = scene.audio.status.music.find((v: any) => !v.fading && v.url.includes('03-92'));
          (window as any).takeoffs.push({ id: next.id, position: voice.position, tick: this.tick });
        }
      }
      step.call(this);
    };
  });
  await page.getByRole('button', { name: 'Второй забег · 200–400', exact: true }).click();
  await page.waitForFunction(() => (window as any).musicScene?.audio.status.music.some((v: any) =>
    v.url.includes('03-92') && v.started && !v.seeking && v.position > 4));
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const frozen = await page.evaluate(() => (window as any).musicScene.session.runner.tick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).musicScene.session.runner.tick)).toBe(frozen);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForFunction(() => (window as any).takeoffs.length === 6, undefined, { timeout: 40000 });
  const takeoffs = await page.evaluate(() => (window as any).takeoffs);
  const expectedMusic = [15 + AUTUMN_SCORE.musicLeadSeconds, 18 + AUTUMN_SCORE.musicLeadSeconds,
    ...AUTUMN_SCORE.jumpMarkers, 29 + AUTUMN_SCORE.musicLeadSeconds];
  expect(takeoffs.map((event: { id: string }) => event.id)).toEqual(['autumn-single', 'autumn-extra-0', 'autumn-accent-0', 'autumn-accent-1', 'autumn-accent-2', 'autumn-extra-1']);
  expect(Math.abs(takeoffs[0].tick / 120 - 15)).toBeLessThan(.01);
  for (let i = 0; i < 6; i++) expect(Math.abs(takeoffs[i].position - expectedMusic[i]), JSON.stringify(takeoffs)).toBeLessThan(.15);
  expect(await page.evaluate(() => (window as any).musicScene.session.lives)).toBe(3);
  await page.waitForFunction(() => (window as any).musicScene.session.phase !== 'runner', undefined, { timeout: 15000 });
  expect(await page.evaluate(() => (window as any).musicScene.session.distance)).toBe(400);
});

test('shadows skips the intro and keeps the same stream from the court exit into the run and rain', async ({ page }) => {
  test.setTimeout(65000);
  await open(page);
  await page.getByRole('button', { name: 'Мини-игра со звёздами', exact: true }).click();
  await page.getByRole('button', { name: 'Начать →', exact: true }).click();
  await page.waitForFunction(() => (window as any).musicScene?.session.phase === 'stars');
  await page.evaluate(seconds => {
    const s = (window as any).musicScene.session;
    s.phase = 'stars-failure'; s.phaseTime = seconds;
  }, JOURNEY.narrativeSeconds);
  await page.waitForFunction(offset => (window as any).musicScene.audio.status.music.some((v: any) =>
    v.url.includes('05-teni') && v.started && !v.seeking && v.position > offset + .1), SHADOWS_SCORE.musicStartSeconds);
  await page.evaluate(() => {
    const scene = (window as any).musicScene;
    (window as any).shadowsElement = [...scene.audio.music.voices].find((v: any) => v.url.includes('05-teni')).audio;
  });
  await page.waitForFunction(() => (window as any).musicScene.session.phase === 'runner');
  const read = () => page.evaluate(() => {
    const scene = (window as any).musicScene;
    const voice = [...scene.audio.music.voices].find((v: any) => v.url.includes('05-teni')) as any;
    return { same: voice.audio === (window as any).shadowsElement, position: voice.audio.currentTime };
  });
  const running = await read(); expect(running.same).toBe(true);
  expect(running.position).toBeGreaterThan(SHADOWS_SCORE.musicStartSeconds + JOURNEY.courtExitSeconds - .5);
  await page.evaluate(() => { (window as any).clearRunnerObstacles = true; });
  await page.waitForFunction(() => (window as any).shadowCues.length === 1, undefined, { timeout: 45000 });
  const cue = await page.evaluate(() => (window as any).shadowCues[0]);
  expect(cue.elapsed).toBeGreaterThan(26);
  expect(cue.elapsed).toBeLessThan(26.15);
  expect(cue.position).toBeGreaterThan(78);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const frozen = (await read()).position;
  await page.waitForTimeout(300);
  expect((await read()).position).toBeCloseTo(frozen, 2);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.evaluate(() => { const s = (window as any).musicScene.session; s.runner.objects = []; s.weatherStarted = true; });
  await page.waitForFunction(() => (window as any).musicScene.audio.status.scene === 'runner-storm');
  expect((await read()).same).toBe(true); expect((await read()).position).toBeGreaterThanOrEqual(running.position);
});

test('direct third-run entry shows the shadow at distance 530, preserving the previous music entry', async ({ page }) => {
  test.setTimeout(60000);
  await page.route('**/05-teni.mp3', async route => {
    await new Promise(resolve => setTimeout(resolve, 600)); await route.continue();
  });
  await open(page);
  await page.getByRole('button', { name: 'Третий забег · 400–600', exact: true }).click();
  await page.waitForFunction(() => (window as any).musicScene?.session.debugStart === 'third-run');
  await page.evaluate(() => { (window as any).clearRunnerObstacles = true; });
  await page.waitForFunction(() => (window as any).musicScene.session.runner.tick > 240);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const frozen = await page.evaluate(() => (window as any).musicScene.session.runner.tick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).musicScene.session.runner.tick)).toBe(frozen);
  expect(await page.evaluate(() => (window as any).shadowCues.length)).toBe(0);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForFunction(() => (window as any).shadowCues.length === 1, undefined, { timeout: 45000 });
  const cue = await page.evaluate(() => (window as any).shadowCues[0]);
  expect(cue.elapsed).toBeGreaterThan(26);
  expect(cue.elapsed).toBeLessThan(26.15);
  expect(Math.abs(cue.position - 78)).toBeLessThan(1.5);
  expect(cue.distance).toBeGreaterThan(530);
  expect(cue.distance).toBeLessThan(531);
});

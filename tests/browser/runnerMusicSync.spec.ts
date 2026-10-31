import { expect, test, type Page } from '@playwright/test';
import { AUTUMN_SCORE, JOURNEY, SHADOWS_SCORE } from '../../apps/web/src/game/config';
import { mkdir, writeFile } from 'node:fs/promises';

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
    (window as any).shadowFadeSamples = [];
    ShadowsEpisode.prototype.render = function (...args: any[]) {
      shadowRender.apply(this, args as any);
      const distance = args[0], samples = (window as any).shadowFadeSamples;
      if (distance >= 548 && distance <= 570 && (!samples.length || Math.floor(distance) > Math.floor(samples.at(-1).distance))) {
        samples.push({ distance, visible: this.container.visible, alpha: this.container.visible ? (this.container.list[0] as any).alpha : 0 });
      }
      if (this.container.visible && !(window as any).shadowCues.length) {
        const scene = (window as any).musicScene;
        (window as any).shadowCues.push({ position: scene.audio.status.music.find((v: any) => !v.fading && v.url.includes('05-teni'))?.position,
          elapsed: scene.session.runner.tick / 120, distance: args[0] });
      }
    };
  });
  await page.getByText('Тестирование этапов', { exact: true }).click();
}

test('all fifteen authored takeoffs follow the real MP3 through slow frames, buffering and pause', async ({ page }) => {
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
  await page.waitForFunction(() => (window as any).takeoffs.length === 15, undefined, { timeout: 45000 });
  const takeoffs = await page.evaluate(() => (window as any).takeoffs);
  const expectedMusic = [10.9, 13.7, 15.9, 18, 19.5, 21.14, 22.7, 24.4, 26.5, 28, 29.9, 31.7, 33.1, 34.5, 36.5]
    .map(t => t + AUTUMN_SCORE.musicLeadSeconds);
  expect(takeoffs.map((event: { id: string }) => event.id)).toEqual(['autumn-single', 'autumn-filling-0', 'autumn-filling-1', 'autumn-extra-0', 'autumn-filling-2', 'autumn-accent-0', 'autumn-accent-1', 'autumn-accent-2', 'autumn-filling-3', 'autumn-extra-1', 'autumn-filling-4', 'autumn-closing-0', 'autumn-filling-5', 'autumn-closing-1', 'autumn-closing-2']);
  expect(Math.abs(takeoffs[0].tick / 120 - 10.9)).toBeLessThan(.01);
  for (let i = 0; i < 15; i++) expect(Math.abs(takeoffs[i].position - expectedMusic[i]), JSON.stringify(takeoffs)).toBeLessThan(.15);
  expect(await page.evaluate(() => (window as any).musicScene.session.lives)).toBe(3);
  await page.waitForFunction(() => (window as any).musicScene.session.phase !== 'runner', undefined, { timeout: 15000 });
  expect(await page.evaluate(() => (window as any).musicScene.session.distance)).toBe(400);
  await mkdir('docs/previews/route-density', { recursive: true });
  await writeFile('docs/previews/route-density/second-run.json', JSON.stringify(takeoffs, null, 2));
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
    const element = [...scene.audio.music.voices].find((v: any) => v.url.includes('05-teni')).audio;
    (window as any).shadowsElement = element;
    (window as any).shadowsStarted = { position: element.currentTime, time: scene.audio.status.time };
  });
  await page.waitForFunction(() => (window as any).musicScene.session.phase === 'runner');
  const read = () => page.evaluate(() => {
    const scene = (window as any).musicScene;
    const voice = [...scene.audio.music.voices].find((v: any) => v.url.includes('05-teni')) as any;
    return { same: voice.audio === (window as any).shadowsElement, position: voice.audio.currentTime,
      time: scene.audio.status.time, started: (window as any).shadowsStarted };
  });
  const running = await read(); expect(running.same).toBe(true);
  // Buffering can consume part of the visual exit. Measure actual playback time,
  // preserving the authored 52s entry rather than counting load time as audible music.
  expect(running.started.position).toBeGreaterThanOrEqual(SHADOWS_SCORE.musicStartSeconds);
  expect(running.started.position).toBeLessThan(SHADOWS_SCORE.musicStartSeconds + 1);
  expect(running.position).toBeGreaterThan(running.started.position);
  expect(Math.abs((running.position - running.started.position) - (running.time - running.started.time))).toBeLessThan(.15);
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
  await page.waitForFunction(() => (window as any).musicScene.session.distance >= 566, undefined, { timeout: 15000 });
  const samples = await page.evaluate(() => (window as any).shadowFadeSamples);
  const at = (distance: number) => samples.find((sample: any) => Math.floor(sample.distance) === distance);
  expect(at(550).alpha).toBeGreaterThan(.7);
  expect(at(555).alpha).toBeLessThan(at(550).alpha);
  expect(at(560).alpha).toBeLessThan(at(555).alpha);
  expect(at(564).alpha).toBeLessThan(.02);
  expect(at(565).visible).toBe(false); expect(at(565).alpha).toBe(0);
  await mkdir('docs/previews/route-density', { recursive: true });
  await writeFile('docs/previews/route-density/shadow-fade.json', JSON.stringify(samples, null, 2));
});

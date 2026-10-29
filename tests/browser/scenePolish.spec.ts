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
      (window as any).polishedScene = this.scene; render.apply(this, args);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.getByRole('button', { name: 'Понятно, в путь' }).click(); await page.clock.runFor(40);
  await page.locator('.score img').evaluate(image => (image as HTMLImageElement).decode());
}

for (const kind of ['debris', 'rubble']) {
  test(`увеличенный ${kind}: заметный силуэт и настоящий короткий тап`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); await start(page);
    await page.evaluate(kind => {
      const r = (window as any).polishedScene.session.runner;
      r.objects = [{ id: 'large-hazard', kind, x: r.travel + 265, y: 378, width: 100, height: 60 }];
    }, kind);
    await page.keyboard.press('Space'); await page.clock.runFor(120);
    const size = await page.evaluate(() => {
      const image = (window as any).polishedScene.runnerView.objects.get('large-hazard');
      return { width: image.displayWidth, height: image.displayHeight, sx: image.scaleX, sy: image.scaleY };
    });
    expect(size.width).toBeGreaterThan(100); expect(size.height).toBeGreaterThan(59);
    expect(size.sx).toBe(size.sy);
    await page.clock.runFor(800);
    await expect(page.locator('main')).toHaveAttribute('data-screen', 'playing');
    expect(await page.evaluate(() => (window as any).polishedScene.session.runner.player.grounded)).toBe(true);
  });
}

test('подход к трубе: прямой участок без декоративных бетонных блоков', async ({ page }) => {
  await page.setViewportSize({ width: 1230, height: 372 }); await start(page);
  await page.evaluate(async () => {
    const scene = (window as any).polishedScene;
    const path = '/src/game/runner/engine.ts'; const { RunnerEngine } = await import(/* @vite-ignore */ path);
    scene.session.runner = new RunnerEngine(1, { start: 0, end: 200, score: 0, empty: true });
    scene.session.runner.travel = 200 * 60; scene.session.phase = 'pipe-approach'; scene.session.phaseTime = .3;
  });
  await page.clock.runFor(40);
  const crossing = await page.evaluate(() => {
    const v = (window as any).polishedScene.runnerView.crossing;
    return { visible: v.container.visible, frame: v.pipe.frame.name, y: v.pipe.y,
      keys: v.container.list.map((object: any) => object.texture?.key).filter(Boolean),
      width: v.pipe.displayWidth, height: v.pipe.displayHeight };
  });
  expect(crossing.visible).toBe(true); expect(crossing.frame).toBe('shaft');
  expect(crossing.keys).toEqual(['pipe-side-excavation', 'pipe-side-illustration']);
  expect(crossing.y).toBe(RUNNER.groundY - 1);
  expect(crossing.width / crossing.height).toBeCloseTo(10);
  await page.screenshot({ path: 'docs/previews/current-pipe-approach.png' });
});

test('выход с площадки непрерывен: без затемнения, загрузок и скачка героя', async ({ page }) => {
  const errors: string[] = [], loads: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/assets/')) loads.push(request.url()); });
  await page.evaluate(async () => {
    const scene = (window as any).polishedScene, s = scene.session;
    const path = '/src/game/minigames/stars/StarsEngine.ts'; const { StarsEngine } = await import(/* @vite-ignore */ path);
    s.runner.travel = 400 * 60; s.runner.score = 17;
    s.stars = new StarsEngine(1); s.stars.tick = 18 * 120; s.stars.x = 650; s.stars.y = 420;
    s.stars.outcome = 'narrative-failure'; s.phase = 'stars-failure'; s.phaseTime = 3.4;
  });
  let previousX: number | undefined, previousTime = 0, exits = 0;
  for (let i = 0; i < 65; i++) {
    await page.clock.runFor(100);
    const state = await page.evaluate(() => {
      const scene = (window as any).polishedScene;
      return { phase: scene.session.phase, time: scene.session.phaseTime, score: scene.session.score, paused: document.querySelector('main')?.dataset.paused,
        shade: scene.starsView.shade.alpha + scene.arrivalView.shade.alpha + scene.cutShade.alpha,
        runnerVisible: scene.runnerView.container.visible, x: scene.starsView.hero.x,
        fieldAlpha: scene.starsView.arena.floor.alpha };
    });
    expect(state.shade).toBe(0); expect(state.paused).toBe('false'); expect(state.score).toBe(17);
    if (state.phase === 'stars-exit') {
      exits++; expect(state.runnerVisible).toBe(true); expect(state.fieldAlpha).toBe(1);
      if (previousX !== undefined) expect(Math.abs(state.x - previousX)).toBeLessThan(1 + 850 * (state.time - previousTime));
      previousX = state.x; previousTime = state.time;
      if (exits === 13) await page.screenshot({ path: 'docs/previews/current-stars-exit.png' });
    }
    if (state.phase === 'runner') {
      expect(previousX!).toBeLessThan(184);
      expect(await page.evaluate(() => (window as any).polishedScene.runnerView.hero.x)).toBe(180);
      break;
    }
  }
  expect(exits).toBeGreaterThan(40);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
  expect(loads).toEqual([]); expect(errors).toEqual([]);
});

test('финал: жилой подъезд и бег после скамейки', async ({ page }) => {
  const loaded = new Set<string>();
  page.on('response', response => { if (response.ok()) loaded.add(new URL(response.url()).pathname); });
  await start(page);
  const runAt = JOURNEY.endingSlowSeconds + JOURNEY.endingSitSeconds + JOURNEY.endingRestSeconds + JOURNEY.endingStandSeconds;
  await page.evaluate(async time => {
    const scene = (window as any).polishedScene;
    const path = '/src/game/runner/engine.ts'; const { RunnerEngine } = await import(/* @vite-ignore */ path);
    scene.session.runner = new RunnerEngine(1, { start: 600, end: 700, score: 17, empty: true });
    scene.session.runner.travel = 700 * 60; scene.session.phase = 'ending'; scene.session.phaseTime = time;
  }, runAt + .5);
  await page.clock.runFor(40);
  const state = await page.evaluate(() => {
    const scene = (window as any).polishedScene, hero = scene.endingView.hero;
    return { image: scene.textures.get('archway').source[0].image.src, x: hero.x, alpha: hero.alpha, key: hero.texture.key };
  });
  expect(loaded.has('/assets/entrance-v1/entrance.webp')).toBe(true);
  expect(loaded.has('/assets/transitions-v4/arch.webp')).toBe(false);
  expect(state.x).toBeGreaterThan(480); expect(state.x).toBeLessThan(688);
  expect(state.key).toBe('night-hero'); expect(state.alpha).toBe(1);
  await expect(page.locator('.distance')).toContainText('ПОДЪЕЗД');
  await page.screenshot({ path: 'docs/previews/current-entrance.png' });
  await page.clock.runFor((ENDING_DURATION - runAt + 1) * 1000);
  await expect(page.getByRole('heading', { name: 'Путь домой завершён' })).toBeVisible();
});

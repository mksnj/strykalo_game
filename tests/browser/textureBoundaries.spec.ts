import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

for (const width of [960, 1786]) {
  test(`котлован: двор непрерывен, нижний декор не закрывает выемку ${width}`, async ({ page }) => {
    test.setTimeout(60000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 540 });
    await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
    await page.waitForFunction(() => 'scenePreview' in window);
    await page.evaluate(width => {
      (window as any).scenePreview.resizePanorama(width);
      (window as any).scenePreview.show('crossing', 200);
    }, width);
    await page.waitForTimeout(40);
    const state = await page.evaluate(() => (window as any).scenePreview.auditLayers());
    expect(state.crossing).toBe(true); expect(state.midgroundMask).toBe(false); expect(state.farMask).toBe(false);
    const visible = await page.screenshot({ path: `docs/previews/trench-v10-${width}.png` });
    await page.evaluate(() => (window as any).scenePreview.setForegroundMaskEnabled(false));
    await page.waitForTimeout(40);
    const front = await page.screenshot();
    await page.evaluate(() => (window as any).scenePreview.setForegroundMaskEnabled(true));
    await page.evaluate(() => (window as any).scenePreview.setMidgroundVisible(false));
    await page.waitForTimeout(40);
    const hidden = await page.screenshot();
    const report = await page.evaluate(async ({ shots, width }) => {
      const frames = await Promise.all(shots.map(async data => {
        const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 540;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, width, 540).data;
      }));
      const offset = (width - 960) / 2;
      let inside = 0, outside = 0, canopy = 0, rubble = 0;
      for (let y = 35; y < 432; y += 4) for (let px = 8; px < width - 8; px += 4) {
        const x = px - offset, i = (y * width + px) * 4;
        const delta = Math.max(...[0, 1, 2].map(c => Math.abs(frames[0][i + c] - frames[1][i + c])));
        if (x > 216 && x < 744 && delta > 2) inside++;
        if ((x < 180 || x > 780) && delta > 2) outside++;
        const frontDelta = Math.max(...[0, 1, 2].map(c => Math.abs(frames[0][i + c] - frames[2][i + c])));
        if (frontDelta > 2) canopy++;
      }
      for (let y = 500; y < 540; y += 2) for (let x = 216; x < 744; x += 2) {
        const i = (y * width + Math.round(x + offset)) * 4;
        if ([0, 1, 2].some(c => Math.abs(frames[0][i + c] - frames[2][i + c]) > 2)) rubble++;
      }
      return { inside, outside, canopy, rubble };
    }, { shots: [visible.toString('base64'), hidden.toString('base64'), front.toString('base64')], width });
    expect(report.inside, 'двор за выемкой не вырезается прямоугольной маской').toBeGreaterThan(100);
    expect(report.outside, 'окружение на берегах сохранено').toBeGreaterThan(100);
    expect(report.canopy, 'ветви и провода над землёй не обрезаны маской котлована').toBe(0);
    expect(report.rubble, 'передний декор не перекрывает дно котлована').toBeGreaterThan(20);
    await page.evaluate(() => (window as any).scenePreview.setMidgroundVisible(true));
    for (const distance of [188, 194, 200.05, 205, 218]) {
      await page.evaluate(distance => (window as any).scenePreview.show('crossing', distance), distance);
      await page.waitForTimeout(30);
      await page.screenshot({ path: `docs/previews/trench-v10-${width}-${distance}.png` });
    }
    await page.evaluate(() => (window as any).scenePreview.show('memory', 325));
    expect((await page.evaluate(() => (window as any).scenePreview.auditLayers())).midgroundMask).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('короткий маршрут: труба не появляется на старом месте, телевизор далеко от выемки после resize и возврата к началу', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.setViewportSize({ width: 1588, height: 801 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts'; const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).pipeScene = (this as any).scene; return render.apply(this, args as any);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('checkbox', { name: 'Для разработчика' }).check({ force: true });
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  await page.clock.runFor(40);
  await page.evaluate(() => {
    // Freeze travel while keeping the real scene, UI, camera and render loop running.
    (window as any).pipeScene.session.runner.step = () => {};
  });
  for (const viewport of [{ width: 1588, height: 801 }, { width: 1600, height: 812 },
    { width: 1230, height: 372 }, { width: 960, height: 540 }]) {
    await page.setViewportSize(viewport); await page.clock.runFor(80);
    // Jump backwards as well: previously visible geometry must not survive an offscreen/reset frame.
    for (const distance of [6, 6.5, 7, 12, 16, 19.9, 0, 6]) {
      await page.evaluate(distance => { (window as any).pipeScene.session.runner.travel = distance * 60; }, distance);
      await page.clock.runFor(40);
      const state = await page.evaluate(() => {
        const scene = (window as any).pipeScene, view = scene.runnerView, crossing = view.crossing;
        const { runner } = scene.session, near = 180 + (200 - runner.artDistance) / runner.distanceScale * 60 + 20;
        return { near, pipeX: crossing.pipe.x, pipeRight: crossing.pipe.x + crossing.pipe.displayWidth,
          soilX: crossing.excavation.x, soilRight: crossing.excavation.x + crossing.excavation.displayWidth,
          televisionRight: view.television.container.getBounds().right,
          televisionTextures: view.television.container.list.map((image: any) => image.texture.key),
          maskedBackdrop: !!view.nightArt.midground.mask };
      });
      expect(state.pipeX, 'труба следует текущему берегу даже до появления в кадре').toBeCloseTo(state.near);
      expect(state.pipeRight).toBeCloseTo(state.near + 560);
      expect(state.soilX).toBeCloseTo(state.near); expect(state.soilRight).toBeCloseTo(state.near + 560);
      expect(state.televisionRight, 'телевизор с лужей остаётся позади края выемки на своём плане').toBeLessThan(state.near - 200);
      expect(state.televisionTextures, 'без дополнительного дома или окна').toEqual(['television-water', 'television-crt', 'television-water']);
      expect(state.maskedBackdrop, 'без вертикального среза двора над трубой').toBe(false);
      if (distance === 6 && viewport.width === 1588) {
        await page.screenshot({ path: 'docs/previews/pipe-v13-live-6.png' });
      }
      if (distance === 16 && viewport.width === 1588) await page.screenshot({ path: 'docs/previews/pipe-v13-live-16.png' });
    }
  }
  expect(errors).toEqual([]);
});

test('финальный фасад на широком окне продолжается стенами без отражённых подъездов', async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 540 });
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  for (const width of [960, 1786, 2400]) {
    await page.evaluate(width => {
      (window as any).scenePreview.resizePanorama(width);
      (window as any).scenePreview.show('final', 703.5);
    }, width);
    const { wings } = await page.evaluate(() => (window as any).scenePreview.auditLayers());
    expect(wings.map((wing: any) => wing.frame)).toEqual(['wall-left', 'wall-right']);
    expect(wings.every((wing: any) => !wing.flipX)).toBe(true);
    expect(wings[0].x).toBeLessThanOrEqual((960 - width) / 2);
    expect(wings[1].x + wings[1].width).toBeGreaterThanOrEqual((960 + width) / 2);
    const blackFractions = await page.evaluate(async wings => {
      const image = new Image(); image.src = '/assets/entrance-v1/entrance.webp'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return wings.map((wing: any) => {
        const r = wing.crop, pixels = ctx.getImageData(r.x, r.y, r.width, r.height).data;
        let black = 0;
        for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 8) black++;
        return black / (r.width * r.height);
      });
    }, wings);
    for (const fraction of blackFractions) expect(fraction, 'боковые стены не содержат чёрных клиньев старого края фасада').toBeLessThan(.08);
    await page.waitForTimeout(40);
    await page.screenshot({ path: `docs/previews/facade-v10-${width}.png` });
  }
});

test('тень бежит за настоящим героем, сохраняется на паузе и исчезает в конце эпизода', async ({ page }) => {
  await page.clock.install(); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts'; const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).shadowScene = (this as any).scene; return render.apply(this, args as any);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.getByRole('button', { name: 'Понятно, в путь' }).click(); await page.clock.runFor(40);
  await page.evaluate(async () => {
    const path = '/src/game/runner/engine.ts'; const { RunnerEngine } = await import(/* @vite-ignore */ path);
    const s = (window as any).shadowScene;
    s.session.runner = new RunnerEngine(1, { start: 400, end: 600, score: 17, empty: true });
    s.session.runner.travel = 470 * 60;
  });
  await page.clock.runFor(600);
  const state = () => page.evaluate(() => {
    const s = (window as any).shadowScene, view = s.runnerView.shadows, echo = view.echo;
    return { x: echo.x, heroX: s.runnerView.hero.x, alpha: echo.alpha, rotation: echo.rotation,
      flipY: echo.flipY, height: echo.displayHeight, visible: view.container.visible, count: view.container.list.length };
  });
  const following = await state();
  expect(following.x).toBeLessThan(following.heroX - 70);
  expect(following.rotation).toBe(0); expect(following.flipY).toBe(false); expect(following.height).toBe(106);
  expect(following.visible).toBe(true); expect(following.count).toBe(1);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.clock.runFor(5000); expect(await state()).toEqual(following);
  await page.getByRole('button', { name: /^Продолжить/ }).click(); await page.clock.runFor(1000);
  expect((await state()).alpha).toBe(following.alpha);
  await page.screenshot({ path: 'docs/previews/shadow-v10-live.png' });
  await page.evaluate(() => { (window as any).shadowScene.session.runner.travel = 491 * 60; });
  await page.clock.runFor(40); expect((await state()).alpha).toBeGreaterThan(0);
  expect((await state()).alpha).toBeLessThan(following.alpha);
  await page.evaluate(() => { (window as any).shadowScene.session.runner.travel = 497 * 60; });
  await page.clock.runFor(40); expect((await state()).visible).toBe(false);
});

import { finishRhythmRounds } from './rhythmHarness';
import { test, expect } from '@playwright/test';
import { JOURNEY } from '../../apps/web/src/game/config';
import { startCourt as start, placeCourt, positionCourt } from './courtHarness';

for (const [width, height] of [[960, 540], [1920, 1080], [1230, 372], [375, 667], [390, 844]]) {
  test(`самостоятельная арена, неизменная улица и смена плана у прохода ${width}x${height}`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height }); await start(page); await placeCourt(page);
    let baseline: any;
    for (const p of [0, .45, .56, .60, .65, .74, 1]) {
      await positionCourt(page, 'stars-approach', p);
      const v = await page.evaluate(() => {
        const s = (window as any).courtScene, a = s.starsView.arena, f = s.runnerView.nightArt.foundation;
        return { arenaAlpha: a.container.alpha, arenaVisible: a.container.visible,
          gateX: s.runnerView.courtEntrance.container.x, heroX: s.runnerView.hero.x, heroY: s.runnerView.hero.y,
          streetScale: f.tileScaleY, streetY: f.y,
          shared: s.runnerView.hero === s.starsView.hero,
          shade: s.cutShade.alpha + s.starsView.shade.alpha + s.arrivalView.shade.alpha };
      });
      baseline ??= v;
      expect(v.shared).toBe(true); expect(v.shade).toBe(0);
      expect(v.streetScale).toBe(baseline.streetScale); expect(v.streetY).toBe(baseline.streetY);
      if (p === .45 || p === .56) expect(Math.abs(v.heroX - v.gateX)).toBeLessThan(20);
      if (p === .56) expect(v.heroY).toBeLessThan(435);
      if (p <= .56) expect(v.arenaAlpha).toBe(0);
      else if (p < .74) { expect(v.arenaAlpha).toBeGreaterThan(0); expect(v.arenaAlpha).toBeLessThan(1); }
      else expect(v.arenaAlpha).toBe(1);
    }
    await positionCourt(page, 'stars');
    const active = await page.evaluate(() => {
      const s = (window as any).courtScene, a = s.starsView.arena, camera = s.cameras.main;
      return { opaque: a.container.alpha === 1 && a.container.visible,
        streetHidden: !('scenery' in s.starsView),
        hoopUniform: a.hoop.scaleX === a.hoop.scaleY, hoopHeight: a.hoop.displayHeight,
        floorLeft: a.floor.x, floorRight: a.floor.x + a.floor.displayWidth,
        viewLeft: camera.worldView.x, viewRight: camera.worldView.right };
    });
    expect(active.opaque).toBe(true); expect(active.streetHidden).toBe(true);
    expect(active.hoopUniform).toBe(true); expect(active.hoopHeight).toBeCloseTo(192);
    expect(active.floorLeft).toBeLessThanOrEqual(active.viewLeft);
    expect(active.floorRight).toBeGreaterThanOrEqual(active.viewRight);
    expect(errors).toEqual([]);
  });

  test(`полный цикл с сохранением счёта, дистанции и передачи управления ${width}x${height}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height }); await start(page); await placeCourt(page, false);
    let previous: any;
    const inspect = async () => {
      const v = await page.evaluate(() => {
        const s = (window as any).courtScene, h = s.runnerView.hero, c = s.cameras.main;
        return { phase: s.session.phase, phaseTime: s.session.phaseTime,
          x: (h.x - c.worldView.x) * c.zoom, y: (h.y - c.worldView.y) * c.zoom,
          // Different source padding must not masquerade as a visible scale jump.
          size: h.displayHeight * c.zoom * (h.texture.key === 'hero-front' ? 248 / 256 : 112 / 128), camera: { x: c.scrollX, y: c.scrollY, zoom: c.zoom },
          shared: h === s.starsView.hero, score: s.session.score, distance: s.session.distance,
          shade: s.cutShade.alpha + s.starsView.shade.alpha + s.arrivalView.shade.alpha };
      });
      expect(v.shared).toBe(true); expect(v.score).toBe(17); expect(v.shade).toBe(0);
      if (v.phase === 'runner') {
        expect(v.distance).toBeGreaterThanOrEqual(400); expect(v.distance).toBeLessThan(400.3);
      } else expect(v.distance).toBe(400);
      if (previous) {
        // Browser renders can batch physics ticks; bound motion by actual
        // simulation time between rendered poses, rather than polling time.
        const dt = v.phase === previous.phase ? v.phaseTime - previous.phaseTime : .05;
        expect(Math.hypot(v.x - previous.x, v.y - previous.y), 'герой движется непрерывно во время смены плана')
          .toBeLessThan(1 + 850 * dt);
        expect(Math.abs(v.size - previous.size)).toBeLessThan(4);
        expect(Math.abs(v.camera.zoom - previous.camera.zoom)).toBeLessThan(.04);
      }
      previous = v; return v;
    };
    await page.clock.runFor(40); await inspect();
    // Movement commands during the entry must not advance the mini-game timer.
    await page.keyboard.down('ArrowRight');
    for (let i = 0; i < 220; i++) {
      await page.clock.runFor(25); const v = await inspect(); if (v.phase === 'stars') break;
    }
    await page.keyboard.up('ArrowRight');
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars');
    await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true });
    await page.clock.runFor(40);
    const activeCamera = (await inspect()).camera;
    await page.keyboard.down('ArrowRight'); await page.clock.runFor(200); await page.keyboard.up('ArrowRight');
    previous = undefined;
    expect((await inspect()).camera).toEqual(activeCamera);
    await page.evaluate(() => {
      const s = (window as any).courtScene.session, e = s.stars;
      e.step(100); s.step();
    });
    await finishRhythmRounds(page, 'courtScene');
    await page.evaluate(() => { (window as any).courtScene.session.phaseTime = 3.7; });
    for (let i = 0; i < 220; i++) {
      await page.clock.runFor(25); const v = await inspect(); if (v.phase === 'runner') break;
    }
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'runner');
    expect(await page.evaluate(() => (window as any).courtScene.session.checkpoint.start)).toBe(400);
  });
}

test('прыжок на границе площадки заканчивается в движении входа без скачка стоп на землю', async ({ page }) => {
  await start(page);
  await page.evaluate(async clearance => {
    const scene = (window as any).courtScene;
    const path = '/src/game/runner/engine.ts'; const { RunnerEngine } = await import(/* @vite-ignore */ path);
    scene.session.runner = new RunnerEngine(1, { start: 200, end: 400, score: 17, clearance });
    scene.session.runner.travel = 400 * 60 - 2; scene.session.runner.objects = [];
    scene.session.phase = 'runner'; scene.session.runner.press();
  }, JOURNEY.transitionClearance);
  let minimum = 438, previous = 438;
  for (let i = 0; i < 45; i++) {
    await page.clock.runFor(20);
    const state = await page.evaluate(() => {
      const scene = (window as any).courtScene;
      return { y: scene.runnerView.hero.y, physics: scene.session.runner.player.y, phase: scene.session.phase };
    });
    // At 135 px/s the remaining 2 px need two physics ticks. The first render
    // after confirming the tutorial can supply only one of them.
    if (i < 2) expect(['runner', 'stars-approach']).toContain(state.phase);
    else expect(state.phase).toBe('stars-approach');
    expect(state.y).toBeCloseTo(state.physics, 4);
    expect(Math.abs(state.y - previous)).toBeLessThan(24);
    minimum = Math.min(minimum, state.y); previous = state.y;
  }
  expect(minimum).toBeLessThan(370);
  await page.clock.runFor(4200);
  expect(await page.evaluate(() => (window as any).courtScene.session.runner.player.grounded)).toBe(true);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars');
});

test('в обоих маршрутах до входа нет полной арены; отсылка 92 отсутствует', async ({ page }) => {
  await start(page);
  for (const developer of [false, true]) {
    await page.evaluate(async developer => {
      const a = '/src/game/state/RunSession.ts', b = '/src/game/runner/engine.ts';
      const { RunSession } = await import(/* @vite-ignore */ a);
      const { RunnerEngine } = await import(/* @vite-ignore */ b);
      const s = new RunSession(1, developer);
      s.runner = new RunnerEngine(1, { start: s.route.balanceAt, end: s.route.starsAt,
        score: 17, empty: true, distanceScale: s.route.scale });
      s.step = () => {}; (window as any).courtScene.session = s;
    }, developer);
    for (const progress of [.1, .42, .8, .99, 1]) {
      await page.evaluate(progress => {
        const s = (window as any).courtScene.session;
        s.runner.travel = (s.route.balanceAt + (s.route.starsAt - s.route.balanceAt) * progress) * 60;
      }, progress);
      await page.clock.runFor(40);
      const state = await page.evaluate(() => {
        const scene = (window as any).courtScene;
        const keys: string[] = [];
        let fullCourt = 0;
        const visit = (objects: any[]) => objects.forEach(o => {
          if (!o.visible || o.alpha === 0) return;
          if (o.list) visit(o.list);
          const key = o.displayTexture?.key ?? o.texture?.key;
          if (key) keys.push(key);
          if (key === 'court-original' && (o.displayFrame?.name ?? o.frame?.name) === '__BASE') fullCourt++;
        });
        visit(scene.children.list);
        return { keys, fullCourt, fenceKey: scene.runnerView.nightArt.courtKey, arenaVisible: scene.starsView.container.visible,
          hint: scene.runnerView.courtEntrance.container.visible, hintMasked: !!scene.runnerView.courtEntrance.view.mask,
          maskedStreet: !!scene.runnerView.nightArt.midground.mask ||
            scene.runnerView.nightArt.midground.list.some((o: any) => !!o.mask),
          retiredTextures: ['route92', 'memory-courtyard', 'memories'].filter(k => scene.textures.exists(k)) };
      });
      expect(state.arenaVisible).toBe(false); expect(state.maskedStreet).toBe(true);
      expect(state.fenceKey).toBe('court-original');
      expect(state.retiredTextures).toEqual([]);
      expect(state.keys).not.toEqual(expect.arrayContaining(['court-hoop']));
      // A framed entrance glimpse may be visible, but the full arena stays off.
      if (!state.hint) expect(state.fullCourt).toBe(0);
      else expect(state.hintMasked).toBe(true);
    }
  }
});

test('забор перед переходом стоит на земле и движется с маской только для прохода', async ({ page }) => {
  await page.setViewportSize({ width: 1588, height: 801 }); await start(page); await placeCourt(page);
  let previous: number | undefined;
  for (const remaining of [1200, 600, 300, 120, 0]) {
    await page.evaluate(remaining => {
      const s = (window as any).courtScene.session;
      s.phase = 'runner'; s.runner.travel = 24000 - remaining;
    }, remaining);
    await page.clock.runFor(40);
    const v = await page.evaluate(() => {
      const art = (window as any).courtScene.runnerView.nightArt;
      return { foot: art.court.y + art.court.height, phase: art.court.tilePositionX * art.court.tileScaleX,
        mask: !!art.court.mask, size: art.midground.list.length };
    });
    expect(v.foot).toBeCloseTo(435); expect(v.mask).toBe(true); expect(v.size).toBe(1);
    if (previous !== undefined) expect(v.phase).toBeGreaterThan(previous);
    previous = v.phase;
  }
});

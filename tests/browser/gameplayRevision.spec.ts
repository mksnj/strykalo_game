import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm, readRhythm } from './rhythmHarness';
import { DEBUG_MINIGAME_POINTS, DEBUG_START_POINTS } from '../../apps/web/src/game/state/debugStart';
import { AUTUMN_SCORE, RHYTHM } from '../../apps/web/src/game/config';

async function choose(page: import('@playwright/test').Page, point: typeof DEBUG_START_POINTS[number]) {
  await page.getByRole('button', { name: 'К этапам' }).click({ force: true });
  await page.getByText('Тестирование этапов', { exact: true }).click({ force: true });
  await page.getByRole('spinbutton', { name: 'Seed' }).fill('42');
  await page.getByRole('button', { name: point.label, exact: true }).click({ force: true });
  await page.clock.runFor(80);
}

test('all seven stages initialize through the real menu, with controls and sound cues', async ({ page }) => {
  await bootRhythm(page);
  const expected = ['runner', 'balance', 'runner', 'stars', 'runner', 'waiting', 'final-run'];
  const distances = [0, 200, 200, 400, 400, 600, 600];
  const music = ['runner-intro', 'balance', 'runner-autumn', 'stars-intro', 'runner-shadows', 'room-storm', 'final-run'];
  for (const [i, point] of DEBUG_START_POINTS.entries()) {
    await choose(page, point);
    const s = await page.evaluate(() => {
      const scene = (window as any).rhythmScene, s = scene.session;
      return { phase: s.phase, distance: s.distance, lives: s.lives, score: s.score, scale: s.route.scale,
        seed: s.seed, debug: s.debugStart, music: scene.audio.status.scene,
        engine: s.phase === 'balance' ? !!s.balance : s.phase === 'stars' ? !!s.stars : s.phase === 'waiting' ? !!s.waiting : !!s.runner };
    });
    expect(s).toMatchObject({ phase: expected[i], lives: 3, score: 0, seed: 42, scale: 1, debug: point.id, music: music[i], engine: true });
    expect(s.distance).toBeGreaterThanOrEqual(distances[i]); expect(s.distance).toBeLessThan(distances[i] + 1);
    if (point.id.endsWith('run') && point.id !== 'final-run') {
      await page.locator('main').focus(); await page.keyboard.press('Space'); await page.clock.runFor(80);
      expect(await page.evaluate(() => (window as any).rhythmScene.session.runner.player.grounded)).toBe(false);
    }
    if (point.id === 'balance') {
      await expect(page.locator('.balance-tutorial')).toBeVisible();
      await page.getByRole('button', { name: 'Понятно, пошатываемся' }).click({ force: true }); await page.clock.runFor(80);
      await expect(page.locator('.balance-hud')).toBeVisible();
    }
    if (point.id === 'stars') {
      await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true }); await page.clock.runFor(80);
      await expect(page.locator('.rhythm-hud')).toBeVisible();
    }
    if (point.id === 'waiting') {
      await page.locator('main').focus(); await page.keyboard.press('Space'); await page.clock.runFor(80);
      expect(await page.evaluate(() => (window as any).rhythmScene.session.waiting.resets)).toBe(1);
    }
  }
  for (const point of DEBUG_MINIGAME_POINTS) {
    const back = page.getByRole('dialog').getByRole('button', { name: 'К этапам', exact: true });
    if (await back.count()) await back.click();
    else await page.getByRole('button', { name: 'К этапам', exact: true }).click();
    await expect(page.locator('.debug-menu')).not.toHaveAttribute('open', '');
    const quick = page.getByRole('button', { name: `Мини-игра ${point.miniGame}`, exact: true });
    await expect(quick).toBeVisible(); await quick.click(); await page.clock.runFor(80);
    await expect(page.locator('main')).toHaveAttribute('data-phase', point.id);
  }
});

for (const [width, height, name] of [[960, 540, 'desktop'], [390, 844, 'portrait'], [844, 390, 'landscape']] as const) {
  test('five rounds, leg movement and onward transition: ' + name, async ({ page }) => {
    test.setTimeout(60000); await page.setViewportSize({ width, height }); await bootRhythm(page);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await choose(page, DEBUG_START_POINTS[3]);
    await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true }); await page.clock.runFor(40);
    await mkdir('docs/previews/gameplay-v17', { recursive: true });
    await page.screenshot({ path: `docs/previews/gameplay-v17/${name}-court.png` });
    for (let round = 1; round <= 5; round++) {
      await page.evaluate(() => {
        const s = (window as any).rhythmScene.session, e = s.stars, n = e.notes[0];
        e.step(n.at); s.rhythmPress(n.direction);
      });
      await page.clock.runFor(160);
      const actor = await page.evaluate(() => {
        const scene = (window as any).rhythmScene, parts = scene.starsView.actor.parts;
        const visible = parts.filter((p: any) => p.visible && p.alpha > .01);
        return { visible: visible.length > 0, dancing: visible.some((p: any) => p.texture.key === 'court-dance'),
          heroSize: scene.runnerView.hero.displayHeight, targetRight: 521, heroLeft: Math.min(...visible.map((p: any) => p.getBounds().left)) };
      });
      expect(actor.visible).toBe(true); expect(actor.heroSize).toBe(154);
      expect(actor.dancing).toBe(true); expect(actor.heroLeft).toBeGreaterThan(actor.targetRight);
      if (round === 1) await page.screenshot({ path: `docs/previews/gameplay-v17/${name}-step.png` });
      await page.evaluate(() => {
        const e = (window as any).rhythmScene.session.stars;
        for (let i = 0; i < 3; i++) { const n = e.notes.find((n: any) => n.state === 'pending'); e.step(n.at + .26); }
      });
      await page.clock.runFor(40);
      expect((await readRhythm(page)).phase).toBe(round < 5 ? 'stars-retry' : 'stars-failure');
      expect((await readRhythm(page)).misses).toBe(3);
      if (round < 5) {
        await expect(page.getByText('Ещё раз', { exact: true })).toBeVisible();
        await expect(page.locator('.narrative-caption')).toHaveCount(0);
        if (round === 1) {
          await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
          const frozen = await readRhythm(page); await page.clock.runFor(3000); expect(await readRhythm(page)).toEqual(frozen);
          await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
        }
        for (let i = 0; i < 80 && (await readRhythm(page)).phase === 'stars-retry'; i++) await page.clock.runFor(40);
        const fresh = await readRhythm(page); expect(fresh.phase).toBe('stars'); expect(fresh.misses).toBe(0); expect(fresh.hits).toBe(0);
        expect(fresh.elapsed).toBeLessThan(.4);
      }
    }
    await expect(page.locator('.narrative-caption')).toHaveText('бесполезно');
    await page.clock.runFor(2500); await expect(page.locator('.narrative-caption')).toBeVisible();
    await page.screenshot({ path: `docs/previews/gameplay-v17/${name}-fifth-defeat.png` });
    for (let i = 0; i < 350 && (await readRhythm(page)).phase !== 'runner'; i++) await page.clock.runFor(40);
    const onward = await readRhythm(page); expect(onward.phase).toBe('runner'); expect(onward.checkpoint).toBe(400);
    expect(onward.distance).toBeGreaterThanOrEqual(400); expect(onward.lives).toBe(3); expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as any).rhythmScene.starsView.actor.parts.some((p: any) => p.visible))).toBe(false);
  });
}

test('a real music voice restarts at zero on round two and survives pausing the retry', async ({ page }) => {
  test.setTimeout(45000); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const original = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).rhythmScene = (this as any).scene; return original.apply(this, args as any);
    };
  });
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: 'Мини-игра со звёздами', exact: true }).click();
  await page.getByRole('button', { name: 'Начать →', exact: true }).click();
  await page.waitForFunction(() => (window as any).rhythmScene?.session.phase === 'stars-retry');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const read = () => page.evaluate(() => {
    const scene = (window as any).rhythmScene, s = scene.session;
    return { round: s.starsRound, elapsed: s.stars.elapsed, phase: s.phase,
      time: s.phaseTime, voices: scene.audio.status.music.filter((v: any) => !v.fading && v.url.includes('06-bespolezno')) };
  });
  const frozen = await read(); await page.waitForTimeout(500); const still = await read();
  expect(still.time).toBe(frozen.time); expect(Math.abs(still.voices[0].position - frozen.voices[0].position)).toBeLessThan(.1);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForFunction(() => { const s = (window as any).rhythmScene.session; return s.starsRound === 2 && s.stars.elapsed > .4; });
  const fresh = await read(); expect(fresh.phase).toBe('stars'); expect(fresh.voices).toHaveLength(1);
  expect(fresh.elapsed).toBeLessThan(1); expect(Math.abs(fresh.elapsed - fresh.voices[0].position)).toBeLessThan(.1);
  expect((await readRhythm(page)).misses).toBe(0);
});

test('direct second run aligns music once, then pause preserves both playheads', async ({ page }) => {
  await page.route('**/03-92.mp3', async route => {
    await new Promise(resolve => setTimeout(resolve, 600)); await route.continue();
  });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const original = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).rhythmScene = (this as any).scene; return original.apply(this, args as any);
    };
  });
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: 'Второй забег · 200–400', exact: true }).click();
  await page.waitForFunction(lead => (window as any).rhythmScene?.audio.status.music.some((v: any) =>
    v.started && !v.seeking && v.gain > .01 && v.position > lead + .2), AUTUMN_SCORE.musicLeadSeconds);
  const read = () => page.evaluate(lead => {
    const scene = (window as any).rhythmScene;
    return { tick: scene.session.runner.tick, time: scene.session.runner.tick / 120 + lead,
      voice: scene.audio.status.music.find((v: any) => !v.fading && v.url.includes('03-92')) };
  }, AUTUMN_SCORE.musicLeadSeconds);
  const live = await read(); expect(Math.abs(live.time - live.voice.position), JSON.stringify(live)).toBeLessThan(.25);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const frozen = await read(); await page.waitForTimeout(400); const later = await read();
  expect(later.tick).toBe(frozen.tick); expect(Math.abs(later.voice.position - frozen.voice.position)).toBeLessThan(.1);
});

test('reduced motion uses supplied poses without rotating the character', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await bootRhythm(page);
  await choose(page, DEBUG_START_POINTS[3]);
  await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true }); await page.clock.runFor(40);
  const direction = await page.evaluate(musicStart => {
    const s = (window as any).rhythmScene.session, e = s.stars;
    const note = e.notes[0];
    e.step(musicStart + note.at); s.rhythmPress(note.direction);
    return note.direction;
  }, RHYTHM.musicStartSeconds);
  await page.clock.runFor(160);
  const actor = await page.evaluate(() => {
    const scene = (window as any).rhythmScene;
    return { angle: scene.runnerView.hero.angle, poses: scene.starsView.actor.parts.filter((p: any) => p.visible && p.alpha > .01)
      .map((p: any) => ({ angle: p.angle, texture: p.texture.key, frame: String(p.frame.name) })) };
  });
  expect(actor.angle).toBe(0); expect(actor.poses).toHaveLength(1);
  expect(actor.poses[0].texture).toBe(direction === 'up' ? 'hero-front' : 'court-dance'); expect(actor.poses[0].angle).toBe(0);
});

for (const [width, height] of [[375, 667], [568, 320]]) test('debug stages and modal return fit ' + width + 'x' + height, async ({ page }) => {
  await page.setViewportSize({ width, height }); await bootRhythm(page);
  for (const point of [DEBUG_START_POINTS[1], DEBUG_START_POINTS[3]]) {
    if (await page.getByRole('button', { name: 'К этапам', exact: true }).count()) {
      await page.getByRole('button', { name: 'К этапам', exact: true }).click();
    }
    await page.getByText('Тестирование этапов', { exact: true }).click();
    await page.getByRole('button', { name: point.label, exact: true }).click(); await page.clock.runFor(80);
    const back = page.getByRole('dialog').getByRole('button', { name: 'К этапам', exact: true });
    await back.scrollIntoViewIfNeeded(); await expect(back).toBeVisible();
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await expect(back).toBeFocused();
    await back.click(); await expect(page.locator('main')).toHaveAttribute('data-screen', 'menu');
  }
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: DEBUG_START_POINTS[6].label, exact: true }).click(); await page.clock.runFor(80);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'final-run');
});

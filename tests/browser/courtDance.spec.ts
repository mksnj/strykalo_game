import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';
import { RHYTHM } from '../../apps/web/src/game/config';
import { musicNodFrame } from '../../apps/web/src/game/views/musicNodAnimation';
import nod from '../../apps/web/src/game/assets/musicNodLayout.json' with { type: 'json' };
import sizing from '../../apps/web/src/game/assets/courtHeroLayout.json' with { type: 'json' };
import steps from '../../apps/web/src/game/assets/sideStepLayout.json' with { type: 'json' };
import { sideStepHitFrame } from '../../apps/web/src/game/views/sideStepAnimation';
import type { RhythmDirection } from '../../apps/web/src/game/minigames/stars/StarsEngine';

for (const [width, height, name] of [[960, 540, 'desktop'], [375, 667, 'portrait'], [844, 390, 'landscape']] as const) {
  test('side steps and nod follow keys, up keeps rest, feet and pause stay stable: ' + name, async ({ page }) => {
    await page.setViewportSize({ width, height }); await bootRhythm(page);
    await page.getByRole('button', { name: 'К этапам', exact: true }).click();
    await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click(); await page.clock.runFor(80);
    await page.getByRole('button', { name: 'Начать →', exact: true }).click(); await page.clock.runFor(80);
    const previews = `docs/previews/${steps.collection}`;
    await page.locator('main').focus(); await mkdir(previews, { recursive: true });
    const read = () => page.evaluate(() => {
      const scene = (window as any).rhythmScene, s = scene.session;
      return { elapsed: s.stars.elapsed, hits: s.stars.hits, misses: s.stars.misses,
        direction: s.stars.feedback.at(-1)?.direction, at: s.stars.feedback.at(-1)?.at,
        pose: scene.starsView.actor.current, startedAt: scene.starsView.actor.startedAt,
        parts: scene.starsView.actor.parts.filter((p: any) => p.visible && p.alpha > .01).map((p: any) => ({
          texture: p.texture.key, frame: String(p.frame.name), x: p.x, y: p.y, alpha: p.alpha,
          angle: p.angle, flip: p.flipX, left: p.getBounds().left,
        })) };
    });
    const anchor = (await read()).parts[0];
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const note = await page.evaluate(musicStart => {
        const e = (window as any).rhythmScene.session.stars, n = e.notes.find((n: any) => n.state === 'pending');
        e.step(musicStart + n.at); return { direction: n.direction as RhythmDirection,
          key: ({ left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' } as any)[n.direction] };
      }, RHYTHM.musicStartSeconds);
      await page.keyboard.press(note.key);
      // Phaser smooths the mocked frame delta; wait for simulation time, not wall time.
      const hitAt = (await read()).elapsed;
      const sampleAge = note.direction === 'left' || note.direction === 'right' ? .3 : .16;
      for (let frame = 0; frame < 60 && (await read()).elapsed < hitAt + sampleAge; frame++) await page.clock.runFor(40);
      const state = await read();
      expect(state.hits).toBe(i + 1); expect(state.misses).toBe(0); expect(state.parts).toHaveLength(1);
      const expected = state.pose === 'idle' ? { texture: 'hero-front', frame: '__BASE' } : state.pose === 'down' ?
        { texture: nod.key, frame: String(musicNodFrame(state.elapsed - state.startedAt)) } :
        { texture: steps.key, frame: String(sideStepHitFrame(state.pose, state.elapsed - state.startedAt)) };
      if (note.direction !== 'up') expect(state.pose).toBe(note.direction);
      expect(state.parts[0]).toMatchObject({ ...expected, angle: 0, flip: false, x: anchor.x });
      expect(state.parts[0].left).toBeGreaterThan(0); expect(Math.abs(state.parts[0].y - anchor.y)).toBeLessThan(1.3);
      seen.add(note.direction);
      await page.screenshot({ path: `${previews}/${name}-${note.direction}.png` });
      if (note.direction === 'left') {
        await page.getByRole('button', { name: 'Пауза', exact: true }).click();
        const frozen = await read(); await page.clock.runFor(2000); expect(await read()).toEqual(frozen);
        await page.getByRole('button', { name: 'Продолжить' }).click();
      }
    }
    expect([...seen].sort()).toEqual(['down', 'left', 'right', 'up']);
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const frozen = await read(); await page.clock.runFor(2000); expect(await read()).toEqual(frozen);
    await page.getByRole('button', { name: 'Продолжить' }).click();
    const resumedAt = (await read()).elapsed;
    for (let frame = 0; frame < 40 && (await read()).elapsed < resumedAt + .1; frame++) await page.clock.runFor(40);
    const rest = await read(); expect(rest.parts).toHaveLength(1); expect(rest.elapsed).toBeGreaterThan(resumedAt);
    expect(rest.misses).toBe(0);
  });
}

test('up does not interrupt an active gesture or extend its duration', async ({ page }) => {
  await bootRhythm(page);
  const state = await page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor;
    const render = (elapsed: number, direction: 'left' | 'up') => {
      actor.render(640, 400, 154, 0, { direction, judgment: 'perfect', at: direction === 'left' ? 1 : 1.2 }, elapsed);
      return actor.parts.filter((p: any) => p.visible && p.alpha > .99).map((p: any) => ({ texture: p.texture.key, frame: String(p.frame.name) }));
    };
    render(1, 'left');
    const before = render(1.3, 'left');
    const afterUp = render(1.4, 'up');
    render(2.6, 'up');
    const rested = render(2.7, 'up');
    return { before, afterUp, rested };
  });
  expect(state.before).toEqual([{ texture: steps.key, frame: '3' }]);
  expect(state.afterUp).toEqual(state.before);
  expect(state.rested).toEqual([{ texture: 'hero-front', frame: '__BASE' }]);
});

test('hits immediately start moving and atlas transitions never dim the character', async ({ page }) => {
  await bootRhythm(page);
  const sequences = await page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor;
    const sample = (direction: 'left' | 'right' | 'down', at: number, age: number): { frame: number; alpha: number }[] => {
      actor.render(640, 400, 154, 0, { direction, judgment: 'perfect', at }, at + age);
      return actor.parts.filter((p: any) => p.visible).map((p: any) => ({ frame: Number(p.frame.name), alpha: p.alpha }));
    };
    actor.render(640, 400, 154, 0, undefined, 0);
    const steps = (['left', 'right', 'left', 'left'] as const).map((direction, index) =>
      [0, .02, .04, .08, .1, .2].map(age => sample(direction, 1 + index * .3, age)));
    const nod = [0, .02, .04, .08].map(age => sample('down', 3, age));
    const afterNod = [0, .02, .04, .08].map(age => sample('right', 3.1, age));
    return { steps, nod, afterNod };
  });
  for (const [index, sequence] of sequences.steps.entries()) {
    const offset = index === 1 ? 6 : 0;
    expect(sequence.map(parts => parts.map(part => part.frame))).toEqual([1, 1, 1, 1, 2, 3].map(frame => [frame + offset]));
    for (const parts of sequence) expect(parts[0].alpha).toBe(1);
  }
  for (const parts of sequences.afterNod) expect(parts).toEqual([{ frame: 7, alpha: 1 }]);
  for (const parts of sequences.nod) {
    const coverage = 1 - parts.reduce((transmission, part) => transmission * (1 - part.alpha), 1);
    expect(coverage).toBe(1);
  }
});

test('idle, both steps and nod have matching visible height and torso width', async ({ page }) => {
  await bootRhythm(page);
  const states = await page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor;
    const sample = (direction: 'left' | 'right' | 'down' | undefined, at: number) => {
      const feedback = direction ? { direction, judgment: 'perfect', at } : undefined;
      actor.render(640, 400, 154, 0, feedback, at);
      actor.render(640, 400, 154, 0, feedback, at + (direction === 'left' || direction === 'right' ? .3 : .16));
      const sprite = actor.parts.find((p: any) => p.visible && p.alpha > .99), f = sprite.frame;
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight,
        128 - f.width * sprite.scaleX * sprite.originX, 230 - f.height * sprite.scaleY * sprite.originY,
        f.width * sprite.scaleX, f.height * sprite.scaleY);
      const pixels = ctx.getImageData(0, 0, 256, 256).data;
      let top = 256, bottom = 0;
      const widths: number[] = [];
      for (let y = 0; y < 256; y++) {
        let left = 256, right = 0;
        for (let x = 0; x < 256; x++) if (pixels[(y * 256 + x) * 4 + 3] > 128) {
          left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        }
        // Fixed screen band across the upper torso, independent of each image's bounding box.
        if (y >= 120 && y < 140 && right > left) widths.push(right - left);
      }
      widths.sort((a, b) => a - b);
      return { texture: sprite.texture.key, frame: String(f.name), x: sprite.x, y: sprite.y,
        scaleX: sprite.scaleX, scaleY: sprite.scaleY, height: bottom - top, bottom, bodyWidth: widths[Math.floor(widths.length / 2)] };
    };
    return { idle: sample(undefined, 0), left: sample('left', 1), right: sample('right', 2), down: sample('down', 3) };
  });
  expect(states.down).toMatchObject({ texture: nod.key, frame: '1', x: 640, y: 400 });
  for (const state of [states.left, states.right, states.down]) {
    expect(Math.abs(state.bodyWidth - states.idle.bodyWidth)).toBeLessThanOrEqual(states.idle.bodyWidth * .05 + 1);
    expect(state.height).toBeLessThanOrEqual(states.idle.height * 1.02);
    expect(Math.abs(state.bottom - states.idle.bottom)).toBeLessThanOrEqual(1);
  }
});

for (const reduced of [false, true]) test(`authored clips keep a shared origin and scale through transitions and loops, reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await bootRhythm(page);
  const states = await page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor;
    const sample = (clip: string, age: number) => {
      actor.renderClip(clip, 640, 400, 154, age);
      const p = actor.parts[1];
      return { frame: Number(p.frame.name), originX: p.originX, originY: p.originY,
        x: p.x, y: p.y, scaleX: p.scaleX, scaleY: p.scaleY, depth: p.depth };
    };
    const loop = [.1, .5, .6, .8, 1.1, 1.2, 1.4, 1.6, 1.7, 1.9, 2.2, 2.3, 2.5, 2.96, 3.76].map(age => sample('side_to_side', age));
    const left = [0, .5, .6, .8, 1.1, 1.2, 1.4, 1.59, 10].map(age => sample('step_left', age));
    const right = [0, .4, .5, .8, 1, 1.1, 1.3, 1.73, 10].map(age => sample('step_right', age));
    // Game feedback is pruned after .8s; its absence must not cut the return short.
    actor.render(640, 400, 154, 0, undefined, 0);
    actor.render(640, 400, 154, 0, { direction: 'left', judgment: 'perfect', at: 1 }, 1);
    actor.render(640, 400, 154, 0, undefined, 1.8);
    const afterPrune = Number(actor.parts[1].frame.name);
    actor.render(640, 400, 154, 0, undefined, 2.6);
    actor.render(640, 400, 154, 0, undefined, 2.7);
    const rested = String(actor.parts[1].frame.name);
    return { loop, left, right, afterPrune, rested };
  });
  expect(states.loop.map(s => s.frame)).toEqual(reduced ? Array(15).fill(0) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 3]);
  expect(states.left.map(s => s.frame)).toEqual(reduced ? [3, 3, 3, 3, 3, 3, 3, 6, 6] : [0, 1, 2, 3, 4, 5, 6, 6, 6]);
  expect(states.right.map(s => s.frame)).toEqual(reduced ? [9, 9, 9, 9, 9, 9, 9, 12, 12] : [6, 7, 8, 9, 10, 11, 12, 12, 12]);
  expect(states.afterPrune).toBe(reduced ? 3 : 6); expect(states.rested).toBe('__BASE');
  const scale = states.left[0].scaleX, scaleY = states.left[0].scaleY;
  for (const state of [...states.loop, ...states.left, ...states.right]) {
    expect(state).toMatchObject({ originX: .5, originY: sizing.step.footY / sizing.step.cellHeight, x: 640, y: 400, scaleX: scale, scaleY, depth: 40 });
  }
});

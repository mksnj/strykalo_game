import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';
import { COURT_DANCE, RHYTHM } from '../../apps/web/src/game/config';
import type { RhythmDirection } from '../../apps/web/src/game/minigames/stars/StarsEngine';

for (const [width, height, name] of [[960, 540, 'desktop'], [375, 667, 'portrait'], [844, 390, 'landscape']] as const) {
  test('side steps and nod follow keys, up keeps rest, feet and pause stay stable: ' + name, async ({ page }) => {
    await page.setViewportSize({ width, height }); await bootRhythm(page);
    await page.getByRole('button', { name: 'К этапам', exact: true }).click();
    await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click(); await page.clock.runFor(80);
    await page.getByRole('button', { name: 'Начать →', exact: true }).click(); await page.clock.runFor(80);
    const previews = `docs/previews/${COURT_DANCE.collection}`;
    await page.locator('main').focus(); await mkdir(previews, { recursive: true });
    const read = () => page.evaluate(() => {
      const scene = (window as any).rhythmScene, s = scene.session;
      return { elapsed: s.stars.elapsed, hits: s.stars.hits, misses: s.stars.misses,
        direction: s.stars.feedback.at(-1)?.direction,
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
      for (let frame = 0; frame < 40 && (await read()).elapsed < hitAt + .16; frame++) await page.clock.runFor(40);
      const state = await read();
      expect(state.hits).toBe(i + 1); expect(state.misses).toBe(0); expect(state.parts).toHaveLength(1);
      const expected = note.direction === 'up' ? { texture: 'hero-front', frame: '__BASE' } :
        { texture: COURT_DANCE.key, frame: String(COURT_DANCE.frames[note.direction]) };
      expect(state.parts[0]).toMatchObject({ ...expected, angle: 0, flip: false, x: anchor.x });
      expect(state.parts[0].left).toBeGreaterThan(0); expect(Math.abs(state.parts[0].y - anchor.y)).toBeLessThan(1.3);
      seen.add(note.direction);
      await page.screenshot({ path: `${previews}/${name}-${note.direction}.png` });
    }
    expect([...seen].sort()).toEqual(['down', 'left', 'right', 'up']);
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const frozen = await read(); await page.clock.runFor(2000); expect(await read()).toEqual(frozen);
    await page.getByRole('button', { name: 'Продолжить' }).click();
    const resumedAt = (await read()).elapsed;
    for (let frame = 0; frame < 80 && (await read()).elapsed < resumedAt + .55; frame++) await page.clock.runFor(40);
    const rest = await read(); expect(rest.parts).toHaveLength(1); expect(rest.parts[0].texture).toBe('hero-front');
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
    const before = render(1.16, 'left');
    const afterUp = render(1.2, 'up');
    render(1.46, 'up');
    const rested = render(1.56, 'up');
    return { before, afterUp, rested };
  });
  expect(state.before).toEqual([{ texture: COURT_DANCE.key, frame: String(COURT_DANCE.frames.left) }]);
  expect(state.afterUp).toEqual(state.before);
  expect(state.rested).toEqual([{ texture: 'hero-front', frame: '__BASE' }]);
});

test('whole nod pose has no squash and side poses do not enlarge the body', async ({ page }) => {
  await bootRhythm(page);
  const states = await page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor;
    const sample = (direction: 'left' | 'right' | 'down' | undefined, at: number) => {
      const feedback = direction ? { direction, judgment: 'perfect', at } : undefined;
      actor.render(640, 400, 154, 0, feedback, at);
      actor.render(640, 400, 154, 0, feedback, at + .16);
      const sprite = actor.parts.find((p: any) => p.visible && p.alpha > .99), f = sprite.frame;
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight,
        128 - f.width * sprite.scaleX / 2, 230 - f.height * sprite.scaleY, f.width * sprite.scaleX, f.height * sprite.scaleY);
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
  expect(states.down).toMatchObject({ texture: COURT_DANCE.key, frame: String(COURT_DANCE.frames.down), x: 640, y: 400 });
  for (const state of [states.left, states.right, states.down]) {
    expect(state.scaleX).toBe(state.scaleY);
    expect(state.bodyWidth).toBeLessThanOrEqual(states.idle.bodyWidth * 1.05);
    expect(state.height).toBeLessThanOrEqual(states.idle.height * 1.02);
    expect(Math.abs(state.bottom - states.idle.bottom)).toBeLessThanOrEqual(1);
  }
});

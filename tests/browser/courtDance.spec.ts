import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';
import { COURT_DANCE } from '../../apps/web/src/game/config';
import type { RhythmDirection } from '../../apps/web/src/game/minigames/stars/StarsEngine';

for (const [width, height, name] of [[960, 540, 'desktop'], [375, 667, 'portrait'], [844, 390, 'landscape']] as const) {
  test('four supplied poses follow real keys, preserve feet and pause: ' + name, async ({ page }) => {
    await page.setViewportSize({ width, height }); await bootRhythm(page);
    await page.getByRole('button', { name: 'К этапам', exact: true }).click();
    await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click(); await page.clock.runFor(80);
    await page.getByRole('button', { name: 'Начать →', exact: true }).click(); await page.clock.runFor(80);
    await page.locator('main').focus(); await mkdir('docs/previews/court-dance-v19', { recursive: true });
    const read = () => page.evaluate(() => {
      const scene = (window as any).rhythmScene, s = scene.session;
      return { elapsed: s.stars.elapsed, hits: s.stars.hits, misses: s.stars.misses,
        direction: s.stars.feedback.at(-1)?.direction,
        parts: scene.starsView.actor.parts.filter((p: any) => p.visible && p.alpha > .01).map((p: any) => ({
          texture: p.texture.key, frame: String(p.frame.name), x: p.x, y: p.y, alpha: p.alpha,
          angle: p.angle, flip: p.flipX, left: p.getBounds().left,
        })) };
    });
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const note = await page.evaluate(() => {
        const e = (window as any).rhythmScene.session.stars, n = e.notes.find((n: any) => n.state === 'pending');
        e.step(n.at); return { direction: n.direction as RhythmDirection,
          key: ({ left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' } as any)[n.direction] };
      });
      await page.keyboard.press(note.key);
      // Phaser smooths the mocked frame delta; wait for simulation time, not wall time.
      const hitAt = (await read()).elapsed;
      for (let frame = 0; frame < 40 && (await read()).elapsed < hitAt + .16; frame++) await page.clock.runFor(40);
      const state = await read();
      expect(state.hits).toBe(i + 1); expect(state.misses).toBe(0); expect(state.parts).toHaveLength(1);
      expect(state.parts[0]).toMatchObject({ texture: COURT_DANCE.key, frame: String(COURT_DANCE.frames[note.direction]), angle: 0, flip: false, x: 640 });
      expect(state.parts[0].left).toBeGreaterThan(521); expect(Math.abs(state.parts[0].y - 400.6)).toBeLessThan(.7);
      seen.add(note.direction);
      await page.screenshot({ path: `docs/previews/court-dance-v19/${name}-${note.direction}.png` });
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

import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm, beginRhythm } from './rhythmHarness';
import layout from '../../apps/web/src/game/assets/cometLayout.json' with { type: 'json' };
import { RHYTHM } from '../../apps/web/src/game/config';
import type { RhythmDirection } from '../../apps/web/src/game/minigames/stars/StarsEngine';

const directory = 'docs/previews/vertical-comets';
const read = (page: Page) => page.evaluate(() => {
  const scene = (window as any).rhythmScene, v = scene.starsView, e = scene.session.stars;
  const sprite = (s: any) => ({ key: s.texture.key, frame: Number(s.frame.name), x: s.x, y: s.y, alpha: s.alpha,
    scaleX: s.scaleX, scaleY: s.scaleY, width: s.displayWidth, height: s.displayHeight, angle: s.angle, flipX: s.flipX, flipY: s.flipY,
    originX: s.originX, originY: s.originY, visible: s.visible, blendMode: s.blendMode, tint: s.tintTopLeft });
  return { elapsed: e.elapsed, misses: e.misses, hits: e.hits, reduced: v.reduced,
    notes: v.cometSprites.filter((s: any) => s.visible).map(sprite) };
});

for (const [width, height, name] of [[960, 540, 'desktop'], [390, 844, 'portrait'], [844, 390, 'landscape']] as const) {
  test('vertical comets animate in all four lanes, pause and clear on hits: ' + name, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height }); await bootRhythm(page); await beginRhythm(page);
    await mkdir(directory, { recursive: true });
    const directions = new Set<RhythmDirection>();
    for (let hit = 0; hit < 4; hit++) {
      const note = await page.evaluate(start => {
        const e = (window as any).rhythmScene.session.stars, n = e.notes.find((n: any) => n.state === 'pending');
        e.step(start + Math.max(e.elapsed, n.at - 1));
        return { id: n.id, direction: n.direction as RhythmDirection, at: n.at,
          key: ({ left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', up: 'ArrowUp' } as any)[n.direction] };
      }, RHYTHM.musicStartSeconds);
      await page.clock.runFor(40);
      const before = await read(page); expect(before.notes.length).toBeGreaterThan(0);
      for (let frame = 0; frame < 12; frame++) await page.clock.runFor(40);
      const middle = await read(page);
      for (let frame = 0; frame < 12; frame++) await page.clock.runFor(40);
      const after = await read(page);
      expect(after.notes[0].y).toBeGreaterThan(before.notes[0].y);
      expect(new Set([before, middle, after].map(state => state.notes[0].frame)).size,
        JSON.stringify([before, middle, after])).toBeGreaterThan(1);
      for (const sprite of after.notes) {
        expect(sprite.frame).toBe(Math.floor(after.elapsed / layout.shimmerSeconds * layout.frameCount) % layout.frameCount);
        expect(sprite).toMatchObject({ key: layout.key, alpha: 1, width: 160, height: 320,
          scaleX: layout.displayScale, scaleY: layout.displayScale, angle: 0, flipX: false, flipY: false,
          originX: layout.anchor.x / layout.cellWidth, originY: layout.anchor.y / layout.cellHeight,
          visible: true, blendMode: 0, tint: 0xffffff });
      }
      await page.screenshot({ path: `${directory}/${name}-${note.direction}.png` });
      if (!hit) {
        await page.getByRole('button', { name: 'Пауза', exact: true }).click();
        const frozen = await read(page); await page.clock.runFor(1200); expect(await read(page)).toEqual(frozen);
        await page.getByRole('button', { name: /^Продолжить/ }).click();
      }
      await page.evaluate(({ start, at }) => (window as any).rhythmScene.session.stars.step(start + at),
        { start: RHYTHM.musicStartSeconds, at: note.at });
      await page.clock.runFor(40); await page.locator('main').focus(); await page.keyboard.press(note.key); await page.clock.runFor(40);
      const state = await read(page); expect(state.hits).toBe(hit + 1); expect(state.misses).toBe(0);
      directions.add(note.direction);
    }
    expect([...directions].sort()).toEqual(['down', 'left', 'right', 'up']);
    const hidden = await page.evaluate(() => {
      const scene = (window as any).rhythmScene;
      scene.starsView.render(scene.session.stars, 1, 0, undefined, undefined, .5);
      return scene.starsView.cometSprites.every((s: any) => !s.visible);
    });
    expect(hidden).toBe(true); expect(errors).toEqual([]);
  });
}

test('reduced motion keeps the first supplied frame while notes continue falling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await bootRhythm(page); await beginRhythm(page);
  await page.clock.runFor(950); const before = await read(page);
  await page.clock.runFor(240); const after = await read(page);
  expect(before.notes.length).toBeGreaterThan(0);
  expect(after.notes[0].y).toBeGreaterThan(before.notes[0].y);
  for (const state of [before, after]) for (const note of state.notes) {
    expect(note.frame).toBe(0); expect(note.alpha).toBe(1);
  }
});

import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm, beginRhythm } from './rhythmHarness';

const directory = 'docs/previews/rhythm-comets';
const read = (page: Page) => page.evaluate(() => {
  const scene = (window as any).rhythmScene, v = scene.starsView, e = scene.session.stars;
  return { elapsed: e.elapsed, misses: e.misses, notes: v.arrows.flatMap((a: any, i: number) => a.visible ? [{
    arrow: { text: a.text, x: a.x, y: a.y, color: a.style.color },
    badge: { x: v.arrowBadges[i].x, y: v.arrowBadges[i].y, color: v.arrowBadges[i].fillColor,
      alpha: v.arrowBadges[i].fillAlpha, visible: v.arrowBadges[i].visible },
    sprites: v.comets[i].map((s: any) => ({
      key: s.texture.key, frame: Number(s.frame.name), x: s.x, y: s.y, alpha: s.alpha,
      scaleX: s.scaleX, scaleY: s.scaleY, angle: s.angle, flipX: s.flipX, flipY: s.flipY,
      originX: s.originX, originY: s.originY, visible: s.visible,
    })),
  }] : []) };
});

for (const [width, height, name] of [[960, 540, 'desktop'], [390, 844, 'portrait'], [844, 390, 'landscape']] as const) {
  test('comets fall straight with readable arrows, shimmer, pause and disappear on hit: ' + name, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height }); await bootRhythm(page); await beginRhythm(page);
    await mkdir(directory, { recursive: true }); await page.clock.runFor(950);
    const before = await read(page); expect(before.notes.length).toBeGreaterThan(0);
    await page.clock.runFor(240); const after = await read(page);
    expect(after.notes[0].arrow.x).toBe(before.notes[0].arrow.x);
    expect(after.notes[0].arrow.y).toBeGreaterThan(before.notes[0].arrow.y);
    for (const note of after.notes) {
      expect(note.arrow.color).toBe('#ffffff');
      expect(note.badge).toEqual({ x: note.arrow.x, y: note.arrow.y + 1, color: 0x101b29, alpha: .96, visible: true });
    }
    expect(after.notes[0].sprites[0].alpha).not.toBeCloseTo(before.notes[0].sprites[0].alpha, 3);
    for (const note of after.notes) for (const [frame, s] of note.sprites.entries()) {
      expect(s).toMatchObject({ key: 'rhythm-comet', frame, x: note.arrow.x, y: note.arrow.y + 1,
        scaleX: .5, scaleY: .5, angle: 0, flipX: false, flipY: false, originX: .5, originY: 210 / 256, visible: true });
      expect(note.sprites[0].alpha + note.sprites[1].alpha).toBeCloseTo(1, 8);
    }
    await page.screenshot({ path: `${directory}/${name}-falling.png` });
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const paused = await read(page); await page.clock.runFor(1200); expect(await read(page)).toEqual(paused);
    await page.getByRole('button', { name: 'Продолжить →', exact: true }).click();
    const key = await page.evaluate(() => {
      const e = (window as any).rhythmScene.session.stars, n = e.notes.find((n: any) => n.state === 'pending');
      e.step(n.at); return ({ left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', up: 'ArrowUp' } as any)[n.direction];
    });
    await page.clock.runFor(40);
    await page.screenshot({ path: `${directory}/${name}-target.png` });
    await page.locator('main').focus(); await page.keyboard.press(key); await page.clock.runFor(40);
    expect((await read(page)).misses).toBe(0);
    expect(await page.evaluate(() => (window as any).rhythmScene.session.stars.hits)).toBe(1);
    // Inactive notes leave neither a head nor a detached tail behind.
    expect(await page.evaluate(() => {
      const v = (window as any).rhythmScene.starsView;
      return v.comets.every((pair: any[], i: number) => pair.every(s => s.visible === v.arrows[i].visible) && v.arrowBadges[i].visible === v.arrows[i].visible);
    })).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('reduced motion keeps a static comet texture while notes keep falling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await bootRhythm(page); await beginRhythm(page);
  await page.clock.runFor(950); const before = await read(page);
  await page.clock.runFor(240); const after = await read(page);
  expect(after.notes[0].arrow.y).toBeGreaterThan(before.notes[0].arrow.y);
  expect(before.notes[0].sprites.map((s: any) => s.alpha)).toEqual([1, 0]);
  expect(after.notes[0].sprites.map((s: any) => s.alpha)).toEqual([1, 0]);
});

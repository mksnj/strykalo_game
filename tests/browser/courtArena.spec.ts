import { test, expect } from '@playwright/test';
import { bootRhythm, beginRhythm, targetNote } from './rhythmHarness';
for (const [width, height] of [[960,540],[375,667],[844,390]]) test('four stationary rhythm targets fit the painted yard ' + width + 'x' + height, async ({ page }) => {
  await page.setViewportSize({ width, height }); await bootRhythm(page); await beginRhythm(page);
  await targetNote(page, 0, -.7); await page.clock.runFor(40);
  const view = await page.evaluate(() => {
    const s = (window as any).rhythmScene, c = s.cameras.main, v = s.starsView;
    return { targets: v.targets.map((t: any) => ({ x: t.x, y: t.y, visible: t.visible })),
      left: c.worldView.x, right: c.worldView.right, heroScale: [s.runnerView.hero.scaleX, s.runnerView.hero.scaleY],
      notesVisible: v.arrows.filter((a: any) => a.visible).length };
  });
  expect(view.targets).toHaveLength(4); expect(new Set(view.targets.map((t: any) => t.y)).size).toBe(1);
  for (const t of view.targets) { expect(t.visible).toBe(true); expect(t.x - 28).toBeGreaterThan(view.left); expect(t.x + 28).toBeLessThan(view.right); }
  expect(view.heroScale[0]).toBeCloseTo(view.heroScale[1]); expect(view.notesVisible).toBeGreaterThan(0);
  await expect(page.locator('.joystick')).toHaveCount(0);
});

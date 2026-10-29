import { test, expect } from '@playwright/test';
import { bootRhythm, beginRhythm, targetNote, readRhythm } from './rhythmHarness';
import { RHYTHM } from '../../apps/web/src/game/config';
test('holding and repeat events cannot play a note; three actual misses finish only the first round', async ({ page }) => {
  await bootRhythm(page); await beginRhythm(page);
  const n = await targetNote(page, 0, -RHYTHM.travelSeconds - .1);
  await page.keyboard.down(n.key); await page.clock.runFor(40);
  expect((await readRhythm(page)).misses).toBe(0);
  await targetNote(page);
  for (let i = 0; i < 15; i++) await page.evaluate(code =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: true, bubbles: true })), n.key);
  await page.clock.runFor(40); expect((await readRhythm(page)).hits).toBe(0);
  await page.keyboard.up(n.key); await page.keyboard.press(n.key); await page.clock.runFor(40);
  expect((await readRhythm(page)).hits).toBe(1);
  await page.evaluate(() => { const e = (window as any).rhythmScene.session.stars; e.step(e.elapsed + 20); });
  await page.clock.runFor(40);
  expect((await readRhythm(page)).phase).toBe('stars-retry'); expect((await readRhythm(page)).misses).toBe(3);
});

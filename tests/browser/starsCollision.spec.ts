import { test, expect } from '@playwright/test';
import { bootRhythm, beginRhythm, targetNote, readRhythm } from './rhythmHarness';
for (const developer of [false, true]) test('timing replaces star collision, developer=' + developer, async ({ page }) => {
  await bootRhythm(page, developer); await beginRhythm(page);
  const before = await readRhythm(page), n = await targetNote(page);
  await page.keyboard.press(n.key); await page.clock.runFor(40);
  expect((await readRhythm(page)).hits).toBe(1);
  expect((await readRhythm(page)).score).toBe(before.score); expect((await readRhythm(page)).lives).toBe(3);
  const next = await targetNote(page, 1);
  const wrong = next.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  await page.keyboard.press(wrong); await page.clock.runFor(40);
  expect((await readRhythm(page)).hits).toBe(1);
  for (let i = 0; i < 20 && (await readRhythm(page)).elapsed < next.at + .3; i++) await page.clock.runFor(80);
  expect((await readRhythm(page)).misses).toBe(1); expect((await readRhythm(page)).lives).toBe(3);
  expect((await readRhythm(page)).actor).toEqual(before.actor);
});

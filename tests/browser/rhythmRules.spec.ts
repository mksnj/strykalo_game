import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm, beginRhythm, readRhythm } from './rhythmHarness';
import { RHYTHM } from '../../apps/web/src/game/config';

const directory = 'docs/previews/rhythm-endless-restored';

test('speed doubles at 20s, triples at 40s and perfect play cannot win after a minute', async ({ page }) => {
  await bootRhythm(page, false); await beginRhythm(page);
  for (const [time, speed] of [[20, 2], [40, 3], [60, 4]]) {
    await page.evaluate(time => {
      const s = (window as any).rhythmScene.session;
      while (s.phase === 'stars' && s.stars.elapsed < time && !s.stars.outcome) {
        for (const note of s.stars.notes) if (note.state === 'pending' && Math.abs(note.at - s.stars.elapsed) <= 1 / 120) s.rhythmPress(note.direction);
        s.step();
      }
    }, time);
    await page.clock.runFor(40);
    const state = await readRhythm(page);
    expect(state.phase).toBe('stars'); expect(state.misses).toBe(0); expect(state.elapsed).toBeGreaterThanOrEqual(time);
    await expect(page.locator('.rhythm-attempts')).toContainText(`Скорость ×${speed.toFixed(1)}`);
    expect(await page.evaluate(() => (window as any).rhythmScene.session.stars.outcome)).toBeNull();
    await expect(page.locator('.narrative-caption')).toHaveCount(0);
  }
  await mkdir(directory, { recursive: true }); await page.screenshot({ path: `${directory}/still-playing-60s.png` });
});

for (const [width, height, name] of [[960, 540, 'desktop'], [390, 844, 'portrait']] as const) {
  test('only the fifth hidden defeat shows бесполезно and continues the route: ' + name, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height }); await bootRhythm(page, false); await beginRhythm(page);
    for (let round = 1; round <= 5; round++) {
      await expect(page.locator('.rhythm-attempts')).toContainText('Ошибки 0 / 3');
      await expect(page.locator('.rhythm-hud')).not.toContainText(/попытк|раунд|из 5|\/ 5/i);
      for (let miss = 1; miss <= 3; miss++) {
        const key = await page.evaluate(start => {
          const e = (window as any).rhythmScene.session.stars, note = e.notes.find((n: any) => n.state === 'pending');
          e.step(start + note.at);
          return note.direction === 'left' ? 'ArrowRight' : 'ArrowLeft';
        }, RHYTHM.musicStartSeconds);
        await page.clock.runFor(40); await page.locator('main').focus(); await page.keyboard.press(key); await page.clock.runFor(40);
        const state = await readRhythm(page); expect(state.misses).toBe(miss);
        expect(state.phase).toBe(miss < 3 ? 'stars' : round < 5 ? 'stars-retry' : 'stars-failure');
        await expect(page.locator('.rhythm-attempts')).toContainText(`Ошибки ${miss} / 3`);
      }
      if (round < 5) {
        await expect(page.getByText('Ещё раз', { exact: true })).toBeVisible();
        await expect(page.locator('.narrative-caption')).toHaveCount(0);
        if (round === 1) {
          await page.getByRole('button', { name: 'Пауза', exact: true }).click();
          const frozen = await readRhythm(page); await page.clock.runFor(1000); expect(await readRhythm(page)).toEqual(frozen);
          await page.getByRole('button', { name: /^Продолжить/ }).click();
        }
        for (let frame = 0; frame < 250 && (await readRhythm(page)).phase === 'stars-retry'; frame++) await page.clock.runFor(40);
        const fresh = await readRhythm(page); expect(fresh.phase, JSON.stringify(fresh)).toBe('stars'); expect(fresh.misses).toBe(0); expect(fresh.hits).toBe(0);
      }
    }
    await expect(page.locator('.narrative-caption')).toHaveText('бесполезно');
    await mkdir(directory, { recursive: true }); await page.screenshot({ path: `${directory}/${name}-fifth-defeat.png` });
    await page.clock.runFor(3500); await expect(page.locator('.narrative-caption')).toBeVisible();
    for (let frame = 0; frame < 500 && (await readRhythm(page)).phase !== 'runner'; frame++) await page.clock.runFor(40);
    const onward = await readRhythm(page); expect(onward.phase).toBe('runner'); expect(onward.checkpoint).toBe(400);
    expect(onward.distance).toBeGreaterThanOrEqual(400); expect(onward.distance).toBeLessThan(401);
    expect(onward.score).toBe(17); expect(onward.lives).toBe(3);
  });
}

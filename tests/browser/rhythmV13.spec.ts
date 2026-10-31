import { finishRhythmRounds } from './rhythmHarness';
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { bootRhythm, reachRhythm, targetNote, readRhythm } from './rhythmHarness';
import { STORM, JOURNEY } from '../../apps/web/src/game/config';
const directory = 'docs/previews/rhythm-v13';
for (const [width, height, name] of [[960, 540, 'desktop'], [390, 844, 'portrait'], [844, 390, 'landscape']] as const) {
  test('four-direction slow rhythm, then storm before game 3: ' + name, async ({ page }) => {
    test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height }); await bootRhythm(page); await mkdir(directory, { recursive: true });
    await reachRhythm(page);
    await expect(page.getByText('Танцуй в ритме падающих звезд.', { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: directory + '/' + name + '-01-tutorial.png' });
    const frozen = await readRhythm(page);
    await page.keyboard.down('ArrowLeft'); await page.clock.runFor(3000);
    expect(await readRhythm(page)).toEqual(frozen);
    await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true }); await page.clock.runFor(40);
    expect((await readRhythm(page)).hits).toBe(0); await page.keyboard.up('ArrowLeft');
    await expect(page.locator('.joystick')).toHaveCount(0); await expect(page.locator('.rhythm-keys button')).toHaveCount(4);
    await targetNote(page, 0, -.7); await page.clock.runFor(40);
    await page.screenshot({ path: directory + '/' + name + '-02-falling.png' });
    const note = await targetNote(page);
    if (name === 'portrait') {
      const cdp = await page.context().newCDPSession(page), b = (await page.locator('[data-direction=' + note.direction + ']').boundingBox())!;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.keyboard.press(note.key);
    await page.clock.runFor(40);
    const hit = await readRhythm(page); expect(hit.hits).toBe(1); expect(hit.score).toBe(17); expect(hit.actor).toEqual(frozen.actor);
    expect(hit.feedback!.at(-1).judgment).toBe('perfect');
    await page.screenshot({ path: directory + '/' + name + '-03-hit.png' });
    await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
    const paused = await readRhythm(page); await page.clock.runFor(2000); expect(await readRhythm(page)).toEqual(paused);
    await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const b of await page.locator('.rhythm-keys button').all()) {
      const box = (await b.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await page.evaluate(() => { const e = (window as any).rhythmScene.session.stars; e.step(e.elapsed + 20); });
    await page.clock.runFor(40); expect((await readRhythm(page)).phase).toBe('stars-retry');
    await finishRhythmRounds(page); await page.clock.runFor(40); expect((await readRhythm(page)).phase).toBe('stars-failure');
    await page.screenshot({ path: directory + '/' + name + '-04-story.png' });
    await page.clock.runFor((JOURNEY.narrativeSeconds + JOURNEY.courtExitSeconds + .2) * 1000);
    expect((await readRhythm(page)).phase).toBe('runner'); expect((await readRhythm(page)).checkpoint).toBe(40);
    await page.evaluate(() => {
      const s = (window as any).rhythmScene.session; s.runner.objects = []; s.runner.travel = s.route.waitingAt * 60 - 1;
    });
    await page.clock.runFor(80); expect((await readRhythm(page)).phase).toBe('room-approach'); expect((await readRhythm(page)).distance).toBe(60);
    await page.evaluate(() => { (window as any).rhythmScene.session.phaseTime = 1.2; });
    await page.clock.runFor(40); await page.screenshot({ path: directory + '/' + name + '-05-outdoor-storm.png' });
    expect(await page.evaluate(() => (window as any).rhythmScene.waitingView.container.visible)).toBe(false);
    await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
    const storm = await readRhythm(page); await page.clock.runFor(1500); expect(await readRhythm(page)).toEqual(storm);
    await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
    await page.evaluate(() => {
      const s = (window as any).rhythmScene.session;
      if (s.phase !== 'room-approach') throw new Error('Storm returned to the wrong game');
      s.phaseTime = 2.8;
    });
    await page.clock.runFor(40); await page.screenshot({ path: directory + '/' + name + '-06-room-entrance.png' });
    const waitingBefore = await page.evaluate(() => {
      const scene = (window as any).rhythmScene; return { phase: scene.session.phase, visible: scene.waitingView.container.visible, started: !!scene.session.waiting };
    });
    expect(waitingBefore).toEqual({ phase: 'room-approach', visible: true, started: false });
    await page.evaluate(() => { const s = (window as any).rhythmScene.session; while (s.phase !== 'waiting') s.step(); });
    await page.clock.runFor(40); expect((await readRhythm(page)).phase).toBe('waiting');
    await page.clock.runFor(2250); await page.screenshot({ path: directory + '/' + name + '-07-room-window.png' });
    expect((await readRhythm(page)).lives).toBe(3); expect(errors).toEqual([]);
    await writeFile(directory + '/' + name + '.json', JSON.stringify({ width, height, rhythm: hit, stormAt: 100, waitingBefore, errors }, null, 2));
    expect(STORM.lightningInterval).toBeLessThan(90);
  });
}

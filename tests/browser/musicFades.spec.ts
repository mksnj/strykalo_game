import { expect as baseExpect, test } from '@playwright/test';
import { resolve } from 'node:path';

const fixture = '/@fs/' + resolve('tests/fixtures/audio.html').replaceAll('\\', '/');
const expect = baseExpect.configure({ timeout: 10000 });
const status = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).audioPreview.manager.status);

test('rapid track changes preserve the outgoing fade; game over fades to silence', async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(async () => (await status(page)).music[0]?.position ?? 0, { timeout: 10000, intervals: [100] }).toBeGreaterThan(3);
  const firstUrl = (await status(page)).music[0].url;
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('balance'));
  await page.waitForFunction(firstUrl => (window as any).audioPreview.manager.status.music.some((v: any) =>
    v.url !== firstUrl && v.started && v.gain > .1), firstUrl);
  const before = (await status(page)).music.find((v: any) => v.url === firstUrl);
  expect(before.fading).toBe(true);
  expect(before.gain).toBeGreaterThan(.1);
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('stars'));
  const during = (await status(page)).music.find((v: any) => v.url === firstUrl);
  expect(during, 'a new request must not delete an audible outgoing voice').toBeDefined();
  expect(during.gain).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  const later = (await status(page)).music.find((v: any) => v.url === firstUrl);
  expect(later).toBeDefined(); expect(later.gain).toBeLessThan(during.gain);
  await expect.poll(async () => (await status(page)).music.length).toBe(1);
  await expect.poll(async () => (await status(page)).music[0]?.gain ?? 0).toBeGreaterThan(.7);

  const outgoing = (await status(page)).music[0];
  await page.evaluate(() => (window as any).audioPreview.manager.endRun());
  const fading = (await status(page)).music[0];
  expect(fading.fading).toBe(true); expect(fading.gain).toBeGreaterThan(.5);
  await page.waitForTimeout(2000);
  const tail = (await status(page)).music[0];
  expect(tail.gain).toBeGreaterThan(0); expect(tail.gain).toBeLessThan(outgoing.gain - .1);
  await expect.poll(async () => (await status(page)).music.length).toBe(0);
  await page.evaluate(() => (window as any).audioPreview.manager.dispose());
});

test('tutorial/menu pause fades the song; a quick resume cancels the fade', async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(async () => (await status(page)).music[0]?.position ?? 0, { timeout: 10000, intervals: [100] }).toBeGreaterThan(3);
  await page.evaluate(() => (window as any).audioPreview.manager.pauseWithFade());
  expect((await status(page)).state).toBe('running');
  await page.waitForTimeout(2000);
  const tail = (await status(page)).musicVolume;
  expect(tail).toBeGreaterThan(.45); expect(tail).toBeLessThan(.7);
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(async () => (await status(page)).musicVolume).toBeGreaterThan(.8);
  await page.waitForTimeout(1100);
  expect((await status(page)).state).toBe('running');

  await page.evaluate(() => {
    const manager = (window as any).audioPreview.manager;
    (window as any).fadeInterval = setInterval(() => manager.pauseWithFade(), 20);
  });
  await expect.poll(async () => (await status(page)).state).toBe('suspended');
  const frozen = (await status(page)).music[0].position;
  await page.waitForTimeout(200);
  expect((await status(page)).music[0].position).toBeCloseTo(frozen, 2);
  await page.evaluate(() => clearInterval((window as any).fadeInterval));
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(async () => (await status(page)).musicVolume).toBeGreaterThan(.8);
  await expect.poll(async () => (await status(page)).music[0].position).toBeGreaterThan(frozen + .1);
  await page.evaluate(() => (window as any).audioPreview.manager.dispose());
});

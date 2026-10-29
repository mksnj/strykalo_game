import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('пространство, часы и анимации: контрольные кадры реальных представлений', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  const capture = async (name: string, value: number, file: string, reset = false) => {
    await page.evaluate(({ name, value, reset }) => {
      (window as unknown as { scenePreview: { show: (name: string, value: number, reset: boolean) => void } }).scenePreview.show(name, value, reset);
    }, { name, value, reset });
    await page.waitForTimeout(80);
    return await page.screenshot({ path: `docs/previews/${file}.png` });
  };
  const trench = await capture('crossing', 194, 'fixes-crossing-near');
  const trenchRange = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(650, 510, 240, 24).data;
    let min = 255, max = 0;
    for (let i = 0; i < pixels.length; i += 4) { min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]); }
    return max - min;
  }, trench.toString('base64'));
  expect(trenchRange, 'под боковой трубой должно быть рисованное дно, а не однотонная пустота').toBeGreaterThan(12);
  await capture('crossing', 200.05, 'fixes-crossing-far');
  for (const progress of [.2, .36, .6, .85]) await capture('pipe-entry', progress, `spatial-pipe-turn-${progress}`);
  await capture('pipe', 2, 'fixes-pipe-start-clean');
  await capture('pipe', 32, 'fixes-pipe-end-clean');
  await capture('court', -1, 'fixes-court-preview');
  await capture('court', .4, 'fixes-court-gate');
  await capture('court', .99, 'fixes-court-inside');
  for (const progress of [.3, .42, .6, 1]) await capture('court', progress, `locations-court-${progress}`);
  for (const progress of [.3, .36, .375, .42, .6, 1]) {
    const shot = await capture('room-entry', progress, `locations-room-${progress}`);
    if (progress === .375) {
      const samples = await page.evaluate(async data => {
        const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        return [[10, 10], [480, 270], [950, 530], [50, 480], [900, 50]].map(([x, y]) =>
          Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3));
      }, shot.toString('base64'));
      expect(new Set(samples.map(pixel => pixel.join(','))).size, 'смена комнаты скрыта равномерным затемнением всего кадра').toBe(1);
      expect(Math.max(...samples.flat())).toBeLessThan(40);
    }
  }
  await capture('shower', 12, 'stars-shower-before-threshold');
  await capture('shower', 18, 'stars-shower-after-threshold');
  const memoryShot = await capture('memory', 325, 'fixes-memory-clean');
  const roadRange = await page.evaluate(async screenshot => {
    // Read the composited screenshot: WebGL may discard its drawing buffer after presentation.
    const image = new Image(); image.src = 'data:image/png;base64,' + screenshot; await image.decode();
    const copy = document.createElement('canvas'); copy.width = 960; copy.height = 540;
    const ctx = copy.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(360, 490, 240, 24).data;
    let min = 255, max = 0;
    for (let i = 0; i < pixels.length; i += 4) { min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]); }
    return max - min;
  }, memoryShot.toString('base64'));
  expect(roadRange, 'дорожная маска должна восстановиться после котлована').toBeGreaterThan(12);
  await capture('memory', 334, 'fixes-memory-fade');
  const looking = await capture('room', 12, 'fixes-room-seated');
  const resting = await capture('room', 5, 'spatial-room-resting');
  const changed = await page.evaluate(async shots => {
    const pixels = await Promise.all(shots.map(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, 960, 540).data;
    }));
    const count = (x: number, y: number, width: number, height: number) => {
      let total = 0;
      for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
        const index = (py * 960 + px) * 4;
        if (pixels[0][index] !== pixels[1][index]) total++;
      }
      return total;
    };
    let door = 0;
    for (let y = 180; y < 380; y++) {
      const index = (y * 960 + 850) * 4;
      door += (pixels[0][index] + pixels[0][index + 1] + pixels[0][index + 2]) / 3;
    }
    return { body: count(362, 326, 100, 100), head: count(370, 276, 70, 46), clock: count(697, 125, 40, 40), door: door / 200 };
  }, [looking.toString('base64'), resting.toString('base64')]);
  expect(changed.body, 'тело и табуретка неподвижны при взгляде на часы').toBe(0);
  expect(changed.head).toBeGreaterThan(0); expect(changed.clock).toBeGreaterThan(0);
  expect(changed.door, 'закрытое полотно должно доходить до правого края проёма без тёмной щели').toBeGreaterThan(20);
  await capture('room', 35, 'fixes-room-window');
  // Keep the fixture below the new 90s completion boundary before testing a reset.
  await capture('room', 22, 'spatial-room-quiet');
  await capture('room', .12, 'spatial-room-clock');
  await capture('room', .12, 'fixes-room-reset', true);
  await capture('room', 9, 'spatial-room-after-reset');
  for (const distance of [605, 655, 690, 702.5, 706, 708]) await capture('final', distance, `fixes-final-${distance}`);
  expect(errors).toEqual([]);
});

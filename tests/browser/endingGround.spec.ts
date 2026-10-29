import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('финал: фасад, асфальт, скамейка и сидящий герой на общей земле', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  for (const [value, name] of [[698, 'approach'], [701.5, 'bench'], [703.5, 'seated']] as const) {
    await page.evaluate(value => (window as any).scenePreview.show('final', value), value);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `docs/previews/ending-grounded-${name}.png` });
  }
  // Audit the actual decoded resource as well as the composited renderer screenshots above.
  const pixels = await page.evaluate(async () => {
    const image = new Image(); image.src = '/assets/visual-v12/facade.webp'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const area = (x: number, y: number, w: number, h: number) => {
      const data = ctx.getImageData(x, y, w, h).data;
      let opaque = 0, min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 245) opaque++; min = Math.min(min, data[i]); max = Math.max(max, data[i]); }
      return { opaque: opaque / (w * h), contrast: max - min };
    };
    return { base: area(80, 400, 240, 38), entrance: area(425, 380, 120, 58), road: area(100, 438, 760, 80) };
  });
  for (const area of Object.values(pixels)) { expect(area.opaque).toBeGreaterThan(.99); expect(area.contrast).toBeGreaterThan(16); }
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

for (const width of [960, 1786]) {
  test(`новые панорамы: единый фон и заполнение ширины ${width}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 540 });
    await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
    await page.waitForFunction(() => 'scenePreview' in window);
    await page.evaluate(width => (window as any).scenePreview.resizePanorama(width), width);
    for (const name of ['pipe', 'room']) {
      const images = await page.evaluate(name => {
        const preview = (window as any).scenePreview;
        preview.show(name, 12);
        return preview.auditPanorama(name);
      }, name);
      expect(images).toHaveLength(1);
      expect(images[0].flipX || images[0].flipY).toBe(false);
      expect(images[0].scaleX).toBeCloseTo(images[0].scaleY, 4);
      expect(images[0].left).toBeLessThanOrEqual(480 - width / 2 + 1);
      expect(images[0].right).toBeGreaterThanOrEqual(480 + width / 2 - 1);
      expect(images[0].top).toBeLessThanOrEqual(1);
      expect(images[0].bottom).toBeGreaterThanOrEqual(539);
      await page.waitForTimeout(80);
      await page.screenshot({ path: `docs/previews/provided-v4-${name}-${width}.png` });
    }
    expect(errors).toEqual([]);
  });
}

import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

async function openPreview(page: Page): Promise<void> {
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
}
async function show(page: Page, name: string, value: number, file: string): Promise<Buffer> {
  await page.evaluate(({ name, value }) => {
    (window as unknown as { scenePreview: { show: (name: string, value: number) => void } }).scenePreview.show(name, value);
  }, { name, value });
  await page.waitForTimeout(80);
  return page.screenshot({ path: `docs/previews/${file}.png` });
}

test('широкий фон трубы сохраняет пропорции и не отражается', async ({ page }) => {
  await openPreview(page);
  const shot = await show(page, 'pipe', 2, 'provided-v4-pipe');
  const comparison = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const source = new Image(); source.src = '/assets/visual-v12/pipe.webp'; await source.decode();
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0); const actual = ctx.getImageData(0, 0, 960, 540).data;
    ctx.clearRect(0, 0, 960, 540); ctx.drawImage(source, -330, 0, 1620, 540);
    const expected = ctx.getImageData(0, 0, 960, 540).data;
    let checked = 0, matched = 0;
    // Avoid the sky cloud layer and independently moving pipe in the centre.
    for (let y = 65; y < 536; y += 8) for (const start of [8, 728]) for (let x = start; x < start + 224; x += 8) {
      const i = (y * 960 + x) * 4; checked++;
      if (Math.max(...[0, 1, 2].map(c => Math.abs(actual[i + c] - expected[i + c]))) <= 6) matched++;
    }
    return { checked, fraction: matched / checked };
  }, shot.toString('base64'));
  expect(comparison.checked).toBeGreaterThan(2000);
  expect(comparison.fraction, 'виден центр единой широкой панорамы без растяжения или зеркальных краёв').toBeGreaterThan(.97);
  await show(page, 'room', 12, 'provided-v4-room');
  await show(page, 'crossing', 194, 'locations-v7-crossing');
});

for (const width of [960, 1786]) for (const developer of [false, true]) {
  test(`площадка без смены фона, покрытия и позы при передаче управления: ${developer ? 'короткий' : 'обычный'} маршрут, ширина ${width}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 540 }); await openPreview(page);
    await page.evaluate(width => (window as any).scenePreview.resizePanorama(width), width);
    const suffix = (developer ? '-dev' : '') + (width === 960 ? '' : '-wide');
    const nameSuffix = developer ? '-dev' : '';
    const arrival = await show(page, 'court' + nameSuffix, 1, `locations-v7-arrival${suffix}`);
    const arrivalPose = await page.evaluate(() => (window as any).scenePreview.auditCourtPose());
    const start = await show(page, 'stars-start' + nameSuffix, 1, `locations-v7-stars${suffix}`);
    expect(await page.evaluate(() => (window as any).scenePreview.auditCourtPose())).toEqual(arrivalPose);
    const difference = await page.evaluate(async shots => {
      const pixels = await Promise.all(shots.map(async data => {
        const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        return { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width };
      }));
      let different = 0, compared = 0;
      for (let i = 0; i < pixels[0].data.length; i += 4) {
        const x = i / 4 % pixels[0].width + (960 - pixels[0].width) / 2, y = Math.floor(i / 4 / pixels[0].width);
        // Activation adds the rhythm targets and the articulated hero. Compare the scenery
        // outside those authored overlays; the hero's position/scale/camera are checked above.
        if (x >= 240 && x <= 525 && y >= 130 && y <= 465 || x >= 550 && x <= 730 && y >= 230 && y <= 455) continue;
        compared++;
        if ([0, 1, 2].some(c => Math.abs(pixels[0].data[i + c] - pixels[1].data[i + c]) > 3)) different++;
      }
      return different / compared;
    }, [arrival.toString('base64'), start.toString('base64')]);
    expect(difference, 'фон, ограда, небо, асфальт и герой не должны перескакивать при начале уклонения').toBeLessThan(.001);
    expect(errors).toEqual([]);
  });
}

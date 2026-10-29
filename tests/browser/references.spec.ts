import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('фасады без отсылки 92 и самостоятельные тени читаются в окружении', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  for (const [name, value, file] of [
    ['television', 74, 'references-v14-television'],
    ['autumn', 235, 'street-v10-autumn'], ['autumn', 325, 'street-v10-no92'],
    ['autumn', 334, 'street-v10-open-yard'], ['shadow-jump', 470, 'references-v10-shadow-jump'],
    ['shadows', 475, 'references-v10-shadow-follow'],
    ['shadows', 491, 'references-v10-shadow-fade'], ['shadows', 497, 'references-v10-shadow-gone'],
  ] as const) {
    await page.evaluate(({ name, value }) => {
      (window as any).scenePreview.show(name, value);
    }, { name, value });
    await page.waitForTimeout(80);
    await page.screenshot({ path: `docs/previews/${file}.png` });
  }
  expect(errors).toEqual([]);
});

test('телевизор за дорогой: корпус медленно уходит под неподвижную воду, без повторного всплытия', async ({ page }) => {
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  const shots: string[] = [];
  const states: any[] = [];
  for (const time of [0, 1000, 3000, 6000, 9000]) {
    await page.evaluate(time => (window as any).scenePreview.show('television', 74, time === 0, time), time);
    await page.waitForTimeout(35);
    shots.push((await page.screenshot({ clip: { x: 256, y: 348, width: 150, height: 90 } })).toString('base64'));
    states.push(await page.evaluate(() => (window as any).scenePreview.auditLayers().television));
    await page.screenshot({ path: `docs/previews/television-v14-sink-${time}.png` });
  }
  const report = await page.evaluate(async shots => {
    const pixels = await Promise.all(shots.map(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 150; canvas.height = 90;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, 150, 90).data;
    }));
    let changedAboveWater = 0, changedWater = 0, changedOutsideCase = 0;
    for (const frame of pixels.slice(1)) for (let y = 0; y < 90; y++) for (let x = 0; x < 150; x++) {
      const i = (y * 150 + x) * 4;
      const delta = Math.max(...[0, 1, 2].map(c => Math.abs(frame[i + c] - pixels[0][i + c])));
      if (delta > 2) {
        if (y >= 69) changedWater++;
        else changedAboveWater++;
        if (x < 30 || x > 120) changedOutsideCase++;
      }
    }
    return { changedAboveWater, changedWater, changedOutsideCase };
  }, shots);
  expect(report.changedAboveWater, 'корпус действительно погружается, а не остаётся статичной картинкой').toBeGreaterThan(100);
  expect(report.changedWater, 'поверхность лужи неподвижна и скрывает корпус').toBe(0);
  expect(report.changedOutsideCase, 'лужа и окружение не мигают').toBe(0);
  expect(states[0].behindGround).toBe(true);
  expect(states[0].waterBottom, 'лужа касается дорожки за бордюром').toBeGreaterThan(432);
  expect(states[0].waterBottom).toBeLessThan(435);
  expect(states[0].textures).toEqual(['television-water', 'television-crt', 'television-water']);
  expect(states[1].bodyY).toBeGreaterThan(states[0].bodyY); expect(states[1].bodyY).toBeLessThan(states[2].bodyY);
  expect(states[2].cropHeight).toBeLessThan(states[0].cropHeight); expect(states[2].bodyVisible).toBe(true);
  expect(states[3].bodyVisible).toBe(false); expect(states[4].bodyY).toBe(states[3].bodyY);
  await page.evaluate(() => (window as any).scenePreview.show('television', 75, false, 9000));
  const moved = await page.evaluate(() => (window as any).scenePreview.auditLayers().television);
  expect(moved.x - states[4].x, 'телевизор не скользит относительно двора')
    .toBeCloseTo(-(moved.courtyardTravel - states[4].courtyardTravel));
  for (const [mode, distance] of [['television', 190], ['crossing-dev', 19.9]] as const) {
    await page.evaluate(({ mode, distance }) => (window as any).scenePreview.show(mode, distance), { mode, distance });
    expect((await page.evaluate(() => (window as any).scenePreview.auditLayers().television)).visible).toBe(false);
  }
});

test('погружение телевизора в настоящей игре: пауза останавливает его, новый забег возвращает начало', async ({ page }) => {
  await page.clock.install(); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts'; const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).televisionScene = (this as any).scene; return render.apply(this, args as any);
    };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('checkbox', { name: 'Для разработчика' }).check({ force: true });
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true }); await page.clock.runFor(40);
  await page.evaluate(() => {
    const s = (window as any).televisionScene;
    s.session.runner.travel = 6 * 60; s.session.runner.step = () => {};
    s.runnerView.television.reset();
  });
  await page.clock.runFor(40);
  const state = () => page.evaluate(() => {
    const v = (window as any).televisionScene.runnerView.television;
    return { x: v.container.x, y: v.container.y, bodyY: v.body.y, visible: v.body.visible, crop: v.body._crop.height };
  });
  const initial = await state(); await page.clock.runFor(2000);
  const middle = await state(); expect(middle.bodyY).toBeGreaterThan(initial.bodyY + 15);
  expect(middle.x).toBe(initial.x); expect(middle.y).toBe(initial.y);
  await page.screenshot({ path: 'docs/previews/television-v14-live.png' });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const paused = await state(); await page.clock.runFor(4000); expect(await state()).toEqual(paused);
  await page.getByRole('button', { name: /^Продолжить/ }).click(); await page.clock.runFor(4500);
  expect((await state()).visible).toBe(false);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'В меню', exact: true }).click();
  await page.getByRole('button', { name: 'Начать путь' }).click(); await page.clock.runFor(40);
  expect((await state()).bodyY).toBeLessThan(middle.bodyY);
  expect((await state()).visible).toBe(true);
});

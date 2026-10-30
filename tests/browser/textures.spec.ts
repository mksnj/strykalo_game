import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ASSETS } from '../../apps/web/src/game/assets/manifest';

test('все текстуры: точные файлы, размеры, кадры и отсутствие подмены после создания сцен', async ({ page }) => {
  const errors: string[] = [], requests = new Map<string, string>(), pending: Promise<void>[] = [];
  const keys = new Set(ASSETS.map(asset => asset.key)), urls = new Set(ASSETS.map(asset => asset.url));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && /texture|frame|failed/i.test(message.text())) errors.push(message.text()); });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (!path.startsWith('/assets/')) return;
    if (!urls.has(path)) errors.push(`Неожиданный или устаревший ресурс ${path}`);
    pending.push(response.body().then(bytes => { requests.set(path, createHash('sha256').update(bytes).digest('hex')); }));
  });
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  await Promise.all(pending);
  const report = await page.evaluate(() => (window as any).scenePreview.auditTextures());
  const sourceFiles = await Promise.all(ASSETS.map(async asset => ({ key: asset.key,
    data: (await readFile(resolve('apps/web/public' + asset.url))).toString('base64') })));
  const pixelHashes = await page.evaluate(async files => {
    return Object.fromEntries(await Promise.all(files.map(async file => {
      const image = new Image(); image.src = 'data:image/webp;base64,' + file.data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const digest = await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, image.width, image.height).data);
      return [file.key, Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')];
    })));
  }, sourceFiles);
  expect(new Set(ASSETS.map(asset => asset.key)).size).toBe(ASSETS.length);
  expect(requests.size).toBe(ASSETS.length);
  // Road puddle hazards are removed; the television's decorative water stays active.
  expect(ASSETS.some(asset => asset.key === 'night-puddle')).toBe(false);
  expect(ASSETS.find(asset => asset.key === 'television-water')?.url).toBe('/assets/references-v13/puddle.webp');
  for (const key of ['pipe-sunset', 'waiting-room']) {
    expect(report.objects.filter((object: any) => object.key === key), 'панорама должна быть единственной, без зеркальных копий').toHaveLength(1);
  }
  for (const asset of ASSETS) {
    const bytes = await readFile(resolve('apps/web/public' + asset.url));
    expect(requests.get(asset.url), `HTTP должен вернуть актуальный файл ${asset.key}`).toBe(createHash('sha256').update(bytes).digest('hex'));
    const actual = report.textures.find((entry: any) => entry.key === asset.key);
    expect(actual, `нет текстуры ${asset.key}`).toBeTruthy();
    expect(actual.pixelSha256, `под ключом ${asset.key} должны быть пиксели именно ${asset.url}`).toBe(pixelHashes[asset.key]);
    expect([actual.width, actual.height], asset.key).toEqual([asset.width, asset.height]);
    if (asset.type === 'image') {
      expect(actual.firstFrame, asset.key).toBe('__BASE');
      expect(actual.defaultFrame).toEqual({ name: '__BASE', width: asset.width, height: asset.height });
      expect(actual.frames).toEqual((asset.frames ?? []).map(({ name, x, y, width, height }) => ({ name, x, y, width, height })));
      for (const frame of asset.frames ?? []) {
        expect(frame.x + frame.width).toBeLessThanOrEqual(asset.width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(asset.height);
      }
    } else {
      expect(actual.defaultFrame).toEqual({ name: '0', width: asset.frameWidth, height: asset.frameHeight });
      const frameCount = asset.width / asset.frameWidth * (asset.height / asset.frameHeight);
      expect(actual.frames.map((frame: any) => frame.name)).toEqual(Array.from({ length: frameCount }, (_, i) => String(i)));
    }
  }
  for (const object of report.objects) {
    if (object.key === 'room-painted-graffiti') {
      expect(object.type).toBe('Image'); expect(object.frame).toBe('__BASE'); continue;
    }
    if (object.key === 'night-far-repeat' || object.key === 'night-far-court-sky') {
      expect(object.type).toBe('TileSprite');
      continue; // Cached repeat join; original night-far is still audited above.
    }
    expect(keys.has(object.key), `объект ${object.type} использует неизвестную текстуру ${object.key}`).toBe(true);
    const asset = ASSETS.find(asset => asset.key === object.key)!;
    const names = asset.type === 'sheet' ? Array.from({ length: asset.width / asset.frameWidth * (asset.height / asset.frameHeight) }, (_, i) => String(i)) :
      ['__BASE', ...(asset.frames ?? []).map(frame => frame.name)];
    expect(names, object.key).toContain(object.frame);
  }
  expect(report.runtimeTextures).toEqual([{ key: 'room-painted-graffiti', width: 480, height: 160 }]);
  await writeFile('docs/previews/textures-loaded-audit.json', JSON.stringify({ ...report, sha256: Object.fromEntries(requests) }, null, 2) + '\n');
  expect(errors).toEqual([]);
});

test('дворы выбирают правильную текстуру и не пересоздают её на каждом кадре', async ({ page }) => {
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  const switches = await page.evaluate(() => (window as any).scenePreview.auditTextureSwitches());
  expect(switches).toEqual(['court-original', 'night-front', 'night-far-court-sky', 'journey-shadows', 'court-original']);
});

test('стык повторения дальнего города не образует вертикальный обрез неба', async ({ page }) => {
  await page.goto('/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  const join = await page.evaluate(() => (window as any).scenePreview.auditFarJoin());
  // A painted sky has native pixel variation. The repeat boundary must match
  // adjacent authored columns, rather than an arbitrary flat-colour tolerance.
  expect(join.after).toBeCloseTo(join.reference, 5);
  expect(join.after).toBeLessThan(join.before);
  expect(join.changedInterior).toBe(0);
});

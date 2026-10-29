// Pack the six supplied images. Color grading of pipe-muted.png is preserved as authored.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = new URL('../assets/source/provided-v4/', import.meta.url);
const output = new URL('../apps/web/public/assets/provided-v4/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage(), report = [], manifest = {};
  for (const [name, filename, cropAlpha, width] of [
    ['pipe', 'pipe-muted.png', false, 1920], ['room', 'room-interactive.png', false, 1920],
    ['barrier', 'barrier.png', true, 264], ['broken-block', 'broken-block.png', true, 264],
    ['debris', 'debris.png', true, 224], ['rubble', 'rubble.png', true, 224],
  ]) {
    const bytes = await readFile(new URL(filename, source));
    const packed = await page.evaluate(async ({ base64, cropAlpha, width }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      let crop = [0, 0, image.width, image.height];
      if (cropAlpha) {
        const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        if (pixels[3] !== 0) throw new Error('Препятствие должно иметь прозрачный фон');
        let left = image.width, top = image.height, right = 0, bottom = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          if (pixels[(y * image.width + x) * 4 + 3] > 48) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
          }
        }
        if (left >= right || top >= bottom) throw new Error('Пустое изображение');
        crop = [left, top, right - left, bottom - top];
      }
      const height = Math.round(width * crop[3] / crop[2]);
      canvas.width = width; canvas.height = height;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, ...crop, 0, 0, width, height);
      return { width, height, crop, originalWidth: image.width, originalHeight: image.height,
        data: canvas.toDataURL('image/webp', .9).split(',')[1] };
    }, { base64: bytes.toString('base64'), cropAlpha, width });
    const { data, ...dimensions } = packed;
    const encoded = Buffer.from(data, 'base64');
    await writeFile(new URL(name + '.webp', output), encoded);
    manifest[name] = { url: `/assets/provided-v4/${name}.webp`, width: packed.width, height: packed.height };
    report.push({ name, source: `assets/source/provided-v4/${filename}`, ...dimensions,
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      sha256: createHash('sha256').update(encoded).digest('hex'), bytes: encoded.length });
  }
  await writeFile(new URL('../apps/web/src/game/assets/providedAssets.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(new URL('../docs/previews/provided-v4-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(report.map(({ name, width, height, bytes }) => `${name}: ${width}×${height}, ${bytes} байт`).join('\n'));
} finally { await browser.close(); }

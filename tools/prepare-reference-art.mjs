// Package the painted route marker, keeping alpha and a uniform scale.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = new URL('../assets/source/references-v8/route92.png', import.meta.url);
// Retired episode: archival rebuilding cannot put the marker back into runtime.
const output = new URL('../assets/source/references-v8/repacked/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const data = (await readFile(source)).toString('base64');
  const packed = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
    const read = scan.getContext('2d', { willReadFrequently: true }); read.drawImage(image, 0, 0);
    const pixels = read.getImageData(0, 0, image.width, image.height).data;
    let l = image.width, t = image.height, r = 0, b = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      if (pixels[(y * image.width + x) * 4 + 3] > 32) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x + 1); b = Math.max(b, y + 1); }
    }
    if (r <= l || b <= t) throw new Error('Empty route marker');
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 320;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const scale = Math.min(96 / (r - l), 320 / (b - t));
    ctx.drawImage(image, l, t, r - l, b - t, (96 - (r - l) * scale) / 2, 320 - (b - t) * scale, (r - l) * scale, (b - t) * scale);
    return canvas.toDataURL('image/webp', .9).split(',')[1];
  }, data);
  const bytes = Buffer.from(packed, 'base64'); await writeFile(new URL('route92.webp', output), bytes);
  console.log('route92.webp: ' + bytes.length + ' bytes');
} finally { await browser.close(); }

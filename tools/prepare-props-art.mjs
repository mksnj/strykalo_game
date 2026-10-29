// Pack transparent painted props, retaining generated alpha and original PNG sources.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const revision = process.argv[2] ?? 'props-v5';
if (!['props-v5', 'repairs-v6'].includes(revision)) throw new Error('Unknown prop revision');
const source = new URL(`../assets/source/${revision}/`, import.meta.url);
const output = new URL(`../apps/web/public/assets/${revision}/`, import.meta.url);
const props = revision === 'repairs-v6' ? [['stool', 192, 192], ['bench', 480, 192]] :
  [['clock', 192, 192], ['sign', 480, 160]];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, width, height] of props) {
    const data = (await readFile(new URL(name + '.png', source))).toString('base64');
    const packed = await page.evaluate(async ({ data, width, height }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
      const read = scan.getContext('2d', { willReadFrequently: true }); read.drawImage(image, 0, 0);
      const pixels = read.getImageData(0, 0, image.width, image.height).data;
      let left = image.width, top = image.height, right = 0, bottom = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] > 12) {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
      }
      if (right <= left || bottom <= top) throw new Error('Empty prop');
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, left, top, right - left, bottom - top, 0, 0, width, height);
      return canvas.toDataURL('image/webp', .9).split(',')[1];
    }, { data, width, height });
    const bytes = Buffer.from(packed, 'base64'); await writeFile(new URL(name + '.webp', output), bytes);
    console.log(name + '.webp: ' + bytes.length + ' bytes');
  }
} finally { await browser.close(); }

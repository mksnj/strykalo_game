// Pack the revised urban-pipe sources; originals are retained for review.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = new URL('../assets/source/pipe-v2/', import.meta.url);
const output = new URL('../apps/web/public/assets/pipe-v2/', import.meta.url);
const selected = process.argv.slice(2);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, width, height] of [['sky-clouds', 1536, 512], ['side', 640, 140]]) {
    if (selected.length && !selected.includes(name)) continue;
    const data = (await readFile(new URL(`${name}.png`, source))).toString('base64');
    const packed = await page.evaluate(async ({ name, width, height, data }) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      if (name === 'side') {
        const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
        const read = scan.getContext('2d', { willReadFrequently: true }); read.drawImage(image, 0, 0);
        const pixels = read.getImageData(0, 0, image.width, image.height).data;
        let left = image.width, top = image.height, right = 0, bottom = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          if (pixels[(y * image.width + x) * 4 + 3] > 40) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
          }
        }
        const scale = Math.min(width / (right - left), height / (bottom - top));
        ctx.drawImage(image, left, top, right - left, bottom - top,
          (width - (right - left) * scale) / 2, height - (bottom - top) * scale, (right - left) * scale, (bottom - top) * scale);
      } else ctx.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL('image/webp', .9).split(',')[1];
    }, { name, width, height, data });
    const buffer = Buffer.from(packed, 'base64');
    await writeFile(new URL(`${name}.webp`, output), buffer);
    console.log(`${name}.webp: ${buffer.length} bytes`);
  }
} finally { await browser.close(); }

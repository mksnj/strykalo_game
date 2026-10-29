// Pack the independently generated CRT and water layers, preserving aspect and alpha.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const output = new URL('../apps/web/public/assets/references-v13/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, width, height] of [['television', 384, 288], ['puddle', 768, 192]]) {
    const source = new URL(`../assets/source/references-v13/${name}.png`, import.meta.url);
    const result = await page.evaluate(async ({ data, width, height }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
      const read = scan.getContext('2d'); read.drawImage(image, 0, 0);
      const pixels = read.getImageData(0, 0, image.width, image.height).data;
      let left = image.width, top = image.height, right = 0, bottom = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] > 32) {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
      }
      if (right <= left || bottom <= top) throw new Error('Empty source sprite');
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      const scale = Math.min((width - 8) / (right - left), (height - 8) / (bottom - top));
      ctx.drawImage(image, left, top, right - left, bottom - top,
        (width - (right - left) * scale) / 2, (height - (bottom - top) * scale) / 2,
        (right - left) * scale, (bottom - top) * scale);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, opaque = 0;
      for (let i = 3; i < rgba.length; i += 4) { if (rgba[i] === 0) transparent++; if (rgba[i] > 240) opaque++; }
      if (transparent < canvas.width * canvas.height * .15 || opaque < 1000) throw new Error('Missing sprite alpha or empty sprite');
      return { data: canvas.toDataURL('image/webp', .92).split(',')[1], transparent, opaque,
        crop: { left, top, right, bottom } };
    }, { data: (await readFile(source)).toString('base64'), width, height });
    const bytes = Buffer.from(result.data, 'base64');
    await writeFile(new URL(`${name}.webp`, output), bytes);
    console.log(`${name}.webp: ${width}x${height}, ${bytes.length} bytes; transparent=${result.transparent}, crop=${JSON.stringify(result.crop)}`);
  }
} finally { await browser.close(); }

// Pack the isolated hoop without altering its proportions or adding terrain.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const data = (await readFile('assets/source/court-v4/hoop.png')).toString('base64');
  const packed = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
    const ctx = source.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
    let left = source.width, top = source.height, right = 0, bottom = 0;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (pixels[(y * source.width + x) * 4 + 3] > 16) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
    }
    const target = document.createElement('canvas'); target.width = 384; target.height = 640;
    const out = target.getContext('2d'); out.imageSmoothingQuality = 'high';
    const scale = Math.min(380 / (right - left), 636 / (bottom - top));
    const width = (right - left) * scale, height = (bottom - top) * scale;
    out.drawImage(image, left, top, right - left, bottom - top, (384 - width) / 2, 640 - height, width, height);
    return target.toDataURL('image/webp', .95).split(',')[1];
  }, data);
  await writeFile('apps/web/public/assets/court-v4/hoop.webp', Buffer.from(packed, 'base64'));
  const ground = (await readFile('assets/source/runner-v1/ground.png')).toString('base64');
  const asphalt = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 3072; canvas.height = 420;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    // UV projection of material only, excluding the authored curb. Reflected repeats
    // share exactly the same edge texels, without alpha or material crossfades.
    ctx.drawImage(image, 0, 130, image.width, image.height - 130, 0, 0, 1536, 420);
    ctx.translate(3072, 0); ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 130, image.width, image.height - 130, 0, 0, 1536, 420);
    return canvas.toDataURL('image/webp', .96).split(',')[1];
  }, ground);
  await writeFile('apps/web/public/assets/court-v4/asphalt.webp', Buffer.from(asphalt, 'base64'));
} finally { await browser.close(); }

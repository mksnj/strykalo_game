// Pack the residential entrance; preserve the original apartment facade source separately.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const output = new URL('../apps/web/public/assets/entrance-v1/', import.meta.url);
await mkdir(output, { recursive: true });
const data = (await readFile(new URL('../assets/source/entrance-v1/entrance.png', import.meta.url))).toString('base64');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const packed = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, 960, 540);
    return canvas.toDataURL('image/webp', .92).split(',')[1];
  }, data);
  const bytes = Buffer.from(packed, 'base64');
  await writeFile(new URL('entrance.webp', output), bytes);
  console.log('entrance.webp: ' + bytes.length + ' bytes');
} finally { await browser.close(); }

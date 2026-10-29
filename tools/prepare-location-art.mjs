// Package the earth cut and delegate court objects/material to their own packer.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const requested = process.argv.slice(2);
if (!requested.length || requested.includes('court')) await import('./prepare-court-art.mjs');
if (!requested.length || requested.includes('excavation')) {
  const output = new URL('../apps/web/public/assets/location-v7/', import.meta.url);
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const data = (await readFile(new URL('../assets/source/location-v10/excavation.png', import.meta.url))).toString('base64');
    const packed = await page.evaluate(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1120; canvas.height = 204;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 160, 2170, 390, 0, 0, 1120, 204);
      return canvas.toDataURL('image/webp', .9).split(',')[1];
    }, data);
    await writeFile(new URL('excavation.webp', output), Buffer.from(packed, 'base64'));
  } finally { await browser.close(); }
}

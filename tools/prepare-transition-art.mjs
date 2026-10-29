import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = new URL('../assets/source/transitions-v4/', import.meta.url);
const output = new URL('../apps/web/public/assets/transitions-v4/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const selected = process.argv.slice(2).length ? process.argv.slice(2) : ['facade', 'arch', 'seated'];
  if (selected.some(name => !['facade', 'arch', 'seated'].includes(name))) throw new Error('Unknown transition asset');
  for (const name of selected) {
    if (name === 'arch') { await import('./prepare-ending-art.mjs'); continue; }
    const data = (await readFile(new URL(name + '.png', source))).toString('base64');
    const packed = await page.evaluate(async ({ data, name }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = name === 'seated' ? 256 : 960;
      canvas.height = name === 'seated' ? 256 : 540;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', .88).split(',')[1];
    }, { data, name });
    const bytes = Buffer.from(packed, 'base64'); await writeFile(new URL(name + '.webp', output), bytes);
    console.log(name + '.webp: ' + bytes.length + ' bytes');
  }
} finally { await browser.close(); }

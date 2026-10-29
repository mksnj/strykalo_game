// Resize/crop generated illustration sources; retain original PNGs and alpha.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const source = new URL('../assets/source/journey-v1/', import.meta.url);
const output = new URL('../apps/web/public/assets/journey-v1/', import.meta.url);
const jobs = [
  ['autumn', 1536, 512], ['shadows', 1536, 512],
  ['pipe', 340, 381], ['idle', 512, 128], ['props', 0, 0],
];
const selected = process.argv.slice(2);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, width, height] of jobs) {
    if (selected.length && !selected.includes(name)) continue;
    if (name === 'autumn') continue; // Repaired source is packed below; never restore the retired number plaque.
    const data = (await readFile(new URL(`${name}.png`, source))).toString('base64');
    const packed = await page.evaluate(async ({ name, width, height, data }) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
      const ctx = source.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      const bounds = (x, y, w, h) => {
        let left = x + w, top = y + h, right = x, bottom = y;
        for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
          if (pixels[(py * image.width + px) * 4 + 3] > 40) {
            left = Math.min(left, px); top = Math.min(top, py);
            right = Math.max(right, px + 1); bottom = Math.max(bottom, py + 1);
          }
        }
        return [left, top, right - left, bottom - top];
      };
      const encode = (w, h, draw) => {
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; draw(context);
        return canvas.toDataURL('image/webp', .88).split(',')[1];
      };
      const cw = image.width / 2, ch = image.height / 2;
      if (name === 'props') return Object.fromEntries([
        ['door', 96, 258, 0],
      ].map(([key, w, h, i]) => [key, encode(w, h, context => {
        const box = bounds(i % 2 * cw, Math.floor(i / 2) * ch, cw, ch);
        context.drawImage(image, ...box, 0, 0, w, h);
      })]));
      if (name === 'idle') return { idle: encode(width, height, context => {
        // The generated top row reaches 53% of the canvas; split in the empty gap.
        const split = Math.floor(image.height * .55);
        const boxes = Array.from({ length: 4 }, (_, i) => bounds(i % 2 * cw, i < 2 ? 0 : split,
          cw, i < 2 ? split : image.height - split));
        const scale = 112 / Math.max(boxes[0][3], boxes[1][3]);
        boxes.forEach((box, i) => context.drawImage(image, ...box,
          i * 128 + (128 - box[2] * scale) / 2, 128 - box[3] * scale, box[2] * scale, box[3] * scale));
      }) };
      const box = name === 'pipe' ? bounds(0, 0, image.width, image.height) : [0, 0, image.width, image.height];
      return { [name]: encode(width, height, context => context.drawImage(image, ...box, 0, 0, width, height)) };
    }, { name, width, height, data });
    for (const [key, base64] of Object.entries(packed)) {
      const buffer = Buffer.from(base64, 'base64');
      await writeFile(new URL(`${key}.webp`, output), buffer);
      console.log(`${key}.webp: ${buffer.length} bytes`);
    }
  }
} finally { await browser.close(); }
if (!selected.length || selected.includes('autumn')) await import('./prepare-street-v10.mjs');

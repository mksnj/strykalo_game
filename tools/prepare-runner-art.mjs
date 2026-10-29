// Pack generated artwork into small runtime textures; source PNGs remain untouched.
// Uses the project's existing browser dependency, without another image library.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../assets/source/runner-v1/', import.meta.url);
const output = new URL('../apps/web/public/assets/runner-v1/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const name of ['far', 'court', 'ground', 'front', 'hero', 'cassette']) {
    const data = (await readFile(new URL(`${name}.png`, source))).toString('base64');
    const packed = await page.evaluate(async ({ data, name }) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const bounds = (x, y, width, height) => {
        let left = x + width, top = y + height, right = x, bottom = y;
        for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
          if (pixels[(py * canvas.width + px) * 4 + 3] > 48) {
            left = Math.min(left, px); top = Math.min(top, py);
            right = Math.max(right, px + 1); bottom = Math.max(bottom, py + 1);
          }
        }
        return [left, top, right - left, bottom - top];
      };
      const encode = (width, height, draw) => {
        const target = document.createElement('canvas'); target.width = width; target.height = height;
        const ctx = target.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        draw(ctx);
        return target.toDataURL('image/webp', 0.88).split(',')[1];
      };
      if (name === 'hero') {
        const cw = image.width / 2, ch = image.height / 2;
        return { hero: encode(512, 128, ctx => {
          for (let index = 0; index < 4; index++) {
            const box = bounds(index % 2 * cw, Math.floor(index / 2) * ch, cw, ch);
            const scale = 112 / box[3];
            // Anchor the hood (rather than outstretched feet) for a stable torso.
            const head = bounds(box[0], box[1], box[2], Math.floor(box[3] * .18));
            const headX = head[0] + head[2] / 2;
            ctx.drawImage(image, ...box, index * 128 + 84 - (headX - box[0]) * scale,
              128 - box[3] * scale, box[2] * scale, box[3] * scale);
          }
        }) };
      }
      if (name === 'cassette') {
        const box = bounds(0, 0, image.width, image.height);
        return { cassette: encode(132, 84, ctx => ctx.drawImage(image, ...box, 0, 0, 132, 84)) };
      }
      const height = name === 'ground' ? 164 : 512;
      return { [name]: encode(1536, height, ctx => ctx.drawImage(image, 0, 0, 1536, height)) };
    }, { data, name });
    for (const [key, base64] of Object.entries(packed)) {
      const destination = new URL(`${key}.webp`, output);
      await writeFile(destination, Buffer.from(base64, 'base64'));
      console.log(`${fileURLToPath(destination)}: ${(await stat(destination)).size} bytes`);
    }
  }
} finally { await browser.close(); }

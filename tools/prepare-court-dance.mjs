// Deterministic packaging of the owner's PNGs. No redraw, mirroring or background replacement.
import { chromium } from '@playwright/test';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import layout from '../apps/web/src/game/assets/danceLayout.json' with { type: 'json' };
const source = 'assets/source/court-dance-v19', output = 'apps/web/public/assets/court-dance-v19';
await mkdir(source, { recursive: true }); await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = [];
for (const direction of layout.directions) {
  const path = process.argv[2] ? resolve(process.argv[2], layout.sources[direction].file) : layout.sources[direction].file;
  const bytes = await readFile(path);
  await copyFile(path, `${source}/${direction}.png`);
  inputs.push({ direction, data: bytes.toString('base64'), sha256: hash(bytes), file: `${source}/${direction}.png` });
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let page;
try {
  page = await browser.newPage();
  const packed = await page.evaluate(async ({ inputs, layout }) => {
    const images = [];
    for (const input of inputs) {
      const image = new Image(); image.src = 'data:image/png;base64,' + input.data; await image.decode();
      const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
      const ctx = scan.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
      if (rgba[3] !== 0) throw new Error(input.direction + ': expected transparent source background');
      let left = image.width, top = image.height, right = 0, bottom = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (rgba[(y * image.width + x) * 4 + 3] > 16) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
      images.push({ image, input, bounds: { left, top, right, bottom } });
    }
    const reference = images.find(item => item.input.direction === 'right').bounds;
    const scale = layout.bodyHeight / (reference.bottom - reference.top);
    const atlas = document.createElement('canvas'); atlas.width = layout.cellSize * 4; atlas.height = layout.cellSize;
    const ctx = atlas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const frames = [];
    for (const [index, item] of images.entries()) {
      const { direction } = item.input, { left, top, right, bottom } = item.bounds;
      const factor = scale * layout.sources[direction].heightScale;
      const x = layout.cellSize / 2 + (left - layout.sources[direction].anchorX) * factor;
      const y = layout.cellSize - (bottom - top) * factor;
      const width = (right - left) * factor, height = (bottom - top) * factor;
      if (x < 1 || x + width > layout.cellSize - 1 || y < 1) throw new Error(direction + ': clipped frame');
      ctx.drawImage(item.image, left, top, right - left, bottom - top,
        index * layout.cellSize + x, y, width, height);
      frames.push({ direction, index, source: item.bounds, visible: { x, y, width, height }, anchor: { x: layout.cellSize / 2, y: layout.cellSize } });
    }
    return { webp: atlas.toDataURL('image/webp', 1).split(',')[1], width: atlas.width, height: atlas.height, frames };
  }, { inputs, layout });
  const bytes = Buffer.from(packed.webp, 'base64'), path = `${output}/dance.webp`;
  await writeFile(path, bytes);
  const audit = { origin: 'Owner supplied four direction PNGs; names determine direction',
    method: 'Uniform scale, transparent trim and foot alignment on a four-cell atlas; pixels not redrawn',
    inputs: inputs.map(({ data, ...input }) => input), output: { path, sha256: hash(bytes), bytes: bytes.length,
      width: packed.width, height: packed.height }, frames: packed.frames };
  await writeFile(`${source}/audit.json`, JSON.stringify(audit, null, 2) + '\n');
  const provenancePath = 'assets/source/provenance.json', provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  provenance.generatedAssets = provenance.generatedAssets.filter(a => a.collection !== 'court-dance-v19');
  provenance.generatedAssets.push({ collection: 'court-dance-v19', createdOn: '2026-10-29',
    tool: 'Owner-provided PNGs, deterministic Canvas packaging', source, audit: `${source}/audit.json`,
    license: 'Owner-provided assets; no external material added', assets: audit });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify({ ...audit.output, frames: packed.frames }, null, 2));
} finally { await page?.close(); await browser.close(); }

// Deterministic packaging of the prepared cutouts; original owner PNGs remain preserved.
import { chromium } from '@playwright/test';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import layout from '../apps/web/src/game/assets/danceLayout.json' with { type: 'json' };
const source = `assets/source/${layout.collection}`, output = dirname(`apps/web/public${layout.url}`);
await mkdir(source, { recursive: true }); await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const toneReferencePath = `apps/web/public${layout.toneReference}`;
const toneReference = await readFile(toneReferencePath);
const inputs = [];
for (const direction of layout.directions) {
  const settings = layout.sources[direction];
  const originalPath = resolve(process.argv[2] ?? '.', settings.file);
  const original = await readFile(originalPath);
  const originalFile = `${source}/original-${direction}.png`;
  await copyFile(originalPath, originalFile);
  const path = settings.preparedFile ?? originalPath;
  const bytes = await readFile(path);
  const file = `${source}/${direction}.png`;
  if (resolve(path) !== resolve(file)) await copyFile(path, file);
  inputs.push({ direction, data: bytes.toString('base64'), sha256: hash(bytes), file,
    original: { file: originalFile, sha256: hash(original), suppliedAs: settings.file } });
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let page;
try {
  page = await browser.newPage();
  const packed = await page.evaluate(async ({ inputs, layout, toneReference }) => {
    const images = [];
    for (const input of [...inputs, { direction: 'idle-reference', data: toneReference }]) {
      const image = new Image(); image.src = 'data:image/png;base64,' + input.data; await image.decode();
      const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
      const ctx = scan.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
      if (rgba[3] !== 0) throw new Error(input.direction + ': expected transparent source background');
      let left = image.width, top = image.height, right = 0, bottom = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (rgba[(y * image.width + x) * 4 + 3] > 16) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
      // Match the central hoodie fabric, excluding the black hood, shoes and transparent edges.
      const tones = [];
      for (let y = Math.ceil(top + (bottom - top) * .32); y < top + (bottom - top) * .51; y++) {
        for (let x = Math.ceil(left + (right - left) * .35); x < left + (right - left) * .65; x++) {
          const at = (y * image.width + x) * 4;
          if (rgba[at + 3] > 230) tones.push((rgba[at] + rgba[at + 1] + rgba[at + 2]) / 3);
        }
      }
      if (!tones.length) throw new Error(input.direction + ': no opaque fabric pixels');
      tones.sort((a, b) => a - b);
      // Measure the torso silhouette, excluding hood and feet, so a step cannot enlarge the body.
      const widths = [];
      for (let y = Math.ceil(top + (bottom - top) * layout.bodySample.top); y < top + (bottom - top) * layout.bodySample.bottom; y++) {
        let rowLeft = image.width, rowRight = 0;
        for (let x = left; x < right; x++) if (rgba[(y * image.width + x) * 4 + 3] > 128) {
          rowLeft = Math.min(rowLeft, x); rowRight = Math.max(rowRight, x + 1);
        }
        if (rowRight > rowLeft) widths.push(rowRight - rowLeft);
      }
      widths.sort((a, b) => a - b);
      images.push({ image, input, bounds: { left, top, right, bottom }, fabricMedian: tones[Math.floor(tones.length / 2)],
        bodyWidth: widths[Math.floor(widths.length / 2)] });
    }
    const standard = images.pop();
    const referenceBodyWidth = standard.bodyWidth * layout.bodyHeight / (standard.bounds.bottom - standard.bounds.top);
    const atlas = document.createElement('canvas'); atlas.width = layout.cellSize * layout.directions.length; atlas.height = layout.cellSize;
    const ctx = atlas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const frames = [];
    for (const [index, item] of images.entries()) {
      const { direction } = item.input, { left, top, right, bottom } = item.bounds;
      const factor = referenceBodyWidth / item.bodyWidth * layout.sources[direction].heightScale;
      const x = layout.cellSize / 2 + (left - layout.sources[direction].anchorX) * factor;
      const y = layout.cellSize - (bottom - top) * factor;
      const width = (right - left) * factor, height = (bottom - top) * factor;
      if (x < 1 || x + width > layout.cellSize - 1 || y < 1) throw new Error(direction + ': clipped frame');
      const toneGain = standard.fabricMedian / Math.max(1, item.fabricMedian);
      ctx.filter = `brightness(${toneGain})`;
      ctx.drawImage(item.image, left, top, right - left, bottom - top,
        index * layout.cellSize + x, y, width, height);
      ctx.filter = 'none';
      frames.push({ direction, index, source: item.bounds, visible: { x, y, width, height }, anchor: { x: layout.cellSize / 2, y: layout.cellSize },
        tone: { referenceMedian: standard.fabricMedian, sourceMedian: item.fabricMedian, gain: toneGain },
        body: { referenceWidth: referenceBodyWidth, sourceWidth: item.bodyWidth, packedWidth: item.bodyWidth * factor } });
    }
    const preview = document.createElement('canvas'); preview.width = 256 * (images.length + 1); preview.height = 560;
    const g = preview.getContext('2d');
    g.fillStyle = '#25303c'; g.fillRect(0, 0, preview.width, preview.height);
    g.font = '18px Arial'; g.textAlign = 'center';
    for (const [i, name] of ['idle', ...layout.directions].entries()) {
      g.strokeStyle = '#728494'; g.beginPath(); g.moveTo(i * 256 + 10, 520); g.lineTo(i * 256 + 246, 520); g.stroke();
      g.fillStyle = '#c1cbd5'; g.fillText(name, i * 256 + 128, 24);
    }
    const { left, top, right, bottom } = standard.bounds, idleScale = layout.bodyHeight / (bottom - top);
    g.drawImage(standard.image, left, top, right - left, bottom - top,
      128 + (left - standard.image.width / 2) * idleScale, 520 - layout.bodyHeight, (right - left) * idleScale, layout.bodyHeight);
    for (let i = 0; i < images.length; i++) g.drawImage(atlas, i * layout.cellSize, 0, layout.cellSize, layout.cellSize,
      (i + 1) * 256 - layout.cellSize / 2 + 128, 520 - layout.cellSize, layout.cellSize, layout.cellSize);
    return { webp: atlas.toDataURL('image/webp', 1).split(',')[1], width: atlas.width, height: atlas.height, frames,
      preview: preview.toDataURL('image/png').split(',')[1] };
  }, { inputs, layout, toneReference: toneReference.toString('base64') });
  const bytes = Buffer.from(packed.webp, 'base64'), path = `${output}/dance.webp`;
  await writeFile(path, bytes);
  const previews = `docs/previews/${layout.collection}`;
  await mkdir(previews, { recursive: true });
  await writeFile(`${previews}/comparison.png`, Buffer.from(packed.preview, 'base64'));
  const audit = { origin: 'Side poses preserved from v23; down follows the new owner reference in the standard character style; no up pose',
    method: 'Complete image_gen poses; uniform scale calibrated to the standard torso width, hoodie brightness matching, transparent trim and shared foot alignment',
    toneReference: { path: toneReferencePath, sha256: hash(toneReference) },
    inputs: inputs.map(({ data, ...input }) => input), output: { path, sha256: hash(bytes), bytes: bytes.length,
      width: packed.width, height: packed.height }, frames: packed.frames };
  await writeFile(`${source}/audit.json`, JSON.stringify(audit, null, 2) + '\n');
  const provenancePath = 'assets/source/provenance.json', provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  provenance.generatedAssets = provenance.generatedAssets.filter(a => a.collection !== layout.collection);
  provenance.generatedAssets.push({ collection: layout.collection, createdOn: '2026-10-30',
    tool: audit.method, source, audit: `${source}/audit.json`, generation: `${source}/generation.json`,
    license: 'Owner-provided assets; no external material added', assets: audit });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify({ ...audit.output, frames: packed.frames }, null, 2));
} finally { await page?.close(); await browser.close(); }

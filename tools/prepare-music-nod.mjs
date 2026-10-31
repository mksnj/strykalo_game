// Audit and copy the supplied PNG without editing pixels or trimming any cells.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import layout from '../apps/web/src/game/assets/musicNodLayout.json' with { type: 'json' };

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function scan(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await scan(path));
    else { const data = await readFile(path); result.push({ path, bytes: data.length, sha256: sha(data) }); }
  }
  return result;
}
const bytes = await readFile(`${layout.source}/sprite_sheet_4x2.png`);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let frames;
try {
  const page = await browser.newPage();
  frames = await page.evaluate(async ({ base64, layout }) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    if (image.width !== layout.width || image.height !== layout.height) throw new Error('Unexpected sheet dimensions');
    const canvas = document.createElement('canvas'); canvas.width = layout.cellWidth; canvas.height = layout.cellHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const result = [];
    for (let i = 0; i < layout.frameCount; i++) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, i % 4 * layout.cellWidth, Math.floor(i / 4) * layout.cellHeight,
        layout.cellWidth, layout.cellHeight, 0, 0, layout.cellWidth, layout.cellHeight);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let top = canvas.height, bottom = 0, lowerTop = canvas.height, left = canvas.width, right = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if ((x === 0 || x === canvas.width - 1 || y === 0 || y === canvas.height - 1) && alpha !== 0) throw new Error('Nontransparent/clipped cell edge');
        if (alpha > 128) {
          top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
          if (y >= 400) { lowerTop = Math.min(lowerTop, y); left = Math.min(left, x); right = Math.max(right, x + 1); }
        }
      }
      result.push({ index: i, top, bottom, feet: { top: lowerTop, left, right, bottom } });
    }
    return result;
  }, { base64: bytes.toString('base64'), layout });
} finally { await browser.close(); }
if (frames.some(frame => frame.bottom !== layout.footContactY)) throw new Error('Uneven foot contact across nod frames');
const path = `apps/web/public${layout.url}`, source = `assets/source/${layout.collection}`;
await mkdir(dirname(path), { recursive: true }); await mkdir(source, { recursive: true });
await writeFile(path, bytes);
const audit = { method: 'Byte-for-byte copy; no generation, cropping, scaling, background or facial edits',
  inputs: await scan(layout.source), frames, output: { path, width: layout.width, height: layout.height, bytes: bytes.length, sha256: sha(bytes) },
  runtime: { layout: 'apps/web/src/game/assets/musicNodLayout.json', clock: 'One down-arrow hit uses frames 0..3 only: one nod in 0.5s at 120 BPM; the source frames 4..7 contain a second nod and are excluded',
    sizing: 'apps/web/src/game/assets/courtHeroLayout.json: fixed width and height calibration per source; no per-frame zoom',
    anchor: 'Shared world foot plane: idle alpha edge 255, step alpha edge 589, nod alpha edge 585',
    priority: 'Down hit only; left/right hits select restored side-step clips; all other time uses hero-front; failure cancels the clip' } };
await writeFile(`${source}/audit.json`, JSON.stringify(audit, null, 2) + '\n');
const provenancePath = 'assets/source/provenance.json';
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
provenance.generatedAssets = provenance.generatedAssets.filter(entry => entry.collection !== layout.collection);
provenance.generatedAssets.push({ collection: layout.collection, createdOn: '2026-10-31', tool: audit.method,
  source: layout.source, audit: `${source}/audit.json`, license: 'Owner-provided assets; original files and metadata preserved; no new license assigned', assets: audit });
await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ output: audit.output, frames }));

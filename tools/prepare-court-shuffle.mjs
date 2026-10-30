// Bake code-native layered motion once. The game only selects frames; no per-frame canvas uploads.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFile, writeFile, mkdir, copyFile, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import layout from '../apps/web/src/game/assets/shuffleLayout.json' with { type: 'json' };

const directory = 'assets/source/court-groove-v21', output = 'apps/web/public/assets/court-groove-v21';
const sourcePath = 'apps/web/public/assets/visual-v12/front.webp';
const referencePath = 'docs/front.png';
const sha = data => createHash('sha256').update(data).digest('hex');
await mkdir(directory, { recursive: true }); await mkdir(output, { recursive: true });
const source = await readFile(sourcePath), reference = await readFile(referencePath);
await copyFile(sourcePath, `${directory}/front.webp`);
const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: 5176, strictPort: true } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage(); await page.goto('http://127.0.0.1:5176/');
  const result = await page.evaluate(async ({ data, reference, layout }) => {
    const { drawShuffleFrame, shufflePose } = await import('/src/game/views/courtShuffleDrawing.ts');
    const decode = async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image; };
    const image = await decode(data), ref = await decode(reference);
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const source = ctx.getImageData(0, 0, image.width, image.height);
    const headCenter = (bytes, width, left, top) => {
      let mass = 0, xSum = 0, ySum = 0;
      for (let y = top; y < top + 58; y++) for (let x = 0; x < width; x++) {
        const alpha = bytes[(y * width + x) * 4 + 3];
        mass += alpha; xSum += (x - left) * alpha; ySum += (y - top) * alpha;
      }
      return { x: xSum / mass, y: ySum / mass };
    };
    const originalHead = headCenter(source.data, image.width, 0, 0);
    const pixelStats = (image) => {
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
      const g = c.getContext('2d'); g.drawImage(image, 0, 0); const bytes = g.getImageData(0, 0, c.width, c.height).data;
      let transparent = 0; for (let i = 3; i < bytes.length; i += 4) if (bytes[i] === 0) transparent++;
      return { width: image.width, height: image.height, transparentPixels: transparent, pixels: bytes.length / 4, corner: Array.from(bytes.slice(0, 4)) };
    };
    if (image.width !== 128 || image.height !== 256 || !pixelStats(image).transparentPixels) throw new Error('Unexpected original sprite');
    canvas.width = layout.cellWidth; canvas.height = layout.cellHeight;
    const atlas = document.createElement('canvas'); atlas.width = layout.columns * layout.cellWidth; atlas.height = layout.rows * layout.cellHeight;
    const g = atlas.getContext('2d'), frames = [];
    for (let frame = 0; frame < layout.frameCount; frame++) {
      const direction = Object.entries(layout.frames).filter(([key, at]) => key !== 'idle' && at <= frame).at(-1)?.[0] ?? 'groove';
      const progress = frame === 0 ? 0 : (frame - layout.frames[direction]) / (layout.samples - 1);
      drawShuffleFrame(ctx, source, direction, progress);
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (bytes[(y * canvas.width + x) * 4 + 3] > 16) {
          left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        }
      }
      const pose = shufflePose(progress, direction), bodyX = layout.profiles[direction].sign * pose.weight;
      if (left <= 0 || top <= 0 || right >= canvas.width || bottom >= canvas.height)
        throw new Error('Clipping at ' + frame);
      g.drawImage(canvas, frame % layout.columns * canvas.width, Math.floor(frame / layout.columns) * canvas.height);
      frames.push({ frame, direction, progress, bounds: { left, top, right, bottom }, bodyX, bodyY: pose.dip, pose });
    }
    return { png: atlas.toDataURL('image/png').split(',')[1], source: pixelStats(image), reference: pixelStats(ref), frames };
  }, { data: source.toString('base64'), reference: reference.toString('base64'), layout });
  const bytes = Buffer.from(result.png, 'base64'); delete result.png;
  const path = output + '/groove.png'; await writeFile(path, bytes);
  const audit = { createdOn: '2026-10-30', method: 'In-place dance: layered inverse mapping, alternating weight, knee bends, shoulder sway and planted foot support. Original head and hands in pockets preserved. No colour removal or image generation.',
    source: { path: sourcePath, preserved: `${directory}/front.webp`, sha256: sha(source), ...result.source },
    reference: { path: referencePath, sha256: sha(reference), ...result.reference, usage: 'Visual reference only; opaque black background and inconsistent poses are not sliced or colour-keyed.' },
    output: { path, sha256: sha(bytes), bytes: bytes.length, width: layout.columns * layout.cellWidth, height: layout.rows * layout.cellHeight },
    anchor: layout.anchor, frames: result.frames };
  await writeFile(directory + '/audit.json', JSON.stringify(audit, null, 2) + '\n');
  const provenancePath = 'assets/source/provenance.json', provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  provenance.generatedAssets = provenance.generatedAssets.filter(a => a.collection !== 'court-groove-v21');
  const legacyEntry = provenance.generatedAssets.find(a => a.collection === 'court-dance-v19');
  if (legacyEntry?.assets?.output) legacyEntry.assets.output.path = 'assets/source/court-dance-v19/dance.webp';
  provenance.generatedAssets.push({ collection: 'court-groove-v21', createdOn: '2026-10-30', tool: audit.method,
    source: sourcePath, reference: referencePath, audit: directory + '/audit.json', license: 'Existing project artwork and owner-provided reference; no external material added' });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  const previous = 'apps/web/public/assets/court-shuffle-v20/shuffle.png';
  if (await access(previous).then(() => true, () => false)) {
    const archive = 'assets/source/court-shuffle-v20/shuffle.png';
    await rename(previous, archive);
    const path = 'assets/source/court-shuffle-v20/audit.json', old = JSON.parse(await readFile(path, 'utf8'));
    old.output.path = archive; await writeFile(path, JSON.stringify(old, null, 2) + '\n');
  }
  // Preserve the previous complete atlas alongside its original PNGs and update its historical location.
  const legacy = 'apps/web/public/assets/court-dance-v19/dance.webp', archive = 'assets/source/court-dance-v19/dance.webp';
  if (await access(legacy).then(() => true, () => false)) {
    await rename(legacy, archive);
    const path = 'assets/source/court-dance-v19/audit.json', old = JSON.parse(await readFile(path, 'utf8'));
    old.output.path = archive; await writeFile(path, JSON.stringify(old, null, 2) + '\n');
  }
  console.log(JSON.stringify({ ...audit.output, source: audit.source, reference: audit.reference, frames: audit.frames.length }, null, 2));
} finally { await browser?.close(); await server.close(); }

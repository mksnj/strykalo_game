import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import nod from '../apps/web/src/game/assets/musicNodLayout.json' with { type: 'json' };
const sources = [
  { name: 'idle', path: 'apps/web/public/assets/visual-v12/front.webp', width: 128, height: 256, count: 1, columns: 1 },
  { name: 'step', path: 'apps/web/public/assets/court-side-step-v26/sprite_sheet.png', width: 320, height: 608, count: 13, columns: 4 },
  { name: 'nod', path: 'apps/web/public/assets/music-nod-v1/sprite_sheet_4x2.png', width: 320, height: 608, count: 8, columns: 4 }
];
const inputs = await Promise.all(sources.map(async source => ({ ...source, data: (await readFile(source.path)).toString('base64') })));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const measurements = await page.evaluate(async sources => {
    const result = [];
    for (const source of sources) {
      const image = new Image(); image.src = `data:image/png;base64,${source.data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      for (let frame = 0; frame < source.count; frame++) {
        ctx.clearRect(0, 0, source.width, source.height);
        ctx.drawImage(image, frame % source.columns * source.width, Math.floor(frame / source.columns) * source.height,
          source.width, source.height, 0, 0, source.width, source.height);
        const data = ctx.getImageData(0, 0, source.width, source.height).data, rows = [];
        let top = source.height, bottom = 0, left = source.width, right = 0;
        for (let y = 0; y < source.height; y++) {
          let rowLeft = source.width, rowRight = 0;
          for (let x = 0; x < source.width; x++) if (data[(y * source.width + x) * 4 + 3] > 128) {
            rowLeft = Math.min(rowLeft, x); rowRight = Math.max(rowRight, x + 1);
          }
          rows.push(rowRight - rowLeft);
          if (rowRight > rowLeft) { top = Math.min(top, y); bottom = y + 1; left = Math.min(left, rowLeft); right = Math.max(right, rowRight); }
        }
        const torso = rows.slice(Math.ceil(top + (bottom - top) * .24), Math.ceil(top + (bottom - top) * .40)).filter(width => width > 0).sort((a, b) => a - b);
        result.push({ name: source.name, frame, top, bottom, height: bottom - top, width: right - left,
          torso: torso[Math.floor(torso.length / 2)] });
      }
    }
    return result;
  }, inputs);
  const median = values => { const sorted = [...values].sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2; };
  const reference = measurements[0];
  const group = (name, include) => {
    const frames = measurements.filter(frame => frame.name === name && (!include || include.includes(frame.frame)));
    const source = sources.find(source => source.name === name);
    // Repeated transition drawings must not outweigh the planted pose when calibrating a sheet.
    return { cellHeight: source.height, visibleHeight: frames[0].height, torsoWidth: median([...new Set(frames.map(frame => frame.torso))]), footY: frames[0].bottom };
  };
  const sizing = { reference: group('idle'), step: group('step'), nod: group('nod', nod.hitFrames) };
  await writeFile('apps/web/src/game/assets/courtHeroLayout.json', JSON.stringify(sizing, null, 2) + '\n');
  const audit = {
    method: 'Fixed horizontal and vertical size calibration per full source sheet; no frame-dependent zoom or texture editing',
    inputs: inputs.map(({ data, ...source }) => ({ ...source, sha256: createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex') })),
    reference, sizing, measurements,
    tolerances: { visibleHeight: '2% plus one raster pixel', torsoWidth: '5% plus one raster pixel', footLine: 'one source pixel' }
  };
  await mkdir('docs/previews', { recursive: true });
  await writeFile('docs/previews/court-hero-size-audit.json', JSON.stringify(audit, null, 2) + '\n');
  const provenancePath = 'assets/source/provenance.json', provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  provenance.runtimeCompositions = (provenance.runtimeCompositions ?? []).filter(entry => entry.version !== 'court-hero-size-v1');
  provenance.runtimeCompositions.push({ version: 'court-hero-size-v1', createdOn: '2026-10-31', tool: audit.method,
    sources: audit.inputs, layout: 'apps/web/src/game/assets/courtHeroLayout.json', audit: 'docs/previews/court-hero-size-audit.json',
    reference: 'README.md#music-nod-v1' });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify(sizing));
} finally { await browser.close(); }

// Pack the owner's eight RGB sprites without repainting or removing source colours.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import layout from '../apps/web/src/game/assets/rhythmArrowLayout.json' with { type: 'json' };

const directory = `assets/source/${layout.collection}`, output = `apps/web/public/assets/${layout.collection}`;
const previews = `docs/previews/${layout.collection}`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await readFile(layout.source);
await mkdir(directory, { recursive: true }); await mkdir(output, { recursive: true }); await mkdir(previews, { recursive: true });
const preserved = directory + '/original.png'; await copyFile(layout.source, preserved);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const packed = await page.evaluate(async ({ data, layout }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    if (image.width !== 1448 || image.height !== 1086) throw new Error('Unexpected source sheet size');
    const atlas = document.createElement('canvas'); atlas.width = layout.cellWidth * 8; atlas.height = layout.cellHeight;
    const ctx = atlas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const frames = [];
    for (const item of layout.sources) for (const [variant, row] of layout.rows.entries()) {
      const frame = layout.frames[item.direction][variant], x = item.column * image.width / 4, width = image.width / 4;
      const anchor = item.anchors[variant];
      const dx = layout.anchor.x - (anchor.x - x) * layout.sourceScale;
      const dy = layout.anchor.y - (anchor.y - row.y) * layout.sourceScale;
      const cell = document.createElement('canvas'); cell.width = layout.cellWidth; cell.height = layout.cellHeight;
      const g = cell.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(image, x, row.y, width, row.height, dx, dy, width * layout.sourceScale, row.height * layout.sourceScale);
      const pixels = g.getImageData(0, 0, cell.width, cell.height).data;
      let brightPixels = 0, clipped = false;
      for (let py = 0; py < cell.height; py++) for (let px = 0; px < cell.width; px++) {
        const i = (py * cell.width + px) * 4;
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 24 || !pixels[i + 3]) continue;
        brightPixels++;
        if (!px || !py || px === cell.width - 1 || py === cell.height - 1) clipped = true;
      }
      if (clipped || brightPixels < 100) throw new Error('Clipped or empty sprite: ' + item.direction + variant);
      ctx.drawImage(cell, frame * layout.cellWidth, 0);
      frames.push({ frame, direction: item.direction, variant, source: { x, y: row.y, width, height: row.height },
        sourceAnchor: anchor, translation: { x: dx, y: dy }, brightPixels, clipped });
    }
    const preview = document.createElement('canvas'); preview.width = 960; preview.height = 600;
    const g = preview.getContext('2d'); g.fillStyle = '#25303c'; g.fillRect(0, 0, preview.width, preview.height);
    g.textAlign = 'center'; g.font = '18px Arial';
    for (const [column, direction] of layout.directions.entries()) for (let variant = 0; variant < 2; variant++) {
      const x = column * 240 + 120, y = variant * 300 + 190;
      g.fillStyle = '#c4cdd5'; g.fillText(direction + ' / ' + (variant + 1), x, variant * 300 + 28);
      g.strokeStyle = '#728494'; g.beginPath(); g.arc(x, y, 20, 0, Math.PI * 2); g.stroke();
      g.globalCompositeOperation = 'screen';
      g.drawImage(atlas, layout.frames[direction][variant] * layout.cellWidth, 0, layout.cellWidth, layout.cellHeight,
        x - layout.anchor.x * .75, y - layout.anchor.y * .75, layout.cellWidth * .75, layout.cellHeight * .75);
      g.globalCompositeOperation = 'source-over';
    }
    return { png: atlas.toDataURL('image/png').split(',')[1], preview: preview.toDataURL('image/png').split(',')[1], frames };
  }, { data: bytes.toString('base64'), layout });
  const atlas = Buffer.from(packed.png, 'base64'), path = output + '/arrows.png';
  await writeFile(path, atlas); await writeFile(previews + '/contact-sheet.png', Buffer.from(packed.preview, 'base64'));
  const audit = { createdOn: '2026-10-30', method: 'Eight owner-provided RGB sprites cropped and uniformly scaled into isolated atlas cells. No repainting, rotation or background removal; runtime SCREEN blending makes black invisible.',
    source: { path: layout.source, preserved, width: 1448, height: 1086, sha256: sha(bytes) }, layout, frames: packed.frames,
    output: { path, width: layout.cellWidth * 8, height: layout.cellHeight, bytes: atlas.length, sha256: sha(atlas) } };
  await writeFile(directory + '/audit.json', JSON.stringify(audit, null, 2) + '\n');
  const provenancePath = 'assets/source/provenance.json', provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  provenance.generatedAssets = provenance.generatedAssets.filter(item => item.collection !== layout.collection);
  provenance.generatedAssets.push({ collection: layout.collection, createdOn: audit.createdOn, tool: audit.method,
    sources: [layout.source], audit: directory + '/audit.json', license: 'Owner-provided project artwork; no external material added' });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify(audit.output));
} finally { await browser.close(); }

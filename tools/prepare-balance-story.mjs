import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'assets/source/balance-story/beer.png';
const output = 'apps/web/public/assets/balance-story/beer.webp';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const packed = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
    const read = scan.getContext('2d', { willReadFrequently: true }); read.drawImage(image, 0, 0);
    const pixels = read.getImageData(0, 0, image.width, image.height).data;
    let l = image.width, t = image.height, r = 0, b = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      if (pixels[(y * image.width + x) * 4 + 3] > 16) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x + 1); b = Math.max(b, y + 1); }
    }
    if (r <= l || b <= t) throw new Error('Empty beer sprite');
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 240;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    const scale = Math.min(78 / (r - l), 238 / (b - t));
    ctx.drawImage(image, l, t, r - l, b - t, (80 - (r - l) * scale) / 2, 239 - (b - t) * scale, (r - l) * scale, (b - t) * scale);
    return { data: canvas.toDataURL('image/webp', .92).split(',')[1], crop: { l, t, r, b }, sourceSize: [image.width, image.height] };
  }, (await readFile(source)).toString('base64'));
  await mkdir('apps/web/public/assets/balance-story', { recursive: true });
  const bytes = Buffer.from(packed.data, 'base64'); await writeFile(output, bytes);
  const sha256 = data => createHash('sha256').update(data).digest('hex');
  await writeFile('assets/source/balance-story/audit.json', JSON.stringify({ source, output, crop: packed.crop,
    sourceSize: packed.sourceSize, size: [80, 240], bytes: bytes.length, sourceSha256: sha256(await readFile(source)), sha256: sha256(bytes) }, null, 2) + '\n');
  const provenancePath = 'assets/source/provenance.json';
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  const generation = JSON.parse(await readFile('assets/source/balance-story/generation.json', 'utf8'));
  provenance.generatedAssets = provenance.generatedAssets.filter(entry => entry.collection !== 'balance-story');
  provenance.generatedAssets.push({ collection: 'balance-story', createdOn: generation.date, tool: generation.tool,
    skill: 'imagegen', prompt: generation.prompt, transparent_background: true, source, output,
    operation: generation.preparation, heroMarker: generation.heroMarker,
    audit: 'assets/source/balance-story/audit.json', sha256: sha256(bytes) });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  console.log(`${output}: ${bytes.length} bytes`);
} finally { await browser.close(); }

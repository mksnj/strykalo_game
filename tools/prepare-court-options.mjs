// Package alternative court layers without changing the game's active asset registry.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('assets/source/court-options-v1/', root);
const runtime = new URL('output/court-options-v1/', root);
const previews = new URL('docs/previews/court-options-v1/', root);
const plan = JSON.parse(await readFile(new URL('generation.json', source), 'utf8'));
const sha256 = data => createHash('sha256').update(data).digest('hex');
await mkdir(runtime, { recursive: true });
await mkdir(previews, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const audit = [];
try {
  const page = await browser.newPage();
  for (const variant of plan.variants) {
    const basename = `${String(variant.n).padStart(2, '0')}-${variant.slug}`;
    const bytes = await readFile(new URL(basename + '.png', source));
    const result = await page.evaluate(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      // Resample the full generated layer without trimming or repainting.
      ctx.drawImage(image, 0, 0, 960, 540);
      const frame = ctx.getImageData(0, 0, 960, 540), pixels = frame.data;
      let transparent = 0, opaque = 0, partial = 0, normalized = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        // Generated solid paint can have an alpha plateau of 253/255. Snap only nearly
        // covered pixels to opaque so the runner cannot bleed through painted asphalt.
        // Preserve actual transparent areas and the antialiased silhouette.
        if (pixels[i] >= 250 && pixels[i] < 255) { pixels[i] = 255; normalized++; }
        if (pixels[i] === 0) transparent++;
        else if (pixels[i] === 255) opaque++;
        else partial++;
      }
      ctx.putImageData(frame, 0, 0);
      return { data: canvas.toDataURL('image/webp', .95).split(',')[1],
        sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight,
        width: 960, height: 540, transparent, opaque, partial, normalized,
        anchorAlpha: pixels[(385 * 960 + 480) * 4 + 3] };
    }, bytes.toString('base64'));
    if (result.transparent < 10000 || result.opaque < 10000 || result.anchorAlpha !== 255) {
      throw new Error(`Layer ${basename} has invalid transparency or no solid floor under the hero: ${JSON.stringify({ ...result, data: undefined })}`);
    }
    const packed = Buffer.from(result.data, 'base64');
    await writeFile(new URL(basename + '.webp', runtime), packed);
    const { data, ...dimensions } = result;
    audit.push({ n: variant.n, name: variant.name, slug: variant.slug,
      source: `assets/source/court-options-v1/${basename}.png`,
      runtime: `output/court-options-v1/${basename}.webp`,
      ...dimensions, sourceSha256: sha256(bytes), runtimeSha256: sha256(packed), bytes: packed.length });
  }
  await writeFile(new URL('audit.json', source), JSON.stringify(audit, null, 2) + '\n');
  // A review sheet uses real texture images as the backdrop, without changing the generated layers.
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Варианты площадки</title>
  <style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#111822;color:#d4dce6;font:16px system-ui}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}figcaption{padding:8px 0}.scene{position:relative;aspect-ratio:16/9;overflow:hidden;background:#222b39}.far,.yard{position:absolute;inset:0 0 auto;height:81.111%;background-size:auto 100%;background-repeat:repeat-x}.far{background-image:url('../../../apps/web/public/assets/runner-v1/far.webp')}.yard{background-image:url('../../../apps/web/public/assets/journey-v1/autumn.webp');background-position-x:-65px}.road{position:absolute;inset:80.555% 0 0;background:url('../../../apps/web/public/assets/runner-v1/ground.webp') left top/auto 100% repeat-x}.asset{position:absolute;inset:0;width:100%;height:100%}a{color:inherit}@media(max-width:800px){main{grid-template-columns:1fr}}</style>
  <main>${audit.map(v => `<figure><figcaption>${v.n}. ${v.name}</figcaption><div class="scene"><div class="far"></div><div class="yard"></div><div class="road"></div><img class="asset" src="../../../${v.runtime}" alt="${v.name}"></div></figure>`).join('')}</main></html>`;
  await writeFile(new URL('index.html', previews), html);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(new URL('index.html', previews).href);
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await page.screenshot({ path: fileURLToPath(new URL('overview.png', previews)), fullPage: true });
  console.log(JSON.stringify(audit.map(v => ({ n: v.n, runtime: v.runtime, width: v.width, height: v.height, sourceWidth: v.sourceWidth, sourceHeight: v.sourceHeight, transparent: v.transparent, anchorAlpha: v.anchorAlpha })), null, 2));
} finally { await browser.close(); }

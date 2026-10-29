import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const dir = 'assets/source/street-v10';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const original = (await readFile(`${dir}/previous-autumn.webp`)).toString('base64');
  const generated = (await readFile(`${dir}/number-removal-generated.png`)).toString('base64');
  const patch = { x: 1369, y: 365, width: 31, height: 30 };
  const png = await page.evaluate(async ({ original, generated, patch }) => {
    const a = new Image(), b = new Image();
    a.src = 'data:image/webp;base64,' + original; b.src = 'data:image/png;base64,' + generated;
    await Promise.all([a.decode(), b.decode()]);
    const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.drawImage(a, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(patch.x, patch.y, patch.width, patch.height); ctx.clip();
    ctx.drawImage(b, 0, 0, canvas.width, canvas.height); ctx.restore();
    return canvas.toDataURL('image/png').split(',')[1];
  }, { original, generated, patch });
  await writeFile(`${dir}/autumn-no92.png`, Buffer.from(png, 'base64'));
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/autumn-no92.png`,
    '-c:v', 'libwebp', '-pix_fmt', 'bgra', '-lossless', '1', 'apps/web/public/assets/journey-v1/autumn.webp'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg ' + result.status);
  const runtime = await readFile('apps/web/public/assets/journey-v1/autumn.webp');
  const audit = await page.evaluate(async ({ original, runtime, patch }) => {
    const images = await Promise.all([original, runtime].map(async data => {
      const image = new Image(); image.src = 'data:image/webp;base64,' + data; await image.decode();
      const c = document.createElement('canvas'); c.width = 1536; c.height = 512;
      const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, 1536, 512).data;
    }));
    let changedOutside = 0, changedInside = 0, maximumOutsideCompositeDelta = 0, outsideAlphaChanges = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 1536; x++) {
      const i = (y * 1536 + x) * 4;
      if ([0,1,2,3].some(c => images[0][i+c] !== images[1][i+c])) {
        if (x >= patch.x && x < patch.x+patch.width && y >= patch.y && y < patch.y+patch.height) changedInside++;
        else {
          changedOutside++;
          if (images[0][i+3] !== images[1][i+3]) outsideAlphaChanges++;
          for (const background of [0, 255]) for (let c = 0; c < 3; c++) {
            const a = images[0][i+c] * images[0][i+3] / 255 + background * (1-images[0][i+3]/255);
            const b = images[1][i+c] * images[1][i+3] / 255 + background * (1-images[1][i+3]/255);
            maximumOutsideCompositeDelta = Math.max(maximumOutsideCompositeDelta, Math.abs(a-b));
          }
        }
      }
    }
    return { width: 1536, height: 512, patch, changedInside, changedOutside, outsideAlphaChanges, maximumOutsideCompositeDelta };
  }, { original, runtime: runtime.toString('base64'), patch });
  await writeFile(`${dir}/asset-audit.json`, JSON.stringify({ ...audit, sha256: createHash('sha256').update(runtime).digest('hex') }, null, 2));
  // Canvas unpremultiplication and lossless WebP re-encoding can round RGB at
  // translucent pixels twice. Alpha must stay exact; visible error stays <2/255.
  if (audit.maximumOutsideCompositeDelta > 2 || audit.outsideAlphaChanges > 0) throw new Error(JSON.stringify(audit));
  console.log(audit);
} finally { await browser.close(); }


import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = 'assets/source/visual-v12', output = 'apps/web/public/assets/visual-v12';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const audit = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const page = await browser.newPage();
  for (const name of ['pipe', 'front', 'seated', 'graffiti', 'facade']) {
    const source = name === 'graffiti' ? null : await readFile(directory + '/' + name + '.png');
    const original = name === 'pipe' ? (await readFile('apps/web/public/assets/provided-v4/pipe.webp')).toString('base64') : null;
    const packed = await page.evaluate(async ({ name, data, original }) => {
      const load = async (data, type = 'png') => { const i = new Image(); i.src = 'data:image/' + type + ';base64,' + data; await i.decode(); return i; };
      const c = document.createElement('canvas');
      c.width = name === 'pipe' ? 1920 : name === 'facade' ? 960 : name === 'graffiti' ? 480 : 128;
      c.height = name === 'pipe' ? 640 : name === 'facade' ? 540 : name === 'graffiti' ? 160 : 256;
      const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      let crop;
      if (name === 'graffiti') {
        ctx.translate(6, 15); ctx.transform(1, -.025, -.12, 1, 0, 0);
        ctx.fillStyle = '#93877b'; ctx.font = 'italic 43px Georgia'; ctx.textAlign = 'center';
        for (const [line, y] of [['Пусть решится', 51], ['само собой', 110]]) {
          let x = 235 - ctx.measureText(line).width / 2;
          for (let n = 0; n < line.length; n++) { ctx.globalAlpha = .67 + (n % 3) * .08; ctx.fillText(line[n], x + ctx.measureText(line[n]).width / 2, y + Math.sin(n * 7) * 1.5); x += ctx.measureText(line[n]).width; }
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out';
        for (let n = 0; n < 900; n++) ctx.fillRect((n * 73) % 480, (n * 31.7) % 160, 1 + n % 3, .5 + n % 2);
      } else {
        const i = await load(data);
        if (name === 'facade') {
          const h = 574, w = i.width / i.height * h;
          ctx.drawImage(i, (960 - w) / 2, 0, w, h);
        } else if (name === 'pipe') {
          ctx.drawImage(i, 0, 0, 1920, 640);
          // Keep every pixel of the original near bank and excavation at Y>=310.
          const old = await load(original, 'webp'); ctx.drawImage(old, 0, 310, 1920, 330, 0, 310, 1920, 330);
        } else {
          const scan = document.createElement('canvas'); scan.width = i.width; scan.height = i.height;
          const read = scan.getContext('2d', { willReadFrequently: true }); read.drawImage(i, 0, 0);
          const p = read.getImageData(0, 0, i.width, i.height).data;
          let l = i.width, t = i.height, r = 0, b = 0;
          for (let y = 0; y < i.height; y++) for (let x = 0; x < i.width; x++) if (p[(y * i.width + x) * 4 + 3] > 40) {
            l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x + 1); b = Math.max(b, y + 1);
          }
          crop = { l, t, r, b };
          const scale = Math.min(124 / (r - l), 248 / (b - t));
          ctx.drawImage(i, l, t, r - l, b - t, (128 - (r - l) * scale) / 2, 255 - (b - t) * scale, (r - l) * scale, (b - t) * scale);
        }
      }
      return { data: c.toDataURL('image/webp', 1).split(',')[1], crop, size: [c.width, c.height] };
    }, { name, data: source?.toString('base64'), original });
    const bytes = Buffer.from(packed.data, 'base64'), path = output + '/' + name + '.webp';
    await writeFile(path, bytes);
    audit.push({ name, source: source ? directory + '/' + name + '.png' : 'tools/prepare-visual-v12.mjs', sourceSha256: source ? hash(source) : null,
      output: path, sha256: hash(bytes), crop: packed.crop, size: packed.size, bytes: bytes.length });
    console.log(path + ': ' + bytes.length);
  }
  await writeFile(directory + '/audit.json', JSON.stringify(audit, null, 2) + '\n');
  const provenancePath = 'assets/source/provenance.json', provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  provenance.generatedAssets = provenance.generatedAssets.filter(a => a.collection !== 'visual-v12');
  provenance.generatedAssets.push({ collection: 'visual-v12', createdOn: '2026-10-28', tool: 'image_gen.imagegen and deterministic canvas packaging',
    generation: directory + '/generation.json', audit: directory + '/audit.json', assets: audit,
    note: 'Original excavation retained below Y=310. Sprites uniformly fitted preserving generated alpha. Graffiti rendered from exact existing text, with no glow.' });
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
} finally { await browser.close(); }

// Review the actual manifest, decoded images and production copies without changing assets.
// Run after npm run build. Generates a contact sheet and a reproducible hash/dimension report.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { middlewareMode: true } });
let browser;
try {
  const { ASSETS } = await server.ssrLoadModule('/src/game/assets/manifest.ts');
  const inventory = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? inventory(url) : [fileURLToPath(url)];
  }))).flat();
  const publicAssets = new URL('../apps/web/public/assets/', import.meta.url);
  const expected = new Set(ASSETS.map(asset => fileURLToPath(new URL('../apps/web/public' + asset.url, import.meta.url))));
  const unused = (await inventory(publicAssets)).filter(path => !expected.has(path));
  if (unused.length) throw new Error('Неиспользуемые файлы в public/assets: ' + unused.join(', '));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const files = await Promise.all(ASSETS.map(async asset => {
    const bytes = await readFile(new URL('../apps/web/public' + asset.url, import.meta.url));
    const built = await readFile(new URL('../dist' + asset.url, import.meta.url));
    return { ...asset, data: bytes.toString('base64'), sha256: hash(bytes), buildMatch: hash(bytes) === hash(built) };
  }));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1785 } });
  const report = await page.evaluate(async files => {
    document.documentElement.lang = 'ru';
    document.body.style = 'margin:0;background:#18212d;color:#dae1ea;font:13px sans-serif;display:grid;grid-template-columns:repeat(4,300px)';
    const rows = [];
    for (const file of files) {
      const image = new Image(); image.src = 'data:image/webp;base64,' + file.data; await image.decode();
      const { data: _data, ...entry } = file;
      rows.push({ ...entry, actualWidth: image.width, actualHeight: image.height });
      const box = document.createElement('div');
      box.style = 'height:255px;padding:8px;box-sizing:border-box;border:1px solid #445062';
      const heading = document.createElement('div'); heading.textContent = file.key + ' · ' + image.width + '×' + image.height;
      const path = document.createElement('div'); path.style = 'font-size:10px;color:#acb6c4;margin:4px 0'; path.textContent = file.url;
      image.style = 'width:282px;height:195px;object-fit:contain;display:block;background:#303a49';
      box.append(heading, path, image); document.body.append(box);
    }
    return rows;
  }, files);
  await page.screenshot({ path: 'docs/previews/textures-audit-contact.png', fullPage: true });
  await writeFile('docs/previews/textures-audit.json', JSON.stringify(report, null, 2) + '\n');
  const mismatches = report.filter(asset => !asset.buildMatch || asset.width !== asset.actualWidth || asset.height !== asset.actualHeight);
  if (mismatches.length) throw new Error('Несовпадение ресурсов: ' + mismatches.map(asset => asset.key).join(', '));
  console.log(`Проверено ${report.length} ресурсов: размеры и SHA-256 копий в dist совпадают. Каталог: docs/previews/textures-audit-contact.png`);
} finally { await browser?.close(); await server.close(); }

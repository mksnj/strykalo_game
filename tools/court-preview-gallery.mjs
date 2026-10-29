// Build a review gallery from the real-game frames captured by courtContinuity.spec.ts.
import { chromium } from '@playwright/test';
import { writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const sizes = ['960x540', '1920x1080', '1230x372', '375x667'];
const world = process.argv.includes('--world');
const prefix = world ? 'court-world-v5' : 'court-v4';
const stages = world ? [
  ...[0, 20, 40, 60, 80, 100].map(p => [`entry-${p}`, `Вход ${p}%`]),
  ['05-active', 'Мини-игра'], ['06-exit-start', 'Начало выхода'],
  ['07-exit-middle', 'Середина выхода'], ['08-runner', 'Возвращение в раннер'],
] : [
  ['01-approach', 'Приближение'], ['02-entry-start', 'Начало входа'],
  ['03-entry-middle', 'Середина входа'], ['04-entry-end', 'Конец входа'],
  ['05-active', 'Мини-игра'], ['06-exit-start', 'Начало выхода'],
  ['07-exit-middle', 'Середина выхода'], ['08-runner', 'Возвращение в раннер'],
];
const files = [];
const sections = await Promise.all(sizes.map(async size => {
  const figures = await Promise.all(stages.map(async ([stage, label]) => {
    const file = `${prefix}-${size}-${stage}.png`;
    files.push({ size, stage, file, bytes: (await stat('docs/previews/' + file)).size });
    return `<figure><a href="${file}"><img src="${file}" alt="${label}"></a><figcaption>${label}</figcaption></figure>`;
  }));
  return `<section id="s${size}"><h2>${size}</h2><div class="grid">${figures.join('')}</div></section>`;
}));
await writeFile(`docs/previews/${prefix}.html`, `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Общий асфальт — переход площадки</title>
<style>body{margin:0;padding:24px;background:#111822;color:#d4dce5;font:16px system-ui}h1{font-size:24px}h2{font-size:18px}section{padding:12px 0 24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;background:#1b2532}img{width:100%;height:270px;object-fit:contain;display:block}figcaption{padding:8px;font-size:14px}a{color:inherit}@media(max-width:850px){.grid{grid-template-columns:repeat(2,1fr)}img{height:210px}}</style>
<h1>${world ? 'Дом, проход и площадка в общих мировых координатах' : 'Общее асфальтовое основание'}</h1><p>${sizes.length * stages.length} кадров работающей игры, снятых Playwright. Нажмите на кадр для просмотра в исходном размере.</p>${sections.join('')}</html>`);
await writeFile(`docs/previews/${prefix}-frames.json`, JSON.stringify({ capturedBy: 'tests/browser/courtContinuity.spec.ts', files }, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(resolve(`docs/previews/${prefix}.html`)).href);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  for (const size of sizes) await page.locator('#s' + size).screenshot({ path: `docs/previews/${prefix}-${size}-overview.png` });
} finally { await browser.close(); }

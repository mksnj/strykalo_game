import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const dir = 'docs/previews/court-spatial-v8';
const report = JSON.parse(await readFile(`${dir}/capture.json`, 'utf8'));
const sections = report.map(c => `<section id="${c.prefix}"><h2>${c.width}×${c.height} · ${c.developer ? 'короткий' : 'обычный'} маршрут</h2><div class="grid">${c.frames.map(f => `<figure><a href="${f.file}"><img src="${f.file}" alt="${f.label}"></a><figcaption>${f.label}</figcaption></figure>`).join('')}</div></section>`);
await writeFile(`${dir}/index.html`, `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Двор и двумерная арена · v8</title><style>body{background:#111822;color:#d3dee5;font:15px system-ui;margin:24px}a{color:#bcd2db}h1{font-size:26px}h2{font-size:19px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}figure{margin:0;background:#202c37}img{display:block;width:100%;height:180px;object-fit:contain}figcaption{padding:8px;font-size:12px}section{padding-bottom:24px}.plans{display:flex;gap:16px}.plans img{width:500px;height:350px}video{width:min(960px,100%)}nav a{display:inline-block;margin:8px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}.plans{display:block}.plans img{max-width:100%}}</style>
<h1>Единая модель двора, камера и полноценная арена</h1><p>Реальная игра: 180 кадров, 5 размеров экрана и оба маршрута. Технические схемы, три макета и крайние позиции используют одну модель. Подробности и результаты проверки находятся в README проекта.</p>
<div class="plans"><a href="plan.svg"><img src="plan.svg" alt="План сверху"></a><a href="depth.svg"><img src="depth.svg" alt="Схема глубины"></a></div>
<h2>Полный вход, столкновение и выход</h2><video controls preload="metadata" src="full-transition.webm"></video>
<h2>Реальное управление в четырёх направлениях</h2><video controls preload="metadata" src="active-four-directions.webm"></video>
<p>В видео активной мини-игры тестовый водитель нажимает настоящие клавиши и читает предупреждения. Генерация, движение и столкновения не изменены. Снимки границ используют отдельную диагностическую звезду с длинным предупреждением для изолированной проверки управления.</p>
<nav>${report.map(c => `<a href="#${c.prefix}">${c.prefix}</a>`).join('')}</nav>${sections.join('')}</html>`);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(resolve(`${dir}/index.html`)).href);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
  for (const c of report) await page.locator(`#${c.prefix} .grid`).screenshot({ path: `${dir}/${c.prefix}-overview.png` });
  for (const name of ['plan', 'depth']) {
    await page.setContent(await readFile(`${dir}/${name}.svg`, 'utf8'));
    await page.locator('svg').screenshot({ path: `${dir}/${name}.png` });
  }
} finally { await browser.close(); }
console.log(`${report.length} overview sheets: ${dir}/index.html`);

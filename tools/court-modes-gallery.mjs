import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const dir = 'docs/previews/court-modes-v9';
const captures = JSON.parse(await readFile(`${dir}/capture.json`, 'utf8'));
const videos = JSON.parse(await readFile(`${dir}/videos.json`, 'utf8'));
const labels = { before: 'Перед входом', transition: 'Короткая смена плана', active: 'Активная мини-игра',
  exit: 'Начало выхода', return: 'Возвращение в раннер' };
const cards = frames => frames.map(f => `<figure><a href="${f.image ?? f.file}"><img src="${f.image ?? f.file}" alt="${labels[f.stage] ?? f.label}"></a><figcaption>${labels[f.stage] ?? f.label}</figcaption></figure>`).join('');
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Площадка и переходы между режимами · v9</title><style>
body{margin:24px;background:#111923;color:#d5dfe7;font:15px system-ui}h1{font-size:25px}h2{font-size:20px}a{color:#c1d9e7}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;background:#1f2b38}img{display:block;width:100%;height:210px;object-fit:contain}figcaption{padding:9px}section{margin:30px 0}video{width:min(960px,100%);max-height:80vh;background:#111923}
@media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}img{height:160px}}
</style><h1>Самостоятельная площадка и короткая смена игровых режимов</h1>
<p>Кадры работающей игры: исходный мокрый асфальт и потёртая разметка, отдельная арена, один общий герой.</p>
<p>Во всех четырёх видео сохранены подход, вход, обычный звездопад с настоящим вводом, естественное попадание после 18 с, реакция, выход и продолжение бега.
Без подмены звёзд, времени симуляции или исхода; запись без звука. Все четыре стороны арены отдельно проверены реальными клавишами.</p>
${videos.map(v => `<section id="cycle-${v.width}"><h2>Полный цикл · ${v.width}×${v.height} · ${v.duration.toFixed(2)} с</h2>
<video controls preload="metadata" src="${v.video}"></video><div class="grid">${cards(v.stages)}</div></section>`).join('')}
<h2>Оба маршрута и проверка четырёх границ</h2>
${captures.map(c => `<section id="${c.prefix}"><h2>${c.width}×${c.height} · ${c.developer ? 'короткий' : 'обычный'} маршрут</h2><div class="grid">${cards(c.frames)}</div></section>`).join('')}
<p><a href="capture.json">Геометрия кадров</a> · <a href="videos.json">Время, фазы и журнал ввода видео</a> · <a href="video-playback.json">Проверка декодирования</a></p></html>`;
await writeFile(`${dir}/index.html`, html);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(resolve(`${dir}/index.html`)).href);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
  for (const v of videos) await page.locator(`#cycle-${v.width} .grid`).screenshot({ path: `${dir}/cycle-${v.width}x${v.height}-overview.png` });
  for (const c of captures) await page.locator(`#${c.prefix} .grid`).screenshot({ path: `${dir}/${c.prefix}-overview.png` });
} finally { await browser.close(); }
console.log(`Gallery: ${captures.length} sets of screenshots; ${videos.length} complete videos`);


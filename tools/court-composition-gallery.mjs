import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const directory = 'docs/previews/court-transitions-v7';
const captures = JSON.parse(await readFile(`${directory}/capture.json`, 'utf8'));
const motionCaptures = captures.filter(c => c.width === 960).flatMap(c =>
  ['stars-approach', 'stars-exit'].map(phase => ({ prefix: c.prefix, phase })));
const sections = captures.map(({ prefix, developer, width, height, frames }) => `<section id="${prefix}">
<h2>${width}×${height} · ${developer ? 'Короткий маршрут' : 'Обычный маршрут'}</h2>
<div class="grid">${frames.map(({ file, label }) => `<figure><a href="${file}"><img class="frame" src="${file}" alt="${label}"></a><figcaption>${label}</figcaption></figure>`).join('')}</div>
${width === 960 ? `<div class="motion"><h3>Плотная серия кадров работающей сцены</h3><label>Переход <select><option value="stars-approach">Вход 4,8 с</option><option value="stars-exit">Выход 4,6 с</option></select></label> <button type="button">Воспроизвести</button> <input aria-label="Кадр перехода" type="range" min="0" max="25" value="0"><output>0%</output><img data-prefix="${prefix}" src="${prefix}-motion-stars-approach-00.png" alt="Кадр перехода"></div>` : ''}</section>`);
await writeFile(`${directory}/index.html`, `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Переходы — court-transitions-v7</title>
<style>body{margin:0;padding:24px;background:#111822;color:#d4dce5;font:15px system-ui}h1{font-size:24px}h2{font-size:20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0;background:#1b2532}.frame{width:100%;height:230px;object-fit:contain;display:block}figcaption{padding:8px}a{color:inherit}section{padding-bottom:32px}.motion>img{display:block;width:min(960px,100%);margin:12px 0}.motion{padding:12px;background:#1b2532}button,select,input{font:inherit;accent-color:#a1b7c7}nav a{margin-right:12px}@media(max-width:850px){.grid{grid-template-columns:repeat(2,1fr)}.frame{height:190px}}</style>
<h1>Вход и выход · court-transitions-v7</h1><p>104 реальных браузерных кадра игры: четыре размера, обычный и короткий маршруты. Статичный кадр снят без HUD только для проверки композиции. Нажмите на изображение, чтобы открыть оригинал. <a href="motion.html">Плотные серии входа и выхода</a>: по 26 кадров с интервалами 192/184 мс, для обоих маршрутов при 960×540.</p>
<nav>${captures.map(c => `<a href="#${c.prefix}">${c.prefix}</a>`).join('')}</nav>${sections.join('')}
<script>
for(const box of document.querySelectorAll('.motion')){
 const select=box.querySelector('select'),button=box.querySelector('button'),range=box.querySelector('input'),output=box.querySelector('output'),image=box.querySelector('img');let timer;
 const draw=()=>{image.src=image.dataset.prefix+'-motion-'+select.value+'-'+String(range.value).padStart(2,'0')+'.png';output.textContent=Math.round(range.value*4)+'%'};
 const stop=()=>{clearInterval(timer);timer=undefined;button.textContent='Воспроизвести'};
 range.oninput=()=>{stop();draw()};select.onchange=()=>{stop();range.value=0;draw()};
 button.onclick=async()=>{if(timer){stop();return}button.disabled=true;await Promise.all(Array.from({length:26},(_,i)=>{const frame=new Image();frame.src=image.dataset.prefix+'-motion-'+select.value+'-'+String(i).padStart(2,'0')+'.png';return frame.decode()}));button.disabled=false;range.value=0;draw();button.textContent='Пауза';timer=setInterval(()=>{if(+range.value===25){stop();return}range.value=+range.value+1;draw()},select.value==='stars-approach'?192:184)};
}
</script></html>`);
await writeFile(`${directory}/motion.html`, `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Плотная серия переходов площадки</title>
<style>body{background:#111822;color:#d4dce5;font:14px system-ui;margin:16px}.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}figure{margin:0}img{width:100%;display:block}h2{font-size:18px}</style>
<a href="index.html">Все размеры и воспроизведение</a>${motionCaptures.map(c => `<section id="${c.prefix}-${c.phase}"><h2>${c.prefix} · ${c.phase}</h2><div class="grid">${Array.from({ length: 26 }, (_, i) => `<figure><img src="${c.prefix}-motion-${c.phase}-${String(i).padStart(2, '0')}.png" alt="Кадр ${i}"><figcaption>${i * 4}%</figcaption></figure>`).join('')}</div></section>`).join('')}</html>`);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(resolve(`${directory}/index.html`)).href);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  for (const capture of captures) await page.locator(`#${capture.prefix} .grid`).screenshot({ path: `${directory}/${capture.prefix}-overview.png` });
  await page.goto(pathToFileURL(resolve(`${directory}/motion.html`)).href);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  for (const capture of motionCaptures) await page.locator(`#${capture.prefix}-${capture.phase}`).screenshot({ path: `${directory}/${capture.prefix}-${capture.phase}-motion-overview.png` });
} finally { await browser.close(); }
console.log(`${captures.length} overview sheets, gallery: ${directory}/index.html`);


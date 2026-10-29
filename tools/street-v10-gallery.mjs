import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const dir='docs/previews/street-v10';
const c=JSON.parse(await readFile(`${dir}/capture.json`,'utf8'));
const v=JSON.parse(await readFile(`${dir}/videos.json`,'utf8'));
const labels={before:'Перед входом: обычная улица',transition:'Смена плана',active:'Самостоятельная мини-игра',exit:'Начало выхода',return:'Возвращение на улицу',yard:'Прежнее место эпизода 92',entry:'Перед сменой плана'};
const cards=frames=>frames.map(f=>`<figure><a href="${f.image??f.file}"><img src="${f.image??f.file}" alt="${labels[f.stage]}"></a><figcaption>${f.developer?'Короткий маршрут · ':''}${labels[f.stage]}</figcaption></figure>`).join('');
await writeFile(`${dir}/index.html`,`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Обычная улица и отдельная мини-игра · v10</title>
<style>body{margin:24px;background:#111923;color:#d5dfe7;font:15px system-ui}a{color:#c1d9e7}h1{font-size:25px}h2{font-size:20px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;background:#1f2b38}img{width:100%;height:240px;object-fit:contain;display:block}figcaption{padding:9px}video{width:min(960px,100%);max-height:80vh}section{margin:30px 0}@media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>
<h1>Улица без встроенной площадки</h1><p>Баскетбольные объекты убраны из раннера. Двор перед переходом больше не вырезается под арену. Пара, указатель и табличка «92» сняты.</p>
${[960,1920,1230,375].map(w=>`<section id="street-${w}"><h2>Обычная улица · ${w}×${c.find(f=>f.width===w).height} · оба маршрута</h2><div class="grid">${cards(c.filter(f=>f.width===w))}</div></section>`).join('')}
<h2>Полные циклы из работающей игры</h2><p>Обычная симуляция звёзд и настоящий ввод. Без изменения таймера или исхода. Записи без звука.</p>
${v.map(f=>`<section id="cycle-${f.width}"><h2>${f.width}×${f.height} · ${f.duration.toFixed(2)} с</h2><video controls preload="metadata" src="${f.video}"></video><div class="grid">${cards(f.stages)}</div></section>`).join('')}
<p><a href="capture.json">Проверка уличного плана</a> · <a href="videos.json">Фазы и ввод видео</a> · <a href="video-playback.json">Декодирование видео</a></p></html>`);
const b=await chromium.launch({channel:'msedge',headless:true});
try{const p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto(pathToFileURL(resolve(`${dir}/index.html`)).href);await p.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
for(const w of [960,1920,1230,375]){
await p.locator(`#street-${w} .grid`).screenshot({path:`${dir}/street-${w}-overview.png`});
await p.locator(`#cycle-${w} .grid`).screenshot({path:`${dir}/cycle-${w}-overview.png`});
}}finally{await b.close();}console.log('Street v10: 24 street frames and 4 full cycles');


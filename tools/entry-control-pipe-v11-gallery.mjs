import {readFile,writeFile,readdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const dir='docs/previews/entry-control-pipe-v11';
const c=JSON.parse(await readFile(`${dir}/capture.json`,'utf8'));
const v=JSON.parse(await readFile(`${dir}/videos.json`,'utf8'));
const files=await readdir(dir),pipes=files.filter(f=>/^pipe-.*\.png$/.test(f));
const labels={before:'Кольцо видно за оградой до входа',transition:'Короткая смена плана после входа',active:'Самостоятельная арена',exit:'Выход к улице',return:'Продолжение бега',yard:'Улица до подхода',entry:'Герой дошёл до прохода',gate:'Герой проходит внутрь до смены плана'};
const cards=frames=>frames.map(f=>`<figure><a href="${f.image??f.file}"><img src="${f.image??f.file}" alt="${labels[f.stage]??f.stage}"></a><figcaption>${f.developer?'Короткий маршрут · ':''}${labels[f.stage]??f.stage}</figcaption></figure>`).join('');
const style='body{margin:24px;background:#111923;color:#d5dfe7;font:15px system-ui}a{color:#c1d9e7}h1{font-size:25px}h2{font-size:20px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;background:#1f2b38}img{width:100%;height:230px;object-fit:contain;display:block}figcaption{padding:9px}video{width:min(960px,100%);max-height:80vh}section{margin:30px 0}@media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
await writeFile(`${dir}/index.html`,`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Вход, плавное движение и труба · v11</title><style>${style}</style>
<h1>Видимый вход на площадку, мягкое управление и труба между берегами</h1>
<p>Во дворе заранее видно кольцо за оградой. Герой подходит к открытой калитке и проходит между стойками перед сменой плана. Полноценная арена остаётся самостоятельной сценой.</p>
<p>По X: скорость до 190 px/с, разгон около 0,11 с, торможение около 0,07 с. По Y — прежние 220 px/с. На паузе остаточная скорость сбрасывается.</p>
${[960,1920,1230,375].map(w=>`<section id="entry-${w}"><h2>Подход и проход · ${w}×${c.find(f=>f.width===w).height} · оба маршрута</h2><div class="grid">${cards(c.filter(f=>f.width===w))}</div></section>`).join('')}
<h2>Труба не выступает на асфальт</h2><p>Показаны подход к ближнему берегу, оба берега и дальний берег после возвращения. Сравнение изображения с трубой и без неё проверяет пиксели асфальта по обе стороны выемки.</p>
<section id="pipes"><div class="grid">${pipes.map(f=>`<figure><a href="${f}"><img src="${f}" alt="${f}"></a><figcaption>${f}</figcaption></figure>`).join('')}</div></section>
<h2>Полные циклы</h2><p>Обычные звёзды, настоящее управление и естественное попадание после 18 с. Без подмены таймера или исхода. Запись без звука.</p>
${v.map(f=>`<section id="cycle-${f.width}"><h2>${f.width}×${f.height} · ${f.duration.toFixed(2)} с</h2><video controls preload="metadata" src="${f.video}"></video><div class="grid">${cards(f.stages)}</div></section>`).join('')}
<p><a href="capture.json">Геометрия входа</a> · <a href="videos.json">Фазы и ввод</a> · <a href="video-playback.json">Декодирование</a> · <a href="validation.json">Проверки</a></p></html>`);
const b=await chromium.launch({channel:'msedge',headless:true});
try{const p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto(pathToFileURL(resolve(`${dir}/index.html`)).href);await p.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
for(const w of [960,1920,1230,375]){
await p.locator(`#entry-${w} .grid`).screenshot({path:`${dir}/entry-${w}-overview.png`});
await p.locator(`#cycle-${w} .grid`).screenshot({path:`${dir}/cycle-${w}-overview.png`});
}await p.locator('#pipes .grid').screenshot({path:`${dir}/pipes-overview.png`});
}finally{await b.close();}console.log(`v11: ${c.length} entry frames, ${pipes.length} pipe frames, ${v.length} full cycles`);


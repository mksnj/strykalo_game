import { readdir, readFile, writeFile } from 'node:fs/promises';
const dir = 'docs/previews/runner-room-v15';
const files = (await readdir(dir)).filter(f => f.endsWith('.png')).sort();
const runs = {};
for (const mode of ['desktop','portrait','landscape']) {
  runs[mode] = JSON.parse(await readFile(`${dir}/${mode}.json`,'utf8'));
}
const labels = {
  'street-50':'До первой мини-игры', 'street-210':'После трубы: город вернулся',
  'street-350':'Город за забором', 'street-650':'Тёмные дворы', 'street-985':'Перед грозой',
  'street-998':'Подход к дому', 'street-1040':'Финальный забег', 'street-1098':'У подъезда',
  'lamp-before':'Комната до касания лампы', 'lamp-dimmed':'Касание лампы: темнеет вся комната',
  'window-flash':'Вспышка в окне без рисунка молнии', 'bench-without-caption':'Скамейка без подписи',
  '01-endless-speed':'Ритм продолжается после 40 секунд', '02-two-mistakes':'Две ошибки: игра продолжается',
  '04-rain-89s':'Дождь на 89-й секунде', '05-dry-rest':'Дождь стих, герой ещё ждёт',
  '06-running-again':'Герой снова бежит',
};
const title = file => labels[file.replace(/^(desktop|portrait|landscape|wide)-/,'').replace('.png','')];
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Город, асфальт и свет в комнате</title><style>
body{margin:24px;background:#111822;color:#c2cfd8;font:16px Georgia;line-height:1.6}h1{font-size:29px}p{max-width:900px}a{color:#afc6d7}button,select{padding:10px;background:#273b4b;color:#d0dbe2;border:1px solid #677b8e}input{width:min(800px,95%);display:block;margin:18px 0}.entry{max-width:1100px}img{width:100%;height:340px;object-fit:contain;background:#172331}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px}figure{margin:0;padding:12px;background:#1c2a38}figcaption{padding-top:10px}
</style><h1>Город, асфальт и свет в комнате</h1>
<p>Город снова виден после трубы. На всём беговом маршруте — асфальт первого участка.
Звёзды начинают падать чуть медленнее. Гроза начинается на секунду раньше;
в комнате остались вспышки, а касание лампы приглушает свет во всём помещении.
Финальная подпись удалена.</p><h2>Вход в дом после начала грозы</h2>
<select id="mode"><option>desktop</option><option>portrait</option><option>landscape</option></select>
<button id="play">Проиграть кадры →</button>
<div class="entry"><img id="frame" alt="Герой непрерывно бежит в дом после начала дождя">
<input id="slider" aria-label="Кадр входа" type="range" min="0" max="6" value="0"><output id="caption"></output></div>` +
  ['desktop','portrait','wide','landscape'].map(mode => `<h2>${mode}</h2><section>` +
    files.filter(f=>f.startsWith(mode)&&!f.includes('-03-entry-')).map(f=>`<figure><a href="${f}"><img loading="lazy" src="${f}" alt="${title(f)}"></a><figcaption>${title(f)}</figcaption></figure>`).join('') + '</section>').join('') +
  `<script>const runs=${JSON.stringify(runs)};const mode=document.querySelector('#mode'),slider=document.querySelector('#slider'),frame=document.querySelector('#frame'),caption=document.querySelector('#caption');let timer;
function show(){const n=Number(slider.value),f=runs[mode.value].frames[n];frame.src=mode.value+'-03-entry-'+n+'.png';caption.textContent=f.age.toFixed(2)+' с после начала дождя';}
mode.onchange=slider.oninput=()=>{clearInterval(timer);show()};document.querySelector('#play').onclick=()=>{clearInterval(timer);slider.value=0;show();timer=setInterval(()=>{slider.value=Number(slider.value)+1;show();if(Number(slider.value)===6)clearInterval(timer)},350)};show();</script></html>`;
await writeFile(`${dir}/index.html`,html+'\n');
console.log(`${files.length} production screenshots`);

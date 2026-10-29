import { readdir, writeFile } from 'node:fs/promises';
const dir='docs/previews/transition-ui-v16';
const files=(await readdir(dir)).filter(f=>f.endsWith('.png')).sort();
const labels={
  '01-immediate-rules':'Первый кадр трубы: правила уже открыты, HUD скрыт',
  '02-active-hud':'После подтверждения: HUD активной мини-игры',
  '03-exit-without-hud':'Мини-игра завершена: HUD исчез',
  '04-court-exit-0':'Выход с площадки: герой смотрит вправо',
  '04-court-exit-1':'Продолжение выхода: направление сохранено',
  '04-court-exit-2':'Возвращение в раннер: герой бежит вперёд',
  '05-third-press-hint':'Третье игровое нажатие: подсказка в комнате',
  '06-ending-without-hint':'После комнаты: подсказки нет',
};
const label=file=>labels[file.replace(/^(desktop|portrait|landscape)-/,'').replace('.png','')];
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Правила трубы, выход с площадки и подсказка</title><style>
body{margin:24px;background:#111822;color:#c2cfd8;font:16px Georgia;line-height:1.6}h1{font-size:29px}p{max-width:900px}a{color:#afc6d7}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px}figure{margin:0;padding:12px;background:#1c2a38}img{width:100%;height:340px;object-fit:contain;background:#172331}figcaption{padding-top:10px}
</style><h1>Правила трубы, выход с площадки и подсказка</h1><p>Правила появляются вместе с видом от первого лица, HUD виден только во время игры.
Герой выходит с площадки лицом по направлению бега. Подсказка появляется после третьего игрового нажатия только внутри комнаты.</p>`+
['desktop','portrait','landscape'].map(mode=>`<h2>${mode}</h2><section>`+files.filter(f=>f.startsWith(mode)).map(f=>`<figure><a href="${f}"><img src="${f}" loading="lazy" alt="${label(f)}"></a><figcaption>${label(f)}</figcaption></figure>`).join('')+'</section>').join('')+'</html>\n';
await writeFile(`${dir}/index.html`,html);console.log(`${files.length} production screenshots`);

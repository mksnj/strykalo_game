import { readdir, writeFile, readFile } from 'node:fs/promises';
const directory = 'docs/previews/visual-v12';
const files = (await readdir(directory)).filter(name => name.endsWith('.png')).sort();
const labels = { '01-sunset': 'Закат над трубой', '02-fence': 'Забор и проход', '03-lightning': 'Начало грозы',
  '04-shelter': 'Укрытие и молния за окном', '05-tutorial': 'Обучение актуальному уклонению',
  '06-stars': 'Фронтальные пропорции', '07-graffiti': 'Граффити без свечения',
  '08-lamp': 'Реакция лампы', '08-window': 'Листья за окном', '08-clock': 'Вращение стрелок',
  '08-hero': 'Движение головы', '09-bench': 'Анфас, локти на коленях', '10-door': 'Подход к двери' };
const title = file => labels[file.replace(/^(desktop|portrait|landscape)-/, '').replace('.png', '')] ?? file;
const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>visual-v12 — кадры работающей игры</title><style>body{margin:28px;background:#111822;color:#c5cbd2;font:16px Georgia,serif}h1{font-size:30px}p{max-width:850px;line-height:1.6}nav{display:flex;gap:24px}a{color:#bbcbd9}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:20px}figure{margin:0;background:#202b38;padding:12px}img{width:100%;height:320px;object-fit:contain}figcaption{margin-top:10px;font-size:16px}small{display:block;color:#8c9fb1;margin-top:5px}</style>' +
  '<h1>Закат, гроза и возвращение домой</h1><p>Реальные кадры production RunnerScene, полученные Playwright. Тест размещает попытку в нужной фазе; камера, графика и эффекты принадлежат игре. Это техническая визуальная проверка. Художественная приёмка владельцем остаётся отдельным шагом.</p>' +
  '<p>В этой ветке «Бесполезно» использует уклонение. Обучение объясняет его; ритм-механика и демонстрация попадания в музыкальную отметку ожидают отдельной реализации.</p>' +
  '<nav><a href="#desktop">Desktop</a><a href="#portrait">Portrait</a><a href="#landscape">Landscape</a></nav>' +
  ['desktop', 'portrait', 'landscape'].map(mode => '<h2 id="' + mode + '">' + mode + '</h2><section>' +
    files.filter(file => file.startsWith(mode)).map(file => '<figure><a href="' + file + '"><img loading="lazy" src="' + file + '" alt="' + title(file) + '"></a><figcaption>' + title(file) + '<small>' + file + '</small></figcaption></figure>').join('') + '</section>').join('') +
  '</html>';
await writeFile(directory + '/index.html', html + '\n');
const generation = JSON.parse(await readFile('assets/source/visual-v12/generation.json', 'utf8'));
await writeFile(directory + '/art-report.json', JSON.stringify({ collection: 'visual-v12', generator: generation.tool,
  skill: 'imagegen', originalImages: Object.keys(generation.prompts).map(name => 'assets/source/visual-v12/' + name + '.png'),
  finalAssets: ['pipe', 'front', 'seated', 'facade', 'graffiti'].map(name => 'apps/web/public/assets/visual-v12/' + name + '.webp'),
  prompts: 'assets/source/visual-v12/generation.json', audit: 'assets/source/visual-v12/audit.json',
  screenshots: files, count: files.length }, null, 2) + '\n');
console.log(files.length + ' production screenshots');

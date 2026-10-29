import { writeFile, access } from 'node:fs/promises';

const directory = 'docs/previews/balance-story';
const story = [
  ['bottle-before.png', 'Бутылка на свободном берегу'],
  ['bottle-pickup.png', 'Подбор: наклон героя и подъём бутылки'],
  ['onboarding-960x540.png', 'Обучение перед первым шагом симуляции'],
  ['hud-normal-progress-50.png', 'Нормальное отклонение, фактический прогресс около 50%'],
  ['hud-critical.png', 'Критическое отклонение при удержании вправо'],
  ['progress-100.png', 'Труба пройдена: 100%, начало прежнего выхода'],
];
const sizes = [[360,800],[375,667],[390,844],[568,320],[667,375],[844,390],[915,412],[1230,372],[1920,1080]];
const responsive = sizes.flatMap(([w,h]) => [[`onboarding-${w}x${h}.png`, `Обучение ${w}×${h}`], [`hud-${w}x${h}.png`, `HUD ${w}×${h}`]]);
for (const [file] of [...story, ...responsive]) await access(`${directory}/${file}`);
const figures = items => items.map(([file,caption]) => `<figure><a href="${file}"><img src="${file}" alt="${caption}" loading="lazy"></a><figcaption>${caption}</figcaption></figure>`).join('\n');
await writeFile(`${directory}/index.html`, `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Делать это трезвым — проверка реализации</title>
<style>body{margin:0;padding:24px;background:#111822;color:#ced8e1;font:15px/1.5 Arial,sans-serif}main{max-width:1280px;margin:auto}a{color:#b2c5d5}h1{font:italic 32px Georgia,serif}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px}figure{margin:0;background:#1b2633;border:1px solid #48576a;padding:10px}img{display:block;width:100%;max-height:720px;object-fit:contain}figcaption{padding:10px 0 4px;color:#adbdcb}h2{font:24px Georgia,serif;margin-top:36px}</style>
<main><h1>Делать это трезвым</h1><p>Кадры production-сцены и React UI из браузерных тестов. <a href="../../../README.md#balance-story">Реализация и результаты проверок в README</a>. <a href="report.json">Файлы и отчёт</a>.</p><h2>Сюжет и баланс</h2><section>${figures(story)}</section><h2>Компоновка в девяти размерах</h2><section>${figures(responsive)}</section></main></html>\n`);
console.log(`${directory}/index.html: ${story.length + responsive.length} screenshots`);

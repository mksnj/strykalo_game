// Capture the actual developer viewer plus its canvas animation and an atlas contact sheet.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = 'docs/previews/court-groove-v21';
await mkdir(directory, { recursive: true });
const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: 5176, strictPort: true } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.goto('http://127.0.0.1:5176/');
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: 'Просмотр танца героя' }).click();
  const modal = page.getByRole('dialog', { name: 'Тихий танец' });
  await modal.getByRole('slider', { name: 'Фаза танца' }).fill('0.25');
  await page.screenshot({ path: directory + '/preview-desktop.png' });
  await modal.getByRole('button', { name: 'Сбросить настройки' }).click();
  await page.evaluate(() => {
    const canvas = document.querySelector('.dance-preview canvas'), chunks = [];
    const stream = canvas.captureStream(60), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1800000 });
    recorder.ondataavailable = event => chunks.push(event.data);
    window.shuffleRecording = { recorder, chunks, stream }; recorder.start();
  });
  await modal.getByRole('checkbox', { name: 'Повторять' }).check();
  await modal.getByRole('button', { name: 'Акцент влево' }).click(); await page.waitForTimeout(1500);
  await modal.getByRole('button', { name: 'Акцент вправо' }).click(); await page.waitForTimeout(2100);
  const video = await page.evaluate(async () => {
    const { recorder, chunks, stream } = window.shuffleRecording;
    await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); }); stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: 'video/webm' });
    return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
  });
  await writeFile(directory + '/preview-motion.webm', Buffer.from(video, 'base64'));
  await modal.getByRole('button', { name: 'Сбросить настройки' }).click();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: directory + '/preview-portrait.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1428 });
  await page.evaluate(async () => {
    const { default: d } = await import('/src/game/assets/shuffleLayout.json');
    const image = new Image(); image.src = d.url; await image.decode();
    document.body.innerHTML = '';
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 1428; document.body.append(canvas);
    const g = canvas.getContext('2d'); g.fillStyle = '#25303c'; g.fillRect(0, 0, 1440, 1428); g.font = '12px Arial'; g.textAlign = 'center';
    for (const [row, direction] of ['left', 'right', 'down', 'up'].entries()) for (const [i, key] of d.keys.entries()) {
      const frame = d.frames[direction] + Math.round(key.at * (d.samples - 1));
      const x = i * 160, y = row * 350 + 36;
      g.strokeStyle = '#536170'; g.beginPath(); g.moveTo(x + 10, y + d.anchor.y); g.lineTo(x + 150, y + d.anchor.y); g.stroke();
      g.drawImage(image, frame % d.columns * d.cellWidth, Math.floor(frame / d.columns) * d.cellHeight, d.cellWidth, d.cellHeight, x, y, 160, 272);
      g.fillStyle = '#c1cbd5'; g.fillText(key.phase, x + 80, y + 300); g.fillText(Math.round(key.at * 100) + '%', x + 80, y + 318);
    }
    g.fillStyle = '#c1cbd5';
    for (const [i, label] of ['Влево', 'Вправо', 'Вниз', 'Вверх'].entries()) g.fillText(label + ' — танец на месте, девять фаз', 720, i * 350 + 22);
  });
  await page.screenshot({ path: directory + '/phases.png' });
  await writeFile(directory + '/index.html', `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Тихий танец · v21</title>
<style>body{margin:24px;background:#18232f;color:#d4dbe2;font:16px Arial}img,video{max-width:100%;display:block;margin:16px 0}a{color:#c8dbe9}figure{margin:24px 0}p{max-width:850px;line-height:1.6}</style>
<h1>Тихий танец · v21</h1><p>Танец на месте: вес переходит с ноги на ногу, колени мягко пружинят, плечи следуют за опорой. Руки остаются в карманах. Четыре направления дают разные акценты по 0,72 с; спокойный фоновый цикл в игре занимает 1,2 с. Каждый цикл заканчивается в исходной стойке, перемещения по площадке нет.</p>
<p>Видео записано с canvas режима разработчика в реальном времени; оно показывает увеличенный и игровой размеры. Это предпросмотр анимации, не запись прохождения мини-игры.</p>
<video controls loop muted src="preview-motion.webm"></video><figure><img src="phases.png" alt="Четыре танцевальных акцента по девяти фазам"></figure>
<p><a href="preview-desktop.png">Просмотр на компьютере</a> · <a href="preview-portrait.png">Просмотр на телефоне</a> · <a href="../../../assets/source/court-groove-v21/audit.json">Размеры, прозрачность, SHA-256 и границы всех кадров</a></p>
<figure><img src="desktop-left.png" alt="Танец в сцене"></figure><figure><img src="portrait-right.png" alt="Танец на телефоне"></figure></html>\n`);
  console.log(directory + '/index.html');
} finally { await browser?.close(); await server.close(); }

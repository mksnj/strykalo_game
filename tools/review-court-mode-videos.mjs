import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
const dir = process.argv.includes('--directory') ? process.argv[process.argv.indexOf('--directory') + 1] : 'docs/previews/court-modes-v9';
const videos = JSON.parse(await readFile(`${dir}/videos.json`, 'utf8'));
// Headless Edge's hardware VP9 path can stall on seek on this Windows host.
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--disable-accelerated-video-decode'] }), report = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(resolve(`${dir}/index.html`)).href);
  for (const item of videos) {
    const video = page.locator(`video[src="${item.video}"]`);
    await video.scrollIntoViewIfNeeded();
    await video.evaluate(v => { v.muted = true; v.preload = 'auto'; v.load(); });
    await page.waitForFunction(src => {
      const v = [...document.querySelectorAll('video')].find(v => v.getAttribute('src') === src);
      if (v?.error) throw new Error(v.error.message);
      return v?.readyState >= 2;
    }, item.video, { timeout: 15000 });
    const info = await video.evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, error: v.error?.message ?? null }));
    const samples = [];
    for (let time = .05; time < info.duration; time += 2) {
      await video.evaluate((v, time) => { v.currentTime = time; }, time);
      await page.waitForFunction(({ src, time }) => {
        const v = [...document.querySelectorAll('video')].find(v => v.getAttribute('src') === src);
        return v && !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - time) < .02;
      }, { src: item.video, time }, { timeout: 15000 });
      const file = `${item.video.slice(0, -5)}-playback-${Math.floor(time)}.jpg`;
      await video.screenshot({ path: `${dir}/${file}`, type: 'jpeg', quality: 90 });
      samples.push({ time, file });
    }
    await page.evaluate(({ samples, name }) => {
      document.getElementById('playback-grid')?.remove();
      const grid = document.createElement('div'); grid.id = 'playback-grid';
      grid.style = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;background:#111923;padding:12px';
      grid.innerHTML = samples.map(s => `<figure style="margin:0"><img style="width:100%;height:170px;object-fit:contain" src="${s.file}"><figcaption>${name} · ${s.time.toFixed(2)} с</figcaption></figure>`).join('');
      document.body.append(grid);
    }, { samples, name: item.video });
    await page.locator('#playback-grid img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
    await page.locator('#playback-grid').screenshot({ path: `${dir}/${item.video.slice(0, -5)}-playback-overview.png` });
    report.push({ video: item.video, ...info, decodedSamples: samples.length, samples });
    console.log(`${item.video}: ${info.width}x${info.height} ${info.duration}s, ${samples.length} decoded frames`);
  }
  await writeFile(`${dir}/video-playback.json`, JSON.stringify(report, null, 2));
} finally { await browser.close(); }


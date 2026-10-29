import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
const dir = 'docs/previews/court-spatial-v8';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  await page.goto(pathToFileURL(resolve(`${dir}/index.html`)).href);
  for (const name of ['full-transition', 'active-four-directions']) {
    const video = page.locator(`video[src="${name}.webm"]`);
    await video.scrollIntoViewIfNeeded();
    await video.evaluate(async v => {
      v.muted = true;
      await v.play(); v.pause();
    });
    const info = await video.evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, error: v.error?.message }));
    for (let time = 0; time < info.duration; time += 1) {
      await video.evaluate((v, time) => new Promise(resolve => {
        v.addEventListener('seeked', () => resolve(), { once: true }); v.currentTime = time + .01;
      }), time);
      await video.screenshot({ path: `${dir}/${name}-playback-${String(time).padStart(2, '0')}.png` });
    }
    report.push({ name, ...info, decodedSamples: Math.ceil(info.duration) });
  }
  await writeFile(`${dir}/video-playback.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally { await browser.close(); }

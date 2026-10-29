// Record the real renderer fixture at normal visual speed, without a HUD.
// Run while the browser-test server is available on 5174, or pass another local base URL.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const base = process.argv[2] ?? 'http://127.0.0.1:5174';
  await page.goto(base + '/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  const data = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 1200000 });
    const chunks = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    const start = performance.now();
    while (performance.now() - start < 12000) {
      window.scenePreview.show('pipe', 20 + (performance.now() - start) / 1000, false);
      await new Promise(requestAnimationFrame);
    }
    recorder.stop(); await done; stream.getTracks().forEach(track => track.stop());
    return await new Promise(resolve => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
    });
  });
  const bytes = Buffer.from(data, 'base64');
  await writeFile('docs/previews/fixes-pipe-motion.webm', bytes);
  console.log(`docs/previews/fixes-pipe-motion.webm: ${bytes.length} bytes; 12 seconds, normal visual speed`);
} finally { await browser.close(); }

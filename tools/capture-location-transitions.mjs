// Record production views at their normal transition speed, through the isolated test fixture.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const server = await createServer({ server: { host: '127.0.0.1', port: 5175, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto('http://127.0.0.1:5175/@fs/' + resolve('tests/fixtures/visual.html').replaceAll('\\', '/'));
  await page.waitForFunction(() => 'scenePreview' in window);
  const data = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 1800000 });
    const chunks = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start();
    for (const [scene, seconds] of [['court', 4.8], ['room-entry', 7.2], ['pipe', 3]]) {
      const start = performance.now();
      while (performance.now() - start < seconds * 1000) {
        const progress = (performance.now() - start) / 1000 / seconds;
        window.scenePreview.show(scene, scene === 'pipe' ? 10 + progress * 3 : progress, false);
        await new Promise(requestAnimationFrame);
      }
    }
    recorder.stop(); await done; stream.getTracks().forEach(track => track.stop());
    return await new Promise(resolve => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
    });
  });
  const bytes = Buffer.from(data, 'base64');
  await writeFile('docs/previews/locations-transitions.webm', bytes);
  console.log(`docs/previews/locations-transitions.webm: ${bytes.length} bytes; 15 seconds`);
} finally { await browser.close(); await server.close(); }

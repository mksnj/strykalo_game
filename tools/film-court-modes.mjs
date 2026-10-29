// Actual RunnerScene, unmodified simulation clock, generated stars and real input.
// Capture rendered frames through CDP; encode each 67 ms interval at 1000/67 fps.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = process.argv.includes('--directory') ? process.argv[process.argv.indexOf('--directory') + 1] : 'docs/previews/court-modes-v9';
const server = await createServer({ server: { host: '127.0.0.1', port: 5177, strictPort: true, hmr: false } });
let browser;
const report = [];
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir(directory, { recursive: true });
  for (const [width, height] of [[960, 540], [1920, 1080], [1230, 372], [375, 667]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    const capture = await page.context().newCDPSession(page);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install(); await page.goto('http://127.0.0.1:5177/');
    await page.getByRole('button', { name: 'Начать путь' }).waitFor();
    await page.evaluate(async () => {
      const { RunnerView } = await import('/src/game/views/RunnerView.ts');
      const render = RunnerView.prototype.render;
      RunnerView.prototype.render = function(...args) { window.courtScene = this.scene; return render.apply(this, args); };
    });
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.getByRole('button', { name: 'Начать путь' }).click();
    await page.getByRole('button', { name: 'Понятно, в путь' }).click(); await page.clock.runFor(80);
    await page.evaluate(async pilotPath => {
      const { RunSession } = await import('/src/game/state/RunSession.ts');
      const { RunnerEngine } = await import('/src/game/runner/engine.ts');
      const { starsPilot } = await import(pilotPath);
      const scene = window.courtScene, s = new RunSession(1);
      s.runner = new RunnerEngine(1, { start: 200, end: 500, score: 17, empty: true });
      s.runner.travel = 30000 - 180;
      scene.session = s; scene.lastPhase = 'runner'; scene.accumulator = 0; scene.visualTime = 0;
      const drive = () => {
        const s = scene.session, move = s.phase === 'stars' && s.stars.elapsed < 18 ? starsPilot(s.stars) : { x: 0, y: 0 };
        const keys = { ArrowLeft: move.x < 0, ArrowRight: move.x > 0, ArrowUp: move.y < 0, ArrowDown: move.y > 0 };
        for (const [code, held] of Object.entries(keys)) window.dispatchEvent(new KeyboardEvent(held ? 'keydown' : 'keyup', { code, bubbles: true }));
        scene.captureInput = move;
        requestAnimationFrame(drive);
      };
      requestAnimationFrame(drive);
    }, '/@fs/' + resolve('tests/fixtures/starsPilot.ts').replaceAll('\\', '/'));
    const name = `cycle-${width}x${height}`, frames = `tmp/court-modes-video/${name}`;
    await mkdir(frames, { recursive: true });
    const samples = [], stages = [], seen = new Set();
    let exited = false, tail = 0;
    for (let frame = 0; frame < 1000; frame++) {
      await page.clock.runFor(67);
      const state = await page.evaluate(() => {
        const scene = window.courtScene, s = scene.session, h = scene.runnerView.hero;
        return { phase: s.phase, progress: s.transitionProgress, elapsed: s.stars?.elapsed ?? 0,
          hits: s.stars?.hits ?? 0, logical: s.stars && { x: s.stars.x, y: s.stars.y },
          hero: { x: h.x, y: h.y, size: h.displayHeight }, input: scene.captureInput,
          score: s.score, distance: s.distance, result: s.result?.reason,
          shade: scene.cutShade.alpha + scene.starsView.shade.alpha + scene.arrivalView.shade.alpha };
      });
      samples.push({ time: (frame + 1) * .067, ...state });
      if (state.result) throw new Error(`${name}: unexpected ${state.result} at ${state.elapsed}`);
      let stage;
      if (!seen.has('before') && state.phase === 'runner') stage = 'before';
      if (!seen.has('transition') && state.phase === 'stars-approach' && state.progress >= .60) stage = 'transition';
      if (!seen.has('active') && state.phase === 'stars' && state.elapsed >= 3) stage = 'active';
      if (!seen.has('exit') && state.phase === 'stars-exit' && state.progress >= .07) stage = 'exit';
      if (state.phase === 'stars-exit') exited = true;
      if (!seen.has('return') && exited && state.phase === 'runner') stage = 'return';
      const file = `${frames}/${String(frame).padStart(5, '0')}.jpg`;
      const shot = await capture.send('Page.captureScreenshot', { format: 'jpeg', quality: 90,
        captureBeyondViewport: false, fromSurface: true, optimizeForSpeed: true });
      const pixels = Buffer.from(shot.data, 'base64');
      await writeFile(file, pixels);
      if (stage) {
        const image = `${name}-${stage}.jpg`;
        await writeFile(`${directory}/${image}`, pixels); seen.add(stage);
        stages.push({ stage, image, frame, ...state });
      }
      if (frame % 100 === 0) console.log(`${name}: ${(frame * .067).toFixed(1)}s ${state.phase} active=${state.elapsed.toFixed(2)}`);
      if (exited && state.phase === 'runner' && ++tail >= 23) break;
    }
    if (seen.size !== 5 || errors.length) throw new Error(`${name}: stages=${[...seen]}, errors=${errors}`);
    const video = `${name}.webm`;
    const encode = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1000/67', '-i', `${frames}/%05d.jpg`,
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-deadline', 'realtime', '-cpu-used', '6',
      '-row-mt', '1', '-threads', '2', '-frames:v', String(samples.length), '-crf', '29', '-b:v', '0', `${directory}/${video}`], { stdio: 'inherit' });
    if (encode.status !== 0) throw new Error('ffmpeg: ' + encode.status);
    const directions = [...new Set(samples.filter(s => s.phase === 'stars').map(s => `${s.input.x},${s.input.y}`))];
    const item = { width, height, video, duration: samples.length * .067, stages, directions, errors, samples };
    report.push(item);
    await writeFile(`${directory}/videos.json`, JSON.stringify(report, null, 2));
    console.log(`${name}: saved ${item.duration}s, inputs ${directions}`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }


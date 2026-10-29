import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Position the real scene without changing gameplay or exposing debug controls.
const before = process.argv.includes('--before');
const directory = 'docs/previews/return-street-v12';
const server = await createServer({ server: { host: '127.0.0.1', port: 5178, strictPort: true, hmr: false } });
const report = [];
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir(directory, { recursive: true });
  for (const [width, height] of before ? [[960, 540]] : [[960, 540], [1920, 1080], [1230, 372], [375, 667]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install(); await page.goto('http://127.0.0.1:5178/');
    await page.getByRole('button', { name: 'Начать путь' }).waitFor();
    await page.evaluate(async () => {
      const { RunnerView } = await import('/src/game/views/RunnerView.ts'), render = RunnerView.prototype.render;
      RunnerView.prototype.render = function(...args) { window.courtScene = this.scene; return render.apply(this, args); };
    });
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.getByRole('button', { name: 'Начать путь' }).click();
    await page.getByRole('button', { name: 'Понятно, в путь' }).click(); await page.clock.runFor(80);
    for (const developer of [false, true]) {
      for (const distance of [501, 650, 880, 999]) {
        await page.evaluate(async ({ developer, distance }) => {
          const { RunSession } = await import('/src/game/state/RunSession.ts');
          const { RunnerEngine } = await import('/src/game/runner/engine.ts');
          const s = new RunSession(1, developer);
          s.runner = new RunnerEngine(1, { start: s.route.starsAt, end: s.route.waitingAt,
            distanceScale: s.route.scale, score: 8, empty: true });
          s.runner.travel = distance / s.route.scale * 60; s.phase = 'runner'; s.step = () => {};
          const scene = window.courtScene; scene.session = s; scene.lastPhase = s.phase; scene.accumulator = 0;
        }, { developer, distance });
        await page.clock.runFor(80);
        const geometry = await page.evaluate(() => {
          const a = window.courtScene.runnerView.nightArt, c = window.courtScene.cameras.main;
          return { asphaltTop: a.foundation.y, asphaltBottom: a.foundation.y + a.foundation.height,
            facadeBottom: a.court.y + a.court.height, skyBottom: a.far.y + a.far.height,
            floorLeft: a.foundation.x, floorRight: a.foundation.x + a.foundation.width,
            viewLeft: c.worldView.x, viewRight: c.worldView.right,
            arenaVisible: window.courtScene.starsView.arena.container.visible };
        });
        if (!before) {
          assert.equal(geometry.asphaltTop, geometry.facadeBottom);
          assert.equal(geometry.skyBottom, geometry.asphaltTop);
          assert.equal(geometry.asphaltBottom, 540);
          // Phaser rounds the wide camera viewport to physical pixels.
          assert(geometry.floorLeft <= geometry.viewLeft + 1 && geometry.floorRight >= geometry.viewRight - 1,
            JSON.stringify(geometry));
          assert.equal(geometry.arenaVisible, false);
        }
        let file;
        if (distance === 880 && !developer) {
          file = `${before ? 'before' : 'after'}-${width}x${height}.png`;
          await page.screenshot({ path: `${directory}/${file}` });
        }
        report.push({ width, height, developer, distance, file, geometry });
      }
    }
    assert.deepEqual(errors, []); await page.close();
    console.log(`${width}x${height}: 8 return-street positions checked`);
  }
  await writeFile(`${directory}/${before ? 'before' : 'after'}.json`, JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }

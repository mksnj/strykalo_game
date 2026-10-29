// Real RunnerScene captures. Session positioning is confined to this browser
// harness; the production game has no debug controls or alternate scene.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'docs/previews/court-transitions-v7';
const staticOnly = process.argv.includes('--static');
const server = await createServer({ server: { host: '127.0.0.1', port: 5176, strictPort: true, hmr: false } });
let browser;
const report = [];
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir(directory, { recursive: true });
  for (const [width, height] of staticOnly ? [[960, 540]] : [[960, 540], [1920, 1080], [1230, 372], [375, 667]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.clock.install(); await page.goto('http://127.0.0.1:5176/');
    await page.getByRole('button', { name: 'Начать путь' }).waitFor();
    await page.evaluate(async () => {
      const { RunnerView } = await import('/src/game/views/RunnerView.ts');
      const render = RunnerView.prototype.render;
      RunnerView.prototype.render = function(...args) { window.courtScene = this.scene; return render.apply(this, args); };
    });
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.getByRole('button', { name: 'Начать путь' }).click();
    await page.getByRole('button', { name: 'Понятно, в путь' }).click();
    await page.clock.runFor(80);
    for (const developer of staticOnly ? [false] : [false, true]) {
      const mode = developer ? 'short' : 'normal', prefix = `${mode}-${width}x${height}`;
      await page.evaluate(async developer => {
        const { gameStore } = await import('/src/game/state/store.ts');
        gameStore.menu(); gameStore.start(developer);
      }, developer);
      await page.clock.runFor(40);
      await page.evaluate(async developer => {
        const { RunSession } = await import('/src/game/state/RunSession.ts');
        const { RunnerEngine } = await import('/src/game/runner/engine.ts');
        const { StarsEngine } = await import('/src/game/minigames/stars/StarsEngine.ts');
        const session = new RunSession(1, developer);
        session.runner = new RunnerEngine(1, { start: session.route.balanceAt, end: session.route.starsAt,
          score: 17, empty: true, distanceScale: session.route.scale });
        session.runner.travel = session.route.starsAt * 60;
        session.stars = new StarsEngine(1); session.step = () => {};
        window.courtScene.session = session;
      }, developer);
      const frames = [];
      const position = async (phase, progress, time) => {
        await page.evaluate(({ phase, progress, time }) => {
          const scene = window.courtScene, session = scene.session;
          session.phase = phase;
          session.phaseTime = progress * (phase === 'stars-exit' ? 4.6 : 4.8);
          scene.visualTime = time;
        }, { phase, progress, time });
        await page.clock.runFor(40);
      };
      const shot = async (stage, label) => {
        const file = `${prefix}-${stage}.png`;
        await page.screenshot({ path: `${directory}/${file}` });
        const geometry = await page.evaluate(() => {
          const s = window.courtScene, c = s.starsView.scenery, h = s.runnerView.hero, d = s.runnerView.nightArt;
          return { phase: s.session.phase, progress: s.session.transitionProgress, offset: c.surface.x,
            hero: { x: h.x, y: h.y, size: h.displayHeight },
            house: { x: c.house.x, scale: c.house.scaleX, bounds: c.house.getBounds() },
            hoop: { x: c.hoop.x, scale: c.hoop.scaleX, bounds: c.hoop.getBounds() },
            foundation: { top: d.foundation.y, bottom: d.foundation.y + d.foundation.height,
              travel: d.foundation.tilePositionX * d.foundation.tileScaleX - d.foundation.x },
            camera: { scrollX: s.cameras.main.scrollX, zoom: s.cameras.main.zoom } };
        });
        frames.push({ stage, label, file, geometry });
      };
      await position('stars-approach', .4, 1920);
      // Only this review image hides the DOM HUD; restore it for the sequence.
      const hide = await page.addStyleTag({ content: '.top-bar,.hud,.transition-caption,.portrait-guide{visibility:hidden!important}' });
      await shot('static', 'Статичный кадр без HUD'); await hide.evaluate(el => el.remove());
      if (!staticOnly) {
        await page.evaluate(() => {
          const s = window.courtScene.session;
          s.phase = 'runner'; s.phaseTime = 0; s.runner.travel -= 300;
        });
        await page.clock.runFor(40); await shot('approach', 'Приближение по улице');
        await page.evaluate(() => { window.courtScene.session.runner.travel += 300; });
        for (const percent of [0, 20, 40, 60, 80, 100]) {
          await position('stars-approach', percent / 100, percent * 48);
          await shot(`entry-${percent}`, `Вход ${percent}%`);
        }
        await position('stars', 0, 4800);
        // Use actual engine steps to show a live shower, without changing hits.
        await page.evaluate(() => {
          const engine = window.courtScene.session.stars;
          for (let tick = 0; tick < 60 && !engine.outcome; tick++) engine.step(1, 0);
        });
        await page.clock.runFor(40); await shot('active', 'Активная мини-игра');
        await page.evaluate(() => {
          const session = window.courtScene.session, stars = session.stars;
          stars.x = 650; stars.y = 420; stars.tick = 18 * 120; stars.outcome = 'narrative-failure';
          // Advance the real narrative handoff: it owns creation of the next
          // runner segment. Skipping it would falsely jump back to autumn.
          session.phase = 'stars-failure'; session.phaseTime = 3.8;
          Object.getPrototypeOf(session).step.call(session);
        });
        for (const percent of [0, 50, 100]) {
          await position('stars-exit', percent / 100, 10000 + percent * 46);
          await shot(`exit-${percent}`, `Выход ${percent}%`);
        }
        await page.evaluate(() => {
          const s = window.courtScene.session; s.phase = 'runner'; s.phaseTime = 0;
          delete s.step;
          // Real RunSession owns the handoff and checkpoint.
          s.phase = 'stars-exit'; s.phaseTime = 4.6 - 1 / 120;
          s.step(); s.step = () => {};
        });
        await page.clock.runFor(40); await shot('runner', 'Возвращение в раннер');
        // Dense real render frames for reviewing motion (animated in the gallery).
        for (const [phase, count, duration] of width === 960 ? [['stars-approach', 25, 4800], ['stars-exit', 25, 4600]] : []) {
          for (let i = 0; i <= count; i++) {
            // Recreate the runner so its readonly segment metadata is correct.
            if (i === 0) await page.evaluate(async phase => {
              const { RunnerEngine } = await import('/src/game/runner/engine.ts');
              const s = window.courtScene.session;
              s.runner = new RunnerEngine(1, { start: s.route.balanceAt, end: s.route.starsAt,
                score: 17, empty: true, distanceScale: s.route.scale });
              s.runner.travel = s.route.starsAt * 60;
              if (phase === 'stars-exit') {
                s.phase = 'stars-failure'; s.phaseTime = 3.8;
                Object.getPrototypeOf(s).step.call(s);
              }
            }, phase);
            await position(phase, i / count, i / count * duration);
            const file = `${prefix}-motion-${phase}-${String(i).padStart(2, '0')}.png`;
            await page.screenshot({ path: `${directory}/${file}` });
          }
        }
      }
      report.push({ width, height, developer, prefix, frames, errors });
      console.log(`${prefix}: ${frames.length} review frames, ${errors.length} browser errors`);
    }
    await page.close();
  }
  await writeFile(`${directory}/${staticOnly ? 'static-capture' : 'capture'}.json`, JSON.stringify(report, null, 2) + '\n');
} finally { await browser?.close(); await server.close(); }

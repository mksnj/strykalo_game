// Real production RunnerScene. The harness positions sessions and records input;
// there is no alternate scene, screenshot camera or production debug interface.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = 'docs/previews/court-spatial-v8';
const mockups = process.argv.includes('--mockups');
const movies = process.argv.includes('--videos');
const server = await createServer({ server: { host: '127.0.0.1', port: 5176, strictPort: true, hmr: false } });
let browser;
const report = [];
async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); await page.goto('http://127.0.0.1:5176/');
  await page.getByRole('button', { name: 'Начать путь' }).waitFor();
  await page.evaluate(async () => {
    const { RunnerView } = await import('/src/game/views/RunnerView.ts');
    const original = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args) { window.courtScene = this.scene; return original.apply(this, args); };
  });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.getByRole('button', { name: 'Понятно, в путь' }).click();
  await page.clock.runFor(80);
  return { page, errors };
}
async function reset(page, developer = false, frozen = true) {
  await page.evaluate(async ({ developer, frozen }) => {
    const { gameStore } = await import('/src/game/state/store.ts');
    gameStore.menu(); gameStore.start(developer);
  }, { developer, frozen });
  await page.clock.runFor(40);
  await page.evaluate(async ({ developer, frozen }) => {
    const { RunSession } = await import('/src/game/state/RunSession.ts');
    const { RunnerEngine } = await import('/src/game/runner/engine.ts');
    const { StarsEngine } = await import('/src/game/minigames/stars/StarsEngine.ts');
    const s = new RunSession(1, developer);
    s.runner = new RunnerEngine(1, { start: s.route.balanceAt, end: s.route.starsAt,
      score: 17, empty: true, distanceScale: s.route.scale });
    s.runner.travel = s.route.starsAt * 60; s.stars = new StarsEngine(1);
    s.phase = 'stars-approach'; s.phaseTime = 0;
    if (frozen) s.step = () => {};
    const scene = window.courtScene;
    scene.session = s; scene.accumulator = 0; scene.lastPhase = s.phase; scene.visualTime = 0;
  }, { developer, frozen });
}
async function position(page, phase, progress = 0) {
  await page.evaluate(({ phase, progress }) => {
    const scene = window.courtScene, s = scene.session;
    s.phase = phase; s.phaseTime = progress * (phase === 'stars-exit' ? 4.6 : 4.8);
    scene.visualTime = progress * 4800;
  }, { phase, progress });
  await page.clock.runFor(40);
}
async function diagnostic(page, visible) {
  await page.evaluate(async visible => {
    const scene = window.courtScene;
    if (!scene.arenaDiagnostic) {
      const { COURT_ARENA: a } = await import('/src/game/views/courtSpace.ts');
      const g = scene.add.graphics().setDepth(90);
      g.lineStyle(1, 0xb9d4d8, .85).strokeRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      for (const x of [a.left, a.right]) for (const y of [a.top, a.bottom]) {
        g.lineStyle(2, 0xe1c28a).strokeCircle(x, y, 7);
        g.lineBetween(x - 10, y, x + 10, y).lineBetween(x, y - 10, x, y + 10);
      }
      scene.arenaDiagnostic = g;
    }
    scene.arenaDiagnostic.setVisible(visible);
  }, visible);
  await page.clock.runFor(40);
}
async function inspect(page) {
  return page.evaluate(async () => {
    const scene = window.courtScene, s = scene.session, h = scene.runnerView.hero;
    const camera = scene.cameras.main, scenery = scene.starsView.scenery;
    const { courtCameraFrame, COURT_ARENA, COURT_IMPACT } = await import('/src/game/views/courtSpace.ts');
    return { phase: s.phase, progress: s.transitionProgress, elapsed: s.stars?.elapsed,
      logical: s.stars && { x: s.stars.x, y: s.stars.y }, hero: { x: h.x, y: h.y, size: h.displayHeight },
      arena: COURT_ARENA, impact: COURT_IMPACT, offset: scenery.surface.x,
      camera: { ...courtCameraFrame(s.phase, s.transitionProgress, scene.scale.width === 720),
        x: camera.worldView.x, y: camera.worldView.y, width: camera.worldView.width,
        height: camera.worldView.height, zoom: camera.zoom },
      canvas: scene.game.canvas.getBoundingClientRect().toJSON(),
      hoop: scenery.hoop.getBounds(), house: scenery.house.getBounds(),
      score: s.score, distance: s.distance, shared: scene.runnerView.hero === scene.starsView.hero,
      shade: scene.cutShade.alpha + scene.starsView.shade.alpha + scene.arrivalView.shade.alpha };
  });
}
async function shot(page, prefix, stage, label, frames) {
  const file = `${prefix}-${stage}.png`;
  await page.screenshot({ path: `${directory}/${file}` });
  frames.push({ stage, label, file, geometry: await inspect(page) });
}
async function narrativeExit(page) {
  await page.evaluate(() => {
    const s = window.courtScene.session;
    s.stars.x = 650; s.stars.y = 420; s.stars.tick = 18 * 120; s.stars.outcome = 'narrative-failure';
    s.phase = 'stars-failure'; s.phaseTime = 3.8;
    Object.getPrototypeOf(s).step.call(s);
  });
}
async function film(page, name, seconds, advance) {
  const dir = `tmp/court-spatial-video/${name}`; await mkdir(dir, { recursive: true });
  const samples = [];
  for (let frame = 0; frame <= seconds * 20; frame++) {
    if (advance) await advance(frame);
    await page.clock.runFor(50);
    await page.screenshot({ path: `${dir}/${String(frame).padStart(5, '0')}.png` });
    if (frame % 10 === 0) samples.push(await inspect(page));
  }
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', `${dir}/%05d.png`,
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-deadline', 'realtime', '-cpu-used', '6', '-row-mt', '1', '-threads', '2',
    '-crf', '30', '-b:v', '0', `${directory}/${name}.webm`], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg ${name}: ${result.status}`);
  await writeFile(`${directory}/${name}.json`, JSON.stringify(samples, null, 2));
}
try {
  await server.listen(); browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir(directory, { recursive: true });
  if (movies) {
    const { page, errors } = await open(960, 540);
    await reset(page, false, false);
    // Entry and exit run through RunSession at their actual durations. The
    // narrative hit uses the real collision branch at an eligible active time.
    await film(page, 'full-transition', 15.5, async frame => {
      if (frame === 118) await page.evaluate(() => {
        const s = window.courtScene.session, e = s.stars;
        e.tick = 18 * 120 - 1;
        e.stars = [{ id: -1, x: e.x, y: e.y, age: 0, warning: 0, fall: 0 }];
        s.step();
      });
    });
    await reset(page, false, false);
    await position(page, 'stars');
    await page.evaluate(async pilotPath => {
      const { starsPilot } = await import(pilotPath);
      const scene = window.courtScene;
      scene.inputTrace = [];
      const drive = () => {
        const s = scene.session, move = s.phase === 'stars' ? starsPilot(s.stars) : { x: 0, y: 0 };
        const keys = { ArrowLeft: move.x < 0, ArrowRight: move.x > 0, ArrowUp: move.y < 0, ArrowDown: move.y > 0 };
        for (const [code, held] of Object.entries(keys)) window.dispatchEvent(new KeyboardEvent(held ? 'keydown' : 'keyup', { code, bubbles: true }));
        scene.inputTrace.push({ x: move.x, y: move.y, time: s.stars.elapsed, px: s.stars.x, py: s.stars.y });
        requestAnimationFrame(drive);
      };
      requestAnimationFrame(drive);
    }, '/@fs/' + resolve('tests/fixtures/starsPilot.ts').replaceAll('\\', '/'));
    await film(page, 'active-four-directions', 18);
    const trace = await page.evaluate(() => window.courtScene.inputTrace);
    await writeFile(`${directory}/active-input.json`, JSON.stringify({ errors, trace }, null, 2));
    console.log(`Videos captured; directions: ${JSON.stringify([...new Set(trace.map(p => `${p.x},${p.y}`))])}; errors: ${errors.length}`);
    await page.close();
  } else for (const [width, height] of mockups ? [[960, 540]] : [[960, 540], [1920, 1080], [1230, 372], [375, 667], [390, 844]]) {
    const { page, errors } = await open(width, height);
    for (const developer of mockups ? [false] : [false, true]) {
      await reset(page, developer);
      const prefix = `${developer ? 'short' : 'normal'}-${width}x${height}`, frames = [];
      const hide = await page.addStyleTag({ content: '.top-bar,.hud,.transition-caption,.portrait-guide{visibility:hidden!important}' });
      await position(page, 'stars-approach', 0); await shot(page, prefix, 'mock-approach', 'Макет: подход', frames);
      await position(page, 'stars-approach', .55); await shot(page, prefix, 'mock-middle', 'Макет: вход в глубину', frames);
      await position(page, 'stars'); await diagnostic(page, true);
      await shot(page, prefix, 'mock-arena', 'Макет: арена и допустимые крайние позиции', frames);
      await diagnostic(page, false); await hide.evaluate(el => el.remove());
      if (!mockups) {
        await page.evaluate(() => { const s = window.courtScene.session; s.runner.travel -= 300; });
        await position(page, 'runner'); await shot(page, prefix, '01-approach', 'Подход по улице', frames);
        await page.evaluate(() => { window.courtScene.session.runner.travel += 300; });
        for (const [i, p] of [0, .25, .5, .75, 1].entries()) {
          await position(page, 'stars-approach', p); await shot(page, prefix, `0${i + 2}-entry-${p * 100}`, `Вход ${p * 100}%`, frames);
        }
        await position(page, 'stars');
        await page.evaluate(() => { const e = window.courtScene.session.stars; for (let i = 0; i < 60; i++) e.step(1, 0); });
        await page.clock.runFor(40); await shot(page, prefix, '07-active', 'Активная мини-игра', frames);
        // Each edge is reached using real keyboard input and the unchanged
        // StarsEngine clamp. Isolate movement with a late warning fixture;
        // the active video exercises the original generated shower separately.
        for (const [edge, key] of [['top', 'ArrowUp'], ['bottom', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']]) {
          await page.evaluate(async () => {
            const { STARS_START } = await import('/src/game/config.ts');
            const s = window.courtScene.session, e = s.stars;
            e.x = STARS_START.x; e.y = STARS_START.y; e.outcome = null;
            e.stars = [{ id: -2, x: 480, y: 420, age: 0, warning: 30, fall: 1 }];
            e.spawnCredit = -1000000;
            delete s.step;
          });
          await page.locator('canvas').click({ force: true });
          await page.keyboard.down(key); await page.clock.runFor(1800); await page.keyboard.up(key);
          await diagnostic(page, true); await shot(page, prefix, `edge-${edge}`, `Герой у границы: ${edge}`, frames); await diagnostic(page, false);
          await page.evaluate(() => { window.courtScene.session.step = () => {}; });
        }
        await narrativeExit(page);
        for (const [i, p] of [0, .5, 1].entries()) {
          await position(page, 'stars-exit', p); await shot(page, prefix, `1${i + 2}-exit-${p * 100}`, `Выход ${p * 100}%`, frames);
        }
        await page.evaluate(() => {
          const s = window.courtScene.session; s.phaseTime = 4.6;
          Object.getPrototypeOf(s).step.call(s);
        });
        await page.clock.runFor(40); await shot(page, prefix, '15-runner', 'Продолжение раннера', frames);
      }
      report.push({ width, height, developer, prefix, frames, errors });
      console.log(`${prefix}: ${frames.length} frames, ${errors.length} errors`);
    }
    await page.close();
  }
  if (!movies) {
    await writeFile(`${directory}/${mockups ? 'mockups' : 'capture'}.json`, JSON.stringify(report, null, 2));
    if (!mockups) await writeFile(`${directory}/mockups.json`, JSON.stringify(report.filter(c => c.width === 960 && !c.developer)
      .map(c => ({ ...c, frames: c.frames.filter(f => f.stage.startsWith('mock-')) })), null, 2));
  }
} finally { await browser?.close(); await server.close(); }

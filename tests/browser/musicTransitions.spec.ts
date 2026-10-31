import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = '/@fs/' + resolve('tests/fixtures/audio.html').replaceAll('\\', '/');
const status = (page: Page) => page.evaluate(() => (window as any).audioPreview.manager.status);
async function open(page: Page) {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await page.evaluate(() => (window as any).audioPreview.manager.enableMusicDiagnostics());
  await expect.poll(async () => (await status(page)).music[0]?.position ?? 0, { timeout: 10000 }).toBeGreaterThan(.1);
  await expect.poll(async () => (await status(page)).music[0]?.gain, { timeout: 10000 }).toBeCloseTo(.77, 5);
}
async function settled(page: Page) {
  await expect.poll(async () => (await status(page)).music.length, { timeout: 10000 }).toBe(1);
}
async function save(name: string, report: unknown) {
  await mkdir('docs/previews/music-transitions', { recursive: true });
  await writeFile(`docs/previews/music-transitions/${name}.json`, JSON.stringify(report, null, 2));
}

/** Samples the actual AudioManager -> HTMLAudioElement -> GainNode -> mixer chain. */
async function capture(page: Page, expression: 'fixture' | 'game') {
  return page.evaluate(async expression => {
    const manager = expression === 'game' ? (window as any).transitionScene.audio : (window as any).audioPreview.manager;
    const outgoing = manager.status.music.find((v: any) => v.fading);
    if (!outgoing) throw new Error('No outgoing stream');
    const raw = [...manager.music.voices].find((v: any) => v.id === outgoing.id) as any;
    const element = raw.audio;
    const rows: any[] = [];
    await new Promise<void>(resolve => {
      const timer = setInterval(() => {
        const state = manager.status;
        rows.push({ time: state.time, since: state.time - outgoing.fadeOutStartedAt,
          bus: state.musicVolume, master: state.master, music: state.music,
          outgoingPaused: element.paused, outgoingSrc: element.getAttribute('src'), outgoingPosition: element.currentTime });
        if (state.time >= outgoing.fadeOutEndsAt + .15) { clearInterval(timer); resolve(); }
      }, 50);
    });
    return { outgoing, rows, events: manager.status.musicEvents,
      released: element.paused && !element.getAttribute('src') && !manager.music.voices.has(raw) };
  }, expression);
}

function verify(report: any) {
  const { outgoing, rows, events } = report;
  expect(outgoing.fadeOutEndsAt - outgoing.fadeOutStartedAt).toBeCloseTo(6, 4);
  const during = rows.filter((r: any) => r.since < 5.95);
  expect(during.length).toBeGreaterThan(70);
  let oldGain = outgoing.gain, newGain = 0;
  const signalErrors: number[] = [];
  for (const row of during) {
    const old = row.music.find((v: any) => v.id === outgoing.id);
    const next = row.music.find((v: any) => !v.fading && v.started);
    expect(old, `source missing at ${row.since}`).toBeDefined();
    expect(row.outgoingPaused).toBe(false); expect(row.outgoingSrc).toBeTruthy();
    expect(old.gain).toBeLessThanOrEqual(oldGain + .002);
    expect(next.gain).toBeGreaterThanOrEqual(newGain - .002);
    // Bound the power of both gain coefficients, independent of varying song samples.
    expect((old.gain / .77) ** 2 + (next.gain / .77) ** 2).toBeLessThanOrEqual(1.002);
    oldGain = old.gain; newGain = next.gain;
    if (row.since > .3 && old.inputRms > .001) {
      // Two AnalyserNodes can expose adjacent render quanta at a transient.
      // Compare the distribution over the whole fade, rather than one unaligned RMS window.
      signalErrors.push(Math.abs(old.outputRms / old.inputRms - old.gain));
    }
  }
  signalErrors.sort((a, b) => a - b);
  expect(signalErrors.length).toBeGreaterThan(40);
  expect(signalErrors[Math.floor(signalErrors.length / 2)]).toBeLessThan(.02);
  expect(signalErrors[Math.floor(signalErrors.length * .9)]).toBeLessThan(.08);
  for (let second = 1; second <= 5; second++) {
    const row = rows.find((r: any) => Math.abs(r.since - second) < .09);
    expect(row, `sample at ${second}s`).toBeDefined();
    expect(row.outgoingPosition).toBeGreaterThan(outgoing.position + second - .2);
  }
  const release = events.find((e: any) => e.id === outgoing.id && e.type === 'released');
  expect(release.reason).toBe('fade-complete');
  expect(release.time).toBeGreaterThanOrEqual(outgoing.fadeOutEndsAt);
  expect(release.gain).toBeLessThan(.0001);
  expect(report.released).toBe(true);
}

test('six-second real stream attenuation, incoming gain, signal RMS and release', async ({ page }) => {
  test.setTimeout(25000);
  await open(page);
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('runner-neighborhood'));
  await page.waitForFunction(() => (window as any).audioPreview.manager.status.music.some((v: any) => v.fading));
  const report = await capture(page, 'fixture'); await save('stream-envelope', report); verify(report);
});

test('rhythm entry, retry and exit use quarter-length fades without early stops', async ({ page }) => {
  test.setTimeout(25000);
  await open(page);
  const reports = [];
  for (const action of ['stars', 'restart', 'stars-exit']) {
    const previous = (await status(page)).music.find((v: any) => !v.fading && v.started);
    await page.evaluate(action => {
      const manager = (window as any).audioPreview.manager;
      if (action === 'restart') manager.restartMusic(); else manager.setScene(action);
    }, action);
    await page.waitForFunction(id => (window as any).audioPreview.manager.status.music.find((v: any) => v.id === id)?.fading, previous.id);
    const report = await page.evaluate(async id => {
      const manager = (window as any).audioPreview.manager;
      const old = manager.status.music.find((v: any) => v.id === id);
      const next = manager.status.music.find((v: any) => !v.fading);
      const incoming = [...manager.music.voices].find((v: any) => v.id === next.id) as any;
      const incomingEnvelopeSeconds = incoming.envelope.end - incoming.envelope.start;
      const element = ([...manager.music.voices].find((v: any) => v.id === id) as any).audio;
      const rows: any[] = [];
      await new Promise<void>(resolve => {
        const timer = setInterval(() => {
          const state = manager.status;
          rows.push({ since: state.time - old.fadeOutStartedAt, paused: element.paused, music: state.music });
          if (state.time > old.fadeOutEndsAt + .1) { clearInterval(timer); resolve(); }
        }, 40);
      });
      return { old, next, incomingEnvelopeSeconds, rows, events: manager.status.musicEvents };
    }, previous.id);
    expect(report.old.fadeOutEndsAt - report.old.fadeOutStartedAt).toBeCloseTo(1.5, 5);
    expect(report.incomingEnvelopeSeconds).toBeCloseTo(.875, 5);
    const during = report.rows.filter((row: any) => row.since < 1.45);
    expect(during.length).toBeGreaterThan(15);
    let gain = report.old.gain, incomingGain = report.next.gain;
    for (const row of during) {
      const voice = row.music.find((v: any) => v.id === previous.id);
      expect(row.paused).toBe(false); expect(voice.gain).toBeLessThanOrEqual(gain + .002); gain = voice.gain;
      const next = row.music.find((v: any) => v.id === report.next.id);
      expect(next.gain).toBeGreaterThanOrEqual(incomingGain - .002); incomingGain = next.gain;
    }
    const release = report.events.find((event: any) => event.id === previous.id && event.type === 'released');
    expect(release.time).toBeGreaterThanOrEqual(report.old.fadeOutEndsAt); expect(release.gain).toBe(0);
    reports.push({ action, ...report });
  }
  await mkdir('docs/previews/residual-adjustments', { recursive: true });
  await writeFile('docs/previews/residual-adjustments/rhythm-fades.json', JSON.stringify(reports, null, 2));
});

test('buffering and retry keep the outgoing stream audible until replacement starts', async ({ page }) => {
  test.setTimeout(30000);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/06-bespolezno.mp3', async route => { await gate; await route.continue(); });
  await open(page);
  const old = (await status(page)).music[0];
  await page.evaluate(() => { const m = (window as any).audioPreview.manager; m.setScene('stars'); m.restartMusic(); });
  await page.waitForTimeout(2200);
  const waiting = (await status(page)).music.find((v: any) => v.id === old.id);
  expect(waiting.fading).toBe(false); expect(waiting.paused).toBe(false); expect(waiting.gain).toBeCloseTo(old.gain, 3);
  expect(waiting.position).toBeGreaterThan(old.position + 1.8);
  release();
  await page.waitForFunction(() => (window as any).audioPreview.manager.status.music.some((v: any) => v.fading));
  await settled(page);
  expect((await status(page)).music[0].url).toContain('06-bespolezno');
});

test('pause freezes both playheads, gain envelopes and cleanup deadlines', async ({ page }) => {
  test.setTimeout(25000);
  await open(page);
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('runner-neighborhood'));
  await page.waitForFunction(() => (window as any).audioPreview.manager.status.music.some((v: any) => v.fading));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).audioPreview.manager.pause());
  await expect.poll(async () => (await status(page)).state).toBe('suspended');
  const frozen = await status(page);
  await page.waitForTimeout(1000);
  const paused = await status(page);
  expect(paused.time).toBe(frozen.time);
  expect(paused.music).toHaveLength(2);
  for (let i = 0; i < 2; i++) {
    expect(paused.music[i].gain).toBeCloseTo(frozen.music[i].gain, 5);
    expect(paused.music[i].position).toBeCloseTo(frozen.music[i].position, 2);
  }
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await page.waitForTimeout(250);
  const resumed = await status(page);
  expect(resumed.music.find((v: any) => v.fading).gain).toBeLessThan(frozen.music.find((v: any) => v.fading).gain);
  await settled(page);
  const release = (await status(page)).musicEvents.find((e: any) => e.type === 'released' && e.reason === 'fade-complete');
  expect(release.time).toBeGreaterThanOrEqual(release.end);
});

test('denied mobile autoplay leaves the old song up until the next user gesture', async ({ page }) => {
  test.setTimeout(25000);
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      if (this.src.includes('02-o-brat') && !(window as any).allowNextSong) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
      return play.call(this);
    };
  });
  await open(page);
  const old = (await status(page)).music[0];
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('runner-neighborhood'));
  await page.waitForTimeout(1500);
  const waiting = (await status(page)).music.find((v: any) => v.id === old.id);
  expect(waiting.fading).toBe(false); expect(waiting.gain).toBeGreaterThan(.76); expect(waiting.paused).toBe(false);
  await page.evaluate(() => { (window as any).allowNextSong = true; });
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await page.waitForFunction(() => (window as any).audioPreview.manager.status.music.some((v: any) => v.fading));
  await settled(page);
});

test.describe('mobile Web Audio compatibility', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  test('the real fade works without cancelAndHoldAtTime', async ({ page }) => {
    test.setTimeout(25000);
    await page.addInitScript(() => { (AudioParam.prototype as any).cancelAndHoldAtTime = undefined; });
    await open(page);
    await page.evaluate(() => (window as any).audioPreview.manager.setScene('runner-neighborhood'));
    await page.waitForFunction(() => (window as any).audioPreview.manager.status.music.some((v: any) => v.fading));
    const report = await capture(page, 'fixture'); await save('mobile-envelope', report); verify(report);
  });
});

test('rapid scenes preserve deadlines and continuous levels; endRun frees every stream', async ({ page }) => {
  test.setTimeout(30000);
  await open(page);
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('runner-neighborhood'));
  await page.waitForFunction(() => (window as any).audioPreview.manager.status.music.some((v: any) => v.fading));
  await page.waitForTimeout(1300);
  const before = await status(page), first = before.music.find((v: any) => v.fading);
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('balance'));
  await page.waitForFunction(() => (window as any).audioPreview.manager.status.music.filter((v: any) => v.started).length === 3);
  const after = (await status(page)).music.find((v: any) => v.id === first.id);
  expect(after.fadeOutEndsAt).toBe(first.fadeOutEndsAt); expect(after.gain).toBeGreaterThan(0);
  expect(Math.abs(after.gain - first.gain)).toBeLessThan(.1);
  await settled(page);
  const old = (await status(page)).music[0];
  await page.evaluate(() => (window as any).audioPreview.manager.endRun());
  await page.waitForTimeout(3000);
  const tail = (await status(page)).music[0]; expect(tail.paused).toBe(false);
  expect(tail.gain).toBeLessThan(old.gain * .6); expect(tail.gain).toBeGreaterThan(old.gain * .35);
  await expect.poll(async () => (await status(page)).music.length, { timeout: 8000 }).toBe(0);
  const events = (await status(page)).musicEvents.filter((e: any) => e.type === 'released' && e.reason === 'fade-complete');
  expect(events.length).toBe(3);
  for (const event of events) { expect(event.time).toBeGreaterThanOrEqual(event.end); expect(event.gain).toBeLessThan(.0001); }
});

test('all story cues share the graceful path, while room rest starts the finale stream', async ({ page }) => {
  test.setTimeout(100000);
  await open(page);
  const transitions = [];
  for (const cue of ['runner-neighborhood', 'pipe-approach', 'pipe-exit', 'stars-intro', 'stars', 'stars-exit',
    'runner-storm', 'room-storm', 'room-approach', 'waiting', 'room-rest', 'room-exit', 'final-run', 'ending']) {
    const before = (await status(page)).music[0];
    await page.evaluate(cue => (window as any).audioPreview.manager.setScene(cue), cue);
    await page.waitForTimeout(100);
    const state = await status(page);
    const old = state.music.find((v: any) => v.id === before.id);
    expect(old).toBeDefined(); expect(old.paused).toBe(false);
    if (state.music.length > 1) {
      await page.waitForFunction(id => (window as any).audioPreview.manager.status.music.find((v: any) => v.id === id)?.fading, before.id);
      const fading = (await status(page)).music.find((v: any) => v.id === before.id);
      expect(fading.fadeOutEndsAt - fading.fadeOutStartedAt).toBeCloseTo(['stars', 'stars-exit'].includes(cue) ? 1.5 : 6);
      await settled(page);
    } else expect(old.id).toBe(before.id);
    transitions.push({ cue, before: before.url, after: (await status(page)).music[0].url, events: (await status(page)).musicEvents.slice(-4) });
  }
  await save('story-cues', transitions);
});

test('real first run: Ускользает -> О, брат at distance 100, without changing simulation', async ({ page }) => {
  test.setTimeout(45000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) {
      (window as any).transitionScene = (this as any).scene;
      return render.apply(this, args as any);
    };
  });
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.getByRole('button', { name: 'Понятно, в путь' }).click();
  await page.waitForFunction(() => (window as any).transitionScene?.audio.status.music[0]?.started);
  await page.evaluate(() => {
    const scene = (window as any).transitionScene;
    scene.audio.enableMusicDiagnostics();
    // Automated input jumps via the existing controller; no physics, speed or layout edits.
    const runner = scene.session.runner, step = runner.step.bind(runner);
    runner.step = () => {
      const next = runner.objects.find((o: any) => o.kind !== 'tape' && !o.hit && o.x > runner.travel + 125 && o.x - runner.travel - 180 < 95);
      if (next && runner.player.grounded) { runner.press(); runner.release(); }
      step();
    };
  });
  await page.waitForFunction(() => (window as any).transitionScene.audio.status.music.some((v: any) => v.fading), undefined, { timeout: 30000 });
  const boundary = await page.evaluate(() => {
    const scene = (window as any).transitionScene;
    return { distance: scene.session.distance, speed: scene.session.runner.speed, state: scene.audio.status };
  });
  expect(boundary.distance).toBeGreaterThanOrEqual(100); expect(boundary.distance).toBeLessThan(102);
  expect(boundary.speed).toBe(300);
  expect(boundary.state.music.find((v: any) => v.fading).url).toContain('01-uskolszaet');
  expect(boundary.state.music.find((v: any) => !v.fading).url).toContain('02-o-brat');
  const report = await capture(page, 'game'); await save('first-run', { boundary, ...report }); verify(report);
});

import { test, expect as baseExpect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const fixture = '/@fs/' + resolve('tests/fixtures/audio.html').replaceAll('\\', '/');
const expect = baseExpect.configure({ timeout: 10000 });
const musicFiles = (page: Page, phase: string): Promise<string[]> => page.evaluate(async phase => {
  const path = '/src/game/audio/catalog.ts';
  const { MUSIC, soundscape } = await import(/* @vite-ignore */ path);
  return MUSIC[soundscape(phase).music].urls;
}, phase);
test('повторяющиеся эффекты не наслаиваются; мобильный autoplay повторяется следующим жестом', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let blocked = true;
    HTMLMediaElement.prototype.play = function() {
      if (blocked) { blocked = false; return Promise.reject(new DOMException('Жест необходим', 'NotAllowedError')); }
      return play.call(this);
    };
  });
  await page.goto(fixture); await page.getByRole('button', { name: 'Воспроизвести' }).click();
  // A denied media play remains available for the next explicit gesture.
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.manager.status.music[0]?.position ?? 0)).toBeGreaterThan(.1);
  const counts = await page.evaluate(async () => {
    const manager = (window as any).audioPreview.manager;
    await Promise.all(Array.from({ length: 20 }, () => manager.effect('gust')));
    const first = manager.voices.size;
    await Promise.all(Array.from({ length: 20 }, () => manager.effect('gust')));
    return { first, second: manager.voices.size, active: [...manager.activeEffects], errors: manager.status.errors };
  });
  expect(counts.first).toBe(1); expect(counts.second).toBe(1);
  expect(counts.active).toEqual(['gust']); expect(counts.errors).toEqual([]);
});
test('аудио: все OGG/MP3/WAV декодируются без тишины и клиппинга', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(fixture);
  await page.waitForFunction(() => 'audioPreview' in window);
  const report = await page.evaluate(() => (window as any).audioPreview.decodeAll());
  expect(report).toHaveLength(48); // 46 stock OGG/MP3 files plus the existing rain and thunder WAVs.
  for (const file of report) {
    expect(file.seconds, file.url).toBeGreaterThan(.1);
    expect(file.channels, file.url).toBe(file.url.includes('/visual-v12/') ? 1 : 2);
    expect(file.peak, file.url).toBeLessThan(.95);
    expect(file.rms, file.url).toBeGreaterThan(.003);
  }
  await writeFile('docs/previews/audio-files-audit.json', JSON.stringify(report, null, 2));
});

test('аудио: реальные воспроизведение, переходы, пауза, громкость, mute и освобождение', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(fixture);
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview?.manager.status.state)).toBe('locked');
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  const status = () => page.evaluate(() => (window as any).audioPreview.manager.status);
  await expect.poll(async () => (await status()).music.length).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.rms())).toBeGreaterThan(.005);
  await page.evaluate(() => (window as any).audioPreview.record());
  const report = [];
  for (const phase of ['balance', 'stars', 'waiting', 'final-run', 'ending', 'runner']) {
    await page.evaluate(phase => (window as any).audioPreview.manager.setScene(phase), phase);
    await expect.poll(async () => (await status()).music.length).toBe(1);
    await expect.poll(async () => (await status()).music[0]?.gain ?? 0).toBeGreaterThan(.7);
    const current = await status(); report.push(current);
    expect(current.music).toHaveLength(1); expect(current.music[0].fading).toBe(false);
    expect(await musicFiles(page, phase)).toContain(current.music[0].url);
    expect(current.ambience).toHaveLength(1); expect(current.errors).toEqual([]);
  }
  // Rapid requests while files are cached must still leave only the latest track.
  await page.evaluate(() => { const { manager } = (window as any).audioPreview; for (const scene of ['stars', 'balance', 'waiting', 'ending', 'runner']) manager.setScene(scene); });
  await expect.poll(async () => (await status()).music.length).toBe(1);
  expect((await status()).music).toHaveLength(1);
  await page.evaluate(() => (window as any).audioPreview.manager.pause());
  await expect.poll(async () => (await status()).state).toBe('suspended');
  const paused = await status(); await page.waitForTimeout(220);
  expect((await status()).time).toBe(paused.time);
  expect((await status()).music[0].position).toBeCloseTo(paused.music[0].position, 2);
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(async () => (await status()).state).toBe('running');
  await expect.poll(async () => (await status()).music[0].position).toBeGreaterThan(paused.music[0].position + .1);
  await page.evaluate(() => (window as any).audioPreview.manager.setVolumes(.2, .8));
  await page.waitForTimeout(350);
  expect((await status()).musicVolume).toBeCloseTo(.2, 2); expect((await status()).effectsVolume).toBeCloseTo(.8, 2);
  await page.evaluate(() => (window as any).audioPreview.manager.setMuted(true));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).audioPreview.rms())).toBeLessThan(.0002);
  await page.evaluate(() => { const { manager } = (window as any).audioPreview; manager.setMuted(false); manager.setVolumes(0, 1); });
  await page.waitForTimeout(350);
  for (const effect of ['cassette', 'jump', 'land', 'stepLeft', 'stepRight', 'collision', 'pipe', 'gust', 'star', 'starHit', 'tick', 'clock', 'neon', 'door']) {
    await page.evaluate(effect => (window as any).audioPreview.manager.effect(effect), effect);
    await page.waitForTimeout(effect === 'tick' ? 15 : 45);
    expect((await status()).effects).toBeGreaterThan(0);
    await page.waitForTimeout(100);
  }
  const recording = await page.evaluate(() => (window as any).audioPreview.finishRecording());
  await writeFile('docs/previews/audio-mix.webm', Buffer.from(recording, 'base64'));
  await writeFile('docs/previews/audio-mixer-audit.json', JSON.stringify(report, null, 2));
  await page.evaluate(() => (window as any).audioPreview.manager.dispose());
  await expect.poll(async () => (await status()).state).toBe('closed');
  expect((await status()).music).toEqual([]); expect(errors).toEqual([]);
});

test('аудио: запоздавшая загрузка и MP3 fallback не возвращают старую сцену', async ({ page }) => {
  await page.goto(fixture);
  await page.route('**' + (await musicFiles(page, 'runner'))[0], async route => { await new Promise(resolve => setTimeout(resolve, 850)); await route.continue(); });
  await page.route('**' + (await musicFiles(page, 'stars'))[0], route => route.fulfill({ status: 404, body: '' }));
  const mp3: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.mp3')) mp3.push(request.url()); });
  await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await page.evaluate(() => (window as any).audioPreview.manager.setScene('stars'));
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.manager.status.music[0]?.url)).toContain('music-stars');
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => (window as any).audioPreview.manager.status);
  expect(state.music).toHaveLength(1); expect(state.music[0].url).toContain('stars');
  expect(mp3.some(url => url.endsWith('music-stars.mp3'))).toBe(true);
});

test('ползунки громкости сохраняются после перезагрузки', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.locator('.audio-settings summary').click();
  await page.getByRole('slider', { name: 'Громкость музыки' }).fill('0.25');
  await page.getByRole('slider', { name: 'Громкость эффектов' }).fill('0.85');
  await page.getByRole('slider', { name: 'Громкость окружения' }).fill('0.35');
  await page.reload(); await page.locator('.audio-settings summary').click();
  await expect(page.getByRole('slider', { name: 'Громкость музыки' })).toHaveValue('0.25');
  await expect(page.getByRole('slider', { name: 'Громкость эффектов' })).toHaveValue('0.85');
  await expect(page.getByRole('slider', { name: 'Громкость окружения' })).toHaveValue('0.35');
});

test('локальный MP3 имеет приоритет и без Vorbis; недоступный файл заменяется штатной музыкой', async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.canPlayType = () => ''; });
  const mp3 = await readFile('apps/web/public/audio/original-v1/music-runner.mp3');
  const requested: string[] = [];
  await page.route('**/audio/user-instrumentals/*.mp3', route => {
    requested.push(route.request().url());
    return route.request().url().includes('missing') ? route.fulfill({ status: 404, body: '' }) :
      route.fulfill({ contentType: 'audio/mpeg', body: mp3 });
  });
  await page.goto(fixture); await page.getByRole('button', { name: 'Воспроизвести' }).click();
  const status = () => page.evaluate(() => (window as any).audioPreview.manager.status);
  await page.evaluate(() => (window as any).audioPreview.manager.music.select({
    urls: ['/audio/user-instrumentals/test.mp3', '/audio/original-v1/music-balance.mp3'], gain: .6,
  }));
  await expect.poll(async () => (await status()).music.find((v: any) => v.url.includes('test.mp3'))?.position ?? 0).toBeGreaterThan(.2);
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.rms())).toBeGreaterThan(.005);
  await page.evaluate(() => (window as any).audioPreview.manager.music.select({
    urls: ['/audio/user-instrumentals/missing.mp3', '/audio/original-v1/music-balance.mp3'], gain: .6,
  }, 26)); // Shadows offset also works with the shorter 24-second fallback.
  // Check the seek when the replacement begins, before the outgoing six-second tail finishes.
  await expect.poll(async () => (await status()).music.find((v: any) => !v.fading && v.started)?.url).toContain('music-balance.mp3');
  const replacement = (await status()).music.find((v: any) => !v.fading && v.started);
  expect(replacement.position).toBeGreaterThanOrEqual(2);
  expect(replacement.position).toBeLessThan(4);
  await expect.poll(async () => (await status()).music.length).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.rms())).toBeGreaterThan(.005);
  expect(requested.some(url => url.endsWith('/test.mp3'))).toBe(true);
  expect(requested.some(url => url.endsWith('/missing.mp3'))).toBe(true);
  expect((await status()).errors).toEqual([]);
});

test('ошибка всех вариантов не оставляет неработающий поток и позволяет повторить загрузку', async ({ page }) => {
  await page.route('**/audio/user-instrumentals/unavailable.mp3', route => route.fulfill({ status: 404, body: '' }));
  await page.goto(fixture); await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.manager.status.music[0]?.position ?? 0)).toBeGreaterThan(.1);
  await page.evaluate(() => {
    const file = { urls: ['/audio/user-instrumentals/unavailable.mp3'], gain: .6 };
    Object.assign((window as any).audioPreview, { retryFile: file });
    (window as any).audioPreview.manager.music.select(file);
  });
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.manager.status.errors)).toContain('/audio/user-instrumentals/unavailable.mp3');
  expect(await page.evaluate(() => (window as any).audioPreview.manager.status.music.length)).toBe(1);
  const mp3 = await readFile('apps/web/public/audio/original-v1/music-runner.mp3');
  await page.unroute('**/audio/user-instrumentals/unavailable.mp3');
  await page.route('**/audio/user-instrumentals/unavailable.mp3', route => route.fulfill({ contentType: 'audio/mpeg', body: mp3 }));
  await page.evaluate(() => { const p = (window as any).audioPreview; p.manager.music.select(p.retryFile); });
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.manager.status.music.find((v: any) => v.url.includes('unavailable'))?.position ?? 0)).toBeGreaterThan(.2);
  await page.evaluate(() => (window as any).audioPreview.manager.dispose());
  expect(await page.evaluate(() => (window as any).audioPreview.manager.status.music)).toEqual([]);
});

test('звук в настоящем раннере: первый жест, прыжок, приземление, пауза и поворот', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: unknown[]) { (window as any).audioGameScene = this.scene; render.apply(this, args); };
  });
  await page.getByRole('checkbox', { name: 'Для разработчика' }).check();
  await page.getByRole('button', { name: 'Начать путь' }).click();
  const status = () => page.evaluate(() => (window as any).audioGameScene.audio.status);
  await expect.poll(async () => (await status()).music.length).toBe(1);
  await expect.poll(async () => (await status()).state).toBe('running');
  await page.evaluate(() => {
    const audio = (window as any).audioGameScene.audio, effect = audio.effect.bind(audio);
    (window as any).heardEffects = [];
    audio.effect = (name: string, strength: number) => { (window as any).heardEffects.push(name); return effect(name, strength); };
  });
  await page.locator('canvas').click({ position: { x: 450, y: 270 } });
  await expect.poll(() => page.evaluate(() => (window as any).heardEffects.includes('land'))).toBe(true);
  expect(await page.evaluate(() => (window as any).heardEffects)).toContain('jump');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect.poll(async () => (await status()).state).toBe('suspended');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect.poll(async () => (await status()).state).toBe('running');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await status()).state).toBe('suspended');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect.poll(async () => (await status()).state).toBe('running');
  expect((await status()).music).toHaveLength(1); expect((await status()).errors).toEqual([]);
});

test('музыкальная петля продолжает звучать после конца установленной записи', async ({ page }) => {
  await page.goto(fixture); await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.manager.status.music[0]?.duration ?? 0)).toBeGreaterThan(3);
  const duration = await page.evaluate(() => {
    const voice = [...(window as any).audioPreview.manager.music.voices][0] as any;
    voice.audio.currentTime = voice.audio.duration - .4;
    return voice.audio.duration;
  });
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.manager.status.music[0].position)).toBeLessThan(duration - 1);
  await expect.poll(() => page.evaluate(() => (window as any).audioPreview.rms())).toBeGreaterThan(.005);
  const state = await page.evaluate(() => (window as any).audioPreview.manager.status);
  expect(state.music).toHaveLength(1); expect(state.errors).toEqual([]);
});

test('все восемь музыкальных эпизодов воспроизводят выбранные записи', async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto(fixture); await page.getByRole('button', { name: 'Воспроизвести' }).click();
  await page.evaluate(() => (window as any).audioPreview.manager.setVolumes(1, 0, 0));
  const report = [];
  for (const phase of ['runner-intro', 'runner-neighborhood', 'runner-autumn', 'balance', 'runner-shadows', 'stars', 'waiting', 'ending']) {
    const expected = (await musicFiles(page, phase))[0];
    await page.evaluate(phase => (window as any).audioPreview.manager.setScene(phase), phase);
    const status = () => page.evaluate(() => (window as any).audioPreview.manager.status);
    await expect.poll(async () => {
      const state = await status();
      return state.music.length === 1 && state.music[0].url === expected && !state.music[0].fading && state.music[0].position > .2;
    }).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).audioPreview.rms()), { timeout: 10_000 }).toBeGreaterThan(.001);
    const state = await status(); expect(state.errors).toEqual([]);
    report.push({ phase, ...state.music[0] });
  }
  await writeFile('docs/previews/instrumentals-playback-audit.json', JSON.stringify(report, null, 2));
  await page.evaluate(() => (window as any).audioPreview.manager.dispose());
});

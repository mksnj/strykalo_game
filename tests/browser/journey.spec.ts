import { test, expect, type Page } from '@playwright/test';
import { installStarsPilot } from './starsController';
import { ENDING_DURATION } from '../../apps/web/src/game/views/endingTimeline';

async function prepareJourney(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-10-31T00:00:00Z') });
  await page.addInitScript(() => {
    // Stable seed in this test only. Production has no shortcuts or debug entry points.
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array.fill(1); return array; } });
    // Exercise a 25 fps WebView and avoid thousands of unnecessary GPU frames in the clock-driven route test.
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 40);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await installStarsPilot(page);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await page.evaluate(async () => {
    const path = '/src/game/views/RunnerView.ts';
    const { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: unknown[]) {
      (window as any).runnerPilotScene = this.scene; render.apply(this, args);
    };
  });
  await page.evaluate(jumpLead => {
    const jumped = new Set<string>();
    let releaseAt = 0;
    const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    const driveRunner = () => {
      const runner = (window as any).runnerPilotScene?.session?.runner;
      if (runner && document.querySelector('.jump-guide') && document.querySelector('main')?.dataset.paused !== 'true') {
        if (releaseAt && runner.travel >= releaseAt) { key('Space', false); releaseAt = 0; }
        const next = runner.objects.find((o: any) => o.kind !== 'tape' && !jumped.has(o.id) &&
          o.x - runner.travel - 180 <= jumpLead);
        if (next && runner.player.grounded && !releaseAt) {
          key('Space', true); jumped.add(next.id); releaseAt = runner.travel + 300;
        }
      } else { key('Space', false); releaseAt = 0; }
      requestAnimationFrame(driveRunner);
    };
    requestAnimationFrame(driveRunner);
  }, 90);
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  await page.getByRole('button', { name: 'Понятно, в путь' }).click({ force: true });
  await page.clock.runFor(41_000);
  await expect(page.getByText('Впереди — только труба', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'docs/previews/pipe-v2-approach.png' });
  await page.clock.runFor(5000);
  for (let i = 0; i < 12 && !(await page.getByRole('dialog').count()); i++) await page.clock.runFor(500);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.balance-hud')).toHaveCount(0);
  await page.getByRole('button', { name: 'Понятно, пошатываемся' }).click({ force: true });
  await page.clock.runFor(40);
}

test('полный путь: труба → звёзды → тени → 90 секунд в комнате → подъезд → повтор', async ({ page }) => {
  // This real-render route also includes the mandatory active dodging. Allow headless
  // software rendering to finish the unchanged room/finale assertions on a busy Windows host.
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepareJourney(page);
  await expect(page.locator('.distance span')).toHaveText('200 / 700');
  const score = await page.locator('.score strong').textContent();
  await page.screenshot({ path: 'test-results/pipe.png' });
  await page.screenshot({ path: 'docs/previews/pipe-v2-city.png' });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
  const position = await page.getByRole('meter').getAttribute('aria-valuenow');
  const progress = await page.locator('.crossing-progress').getAttribute('aria-label');
  await page.clock.runFor(10_000);
  expect(await page.getByRole('meter').getAttribute('aria-valuenow')).toBe(position);
  expect(await page.locator('.crossing-progress').getAttribute('aria-label')).toBe(progress);
  await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
  await page.evaluate(() => {
    let held = '';
    let corrections = 0;
    const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    const balance = () => {
      const meter = document.querySelector('[role="meter"]');
      const position = Number(meter?.getAttribute('aria-valuenow'));
      const next = meter && Math.abs(position) > 6 ? position > 0 ? 'KeyA' : 'KeyD' : '';
      if (next !== held) {
        if (held) key(held, false);
        if (next) key(next, true);
        held = next;
        document.documentElement.dataset.balanceCorrections = String(++corrections);
      }
      requestAnimationFrame(balance);
    };
    requestAnimationFrame(balance);
  });
  await page.clock.runFor(15_000);
  await expect(page.locator('.distance span')).toHaveText('200 / 700');
  await expect(page.locator('.score strong')).toHaveText(score!);
  await page.screenshot({ path: 'test-results/pipe-clouds.png' });
  await page.screenshot({ path: 'docs/previews/fixes-pipe-middle.png' });
  await page.clock.runFor(14_000);
  await page.screenshot({ path: 'docs/previews/pipe-v2-late.png' });
  await page.screenshot({ path: 'docs/previews/fixes-pipe-late.png' });
  await page.clock.runFor(10_000);
  for (let i = 0; i < 16 && !(await page.locator('.distance').textContent())?.includes('ОСЕННИЕ ДВОРЫ'); i++) await page.clock.runFor(500);
  await expect(page.locator('.distance')).toContainText('ОСЕННИЕ ДВОРЫ');
  await expect(page.locator('.balance-hud')).not.toBeVisible();
  expect(Number(await page.locator('html').getAttribute('data-balance-corrections'))).toBeGreaterThan(20);
  expect(Number(await page.locator('.score strong').textContent())).toBeGreaterThanOrEqual(Number(score));
  await page.screenshot({ path: 'test-results/autumn.png' });
  await page.clock.runFor(25_000);
  await page.screenshot({ path: 'test-results/memories.png' });
  await page.screenshot({ path: 'docs/previews/fixes-memory.png' });
  let courtPreview = false, courtApproach = false;
  for (let i = 0; i < 55 && await page.locator('main').getAttribute('data-phase') !== 'stars'; i++) {
    const phase = await page.locator('main').getAttribute('data-phase');
    const distance = Number((await page.locator('.distance span').textContent())?.split('/')[0]);
    if (phase === 'runner' && distance >= 391 && !courtPreview) {
      courtPreview = true; await page.screenshot({ path: 'docs/previews/court-street-approach.png' });
    }
    if (phase === 'stars-approach' && !courtApproach) {
      courtApproach = true;
      await expect(page.getByRole('region', { name: 'Ритм падающих звёзд' })).not.toBeVisible();
      await page.screenshot({ path: 'docs/previews/court-entry-start.png' });
      await page.clock.runFor(1600);
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars-approach');
      await page.screenshot({ path: 'docs/previews/court-entry-walk.png' });
      await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
      const arrivalFrame = await page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
      await page.clock.runFor(3000);
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars-approach');
      expect(await page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(arrivalFrame);
      await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
    }
    await page.clock.runFor(1000);
  }
  expect(courtPreview && courtApproach).toBe(true);
  await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true });
  await page.clock.runFor(40);
  await expect(page.getByRole('region', { name: 'Ритм падающих звёзд' })).toBeVisible();
  await expect(page.locator('.distance span')).toHaveText('400 / 700');
  const scoreAtStars = await page.locator('.score strong').textContent();
  await page.setViewportSize({ width: 844, height: 390 });
  const right = page.locator('.rhythm-keys button').last();
  const bounds = (await right.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(844);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/stars.png' });
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * .85, y: bounds.y + bounds.height / 2, id: 42 }] });
  await page.clock.runFor(800);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(2500);
  await page.screenshot({ path: 'test-results/stars-movement.png' });
  await page.screenshot({ path: 'docs/previews/stars-v2-early.png' });
  for (let i = 0; i < 160 && await page.locator('main').getAttribute('data-phase') !== 'stars-failure'; i++) {
    if (i === 10) await page.screenshot({ path: 'docs/previews/stars-shower-route.png' });
    await page.clock.runFor(1000);
  }
  await expect(page.getByText('бесполезно', { exact: true })).toBeVisible();
  await expect(page.locator('.score strong')).toHaveText(scoreAtStars!);
  await expect(page.getByRole('heading', { name: 'Не в этот раз' })).not.toBeVisible();
  await page.screenshot({ path: 'test-results/stars-failure.png' });
  for (let i = 0; i < 20 && await page.locator('main').getAttribute('data-phase') !== 'runner'; i++) await page.clock.runFor(500);
  await expect(page.locator('.distance')).toContainText('ТЁМНЫЕ ДВОРЫ');
  await page.clock.runFor(33_000);
  await page.screenshot({ path: 'test-results/shadows.png' });
  let roomPreview = false, roomApproach = false;
  for (let i = 0; i < 100 && await page.locator('main').getAttribute('data-phase') !== 'waiting'; i++) {
    const phase = await page.locator('main').getAttribute('data-phase');
    const distance = Number((await page.locator('.distance span').textContent())?.split('/')[0]);
    if (phase === 'runner' && distance >= 591 && !roomPreview) {
      roomPreview = true; await page.screenshot({ path: 'docs/previews/room-street-approach.png' });
    }
    if (phase === 'room-approach' && !roomApproach) {
      roomApproach = true;
      await expect(page.getByText('Внутри тихо', { exact: true })).toHaveCount(0);
      await page.screenshot({ path: 'docs/previews/room-entry-start.png' });
      await page.clock.runFor(1800);
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'room-approach');
      await page.screenshot({ path: 'docs/previews/room-entry-door.png' });
      await page.clock.runFor(2300);
      await expect(page.locator('main')).toHaveAttribute('data-phase', 'room-approach');
      await page.screenshot({ path: 'docs/previews/room-entry-inside.png' });
    }
    await page.clock.runFor(1000);
  }
  expect(roomPreview && roomApproach).toBe(true);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'waiting');
  await expect(page.locator('.distance span')).toHaveText('600 / 700');
  const scoreAtRoom = await page.locator('.score strong').textContent();
  await page.screenshot({ path: 'test-results/room.png' });
  await page.screenshot({ path: 'docs/previews/fixes-room.png' });
  // Gameplay keys and canvas touches reset waiting; only the door shows the phrase.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    });
    await page.clock.runFor(1000);
  }
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.6);
  await page.clock.runFor(1000);
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.6);
  await page.clock.runFor(40);
  await expect(page.getByText('Ты куда-то торопишься?', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).runnerPilotScene.waitingView.interact(802, 275));
  await page.clock.runFor(40);
  await expect(page.getByText('Ты куда-то торопишься?', { exact: true })).toBeVisible();
  await page.clock.runFor(10_000);
  await page.screenshot({ path: 'test-results/room-clock-look.png' });
  await page.screenshot({ path: 'docs/previews/fixes-room-look.png' });
  await page.clock.runFor(15_000);
  await page.screenshot({ path: 'test-results/room-lamp.png' });
  await page.clock.runFor(20_000);
  await page.clock.runFor(2500);
  await page.screenshot({ path: 'test-results/room-quiet-window.png' });
  // System buttons, focused-button keyboard input and orientation must preserve the timeline.
  await page.getByRole('button', { name: /Выключить звук|Включить звук/ }).click({ force: true });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
  await page.clock.fastForward(120_000);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'waiting');
  await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.fastForward(30_000);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.runFor(80);
  await expect(page.getByRole('heading', { name: 'Поверните телефон' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click({ force: true });
  await page.clock.runFor(40);
  await expect(page.getByRole('heading', { name: 'Пауза', exact: true })).not.toBeVisible();
  await page.clock.runFor(40_000);
  await page.screenshot({ path: 'test-results/room-quiet-late.png' });
  await page.clock.runFor(1_500);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'waiting');
  await expect(page.locator('.score strong')).toHaveText(scoreAtRoom!);
  await page.clock.runFor(1000);
  // Orientation/resume may discard one partial render frame. The unit test checks the exact 90 s.
  for (let i = 0; i < 8 && await page.locator('main').getAttribute('data-phase') === 'waiting'; i++) await page.clock.runFor(40);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'room-rest');
  await page.clock.runFor(2100);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'room-exit');
  await page.screenshot({ path: 'test-results/room-door.png' });
  await page.clock.runFor(6000);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'final-run');
  await expect(page.locator('.score strong')).toHaveText(scoreAtRoom!);
  await expect(page.locator('.jump-guide')).not.toBeVisible();
  await page.screenshot({ path: 'test-results/archway.png' });
  await page.screenshot({ path: 'docs/previews/fixes-final-street.png' });
  for (let i = 0; i < 25 && await page.locator('main').getAttribute('data-phase') !== 'ending'; i++) await page.clock.runFor(1000);
  await page.screenshot({ path: 'test-results/archway-look.png' });
  await page.screenshot({ path: 'docs/previews/fixes-archway.png' });
  await page.clock.runFor(ENDING_DURATION * 1000 + 80);
  await expect(page.getByRole('heading', { name: 'Путь домой завершён', exact: true })).toBeVisible();
  await expect(page.locator('.result-numbers strong').first()).toHaveText(scoreAtRoom!);
  await expect(page.locator('.result-numbers strong').nth(2)).toHaveText('700');
  await expect(page.getByRole('button', { name: 'Переслушать альбом' })).toBeDisabled();
  await page.getByRole('button', { name: 'Таблица лидеров' }).click({ force: true });
  await expect(page.getByRole('status')).toContainText('после подключения Telegram и сервера');
  await page.screenshot({ path: 'test-results/journey-complete.png' });
  await page.setViewportSize({ width: 568, height: 320 });
  const replay = page.getByRole('button', { name: 'Играть снова' });
  await replay.scrollIntoViewIfNeeded();
  const replayBounds = (await replay.boundingBox())!;
  expect(replayBounds.y).toBeGreaterThanOrEqual(0); expect(replayBounds.y + replayBounds.height).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'test-results/small-ending.png' });
  await page.getByRole('button', { name: 'Играть снова' }).click({ force: true });
  await page.clock.runFor(40);
  await expect(page.locator('.distance span')).toHaveText('0 / 700');
  await expect(page.locator('.score strong')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('сенсорное отклонение на трубе приводит к общему Game Over; повтор начинает с нуля', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 844, height: 390 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepareJourney(page);
  const initialPosition = Number(await page.getByRole('meter').getAttribute('aria-valuenow'));
  const bounds = (await page.locator('main').boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * (initialPosition >= 0 ? .85 : .15), y: bounds.y + bounds.height / 2, id: 41 }] });
  await page.clock.runFor(200);
  if (await page.getByRole('meter').count()) {
    expect(Math.abs(Number(await page.getByRole('meter').getAttribute('aria-valuenow')))).toBeGreaterThan(Math.abs(initialPosition));
  } else await expect(page.getByRole('heading', { name: 'Не в этот раз' })).toBeVisible();
  await page.clock.runFor(4800);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('heading', { name: 'Не в этот раз' })).toBeVisible();
  await expect(page.getByText('Не удалось удержаться на трубе.', { exact: false })).toBeVisible();
  await expect(page.locator('.result-numbers strong').nth(2)).toHaveText('200');
  await page.screenshot({ path: 'test-results/pipe-fall.png' });
  await page.getByRole('button', { name: 'С начала' }).click({ force: true });
  await page.clock.runFor(16);
  await expect(page.locator('.score strong')).toHaveText('0');
  await expect(page.locator('.distance span')).toHaveText('0 / 700');
  expect(errors).toEqual([]);
});

test('без управления на городской трубе игрок падает; старый лес и туман не загружаются', async ({ page }) => {
  test.setTimeout(90_000);
  const loaded = new Set<string>(), obsolete: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (/\/assets\/(?:pipe-v2\/|provided-v4\/pipe\.webp)/.test(response.url()) && response.ok()) loaded.add(response.url());
    if (/ravine-mist\.svg|pipe-side\.svg|journey-v1\/(?:cloud|ravine)\.webp/.test(response.url())) obsolete.push(response.url());
  });
  await prepareJourney(page);
  await page.screenshot({ path: 'docs/previews/pipe-v2-city.png' });
  const score = await page.locator('.score strong').textContent();
  await page.clock.runFor(25_000);
  await expect(page.getByRole('heading', { name: 'Не в этот раз' })).toBeVisible();
  await expect(page.locator('.result-numbers strong').first()).toHaveText(score!);
  await expect(page.locator('.result-numbers strong').nth(2)).toHaveText('200');
  await page.screenshot({ path: 'docs/previews/pipe-v2-idle-fall.png' });
  expect([...loaded].map(url => url.split('/').pop()).sort()).toEqual(['pipe.webp', 'side.webp', 'sky-clouds.webp']);
  expect(obsolete).toEqual([]); expect(errors).toEqual([]);
});

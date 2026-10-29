import { test, expect, type Page } from '@playwright/test';
import { installStarsPilot } from './starsController';

async function reachPhase(page: Page, phase: string, seconds = 20): Promise<void> {
  for (let i = 0; i < seconds * 2 && await page.locator('main').getAttribute('data-phase') !== phase; i++) await page.clock.runFor(500);
  await expect(page.locator('main')).toHaveAttribute('data-phase', phase);
}

test('для разработчика: маршрут 20 → 40 → 60 → 70 без препятствий, повтор и возврат в обычный режим', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem('razvlechenie.demo.best.v1', '7');
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array.fill(1); return array; } });
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 40);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать путь' })).toBeVisible();
  await installStarsPilot(page);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const option = page.getByRole('checkbox', { name: 'Для разработчика' });
  await expect(option).not.toBeChecked();
  await option.check({ force: true });
  await expect(page.locator('.instructions')).toContainText('0–70 без препятствий');
  await page.screenshot({ path: 'docs/previews/developer-menu.png' });
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  await expect(page.locator('main')).toHaveAttribute('data-developer', 'true');
  await expect(page.locator('.distance span')).toHaveText('0 / 70');
  // Balance the pipe; the stars pilot supplies movement, and this runner needs no jumps.
  await page.evaluate(() => {
    let held = '';
    const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    const balance = () => {
      const meter = document.querySelector('[role="meter"]');
      const position = Number(meter?.getAttribute('aria-valuenow'));
      const next = meter && Math.abs(position) > 6 ? position > 0 ? 'KeyA' : 'KeyD' : '';
      if (next !== held) {
        if (held) key(held, false);
        if (next) key(next, true);
        held = next;
      }
      requestAnimationFrame(balance);
    };
    requestAnimationFrame(balance);
  });
  await reachPhase(page, 'balance');
  await page.getByRole('button', { name: 'Понятно, пошатываемся' }).click({ force: true });
  await expect(page.locator('.distance span')).toHaveText('20 / 70');
  await page.screenshot({ path: 'docs/previews/developer-pipe.png' });
  await page.clock.runFor(36_000);
  await reachPhase(page, 'stars', 35);
  await page.getByRole('button', { name: 'Начать →', exact: true }).click({ force: true });
  await page.clock.runFor(40);
  await expect(page.locator('.distance span')).toHaveText('40 / 70');
  await page.screenshot({ path: 'docs/previews/developer-stars.png' });
  await page.clock.runFor(6_000);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars');
  await expect(page.locator('.rhythm-hud')).not.toContainText(/продерж|\d+\s*секунд/i);
  await page.screenshot({ path: 'docs/previews/stars-stream-6.png' });
  await page.clock.runFor(9_000);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'stars');
  await page.screenshot({ path: 'docs/previews/stars-stream-15.png' });
  await reachPhase(page, 'stars-exit', 160);
  await expect(page.getByRole('heading', { name: 'Не в этот раз' })).not.toBeVisible();
  await reachPhase(page, 'waiting', 40);
  await expect(page.locator('.distance span')).toHaveText('60 / 70');
  await page.screenshot({ path: 'docs/previews/developer-room.png' });
  await page.clock.runFor(89_000);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'waiting');
  await page.clock.runFor(24_000);
  await expect(page.getByRole('button', { name: 'Играть снова' })).toBeVisible();
  await expect(page.locator('.result-numbers strong').last()).toHaveText('70');
  await expect(page.locator('.result-numbers strong').nth(1)).toHaveText('7');
  await expect(page.getByRole('button', { name: 'Поделиться' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('razvlechenie.demo.best.v1'))).toBe('7');
  await page.getByRole('button', { name: 'Играть снова' }).click({ force: true });
  await expect(page.locator('main')).toHaveAttribute('data-developer', 'true');
  await expect(page.locator('.distance span')).toHaveText('0 / 70');
  await expect(page.locator('.score strong')).toHaveText('0');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'В меню', exact: true }).click({ force: true });
  await expect(option).toBeChecked();
  await option.uncheck({ force: true });
  await page.getByRole('button', { name: 'Начать путь' }).click({ force: true });
  await page.getByRole('button', { name: 'Понятно, в путь' }).click({ force: true });
  await expect(page.locator('main')).toHaveAttribute('data-developer', 'false');
  await expect(page.locator('.distance span')).toHaveText('0 / 700');
  expect(errors).toEqual([]);
});

test('галочка для разработчика доступна в маленьком горизонтальном окне', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/');
  const option = page.getByRole('checkbox', { name: 'Для разработчика' });
  await expect(option).toBeVisible();
  await option.check();
  for (const locator of [option, page.getByRole('button', { name: 'Начать путь' }), page.locator('.instructions')]) {
    const box = (await locator.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(568);
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: 'docs/previews/developer-menu-small.png' });
});

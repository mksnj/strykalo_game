import { preview } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const server = await preview({ preview: { host: '127.0.0.1', port: 5176, strictPort: true } });
let browser, page;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00+03:00'));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5176');
  await page.getByRole('button', { name: 'Начать путь' }).waitFor();
  assert.equal(await page.getByText('Тестирование этапов', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('checkbox', { name: 'Для разработчика' }).count(), 0);
  const shortcuts = [
    { label: 'Мини-игра 1', phase: 'balance', start: 'Понятно, пошатываемся →', hud: '.balance-hud' },
    { label: 'Мини-игра 2', phase: 'stars', start: 'Начать →', hud: '.rhythm-hud' },
    { label: 'Мини-игра 3', phase: 'waiting' },
  ];
  const enterCourt = 'Пройти на площадку на свой страх и риск';
  const onward = 'Пройти дальше';
  const checkNotice = async () => {
    await page.getByRole('heading', { name: 'Звезд пока нет', exact: true }).waitFor();
    assert.equal(await page.getByText('По прогнозам, звездопад начнется 30.10 в 08:00', { exact: true }).count(), 1);
  };
  const launch = async shortcut => {
    await page.getByRole('button', { name: shortcut.label, exact: true }).click();
    if (shortcut.phase === 'stars') {
      await checkNotice(); await page.getByRole('button', { name: enterCourt, exact: true }).click();
    }
    await page.locator(`main[data-phase="${shortcut.phase}"]`).waitFor();
  };
  for (const viewport of [{ width: 960, height: 540 }, { width: 375, height: 667 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    for (const { label } of shortcuts) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    }
    await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click();
    await checkNotice();
    for (const label of [enterCourt, onward]) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.scrollIntoViewIfNeeded(); const box = await button.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    }
    await page.getByRole('button', { name: 'К этапам', exact: true }).click();
  }
  await page.setViewportSize({ width: 960, height: 540 });
  await mkdir('docs/previews/gameplay-v18', { recursive: true });
  await page.screenshot({ path: 'docs/previews/gameplay-v18/production-menu.png' });
  for (const shortcut of shortcuts) {
    await launch(shortcut);
    if (shortcut.start) {
      await page.getByRole('dialog').getByRole('button', { name: 'К этапам', exact: true }).click();
      await launch(shortcut);
      await page.getByRole('button', { name: shortcut.start, exact: true }).click();
      await page.locator(shortcut.hud).waitFor();
    }
    await page.getByRole('button', { name: 'К этапам', exact: true }).click();
    await page.getByRole('button', { name: 'Начать путь' }).waitFor();
  }
  await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click();
  await checkNotice(); await page.getByRole('button', { name: onward, exact: true }).click();
  await page.locator('main[data-phase="stars-exit"]').waitFor();
  await page.locator('main[data-phase="runner"]').waitFor();
  assert.match(await page.locator('.distance').innerText(), /ТЁМНЫЕ ДВОРЫ/);
  await page.getByRole('button', { name: 'К этапам', exact: true }).click();
  await page.clock.setFixedTime(new Date('2026-10-30T08:00:00+03:00'));
  await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click();
  await page.locator('.stars-tutorial').waitFor();
  assert.equal(await page.locator('.stars-gate').count(), 0);
  await page.getByRole('dialog').getByRole('button', { name: 'К этапам', exact: true }).click();
  await page.getByRole('button', { name: 'Начать путь' }).click();
  await page.getByRole('button', { name: 'Понятно, в путь' }).click();
  await page.locator('main[data-screen=playing]').waitFor();
  assert.equal(await page.getByRole('button', { name: 'К этапам' }).count(), 0);
  assert.match(await page.locator('.distance span').innerText(), /\/ 700$/);
  assert.equal(await page.locator('.lives').getAttribute('aria-label'), 'Жизни: 3 из 3');
  assert.deepEqual(errors, []);
  await writeFile('docs/previews/gameplay-v18/production.json', JSON.stringify({
    testingMenuAbsent: true, shortenedRouteControlAbsent: true, returnToStagesAbsent: true,
    miniGameShortcutsVisible: true, miniGamesLaunched: shortcuts.map(shortcut => shortcut.phase),
    mobileMenuChecked: true, miniGameModalReturnWorks: true, normalRunStarted: true, routeEnd: 700, errors,
    starsNoticeBeforeRelease: true, starsNoticeMobileChecked: true, starsNoticePlayWorks: true,
    starsNoticeSkipWorks: true, starsNoticeRemovedAtRelease: true,
  }, null, 2));
  console.log('Production: три мини-игры доступны из главного меню; запуск, возврат и мобильная компоновка проверены.');
} finally {
  await page?.close();
  await browser?.close();
  await server.close();
}

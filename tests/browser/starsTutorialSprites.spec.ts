import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';
import comets from '../../apps/web/src/game/assets/cometLayout.json' with { type: 'json' };

async function openTutorial(page: Page) {
  await bootRhythm(page);
  await page.getByRole('button', { name: 'К этапам', exact: true }).click();
  await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click();
  await page.clock.runFor(80);
  await expect(page.locator('.stars-tutorial')).toBeVisible();
}

for (const [width, height, name] of [[960, 540, 'desktop'], [390, 844, 'portrait'], [568, 320, 'landscape']] as const) {
  test('rules animate the same four comet frames, align with the target and keep the round blocked: ' + name, async ({ page }) => {
    await page.setViewportSize({ width, height }); await openTutorial(page);
    await expect(page.locator('.brand')).toContainText('2016—∞');
    await expect(page.locator('.distance')).toContainText('ЗАБРОШЕННАЯ ПЛОЩАДКА');
    await expect(page.locator('.stars-tutorial .eyebrow')).toHaveText('02 / ЗАБРОШЕННАЯ ПЛОЩАДКА');
    await expect(page.locator('#stars-tutorial-intro')).toHaveText(
      'Лови ритм падающих звёзд.Нажимай стрелки в момент, когда звезда совпадает с отметкой.');
    const note = page.locator('.rhythm-lesson-note');
    await expect(note).toHaveText(''); await expect(note.locator('.rhythm-lesson-sprite')).toHaveCount(1);
    const frames = await note.locator('.rhythm-lesson-sprite').evaluate((element, seconds) => {
      const animation = element.getAnimations()[0]; animation.pause();
      return [0, 1, 2, 3].map(frame => {
        animation.currentTime = (frame + .1) * seconds * 1000 / 4;
        const style = getComputedStyle(element);
        return { image: style.backgroundImage, position: style.backgroundPosition };
      });
    }, comets.shimmerSeconds);
    for (const [frame, style] of frames.entries()) {
      expect(style.image).toContain(comets.url);
      expect(Number.parseFloat(style.position)).toBeCloseTo(-frame * comets.cellWidth * comets.tutorialScale, 5);
    }
    await page.clock.runFor(2000);
    expect(await page.evaluate(() => (window as any).rhythmScene.session.stars.elapsed)).toBe(0);
    await page.locator('.balance-demo').evaluate(el => {
      for (const animation of el.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 2800; }
    });
    const spriteBox = await note.boundingBox(), targetBox = await page.locator('.rhythm-lesson > span').boundingBox();
    expect(spriteBox).not.toBeNull(); expect(targetBox).not.toBeNull();
    expect(Math.abs(spriteBox!.y + comets.anchor.y * comets.tutorialScale - (targetBox!.y + targetBox!.height / 2))).toBeLessThan(2);
    await mkdir('docs/previews/stars-tutorial-sprites', { recursive: true });
    await page.screenshot({ path: `docs/previews/stars-tutorial-sprites/${name}.png` });
    await page.getByRole('dialog').getByRole('button', { name: 'К этапам', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-screen', 'menu');
    await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click(); await page.clock.runFor(80);
    await page.getByRole('button', { name: 'Начать →', exact: true }).click(); await page.clock.runFor(80);
    await expect(page.locator('.stars-tutorial')).toHaveCount(0);
    await expect(page.locator('.rhythm-title')).toHaveText(
      'Лови ритм падающих звёздНажми направление в момент совпадения');
    await expect(page.locator('.rhythm-attempts')).toContainText('Ошибки 0 / 3');
  });
}

test('reduced motion shows the actual first sprite statically at the target', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openTutorial(page);
  const styles = await page.locator('.rhythm-lesson-note, .rhythm-lesson-sprite').evaluateAll(elements =>
    elements.map(el => ({ animation: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity })));
  expect(styles.map(style => style.animation)).toEqual(['none', 'none']);
  expect(styles[1].opacity).toBe('1');
  await expect(page.locator('.rhythm-lesson-sprite')).toHaveCSS('background-position', '0px 0px');
});

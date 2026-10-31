import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { bootRhythm } from './rhythmHarness';

test('only down hits start a nod; ordinary idle, interruptions and foot contact stay stable', async ({ page }) => {
  await bootRhythm(page);
  const states = await page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor;
    const render = (elapsed: number, feedback?: any, failure = 0) => {
      actor.render(640, 400, 154, elapsed * 1000, feedback, elapsed, failure);
      const p = actor.parts.find((p: any) => p.visible);
      return { state: actor.current, texture: p.texture.key, frame: String(p.frame.name), x: p.x, y: p.y,
        scale: p.scaleX, scaleY: p.scaleY, alpha: p.alpha, contact: p.y + (585 - p.originY * 608) * p.scaleY };
    };
    const idle = [0, .25, .5, 1, 10].map(time => render(time));
    const down = { direction: 'down', judgment: 'perfect', at: 11 };
    const nod = Array.from({ length: 4 }, (_, i) => render(11 + i / 8, down));
    const afterNod = [11.5, 11.625, 11.75, 12, 12.1].map(time => render(time, down));
    const rested = render(12.2);
    const missed = render(13, { direction: 'down', judgment: 'miss', at: 13 });
    render(14, { direction: 'down', judgment: 'good', at: 14 });
    const interrupted = render(14.25, { direction: 'right', judgment: 'perfect', at: 14.25 });
    const failed = render(14.3, undefined, .1);
    return { idle, nod, afterNod, rested, missed, interrupted, failed };
  });
  for (const idle of states.idle) expect(idle).toMatchObject({ state: 'idle', texture: 'hero-front', frame: '__BASE', x: 640, y: 400, alpha: 1 });
  expect(states.nod.map(s => s.frame)).toEqual(['0', '1', '2', '3']);
  for (const state of states.nod) {
    expect(state).toMatchObject({ state: 'down', texture: 'music_nod', x: 640, y: 400, alpha: 1,
      scale: states.nod[0].scale, scaleY: states.nod[0].scaleY });
    expect(state.contact).toBeCloseTo(400, 8);
  }
  for (const state of states.afterNod) expect(state).toMatchObject({ state: 'idle', texture: 'hero-front' });
  expect(states.rested).toMatchObject({ state: 'idle', texture: 'hero-front' });
  expect(states.missed).toMatchObject({ state: 'idle', texture: 'hero-front' });
  expect(states.interrupted).toMatchObject({ state: 'right', texture: 'court-side-step', frame: '7' });
  expect(states.failed).toMatchObject({ state: 'idle', texture: 'hero-front' });
});

test('all rendered gesture frames match the ordinary model in height, torso width and foot line', async ({ page }) => {
  await bootRhythm(page);
  const result = await page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor;
    const preview = document.createElement('canvas'); preview.width = 840; preview.height = 550;
    const g = preview.getContext('2d')!;
    g.fillStyle = '#25303c'; g.fillRect(0, 0, 840, 550); g.font = '18px Arial'; g.textAlign = 'center';
    const read = (size: number, direction: 'left' | 'right' | 'down' | undefined, age = 0) => {
      const at = direction === 'left' ? 1 : direction === 'right' ? 3 : direction === 'down' ? 5 : 0;
      actor.render(640, 400, size, 0, direction ? { direction, judgment: 'perfect', at } : undefined, at + age);
      const p = actor.parts.find((p: any) => p.visible), f = p.frame;
      const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 700;
      const ctx = canvas.getContext('2d')!;
      const draw = (target: CanvasRenderingContext2D, x: number, y: number) => target.drawImage(f.source.image,
        f.cutX, f.cutY, f.cutWidth, f.cutHeight, x - f.width * p.scaleX * p.originX,
        y - f.height * p.scaleY * p.originY, f.width * p.scaleX, f.height * p.scaleY);
      draw(ctx, 384, 650);
      const data = ctx.getImageData(0, 0, 768, 700).data, rows: number[] = [];
      let top = 700, bottom = 0, left = 768, right = 0;
      for (let y = 0; y < 700; y++) {
        let rowLeft = 768, rowRight = 0;
        for (let x = 0; x < 768; x++) if (data[(y * 768 + x) * 4 + 3] > 128) {
          rowLeft = Math.min(rowLeft, x); rowRight = Math.max(rowRight, x + 1);
        }
        rows.push(rowRight - rowLeft);
        if (rowRight > rowLeft) { top = Math.min(top, y); bottom = y + 1; left = Math.min(left, rowLeft); right = Math.max(right, rowRight); }
      }
      const torso = rows.slice(Math.ceil(top + (bottom - top) * .24), Math.ceil(top + (bottom - top) * .40))
        .filter(width => width > 0).sort((a, b) => a - b);
      if (size === 462 && (!direction || direction !== 'down' && age === .3 || direction === 'down' && age === .26)) {
        const column = direction === 'left' ? 1 : direction === 'right' ? 2 : direction === 'down' ? 3 : 0;
        g.strokeStyle = '#728494'; g.beginPath(); g.moveTo(column * 210 + 8, 510); g.lineTo(column * 210 + 202, 510); g.stroke();
        g.fillStyle = '#c1cbd5'; g.fillText(direction ?? 'idle', column * 210 + 105, 25); draw(g, column * 210 + 105, 510);
      }
      return { direction: direction ?? 'idle', frame: String(f.name), size, height: bottom - top, width: right - left,
        torso: torso[Math.floor(torso.length / 2)], bottom, scaleX: p.scaleX, scaleY: p.scaleY, x: p.x, y: p.y };
    };
    const samples = [];
    for (const size of [154, 462]) {
      samples.push(read(size, undefined));
      for (const direction of ['left', 'right'] as const) for (const age of [.04, .13, .3, .64, .73, .9]) samples.push(read(size, direction, age));
      for (const age of [.01, .14, .26, .4]) samples.push(read(size, 'down', age));
    }
    return { samples, preview: preview.toDataURL('image/png').split(',')[1] };
  });
  for (const size of [154, 462]) {
    const samples = result.samples.filter(sample => sample.size === size), idle = samples[0];
    for (const sample of samples) {
      expect(Math.abs(sample.height - idle.height), JSON.stringify(sample)).toBeLessThanOrEqual(idle.height * .02 + 1);
      expect(Math.abs(sample.torso - idle.torso), JSON.stringify(sample)).toBeLessThanOrEqual(idle.torso * .05 + 1);
      expect(Math.abs(sample.width - idle.width), JSON.stringify(sample)).toBeLessThanOrEqual(idle.width * .05 + 1);
      expect(Math.abs(sample.bottom - idle.bottom), JSON.stringify(sample)).toBeLessThanOrEqual(1);
      expect([sample.x, sample.y]).toEqual([640, 400]);
    }
    for (const kind of ['left', 'right', 'down']) {
      const frames = samples.filter(sample => sample.direction === kind);
      for (const frame of frames) expect([frame.scaleX, frame.scaleY]).toEqual([frames[0].scaleX, frames[0].scaleY]);
    }
  }
  await mkdir('docs/previews/court-hero-size', { recursive: true });
  await writeFile('docs/previews/court-hero-size/comparison.png', Buffer.from(result.preview, 'base64'));
  await writeFile('docs/previews/court-hero-size/rendered.json', JSON.stringify(result.samples, null, 2) + '\n');
});

for (const [width, height] of [[960, 540], [375, 667], [844, 390]]) test(`down key triggers one nod and pause freezes it ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await bootRhythm(page);
  await page.getByRole('button', { name: 'К этапам', exact: true }).click();
  await page.getByRole('button', { name: 'Мини-игра 2', exact: true }).click(); await page.clock.runFor(80);
  await page.getByRole('button', { name: 'Начать →', exact: true }).click(); await page.clock.runFor(160);
  const read = () => page.evaluate(() => {
    const actor = (window as any).rhythmScene.starsView.actor, p = actor.parts.find((p: any) => p.visible);
    return { state: actor.current, texture: p.texture.key, frame: String(p.frame.name), x: p.x, y: p.y,
      elapsed: (window as any).rhythmScene.session.stars.elapsed };
  });
  expect((await read()).texture).toBe('hero-front');
  await page.evaluate(() => {
    const e = (window as any).rhythmScene.session.stars, note = e.notes.find((n: any) => n.state === 'pending');
    note.direction = 'down'; e.tick = Math.ceil(note.at * 120);
  });
  await page.locator('main').focus(); await page.keyboard.press('ArrowDown');
  await page.clock.runFor(160);
  expect((await read()).texture).toBe('music_nod');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const frozen = await read(); await page.clock.runFor(2000); expect(await read()).toEqual(frozen);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.clock.runFor(160);
  await mkdir('docs/previews/music-nod-v1', { recursive: true });
  await page.screenshot({ path: `docs/previews/music-nod-v1/${width}x${height}.png` });
  const until = (await read()).elapsed + .9;
  for (let frame = 0; frame < 60 && (await read()).elapsed < until; frame++) await page.clock.runFor(40);
  expect((await read()).texture).toBe('hero-front'); expect((await read()).state).toBe('idle');
});

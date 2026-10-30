import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { AUTUMN_SCORE } from '../../apps/web/src/game/config';

test('the real streamed song stays aligned through all three authored bumps', async ({ page }) => {
  test.setTimeout(65000);
  await page.goto('/'); await page.getByRole('button', { name: 'Начать путь' }).waitFor();
  await page.evaluate(async () => {
    const { RunnerView } = await import('/src/game/views/RunnerView.ts' as string);
    const render = RunnerView.prototype.render;
    RunnerView.prototype.render = function(...args: any[]) { (window as any).scoreScene = (this as any).scene; return render.apply(this, args); };
    const { RunnerEngine } = await import('/src/game/runner/engine.ts' as string);
    const { AUTUMN_SCORE: C, RUNNER } = await import('/src/game/config.ts' as string);
    const step = RunnerEngine.prototype.step, jumped = new Set<string>(); (window as any).scoreEvents = [];
    RunnerEngine.prototype.step = function(...args: any[]) {
      const next = this.objects.find((o: any) => o.kind !== 'tape' && !jumped.has(o.id) && o.x - this.travel - RUNNER.playerX <= C.jumpLead);
      if (next && this.player.grounded) {
        this.press(); this.release(); jumped.add(next.id);
        if (next.id.startsWith('autumn-accent')) {
          const voice = (window as any).scoreScene.audio.status.music.find((v: any) => !v.fading && v.url.includes('03-92'));
          (window as any).scoreEvents.push({ id: next.id, simulatedMusic: this.tick / 120 + C.musicLeadSeconds,
            actualMusic: voice.position, drift: voice.position - (this.tick / 120 + C.musicLeadSeconds), distance: this.distance });
        }
      }
      return step.apply(this, args);
    };
  });
  await page.getByText('Тестирование этапов', { exact: true }).click();
  await page.getByRole('button', { name: 'Второй забег · 200–400', exact: true }).click();
  await page.waitForFunction(() => (window as any).scoreEvents?.length === 3, null, { timeout: 55000 });
  const events = await page.evaluate(() => (window as any).scoreEvents);
  for (const [i, event] of events.entries()) {
    expect(Math.abs(event.actualMusic - AUTUMN_SCORE.jumpMarkers[i]), JSON.stringify(event)).toBeLessThan(.12);
    expect(Math.abs(event.drift)).toBeLessThan(.12);
  }
  expect(await page.evaluate(() => (window as any).scoreScene.session.lives)).toBe(3);
  await mkdir('docs/previews/court-groove-v21', { recursive: true });
  await writeFile('docs/previews/court-groove-v21/runner-audio-timing.json', JSON.stringify({
    method: 'Real MP3 playback, full second run up to the third bump; autopilot jumps by geometry without changing time or travel.',
    vocalMarkersVerifiedByListening: false, events,
  }, null, 2) + '\n');
});

import type { Page } from '@playwright/test';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { RUNNER as C } from '../../apps/web/src/game/config';

const reference = new RunnerEngine(1);
const first = reference.objects.filter(o => o.kind !== 'tape').sort((a, b) => a.x - b.x)[0];
export const opening = {
  jumpAt: Math.ceil((first.x - C.playerX - C.playerWidth / 2 - 105) / C.pixelsPerUnit),
  clearAt: Math.ceil((first.x + first.width + C.playerWidth - C.playerX) / C.pixelsPerUnit) + 1,
};
for (let tick = 0; tick < 5000 && !reference.result; tick++) reference.step();
export const noJumpScore = reference.score;
export async function fixedRunnerSeed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array.fill(1); return array; } });
  });
}

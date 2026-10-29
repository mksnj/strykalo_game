import { expect, it } from 'vitest';
import { StarsEngine } from '../../apps/web/src/game/minigames/stars/StarsEngine';
import { starsPilot } from '../fixtures/starsPilot';
it.each([0, 0x82c4])('весь медленный ритм проходим реальными нажатиями на 20 seed, маска %i', mask => {
  for (let seed = 1; seed <= 20; seed++) {
    const engine = new StarsEngine(seed ^ mask);
    while (engine.elapsed < 60) { starsPilot(engine); engine.step(); }
    expect(engine.hits).toBeGreaterThan(60); expect(engine.misses).toBe(0);
    expect(engine.outcome).toBeNull();
  }
});

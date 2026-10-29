import { describe, expect, it } from 'vitest';
import { BALANCE as C } from '../../apps/web/src/game/config';
import { BalanceEngine } from '../../apps/web/src/game/minigames/balance/BalanceEngine';

describe('активное равновесие на городской трубе', () => {
  it('бездействие и редкие поправки не позволяют пройти сцену', () => {
    let sparseWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      const idle = new BalanceEngine(seed), sparse = new BalanceEngine(seed);
      for (let tick = 0; tick < C.duration / C.fixedStep + 2; tick++) {
        idle.step(0);
        // One short correction every five seconds; not sustained active balancing.
        sparse.step(tick % 600 < 18 ? -Math.sign(sparse.position + sparse.velocity * .35) : 0);
      }
      expect(idle.outcome, `idle seed ${seed}`).toBe('fatal-failure');
      expect(idle.elapsed).toBeGreaterThan(4);
      expect(idle.elapsed).toBeLessThan(22);
      if (sparse.outcome === 'passed') sparseWins++;
    }
    expect(sparseWins).toBe(0);
  });

  it('отзывчивый ввод с поправкой каждые 83 мс позволяет пройти 200 seed без касания края', () => {
    for (let seed = 0; seed < 200; seed++) {
      const engine = new BalanceEngine(seed);
      let input = 0, changes = 0, previous = 0, peak = 0;
      for (let tick = 0; tick < 5000 && !engine.outcome; tick++) {
        if (tick % 10 === 0) {
          const predicted = engine.position + engine.velocity * .35;
          input = Math.abs(predicted) > .08 ? -Math.sign(predicted) : 0;
          if (input !== previous) changes++;
          previous = input;
        }
        engine.step(input); peak = Math.max(peak, Math.abs(engine.position));
      }
      expect(engine.outcome, `controlled seed ${seed}`).toBe('passed');
      expect(engine.elapsed).toBe(C.duration);
      expect(peak).toBeLessThan(.85);
      expect(changes).toBeGreaterThan(20);
    }
  });

  it('ветер плавно усиливается, меняет направление и не даёт мгновенных толчков', () => {
    const engine = new BalanceEngine(41);
    const strengths = [0, 10, 25, 36].map(time => { engine.elapsed = time; return engine.windStrength; });
    expect(strengths).toEqual([C.introWind, C.middleWind, C.finalWind, C.peakWind]);
    let previous = 0, signChanges = 0, largestStep = 0;
    for (let tick = 0; tick <= 36 / C.fixedStep; tick++) {
      engine.elapsed = tick * C.fixedStep;
      const wind = engine.wind;
      if (tick > 0) {
        if (Math.sign(wind) !== Math.sign(previous)) signChanges++;
        largestStep = Math.max(largestStep, Math.abs(wind - previous));
      }
      previous = wind;
    }
    expect(signChanges).toBeGreaterThanOrEqual(6);
    expect(largestStep).toBeLessThan(.03);
  });
});

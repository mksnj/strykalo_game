import { expect, it } from 'vitest';
import { autumnStepBudget } from '../../apps/web/src/game/audio/catalog';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { AUTUMN_SCORE as C } from '../../apps/web/src/game/config';

it('second-run buffering freezes its score clock; stalled/unavailable audio uses the fallback', () => {
  const s = new RunSession(42, false, 'second-run');
  expect(autumnStepBudget(s, 0)).toBe(0);
  expect(autumnStepBudget(s, C.musicLeadSeconds)).toBe(0);
  expect(autumnStepBudget(s, undefined)).toBeUndefined();
  expect(autumnStepBudget(s, NaN)).toBeUndefined();
  expect(autumnStepBudget(new RunSession(42, false, 'third-run'), 10)).toBeUndefined();
});
it('a frame stall catches up using bounded fixed steps, without rewinding positions', () => {
  const s = new RunSession(42, false, 'second-run');
  for (let frame = 0; frame < 4; frame++) {
    const seconds = autumnStepBudget(s, C.musicLeadSeconds + 1)!;
    expect(seconds).toBeCloseTo(.25);
    for (let tick = 0; tick < 30; tick++) s.step();
  }
  expect(s.runner.tick).toBe(120);
  expect(autumnStepBudget(s, C.musicLeadSeconds + 1)).toBe(0);
  const x = s.runner.travel;
  expect(autumnStepBudget(s, C.musicLeadSeconds + .8)).toBe(0); expect(s.runner.travel).toBe(x);
});

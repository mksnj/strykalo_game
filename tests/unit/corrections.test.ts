import { describe, expect, it } from 'vitest';
import { JOURNEY, RUNNER, WAITING } from '../../apps/web/src/game/config';
import { WaitingEngine } from '../../apps/web/src/game/minigames/waiting/WaitingEngine';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';

describe('регрессии игровых механик', () => {
  it('реакция двери появляется по нажатию двери и исчезает через четыре активные секунды', () => {
    const engine = new WaitingEngine();
    for (let i = 0; i < 2; i++) engine.gameplayInput();
    engine.gameplayInput(); expect(engine.hint).toBe(false); engine.doorInput(); expect(engine.hint).toBe(true);
    for (let i = 0; i < WAITING.hintSeconds / RUNNER.fixedStep; i++) engine.step(true);
    expect(engine.hint).toBe(false); engine.gameplayInput(); expect(engine.hint).toBe(false);
  });
  it('касания предметов не показывают реакцию двери и не сбрасывают ожидание и события', () => {
    const engine = new WaitingEngine();
    for (let i = 0; i < 80 / RUNNER.fixedStep; i++) engine.step();
    engine.registerPress(); engine.registerPress(); expect(engine.hint).toBe(false);
    engine.registerPress(); expect(engine.hint).toBe(false);
    expect(engine.presses).toBe(3); expect(engine.resets).toBe(0); expect(engine.elapsed).toBe(80);
    expect(engine.drainEvents()).toEqual(['look', 'flicker', 'clock']);
  });
  it('финальные 100 единиц идут с обычной скоростью без генерации и начисления очков', () => {
    const engine = new RunnerEngine(1, { start: JOURNEY.waitingAt, end: JOURNEY.availableEnd, score: 19, empty: true });
    while (!engine.result) {
      expect(engine.speed).toBe(RUNNER.speed); engine.step(); expect(engine.objects).toEqual([]);
    }
    expect(engine.tick * RUNNER.fixedStep).toBeCloseTo(20);
    expect(engine.result).toEqual({ reason: 'stage-complete', score: 19, distance: 700 });
  });
  it('сброс ожидания сохраняет ход визуальных часов', () => {
    const engine = new WaitingEngine();
    for (let i = 0; i < 80 / RUNNER.fixedStep; i++) engine.step();
    const time = engine.activeTime;
    engine.gameplayInput(); engine.step(true);
    expect(engine.activeTime).toBeGreaterThan(time);
    expect(engine.elapsed).toBe(0);
    expect(engine.drainEvents()).toEqual([]);
    for (let i = 0; i < WAITING.duration / RUNNER.fixedStep; i++) engine.step();
    expect(engine.drainEvents()).toEqual(['look', 'flicker', 'clock', 'door']);
  });
});

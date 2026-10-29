import { GENERATION as G } from '../../apps/web/src/game/runner/generationConfig';
import { describe, expect, it } from 'vitest';
import { RUNNER, WAITING, JOURNEY } from '../../apps/web/src/game/config';
import { WaitingEngine, type RoomEvent } from '../../apps/web/src/game/minigames/waiting/WaitingEngine';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { starsPilot } from '../fixtures/starsPilot';

const ticks = (seconds: number) => Math.round(seconds / RUNNER.fixedStep);
function stepRoom(engine: WaitingEngine, seconds: number): void { for (let i = 0; i < ticks(seconds); i++) engine.step(); }
describe('90 секунд бездействия', () => {
  it('взгляд на часы длится ровно 10–15 секунд', () => {
    const engine = new WaitingEngine();
    for (let i = 0; i < ticks(10) - 1; i++) engine.step();
    expect(engine.looking).toBe(false); engine.step(); expect(engine.looking).toBe(true);
    expect(engine.drainEvents()).toEqual(['look']);
    stepRoom(engine, 5); expect(engine.looking).toBe(false);
  });
  it('все события выполняются ровно по одному разу и на точных отметках', () => {
    const engine = new WaitingEngine();
    const events: [RoomEvent, number][] = [];
    for (let i = 0; i < ticks(WAITING.duration); i++) {
      engine.step(); for (const event of engine.drainEvents()) events.push([event, engine.elapsed]);
    }
    expect(events).toEqual([['look', 10], ['flicker', 25], ['clock', 65], ['door', 90]]);
    expect(engine.outcome).toBe('passed'); stepRoom(engine, 20);
    expect(engine.elapsed).toBe(90); expect(engine.drainEvents()).toEqual([]);
  });
  it('сброс очищает события без реакции двери; удержание не позволяет ждать', () => {
    const engine = new WaitingEngine();
    for (let reset = 0; reset < 3; reset++) {
      stepRoom(engine, 80); engine.gameplayInput();
      expect(engine.elapsed).toBe(0); expect(engine.looking).toBe(false); expect(engine.drainEvents()).toEqual([]);
      expect(engine.hint).toBe(false);
    }
    for (let i = 0; i < ticks(110); i++) engine.step(true);
    expect(engine.outcome).toBeNull(); expect(engine.elapsed).toBe(0); expect(engine.resets).toBe(3);
    stepRoom(engine, 10); expect(engine.drainEvents()).toEqual(['look']);
    stepRoom(engine, 79); expect(engine.outcome).toBeNull();
    stepRoom(engine, 1); expect(engine.outcome).toBe('passed');
  });
});
describe('непрерывный маршрут до подъезда', () => {
  it('20 seed проходят все сцены; счёт и расстояние неизменны в мини-играх', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const session = new RunSession(seed, false, undefined, () => Date.parse('2026-10-31T00:00:00Z')), jumped = new Set<string>();
      const seen = new Set<string>();
      let scoreAtFinal = -1;
      for (let tick = 0; tick < 65000 && !session.result; tick++) {
        seen.add(session.phase);
        const moving = session.phase === 'runner' || session.phase === 'final-run';
        if (session.phase === 'runner') {
          const next = session.runner.objects.find(o => o.kind !== 'tape' && !jumped.has(o.id) &&
            o.x - session.runner.travel - RUNNER.playerX - RUNNER.playerWidth / 2 <= G.jumpLead - RUNNER.playerWidth / 2);
          if (next && session.runner.player.grounded) { session.press(); jumped.add(next.id); }
        }
        const distance = session.distance, score = session.score, phase = session.phase;
        if (phase === 'final-run') {
          if (scoreAtFinal < 0) {
            scoreAtFinal = score; expect(session.runner.objects).toEqual([]);
            const inputs = session.runner.inputs.length; session.press(); expect(session.runner.inputs.length).toBe(inputs);
          }
        }
        const balance = session.balance;
        session.startBalance();
        session.startStars();
        const movement = phase === 'stars' && session.stars!.elapsed < 20 ? starsPilot(session.stars!) : { x: 0, y: 0 };
        session.step(phase === 'balance' && balance && Math.abs(balance.position) > 0.06 ? -Math.sign(balance.position) : movement.x, movement.y);
        if (!moving && (session.distance !== distance || session.score !== score)) throw new Error(`Мини-игра изменила счёт/дистанцию: seed ${seed}, ${phase}`);
        if (['stars', 'stars-failure', 'waiting'].includes(phase) && session.result) throw new Error(`Преждевременное завершение: ${phase}`);
        if (session.runner.objects.length >= 30 || (session.stars?.notes.length ?? 0) > 16) throw new Error('Неограниченный рост объектов');
      }
      expect(session.result, `seed ${seed}`).toEqual({ score: scoreAtFinal, distance: JOURNEY.availableEnd, reason: 'completed' });
      for (const phase of ['balance', 'stars', 'stars-retry', 'stars-failure', 'stars-exit', 'waiting', 'room-exit', 'final-run', 'ending']) expect(seen.has(phase)).toBe(true);
      expect(session.starsDefeats).toBe(5);
      expect(session.waiting?.elapsed).toBe(90); expect(session.score).toBeGreaterThan(0);
      const result = session.result; session.step(); expect(session.result).toBe(result);
    }
  }, 30_000);
  it('третье столкновение после 400 фатально; ID и подход к комнате безопасны', () => {
    const engine = new RunnerEngine(6, { start: 400, end: 600, score: 14, clearance: JOURNEY.transitionClearance });
    expect(engine.objects.every(o => o.id.startsWith('courtyard-400-'))).toBe(true);
    for (let i = 0; i < 5000 && !engine.result; i++) engine.step();
    expect(engine.lives).toBe(0);
    expect(engine.result?.reason).toBe('collision'); expect(engine.score).toBeGreaterThanOrEqual(14);
    const clear = new RunnerEngine(1, { start: 400, end: 600, score: 14, clearance: JOURNEY.transitionClearance });
    clear.travel = 600 * RUNNER.pixelsPerUnit - 450; clear.step();
    expect(clear.objects.filter(o => o.kind !== 'tape').every(o => o.x + o.width < 600 * RUNNER.pixelsPerUnit - 500)).toBe(true);
  });
});

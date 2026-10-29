import { GENERATION as G } from '../../apps/web/src/game/runner/generationConfig';
import { describe, expect, it } from 'vitest';
import { BALANCE, JOURNEY, RUNNER, STORY_BEER } from '../../apps/web/src/game/config';
import { BalanceEngine } from '../../apps/web/src/game/minigames/balance/BalanceEngine';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { WorldGenerator } from '../../apps/web/src/game/runner/generator';
import { balanceControls } from '../../apps/web/src/game/input/BalanceInput';

function jumpSafely(session: RunSession, jumped: Set<string>): void {
  if (session.phase !== 'runner') return;
  const next = session.runner.objects.find(o => o.kind !== 'tape' && !jumped.has(o.id) &&
    o.x - session.runner.travel - RUNNER.playerX - RUNNER.playerWidth / 2 <= G.jumpLead - RUNNER.playerWidth / 2);
  if (next && session.runner.player.grounded) { session.press(); jumped.add(next.id); }
}
function reachPipe(session: RunSession): void {
  const jumped = new Set<string>();
  for (let i = 0; i < 7000 && session.phase !== 'balance' && !session.result; i++) {
    jumpSafely(session, jumped); session.step();
  }
  expect(session.phase).toBe('balance'); expect(session.distance).toBe(200);
  expect(session.startBalance()).toBe(true);
}
describe('баланс над оврагом', () => {
  it('два пальца не удваивают усилие, противоположные направления компенсируются', () => {
    balanceControls.clear();
    balanceControls.hold('finger-1', -1); balanceControls.hold('finger-2', -1);
    expect(balanceControls.direction).toBe(-1);
    balanceControls.hold('finger-3', 1); expect(balanceControls.direction).toBe(0);
    balanceControls.release('finger-1'); expect(balanceControls.direction).toBe(0);
    balanceControls.release('finger-3'); expect(balanceControls.direction).toBe(-1);
    balanceControls.clear(); expect(balanceControls.direction).toBe(0);
  });
  it('без управления можно упасть; падение останавливает таймер и физику', () => {
    for (let seed = 0; seed < 30; seed++) {
      const engine = new BalanceEngine(seed);
      for (let i = 0; i < 5000 && !engine.outcome; i++) engine.step(0);
      expect(engine.outcome).toBe('fatal-failure');
      const before = [engine.elapsed, engine.position, engine.velocity];
      engine.step(-1); expect([engine.elapsed, engine.position, engine.velocity]).toEqual(before);
    }
  });
  it('баланс проходим на 100 seed, длится ровно 36 секунд', () => {
    for (let seed = 0; seed < 100; seed++) {
      const engine = new BalanceEngine(seed);
      for (let i = 0; i < 5000 && !engine.outcome; i++) {
        const input = Math.abs(engine.position) > 0.06 ? -Math.sign(engine.position) : 0;
        engine.step(input);
      }
      expect(engine.outcome, `seed ${seed}`).toBe('passed');
      expect(engine.elapsed).toBe(BALANCE.duration);
      expect(engine.progress).toBe(1);
    }
  });
  it('одинаковый seed и ввод воспроизводят ветер и движение', () => {
    const a = new BalanceEngine(71), b = new BalanceEngine(71);
    for (let i = 0; i < 500; i++) { const input = i % 60 > 30 ? 1 : -1; a.step(input); b.step(input); }
    expect(a.position).toBe(b.position); expect(a.velocity).toBe(b.velocity); expect(a.wind).toBe(b.wind);
  });
  it('постоянное отклонение в одну сторону приводит к падению', () => {
    const engine = new BalanceEngine(5);
    for (let i = 0; i < 500 && !engine.outcome; i++) engine.step(1);
    expect(engine.outcome).toBe('fatal-failure');
  });
});
describe('единая попытка до площадки', () => {
  it('прыжок на входе в переход заканчивается приземлением без прибавки расстояния', () => {
    const session = new RunSession(1);
    // Place the runner just before the boundary; no hazards exist in this clear zone.
    session.runner.travel = 200 * RUNNER.pixelsPerUnit - 1;
    session.press();
    for (let i = 0; i < Math.ceil((JOURNEY.approachSeconds + STORY_BEER.pickupSeconds + 1) / RUNNER.fixedStep) + 2 && session.phase !== 'balance'; i++) session.step();
    expect(session.phase).toBe('balance'); expect(session.runner.player.grounded).toBe(true);
    expect(session.distance).toBe(200); expect(session.runner.speed).toBeLessThan(RUNNER.speed);
  });
  it('на 200 открывает трубу без прибавки расстояния и очков; прыжок там отключён', () => {
    const session = new RunSession(1); reachPipe(session);
    const score = session.score, inputs = session.runner.inputs.length;
    session.press(); session.release();
    for (let i = 0; i < 120; i++) session.step();
    expect(session.distance).toBe(200); expect(session.score).toBe(score);
    expect(session.runner.inputs.length).toBe(inputs);
    // No step while paused: wall-clock time has no role in the simulation.
    expect(session.balance!.elapsed).toBeCloseTo(1);
  });
  it('падение на трубе завершает всю попытку с сохранением результата', () => {
    const session = new RunSession(3); reachPipe(session);
    const score = session.score;
    for (let i = 0; i < 5000 && !session.result; i++) session.step();
    expect(session.result).toEqual({ score, distance: 200, reason: 'fall' });
    expect(session.lives).toBe(0);
    const elapsed = session.balance!.elapsed;
    session.step(-1); expect(session.balance!.elapsed).toBe(elapsed);
    const restart = new RunSession(3); expect(restart.score).toBe(0); expect(restart.distance).toBe(0);
    expect(restart.lives).toBe(3);
  });
  it('20 seed проходят маршрут 0–200 → труба → 200–400, без потери очков и повторных ID', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const session = new RunSession(seed);
      const jumped = new Set<string>();
      let scoreBeforePipe = 0, enteredAutumn = false;
      let peakObjects = 0;
      for (let tick = 0; tick < 20000 && session.phase !== 'stars-approach' && !session.result; tick++) {
        jumpSafely(session, jumped);
        session.startBalance();
        if (session.phase === 'balance') scoreBeforePipe = session.score;
        const balance = session.balance;
        const input = balance && Math.abs(balance.position) > 0.06 ? -Math.sign(balance.position) : 0;
        session.step(input);
        if (session.phase === 'pipe-exit' && !enteredAutumn) {
          expect(session.distance).toBe(200); expect(session.score).toBe(scoreBeforePipe);
          expect(session.runner.startDistance).toBe(200); enteredAutumn = true;
        }
        peakObjects = Math.max(peakObjects, session.runner.objects.length);
      }
      expect(enteredAutumn).toBe(true);
      expect(session.result, `seed ${seed}`).toBeNull();
      expect(session.phase).toBe('stars-approach');
      expect(session.distance).toBe(400); expect(session.score).toBeGreaterThan(scoreBeforePipe);
      expect(peakObjects).toBeLessThan(30);
    }
  });
  it('осенний участок использует новые ID и оставляет свободный подход к площадке', () => {
    const start = JOURNEY.balanceAt * RUNNER.pixelsPerUnit;
    const end = JOURNEY.starsAt * RUNNER.pixelsPerUnit;
    const objects = new WorldGenerator(1, end - JOURNEY.transitionClearance, start, 'courtyard-200-').generateUntil(end);
    expect(objects.every(o => o.id.startsWith('courtyard-200-'))).toBe(true);
    expect(objects.filter(o => o.kind !== 'tape').every(o => o.x + o.width < end - 500)).toBe(true);
    expect(objects.every(o => o.x >= start + RUNNER.firstObstacle)).toBe(true);
  });
});

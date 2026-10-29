import { describe, expect, it } from 'vitest';
import { RUNNER as C, JOURNEY } from '../../apps/web/src/game/config';
import { RunnerPhysics, intersects } from '../../apps/web/src/game/runner/physics';
import { OBSTACLE_VARIANTS, GENERATION as G } from '../../apps/web/src/game/runner/generationConfig';
import { WorldGenerator } from '../../apps/web/src/game/runner/generator';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { BalanceEngine } from '../../apps/web/src/game/minigames/balance/BalanceEngine';
import { WaitingEngine } from '../../apps/web/src/game/minigames/waiting/WaitingEngine';
import { endingTimeline, ENDING_DURATION } from '../../apps/web/src/game/views/endingTimeline';

describe('утверждённая полировка', () => {
  it('тап между кадрами сразу запускает полный прыжок; все обычные препятствия проходимы без удержания', () => {
    for (const size of Object.values(OBSTACLE_VARIANTS).flat()) {
      const player = new RunnerPhysics();
      player.press(); player.release();
      for (let x = 0; x <= 310; x += C.speed * C.fixedStep) {
        player.step(C.fixedStep);
        if (x === 0) expect(player.velocity).toBeLessThan(-590);
        expect(intersects({ ...player.bounds, x: x - C.playerWidth / 2 },
          { x: G.jumpLead, y: C.groundY - size.height, ...size }), JSON.stringify(size)).toBe(false);
      }
      expect(player.grounded).toBe(true);
    }
  });

  it('отпущенный буферный тап срабатывает после посадки без двойного прыжка', () => {
    const player = new RunnerPhysics(); player.press(); player.release();
    while (!(player.velocity > 0 && player.y > C.groundY - 40)) player.step(C.fixedStep);
    player.press(); player.release();
    let landed = false, jumped = false;
    for (let i = 0; i < 30; i++) {
      player.step(C.fixedStep); landed ||= player.grounded;
      jumped ||= landed && player.velocity < -500;
    }
    expect(jumped).toBe(true);
  });

  it('первый барьер невысокий, серии открываются позже; кассеты преимущественно одиночные или парами', () => {
    let smallPackets = 0, packets = 0, largestGap = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const objects = new WorldGenerator(seed).generateUntil(12_000);
      const hazards = objects.filter(o => o.kind !== 'tape');
      expect(hazards[0].kind).toBe('fence'); expect(hazards[0].height).toBe(21);
      const early = hazards.filter(h => h.x / C.pixelsPerUnit < G.seriesStartUnits);
      for (let i = 1; i < early.length; i++) expect(early[i].x - early[i - 1].x).toBeGreaterThan(C.minObstacleGap);
      const tapes = objects.filter(o => o.kind === 'tape').sort((a, b) => a.x - b.x);
      for (let i = 1; i < tapes.length; i++) largestGap = Math.max(largestGap, tapes[i].x - tapes[i - 1].x);
      const groups = new Map<string, number>();
      tapes.forEach(t => { const key = t.id.split('-')[1]; groups.set(key, (groups.get(key) ?? 0) + 1); });
      for (const count of groups.values()) { packets++; if (count <= 2) smallPackets++; }
    }
    expect(smallPackets / packets).toBeGreaterThan(.55);
    expect(largestGap).toBeLessThan(1700);
  });

  it.each([false, true])('контрольная точка после трубы: детерминированный откат счёта, повтор и новый старт; dev=%s', developer => {
    const session = new RunSession(4, developer);
    expect(session.continueFromCheckpoint()).toBe(false);
    session.runner = new RunnerEngine(4, { start: 0, end: session.route.balanceAt, score: 9, empty: true });
    session.runner.travel = session.route.balanceAt * C.pixelsPerUnit;
    session.runner.lives = 1;
    session.phase = 'balance'; session.balance = new BalanceEngine(4); session.balance.outcome = 'passed'; session.step();
    expect(session.lives).toBe(1);
    expect(session.checkpoint?.start).toBe(session.route.balanceAt);
    const expected = session.runner.objects;
    const tape = expected.find(o => o.kind === 'tape')!; session.runner.collect(tape.id);
    session.runner.lives = 0;
    session.result = { reason: 'collision', score: session.score, distance: session.distance };
    expect(session.continueFromCheckpoint()).toBe(true);
    expect(session.phase).toBe('runner'); expect(session.score).toBe(9);
    expect(session.lives).toBe(3);
    expect(session.runner.objects).toEqual(expected); expect(session.balance).toBeUndefined();
    expect(session.runner.collect(tape.id)).toBe(true); expect(session.score).toBe(10);
    session.result = { reason: 'star-hit', score: 10, distance: session.route.starsAt };
    expect(session.continueFromCheckpoint()).toBe(true); expect(session.score).toBe(9);
    const restart = new RunSession(4, developer);
    expect(restart.distance).toBe(0); expect(restart.checkpoint).toBeUndefined();
  });

  it('концовка дожидается отдыха, подъёма, прохода внутрь и затемнения', () => {
    const standAt = JOURNEY.endingSlowSeconds + JOURNEY.endingSitSeconds + JOURNEY.endingRestSeconds;
    expect(JOURNEY.endingRestSeconds).toBeGreaterThanOrEqual(2.2);
    expect(JOURNEY.endingRestSeconds).toBe(6);
    expect(endingTimeline(standAt).stand).toBe(0);
    expect(endingTimeline(standAt + JOURNEY.endingStandSeconds).walk).toBe(0);
    const enterAt = standAt + JOURNEY.endingStandSeconds + JOURNEY.endingWalkSeconds;
    expect(endingTimeline(enterAt).walk).toBe(1); expect(endingTimeline(enterAt).enter).toBe(0);
    const session = new RunSession(1); session.phase = 'ending';
    for (let i = 0; i < Math.floor(ENDING_DURATION / C.fixedStep) - 1; i++) session.step();
    expect(session.result).toBeNull();
    expect(endingTimeline(session.phaseTime).enter).toBe(1);
    session.step(); session.step();
    expect(session.result?.reason).toBe('completed');
  });

  it('точки после звёзд и комнаты сохраняют пройденные этапы и прежний счёт', () => {
    const session = new RunSession(12);
    session.runner = new RunnerEngine(12, { start: 200, end: 400, score: 23, empty: true });
    session.runner.travel = 400 * C.pixelsPerUnit;
    session.runner.lives = 1;
    session.phase = 'stars-failure'; session.phaseTime = JOURNEY.narrativeSeconds;
    session.step(); expect(session.checkpoint?.start).toBe(400);
    expect(session.lives).toBe(1);
    session.result = { reason: 'collision', distance: 450, score: 25 };
    expect(session.continueFromCheckpoint()).toBe(true);
    expect(session.phase).toBe('runner'); expect(session.distance).toBe(400); expect(session.score).toBe(23);
    session.phase = 'room-exit'; session.phaseTime = JOURNEY.sceneTransitionSeconds;
    session.runner.lives = 2;
    session.waiting = new WaitingEngine(); session.step();
    expect(session.checkpoint?.start).toBe(600); expect(session.distance).toBe(600);
    expect(session.phase).toBe('final-run'); expect(session.runner.objects).toEqual([]);
    expect(session.lives).toBe(2);
    session.result = { reason: 'completed', distance: 700, score: 23 };
    expect(session.continueFromCheckpoint()).toBe(false);
  });
});

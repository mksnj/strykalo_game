import { GENERATION as G } from '../../apps/web/src/game/runner/generationConfig';
import { describe, expect, it } from 'vitest';
import { RUNNER as C } from '../../apps/web/src/game/config';
import { RunnerPhysics, intersects } from '../../apps/web/src/game/runner/physics';
import { WorldGenerator } from '../../apps/web/src/game/runner/generator';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { endsRun, ROUTE } from '../../apps/web/src/game/state/route';

function simulateJump(releaseAt?: number): number {
  const player = new RunnerPhysics();
  player.press();
  let top = player.y;
  for (let tick = 0; tick < 150; tick++) {
    if (tick === releaseAt) player.release();
    player.step(C.fixedStep);
    top = Math.min(top, player.y);
  }
  expect(player.grounded).toBe(true);
  expect(player.y).toBe(C.groundY);
  return C.groundY - top;
}
describe('физика раннера', () => {
  it('сразу начинает прыжок, возвращается на землю; удержание увеличивает высоту', () => {
    expect(simulateJump()).toBeGreaterThan(115);
    const tap = simulateJump(3), hold = simulateJump();
    expect(tap).toBeGreaterThan(115);
    expect(hold).toBeGreaterThan(tap);
    expect(hold - tap).toBeLessThan(40);
  });
  it('не допускает двойного прыжка', () => {
    const player = new RunnerPhysics(); player.press();
    for (let i = 0; i < 20; i++) player.step(C.fixedStep);
    const velocity = player.velocity;
    player.press(); player.step(C.fixedStep);
    expect(player.velocity).toBeGreaterThan(velocity);
  });
  it('буферизует нажатие перед приземлением', () => {
    const player = new RunnerPhysics(); player.press();
    while (!(player.velocity > 0 && player.y > C.groundY - 18)) player.step(C.fixedStep);
    player.press();
    for (let i = 0; i < 10; i++) player.step(C.fixedStep);
    expect(player.velocity).toBeLessThan(0);
    expect(player.grounded).toBe(false);
  });
  it('сохраняет небольшой coyote time при уходе с опоры', () => {
    const player = new RunnerPhysics(); player.grounded = false; player.y -= 1;
    for (let i = 0; i < 3; i++) player.step(C.fixedStep);
    player.press(); player.step(C.fixedStep);
    expect(player.velocity).toBeLessThan(-500);
  });
  it('касание краёв не считается перекрытием', () => {
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
describe('попытка и очки', () => {
  it('первые два препятствия снимают по жизни, третье останавливает симуляцию', () => {
    const engine = new RunnerEngine(1);
    expect(engine.lives).toBe(3);
    for (let hit = 1; hit <= 3; hit++) {
      engine.objects = [{ id: `hit-${hit}`, kind: 'fence', x: engine.travel + C.playerX - 20,
        y: C.groundY - 24, width: 100, height: 24 }];
      engine.step();
      expect(engine.lives).toBe(3 - hit);
      if (hit < 3) {
        expect(engine.result).toBeNull();
        const travel = engine.travel;
        for (let i = 0; i < 15; i++) engine.step();
        expect(engine.lives).toBe(3 - hit); expect(engine.result).toBeNull();
        expect(engine.travel).toBeGreaterThan(travel);
      }
    }
    expect(engine.result?.reason).toBe('collision');
    const before = { travel: engine.travel, score: engine.score, tick: engine.tick, y: engine.player.y };
    engine.press(); engine.release(); engine.step();
    expect({ travel: engine.travel, score: engine.score, tick: engine.tick, y: engine.player.y }).toEqual(before);
  });
  it('кассета даёт одно очко, неизвестный ID и повторный сбор отклоняются', () => {
    const engine = new RunnerEngine(1);
    const tape = engine.objects.find(o => o.kind === 'tape')!;
    expect(engine.collect(tape.id)).toBe(true);
    expect(engine.collect(tape.id)).toBe(false);
    expect(engine.collect('fake')).toBe(false);
    expect(engine.collect(engine.objects.find(o => o.kind !== 'tape')!.id)).toBe(false);
    expect(engine.score).toBe(1);
  });
  it('перезапуск не переносит очки и собранные предметы', () => {
    const one = new RunnerEngine(1);
    const id = one.objects.find(o => o.kind === 'tape')!.id;
    expect(one.collect(id)).toBe(true);
    const two = new RunnerEngine(1);
    expect(two.lives).toBe(3);
    expect(two.score).toBe(0);
    expect(two.collect(id)).toBe(true);
  });
  it('одинаковые seed и ввод дают одинаковый результат', () => {
    const a = new RunnerEngine(17); const b = new RunnerEngine(17);
    for (let i = 0; i < 1000; i++) {
      if (i === 240) { a.press(); b.press(); }
      if (i === 310) { a.release(); b.release(); }
      a.step(); b.step();
    }
    expect(a.result).toEqual(b.result); expect(a.objects).toEqual(b.objects);
    expect(a.inputs).toEqual(b.inputs);
  });
});
describe('проходимая детерминированная генерация', () => {
  it('сохраняет seed, минимальный интервал и уникальные ID', () => {
    const a = new WorldGenerator(42).generateUntil(12000);
    expect(a).toEqual(new WorldGenerator(42).generateUntil(12000));
    expect(a).not.toEqual(new WorldGenerator(43).generateUntil(12000));
    expect(new Set(a.map(o => o.id)).size).toBe(a.length);
    const hazards = a.filter(o => o.kind !== 'tape');
    for (let i = 1; i < hazards.length; i++) expect(hazards[i].x - hazards[i - 1].x).toBeGreaterThanOrEqual(C.minObstacleGap);
  });
  it('100 разных участков можно пройти реальными прыжками; память ограничена', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const engine = new RunnerEngine(seed);
      const jumped = new Set<string>();
      let peakObjects = 0;
      for (let tick = 0; tick < 6000 && !engine.result; tick++) {
        const next = engine.objects.find(o => o.kind !== 'tape' && !jumped.has(o.id) &&
          o.x - engine.travel - C.playerX - C.playerWidth / 2 <= G.jumpLead - C.playerWidth / 2);
        if (next && engine.player.grounded) { engine.press(); jumped.add(next.id); }
        engine.step();
        peakObjects = Math.max(peakObjects, engine.objects.length);
      }
      expect(engine.result?.reason, `seed ${seed}: ${JSON.stringify({ y: engine.player.y, travel: engine.travel, obstacles: engine.objects.filter(o => o.kind !== 'tape'), inputs: engine.inputs })}`).toBe('stage-complete');
      expect(engine.distance).toBe(200);
      expect(engine.lives).toBe(3);
      expect(engine.score).toBeGreaterThan(0);
      expect(peakObjects).toBeLessThan(30);
    }
  });
  it('оставляет заданные точки подключения мини-игр и сюжетное поражение звёзд', () => {
    expect(ROUTE.map(r => r.distance)).toEqual([200, 400, 600]);
    expect(endsRun('stars', 'narrative-failure')).toBe(false);
    expect(endsRun('balance', 'fatal-failure')).toBe(true);
  });
});

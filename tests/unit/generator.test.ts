import { describe, expect, it } from 'vitest';
import { RUNNER as C } from '../../apps/web/src/game/config';
import { WorldGenerator } from '../../apps/web/src/game/runner/generator';
import { GENERATION as G, OBSTACLE_VARIANTS } from '../../apps/web/src/game/runner/generationConfig';
import { SPAWN_PATTERNS } from '../../apps/web/src/game/runner/patterns';
import { RunnerPhysics, intersects } from '../../apps/web/src/game/runner/physics';

describe('разнообразные и достижимые эпизоды', () => {
  it('каждый шаблон с любой комбинацией размеров проходится; все его кассеты можно собрать', () => {
    const variants = Object.values(OBSTACLE_VARIANTS).flat();
    for (const pattern of SPAWN_PATTERNS) {
      const cases = variants.length ** pattern.hazards.length;
      for (let combination = 0; combination < cases; combination++) {
        const hazards = pattern.hazards.map((x, slot) => {
          const size = variants[Math.floor(combination / variants.length ** slot) % variants.length];
          return { x, y: C.groundY - size.height, ...size };
        });
        const tapes = pattern.tapes.map(tape => ({ ...tape, width: G.cassetteWidth, height: G.cassetteHeight }));
        const collected = new Set<number>();
        const player = new RunnerPhysics();
        let nextJump = 0, collision = false;
        for (let x = -300; x < pattern.length + 100; x += C.speed * C.fixedStep) {
          if (nextJump < pattern.jumpStarts.length && x >= pattern.jumpStarts[nextJump]) {
            player.press(); nextJump++;
          }
          player.step(C.fixedStep);
          const body = { ...player.bounds, x: x + C.speed * C.fixedStep - C.playerWidth / 2 };
          collision ||= hazards.some(hazard => intersects(body, hazard));
          tapes.forEach((tape, index) => { if (intersects(body, tape)) collected.add(index); });
        }
        expect(collision, `${pattern.id}, combination ${combination}`).toBe(false);
        expect(collected.size, `${pattern.id}, combination ${combination}`).toBe(tapes.length);
      }
    }
  });

  it('между любыми эпизодами остаётся время приземлиться и подготовить следующий прыжок', () => {
    const player = new RunnerPhysics(); player.press();
    let flight = 0;
    do { player.step(C.fixedStep); flight += C.speed * C.fixedStep; } while (!player.grounded);
    for (const pattern of SPAWN_PATTERNS) {
      const lastJump = pattern.jumpStarts.at(-1);
      if (lastJump !== undefined) expect(lastJump + flight + G.landingRecovery, pattern.id)
        .toBeLessThanOrEqual(pattern.length + G.rests[0][0] - G.jumpLead);
    }
  });

  it('результат не зависит от разбиения загрузки; предметы не выходят в переход и не дублируются', () => {
    const start = 12_000, end = 29_350;
    const expected = new WorldGenerator(42, end, start, 'segment-').generateUntil(end);
    const streamed = new WorldGenerator(42, end, start, 'segment-');
    const actual = [];
    for (let x = start; x < end; x += 137) actual.push(...streamed.generateUntil(x));
    actual.push(...streamed.generateUntil(end));
    expect(actual).toEqual(expected);
    expect(new Set(actual.map(o => o.id)).size).toBe(actual.length);
    expect(actual.every(o => o.x >= start + C.firstObstacle && o.x + o.width <= end)).toBe(true);
  });

  it('встречаются разные размеры, интервалы, высоты и группы; награда не выдаёт каждую опасность', () => {
    const sizes = new Set<string>(), heights = new Set<number>(), groups = new Set<number>();
    const gaps = new Set<number>();
    let bare = false, free = false;
    for (let seed = 1; seed <= 20; seed++) {
      const objects = new WorldGenerator(seed).generateUntil(12_000);
      const hazards = objects.filter(o => o.kind !== 'tape');
      hazards.forEach((hazard, i) => {
        sizes.add(`${hazard.kind}:${hazard.width}:${hazard.height}`);
        if (i) gaps.add(Math.round(hazard.x - hazards[i - 1].x));
      });
      const packets = new Map<string, typeof objects>();
      for (const object of objects) {
        const index = object.id.split('-')[1];
        packets.set(index, [...(packets.get(index) ?? []), object]);
        if (object.kind === 'tape') heights.add(Math.round(object.y));
      }
      for (const packet of packets.values()) {
        const count = packet.filter(o => o.kind === 'tape').length;
        groups.add(count);
        bare ||= count === 0;
        free ||= packet.every(o => o.kind === 'tape');
      }
      expect(objects.filter(o => o.kind === 'tape').every(tape => hazards.every(hazard => !intersects(tape, hazard)))).toBe(true);
    }
    expect(sizes.size).toBe(12);
    expect([...new Set([...sizes].map(size => size.split(':')[0]))].sort())
      .toEqual(['broken-block', 'debris', 'fence', 'rubble']);
    expect(heights.size).toBeGreaterThan(10);
    expect(gaps.size).toBeGreaterThan(30);
    expect([...groups]).toEqual(expect.arrayContaining([0, 2, 3, 4, 5]));
    expect(bare && free).toBe(true);
  });

  it('при потоковой генерации новые объекты появляются заранее, за правой границей экрана', () => {
    const generator = new WorldGenerator(83, 60_000);
    let closestSpawn = Infinity;
    for (let travel = 0; travel < 60_000; travel += 37) {
      const fresh = generator.generateUntil(travel + C.width + 400);
      if (travel > 0) for (const object of fresh) closestSpawn = Math.min(closestSpawn, object.x - travel);
    }
    expect(Number.isFinite(closestSpawn)).toBe(true);
    expect(closestSpawn).toBeGreaterThanOrEqual(C.width);
  });
});

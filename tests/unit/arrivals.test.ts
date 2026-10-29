import { describe, expect, it } from 'vitest';
import { JOURNEY, RUNNER } from '../../apps/web/src/game/config';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { ARRIVAL, courtArrival, courtDeparture, roomEntry } from '../../apps/web/src/game/views/arrivalLayout';
import { courtPoint } from '../../apps/web/src/game/views/courtSpace';

describe('подход к площадке и комнате', () => {
  it('подход продолжает скорость раннера, выход продолжает движение улицы и проходит через правый проход', () => {
    const runner = new RunnerEngine(1, { start: 200, end: 400, score: 17, clearance: JOURNEY.transitionClearance });
    runner.travel = 400 * RUNNER.pixelsPerUnit;
    const dt = .0001;
    const cameraVelocity = (courtArrival(0).offset - courtArrival(dt).offset) / (dt * JOURNEY.courtApproachSeconds);
    expect(cameraVelocity).toBeCloseTo(runner.speed, 0);
    for (const [x, y] of [[180, 356], [480, 385], [820, 490]]) {
      let previous = courtDeparture(0, x, y);
      expect(previous).toMatchObject({ ...courtPoint(x, y), camera: 0 });
      for (let i = 1; i <= 1000; i++) {
        const next = courtDeparture(i / 1000, x, y);
        expect(next.camera).toBeGreaterThanOrEqual(previous.camera);
        expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(4);
        if (i / 1000 >= .78) expect(next.y).toBe(RUNNER.groundY);
        previous = next;
      }
      expect(previous).toMatchObject({ x: RUNNER.playerX, y: RUNNER.groundY, size: 106 });
      const velocity = (previous.camera - courtDeparture(1 - dt, x, y).camera) / (dt * JOURNEY.courtExitSeconds);
      expect(velocity).toBeCloseTo(RUNNER.speed, 0);
    }
  });
  it('площадка принимает героя в той же точке, без скачка позиции и размера', () => {
    expect(courtArrival(0)).toMatchObject({ offset: ARRIVAL.offset, x: RUNNER.playerX, y: RUNNER.groundY, size: 106 });
    expect(courtArrival(1)).toMatchObject({ offset: 0, ...courtPoint(ARRIVAL.courtX, ARRIVAL.courtY), size: ARRIVAL.courtHeroSize });
    let previous = courtArrival(0);
    const steps = Math.round(JOURNEY.courtApproachSeconds / RUNNER.fixedStep);
    for (let i = 1; i <= steps; i++) {
      const pose = courtArrival(i / steps);
      expect(Math.hypot(pose.x - previous.x, pose.y - previous.y)).toBeLessThan(4);
      expect(pose.offset).toBeLessThanOrEqual(previous.offset);
      previous = pose;
    }
  });
  it.each([
    [200, 400, 'stars-approach', 'stars', JOURNEY.courtApproachSeconds],
    [400, 600, 'room-approach', 'waiting', JOURNEY.roomApproachSeconds],
  ] as const)('подход от %i до %i завершает движение прежде, чем запускается мини-игра', (start, end, approach, mode, seconds) => {
    const session = new RunSession(18, false, undefined, () => Date.parse('2026-10-31T00:00:00Z'));
    session.runner = new RunnerEngine(18, { start, end, score: 19, clearance: JOURNEY.transitionClearance });
    session.runner.travel = end * RUNNER.pixelsPerUnit - 1;
    session.press(); session.step();
    expect(session.phase).toBe(approach);
    const distance = session.distance, score = session.score;
    for (let i = 0; i < Math.round(seconds / RUNNER.fixedStep) - 1; i++) session.step(1, 1, true);
    expect(session.phase).toBe(approach);
    expect(session.stars).toBeUndefined(); expect(session.waiting).toBeUndefined();
    expect(session.runner.player.grounded).toBe(true);
    for (let i = 0; i < 2 && session.phase === approach; i++) session.step();
    expect(session.phase).toBe(mode);
    expect(session.distance).toBe(distance); expect(session.score).toBe(score);
    expect((session.stars ?? session.waiting)?.elapsed).toBe(0);
  });
  it('проход внутри начинается после порога и заканчивается у места ожидания', () => {
    expect(roomEntry(ARRIVAL.thresholdEnd)).toBe(0);
    expect(roomEntry(ARRIVAL.seatArrival)).toBe(1);
    expect(roomEntry(1)).toBe(1);
    expect(roomEntry(.8)).toBeGreaterThan(0); expect(roomEntry(.8)).toBeLessThan(1);
  });
});


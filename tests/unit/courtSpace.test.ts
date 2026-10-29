import { describe, expect, it } from 'vitest';
import { RUNNER, STARS_START } from '../../apps/web/src/game/config';
import { courtPoint, COURT_ARENA, courtCameraFrame, courtGroundY } from '../../apps/web/src/game/views/courtSpace';
import { courtArrival, courtDeparture } from '../../apps/web/src/game/views/arrivalLayout';

describe('независимая проекция игровой арены и камеры', () => {
  it('смена планов ограничена проходом; активная камера неподвижна и вмещает арену', () => {
    for (const portrait of [false, true]) {
      expect(courtCameraFrame('stars-approach', 0, portrait).top).toBe(0);
      const active = courtCameraFrame('stars', 0, portrait);
      expect(active.state).toBe('COURT_ACTIVE');
      expect(courtCameraFrame('stars-approach', 1, portrait).top).toBe(active.top);
      expect(courtCameraFrame('stars-exit', 0, portrait).top).toBe(active.top);
      expect(courtCameraFrame('stars-exit', 1, portrait).top).toBe(0);
      expect(courtCameraFrame('stars', 100, portrait)).toEqual(active);
      const height = portrait ? 600 : 540;
      expect(COURT_ARENA.top - 94).toBeGreaterThan(active.top);
      expect(COURT_ARENA.bottom).toBeLessThan(active.top + height);
      expect(courtCameraFrame('stars-approach', .56).focus).toBe(0);
      expect(courtCameraFrame('stars-approach', .74).focus).toBe(1);
      expect(courtCameraFrame('stars-exit', .52).focus).toBe(1);
      expect(courtCameraFrame('stars-exit', .78).focus).toBe(0);
    }
    for (let p = 0; p <= 1; p += .001) {
      expect(courtGroundY(RUNNER.groundY, courtCameraFrame('stars-approach', p).focus)).toBe(RUNNER.groundY);
    }
  });
  it('позиция и скорость не перескакивают в точках передачи управления', () => {
    const destination = courtPoint(STARS_START.x, STARS_START.y);
    expect(courtArrival(1)).toMatchObject(destination);
    expect(courtDeparture(0, STARS_START.x, STARS_START.y)).toMatchObject(destination);
    const dt = 1e-5;
    for (const pose of [(p: number) => courtArrival(p), (p: number) => courtDeparture(p, 480, 385)]) {
      for (const p of [0, 1]) {
        const a = pose(p), b = pose(p === 0 ? dt : 1 - dt);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(.02);
      }
    }
  });
});

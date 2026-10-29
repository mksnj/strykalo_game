import { describe, it, expect } from 'vitest';
import { pipeBanks, pipeProjection, finalArrival, pipeTurn } from '../../apps/web/src/game/views/worldLayout';
import { ARRIVAL, COURT, courtArrival, courtDeparture, courtSceneryBounds, roomTransition } from '../../apps/web/src/game/views/arrivalLayout';
import { RUNNER } from '../../apps/web/src/game/config';
import { projectPipe } from '../../apps/web/src/game/views/pipeGeometry';
import { COURT_ENTRY, courtEntranceX } from '../../apps/web/src/game/views/courtEntranceLayout';
import { COURT_SPACE, courtCameraFrame } from '../../apps/web/src/game/views/courtSpace';

describe('связность локаций', () => {
  it('прямая труба остаётся прямой во всех промежуточных ракурсах', () => {
    for (let opening = 0; opening <= 1; opening += .01) {
      const camera = { progress: 0, opening, nearX: 200, lean: 0 };
      const a = projectPipe(0, .5, 1, camera), b = projectPipe(0, .5, 30, camera);
      for (let z = 2; z < 30; z++) {
        const p = projectPipe(0, .5, z, camera);
        const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
        expect(Math.abs(cross)).toBeLessThan(1e-7);
      }
    }
  });
  it.each([1, 10])('камера останавливается перед скамейкой без скачка мира, масштаб %i', scale => {
    const lock = 700 - 6 * scale;
    expect(finalArrival(lock, scale)).toEqual({ offset: 0, advance: 0 });
    expect(finalArrival(700, scale)).toEqual({ offset: 0, advance: 360 });
    expect(finalArrival(lock - scale, scale).offset).toBe(60);
    expect(finalArrival(lock + scale, scale).advance).toBe(60);
  });
  it('поворот камеры начинается после остановки и непрерывен', () => {
    expect(pipeTurn(.36)).toBe(0); expect(pipeTurn(1)).toBe(1);
    for (let i = 1; i <= 1000; i++) expect(pipeTurn(i / 1000) - pipeTurn((i - 1) / 1000)).toBeLessThan(.003);
  });
  it.each([1, 10])('труба привязана к игровой плоскости в масштабе %i', scale => {
    const a = pipeBanks(198, scale), b = pipeBanks(199, scale);
    expect(a.near - b.near).toBeCloseTo(RUNNER.pixelsPerUnit / scale);
    expect(a.far - a.near).toBe(560);
    expect(pipeBanks(200, scale).near).toBeGreaterThan(RUNNER.playerX);
    expect(pipeBanks(200, scale, true).far).toBeLessThan(RUNNER.playerX);
  });
  it('дальний берег приближается, ближние объекты движутся быстрее дальних', () => {
    const start = pipeProjection(30, 0), end = pipeProjection(30, 28.8);
    expect(end.y).toBeGreaterThan(start.y + 150);
    expect(end.scale).toBeGreaterThan(start.scale * 20);
    const near = pipeProjection(2, .1).y - pipeProjection(2, 0).y;
    const far = pipeProjection(25, .1).y - pipeProjection(25, 0).y;
    expect(near).toBeGreaterThan(far * 100);
  });
  it('герой проходит через открытый проход ограждения перед центром площадки', () => {
    let gateError = Infinity;
    for (let i = 0; i <= 1000; i++) {
      const pose = courtArrival(i / 1000);
      const localX = pose.x - pose.offset;
      if (Math.abs(localX - COURT.entryX) < 1) gateError = Math.min(gateError, Math.abs(pose.y - RUNNER.groundY));
      expect(pose.size).toBeGreaterThanOrEqual(Math.min(106, ARRIVAL.courtHeroSize));
      expect(pose.size).toBeLessThanOrEqual(Math.max(106, ARRIVAL.courtHeroSize));
    }
    expect(gateError).toBeLessThan(.1);
    expect(courtArrival(1).x).toBe(ARRIVAL.courtX);
  });
  it('сначала герой бежит вдоль улицы, затем поворачивает вглубь через передний проход', () => {
    expect(COURT_SPACE.front).toBeLessThan(RUNNER.groundY);
    for (let i = 0; i <= 1000; i++) {
      const pose = courtArrival(i / 1000);
      if (i / 1000 <= COURT_SPACE.entryTurn) expect(pose.y).toBe(RUNNER.groundY);
    }
  });
  it('герой проходит между стойками видимого входа до смены плана', () => {
    let previous = courtArrival(COURT_SPACE.entryTurn).y, crossings = 0;
    for (let i = 450; i <= 560; i++) {
      const p = i / 1000, pose = courtArrival(p), camera = ARRIVAL.offset - pose.offset;
      expect(Math.abs(pose.x - courtEntranceX(camera, 0))).toBeLessThan(COURT_ENTRY.halfOpening - 16);
      expect(courtCameraFrame('stars-approach', p).focus).toBe(0);
      if (previous > COURT_ENTRY.groundY && pose.y <= COURT_ENTRY.groundY) crossings++;
      previous = pose.y;
    }
    expect(crossings).toBe(1);
    for (const [x, y] of [[180,356],[500,423],[820,490]]) for (let i = 520; i <= 780; i++) {
      const pose = courtDeparture(i / 1000, x, y);
      expect(pose.x).toBeCloseTo(780 - pose.camera, 6);
    }
    expect(courtSceneryBounds(0).right - COURT.exitX).toBeGreaterThanOrEqual(106);
  });
  it('фасад сменяется комнатой только при полном затемнении, без скачка яркости', () => {
    expect(roomTransition(0)).toEqual({ interior: false, shade: 0 });
    expect(roomTransition(1)).toEqual({ interior: true, shade: 0 });
    let previous = roomTransition(0);
    for (let tick = 1; tick <= 10000; tick++) {
      const next = roomTransition(tick / 10000);
      if (previous.interior !== next.interior) {
        expect(previous.shade).toBeGreaterThan(.999);
        expect(next.shade).toBe(1);
      }
      expect(Math.abs(next.shade - previous.shade)).toBeLessThan(.003);
      expect(next.shade).toBeGreaterThanOrEqual(0); expect(next.shade).toBeLessThanOrEqual(1);
      previous = next;
    }
  });
});

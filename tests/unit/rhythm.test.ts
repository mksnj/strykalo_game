import { describe, expect, it } from 'vitest';
import { DIRECTIONS, StarsEngine } from '../../apps/web/src/game/minigames/stars/StarsEngine';
import { rhythmPhase, rhythmSpeed, rhythmTime } from '../../apps/web/src/game/minigames/stars/rhythmTiming';
import { RHYTHM, RUNNER, STORM, JOURNEY, WAITING } from '../../apps/web/src/game/config';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { rhythmControls } from '../../apps/web/src/game/input/JourneyInput';

function advance(e: StarsEngine, until: number, perfect = true) {
  while (e.elapsed < until && !e.outcome) {
    if (perfect) for (const n of e.notes) if (n.state === 'pending' && Math.abs(n.at - e.elapsed) <= RUNNER.fixedStep) e.press(n.direction);
    e.step();
  }
}
describe('endless accelerating four-direction rhythm', () => {
  it.each([0, 2, 4, 10, 19.99, 20, 40])('linear ten-percent steps match the 20-second example: %f', time => {
    expect(rhythmSpeed(time)).toBeCloseTo(1 + Math.floor(time / 2) * .1);
    expect(rhythmTime(rhythmPhase(time))).toBeCloseTo(time, 8);
  });
  it('initial fall is gentler; at 20s all active notes move twice as fast', () => {
    const e = new StarsEngine(1);
    expect(e.notes[0].at).toBeCloseTo(2 + .45 / 1.1); expect(RHYTHM.travelSeconds).toBe(2.1);
    expect(rhythmSpeed(20)).toBe(2);
    expect((rhythmPhase(20.01) - rhythmPhase(20)) / .01).toBeCloseTo(2);
    expect((rhythmPhase(.01) - rhythmPhase(0)) / .01).toBeCloseTo(1);
    const threshold = rhythmPhase(20);
    expect(rhythmTime(threshold + RHYTHM.spawnInterval) - rhythmTime(threshold)).toBeCloseTo(.6);
    expect(rhythmPhase(2 - .000001)).toBeCloseTo(rhythmPhase(2), 4);
  });
  it('perfect play lasts beyond the former limit, generates all directions and stays bounded for 2 minutes', () => {
    const e = new StarsEngine(7), seen = new Set<string>();
    while (e.elapsed < 120 && !e.outcome) {
      for (const n of e.notes) {
        seen.add(n.direction);
        if (n.state === 'pending' && Math.abs(n.at - e.elapsed) <= RUNNER.fixedStep) e.press(n.direction);
      }
      e.step(); expect(e.notes.length).toBeLessThanOrEqual(RHYTHM.maxNotes);
    }
    expect(seen).toEqual(new Set(DIRECTIONS)); expect(e.elapsed).toBeGreaterThanOrEqual(120);
    expect(e.outcome).toBeNull(); expect(e.misses).toBe(0); expect(e.hits).toBeGreaterThan(100);
  });
  it.each([-.23, -.12, 0, .12, .23])('judges the relaxed window without consuming another note: %f', offset => {
    const e = new StarsEngine(1), n = e.notes[0]; e.step(n.at + offset);
    expect(e.press(n.direction)).toBe(offset === 0 ? 'perfect' : 'good'); expect(e.hits).toBe(1);
    expect(e.remainingMistakes).toBe(3);
  });
  it('one wrong direction consumes one note and exactly one mistake, not another on expiry', () => {
    const e = new StarsEngine(1), n = e.notes[0]; e.step(n.at);
    expect(e.press(DIRECTIONS.find(d => d !== n.direction)!)).toBe('miss');
    expect(e.misses).toBe(1); expect(n.state).toBe('missed');
    e.step(n.at + .3); expect(e.misses).toBe(1); expect(e.outcome).toBeNull();
  });
  it('misses one and two continue, the third ends it; no end is scheduled by time', () => {
    const e = new StarsEngine(1);
    for (let i = 1; i <= 3; i++) {
      const n = e.notes.find(n => n.state === 'pending')!;
      e.step(n.at + RHYTHM.goodWindow + .02);
      expect(e.misses).toBe(i); expect(e.remainingMistakes).toBe(3 - i);
      expect(e.outcome).toBe(i === 3 ? 'narrative-failure' : null);
    }
    const tick = e.tick; e.step(); e.press('left'); expect(e.tick).toBe(tick); expect(e.misses).toBe(3);
  });
  it('seed and note timings reproduce, and neither presses nor acceleration move the actor', () => {
    const a = new StarsEngine(88), b = new StarsEngine(88), position = [a.x, a.y];
    advance(a, 45); advance(b, 45); expect(a.notes).toEqual(b.notes); expect(a.hits).toBe(b.hits);
    expect([a.x, a.y]).toEqual(position);
  });
  it('music playhead is authoritative; repeated positions do not advance rhythm', () => {
    const e = new StarsEngine(1); e.step(.5);
    const tick = e.tick; for (let i = 0; i < 100; i++) e.step(.5);
    expect(e.tick).toBe(tick); e.step(.1); expect(e.tick).toBe(tick);
  });
  it('bounded gestures drain once and clear on pause', () => {
    rhythmControls.clear(); rhythmControls.press('left'); expect(rhythmControls.drain()).toEqual(['left']);
    expect(rhythmControls.drain()).toEqual([]); rhythmControls.press('up'); rhythmControls.clear(); expect(rhythmControls.drain()).toEqual([]);
  });
});
it.each([false, true])('rain begins during the run, continues until 90 idle seconds, then 2s rest; developer=%s', developer => {
  const s = new RunSession(42, developer), scale = s.route.scale;
  s.runner = new RunnerEngine(42, { start: s.route.starsAt, end: s.route.waitingAt, score: 17, empty: true, distanceScale: scale });
  s.runner.travel = s.route.waitingAt * 60 - RUNNER.speed * (STORM.runLeadSeconds + .2);
  while (!s.weatherStarted) s.step();
  expect(s.phase).toBe('runner'); const start = s.distance, score = s.score;
  while (s.phase === 'runner') s.step();
  expect(s.phase).toBe('room-approach'); expect(s.distance).toBeGreaterThan(start);
  expect(s.weatherElapsed).toBeCloseTo(1.12, 1);
  expect(s.weatherElapsed + .375 * JOURNEY.roomApproachSeconds).toBeLessThan(3.1);
  while (String(s.phase) !== 'waiting') s.step();
  expect(s.waiting!.elapsed).toBe(0); expect(s.weatherCleared).toBe(false);
  // An input resets the required inactivity, not the weather's lifetime.
  for (let i = 0; i < 30 / RUNNER.fixedStep; i++) s.step();
  s.gameplayInput();
  for (let i = 0; i < 89 / RUNNER.fixedStep; i++) s.step();
  expect(s.phase).toBe('waiting'); expect(s.weatherCleared).toBe(false); expect(s.weatherElapsed).toBeGreaterThan(90);
  while (!s.waiting!.outcome) s.step();
  expect(s.waiting!.elapsed).toBe(WAITING.duration); expect(s.phase).toBe('room-rest'); expect(s.weatherCleared).toBe(true);
  const weather = s.weatherElapsed;
  for (let i = 0; i < (JOURNEY.roomRestSeconds - .1) / RUNNER.fixedStep; i++) s.step();
  expect(s.phase).toBe('room-rest'); expect(s.weatherElapsed).toBe(weather);
  while (String(s.phase) === 'room-rest') s.step();
  expect(s.phase).toBe('room-exit'); expect(s.score).toBe(score);
  expect(STORM.runLeadSeconds).toBe(1.12);
});

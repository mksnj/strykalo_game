import { describe, expect, it } from 'vitest';
import { RUNNER, STORM, JOURNEY } from '../../apps/web/src/game/config';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { RoomReactions, REACTION_SECONDS } from '../../apps/web/src/game/views/roomReactions';
import { stormTimeline } from '../../apps/web/src/game/views/stormTimeline';
import { endingTimeline } from '../../apps/web/src/game/views/endingTimeline';
import { musicCue } from '../../apps/web/src/game/audio/catalog';

describe('blocking rhythm tutorial', () => {
  it.each([1, 88, 2026])('one interlude and blocked intro, seed %i', seed => {
    const s = new RunSession(seed, false, undefined, () => Date.parse('2026-10-31T00:00:00Z'));
    s.runner = new RunnerEngine(seed, { start: 200, end: 400, score: 17, empty: true });
    s.runner.travel = 400 * 60 - 1;
    s.step(); expect(s.phase).toBe('stars-approach');
    const checkpoint = s.checkpoint;
    while (s.phase !== 'stars') s.step();
    expect(s.starsIntroPending).toBe(true);
    expect(musicCue(s)).toBe('stars-intro');
    for (let i = 0; i < 2000; i++) { s.press(); s.step(1, 1, true); }
    expect(s.phaseTime).toBe(0); expect(s.stars!.elapsed).toBe(0); expect(s.stars!.hits).toBe(0);
    expect(s.distance).toBe(400); expect(s.score).toBe(17); expect(s.checkpoint).toBe(checkpoint);
    expect(s.startStars()).toBe(true); expect(s.startStars()).toBe(false);
    expect(musicCue(s)).toBe('stars');
    s.step(); expect(s.stars!.elapsed).toBe(RUNNER.fixedStep);
    expect(s.stars!.outcome).toBeNull(); expect(s.starsIntroPending).toBe(false);
  });
  it('lightning schedule includes outdoor and window flashes; reduced motion removes them', () => {
    for (const at of [0, STORM.lightningInterval, STORM.lightningInterval * 15]) {
      expect(stormTimeline(at).flash).toBe(1);
      expect(stormTimeline(at + .8).flash).toBe(0);
      expect(stormTimeline(at, true).flash).toBe(0);
    }
  });
});
it('three full exhales complete before standing', () => {
  const rest = JOURNEY.endingSlowSeconds + JOURNEY.endingSitSeconds;
  for (let n = 0; n < 3; n++) {
    expect(endingTimeline(rest + n * 2 + .65).breath).toBeCloseTo(1);
    expect(endingTimeline(rest + n * 2 + 1.7).breath).toBeCloseTo(0);
    expect(endingTimeline(rest + n * 2 + 1.7).stand).toBe(0);
  }
  expect(endingTimeline(rest + 6.5).stand).toBeGreaterThan(0);
});
it('prop reactions are independent, bounded and resettable without session access', () => {
  const reactions = new RoomReactions();
  for (const object of ['lamp', 'window', 'clock', 'hero'] as const) {
    expect(reactions.trigger(object, 10)).toBe(true);
    expect(reactions.trigger(object, 10.1)).toBe(false);
    expect(reactions.progress(object, 10)).toBe(0);
    expect(reactions.progress(object, 10 + REACTION_SECONDS[object])).toBeCloseTo(1);
    expect(reactions.trigger(object, 20)).toBe(true);
  }
  reactions.reset();
  expect(reactions.trigger('lamp', 0)).toBe(true);
});

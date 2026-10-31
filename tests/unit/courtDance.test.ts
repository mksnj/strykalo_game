import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { COURT_HERO } from '../../apps/web/src/game/config';
import { musicNodDuration } from '../../apps/web/src/game/views/musicNodAnimation';
import { courtDancePose } from '../../apps/web/src/game/views/courtDancePose';
import { sideStepDuration, sideStepFrame, sideStepHitDuration, sideStepHitFrame } from '../../apps/web/src/game/views/sideStepAnimation';
import { DIRECTIONS, type RhythmFeedback } from '../../apps/web/src/game/minigames/stars/StarsEngine';
import layout from '../../apps/web/src/game/assets/danceLayout.json';
import steps from '../../apps/web/src/game/assets/sideStepLayout.json';

describe('side-step animation timing', () => {
  it.each([
    ['step_left', [0, 1, 2, 3, 4, 5, 6], [460, 85, 90, 420, 90, 85, 360]],
    ['step_right', [6, 7, 8, 9, 10, 11, 12], [360, 85, 90, 420, 90, 85, 600]],
  ] as const)('%s keeps every authored frame duration and finishes with both feet together', (clip, frames, durations) => {
    let elapsed = 0;
    frames.forEach((frame, index) => {
      expect(sideStepFrame(clip, (elapsed + .1) / 1000)).toBe(frame);
      expect(sideStepFrame(clip, (elapsed + durations[index] - .1) / 1000)).toBe(frame);
      elapsed += durations[index];
    });
    expect(sideStepDuration(clip)).toBe(elapsed / 1000);
    expect(sideStepFrame(clip, elapsed / 1000 + 10)).toBe(frames.at(-1));
  });
  it('loops the complete sequence seamlessly, keeps idle still and uses planted reduced-motion poses', () => {
    expect(sideStepDuration('side_to_side')).toBe(2.96);
    for (const time of [0, .46, .8, 1.59, 2.5, 2.959]) {
      expect(sideStepFrame('side_to_side', time + 2.96)).toBe(sideStepFrame('side_to_side', time));
    }
    expect(sideStepFrame('side_to_side', 2.96)).toBe(0);
    expect(sideStepFrame('idle', 100)).toBe(0);
    expect(sideStepFrame('step_left', .8, true)).toBe(3);
    expect(sideStepFrame('step_right', .8, true)).toBe(9);
  });
  it('loads exactly the supplied PNG, with no cropping or image modification', () => {
    const original = readFileSync(`${steps.source}/sprite_sheet.png`);
    expect(readFileSync(`apps/web/public${steps.url}`).equals(original)).toBe(true);
  });
  it.each(['left', 'right'] as const)('%s reacts immediately to hits without changing transition or hold durations', direction => {
    const offset = direction === 'left' ? 0 : 6;
    const samples = [0, .084, .086, .174, .176, .594, .596, .684, .686, .769, .771];
    expect(samples.map(time => sideStepHitFrame(direction, time))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6].map(frame => frame + offset));
    const duration = sideStepHitDuration(direction);
    expect(duration).toBeCloseTo(direction === 'left' ? 1.13 : 1.37);
    expect(sideStepHitFrame(direction, duration + 1)).toBe(6 + offset);
  });
});

describe('provided dance poses follow actual hit feedback', () => {
  it.each(DIRECTIONS.filter(direction => direction !== 'up'))('%s responds to successful hits, then returns to rest', direction => {
    for (const judgment of ['perfect', 'good'] as const) {
      const feedback: RhythmFeedback = { direction, judgment, at: 3 };
      const duration = direction === 'down' ? musicNodDuration() : sideStepHitDuration(direction);
      expect(courtDancePose(feedback, 3)).toBe(direction);
      expect(courtDancePose(feedback, 3 + duration - .01)).toBe(direction);
      expect(courtDancePose(feedback, 3 + duration + .01)).toBe('idle');
    }
  });
  it('up never selects a dance pose, even on successful hits', () => {
    for (const judgment of ['perfect', 'good'] as const) {
      const feedback: RhythmFeedback = { direction: 'up', judgment, at: 3 };
      for (const elapsed of [3, 3.1, 3 + COURT_HERO.gestureSeconds]) {
        expect(courtDancePose(feedback, elapsed)).toBe('idle');
      }
    }
  });
  it('misses, empty presses, a previous-round timestamp and defeat do not start a dance', () => {
    expect(courtDancePose(undefined, 0)).toBe('idle');
    for (const judgment of ['miss', 'empty'] as const) expect(courtDancePose({ direction: 'left', judgment, at: 1 }, 1)).toBe('idle');
    expect(courtDancePose({ direction: 'up', judgment: 'perfect', at: 8 }, 0)).toBe('idle');
    expect(courtDancePose({ direction: 'down', judgment: 'good', at: 1 }, 1.1, .01)).toBe('idle');
  });
  it('keeps exact source PNGs and the audited runtime atlas', () => {
    const audit = JSON.parse(readFileSync(`assets/source/${layout.collection}/audit.json`, 'utf8'));
    const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(audit.inputs.map((input: any) => input.direction).sort()).toEqual([...layout.directions].sort());
    for (const input of audit.inputs) {
      expect(sha(input.file)).toBe(input.sha256);
      expect(sha(input.original.file)).toBe(input.original.sha256);
      expect(sha(input.original.suppliedAs)).toBe(input.original.sha256);
    }
    expect(audit.output.path).toBe(`apps/web/public${layout.url}`);
    expect(sha(audit.toneReference.path)).toBe(audit.toneReference.sha256);
    expect(sha(audit.output.path)).toBe(audit.output.sha256);
    expect(audit.frames.every((frame: any) => frame.visible.x > 0 && frame.visible.y > 0 &&
      frame.visible.x + frame.visible.width < 512 && frame.anchor.x === 256 && frame.anchor.y === 512)).toBe(true);
  });
});

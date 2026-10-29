import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { COURT_HERO } from '../../apps/web/src/game/config';
import { courtDancePose } from '../../apps/web/src/game/views/courtDancePose';
import { DIRECTIONS, type RhythmFeedback } from '../../apps/web/src/game/minigames/stars/StarsEngine';

describe('provided dance poses follow actual hit feedback', () => {
  it.each(DIRECTIONS)('%s responds to successful hits, then returns to rest', direction => {
    for (const judgment of ['perfect', 'good'] as const) {
      const feedback: RhythmFeedback = { direction, judgment, at: 3 };
      expect(courtDancePose(feedback, 3)).toBe(direction);
      expect(courtDancePose(feedback, 3 + COURT_HERO.gestureSeconds - .01)).toBe(direction);
      expect(courtDancePose(feedback, 3 + COURT_HERO.gestureSeconds + .01)).toBe('idle');
    }
  });
  it('misses, empty presses, a previous-round timestamp and defeat do not start a dance', () => {
    expect(courtDancePose(undefined, 0)).toBe('idle');
    for (const judgment of ['miss', 'empty'] as const) expect(courtDancePose({ direction: 'left', judgment, at: 1 }, 1)).toBe('idle');
    expect(courtDancePose({ direction: 'up', judgment: 'perfect', at: 8 }, 0)).toBe('idle');
    expect(courtDancePose({ direction: 'down', judgment: 'good', at: 1 }, 1.1, .01)).toBe('idle');
  });
  it('keeps exact source PNGs and the audited runtime atlas', () => {
    const audit = JSON.parse(readFileSync('assets/source/court-dance-v19/audit.json', 'utf8'));
    const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(audit.inputs.map((input: any) => input.direction).sort()).toEqual([...DIRECTIONS].sort());
    for (const input of audit.inputs) expect(sha(input.file)).toBe(input.sha256);
    expect(sha(audit.output.path)).toBe(audit.output.sha256);
    expect(audit.frames.every((frame: any) => frame.visible.x > 0 && frame.visible.y > 0 &&
      frame.visible.x + frame.visible.width < 512 && frame.anchor.x === 256 && frame.anchor.y === 512)).toBe(true);
  });
});

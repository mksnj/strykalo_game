import { sideStepHitDuration } from './sideStepAnimation';
import { musicNodDuration } from './musicNodAnimation';
import type { RhythmDirection, RhythmFeedback } from '../minigames/stars/StarsEngine';

export type CourtDancePose = Exclude<RhythmDirection, 'up'> | 'idle';

/** Only a successful, current rhythm hit starts a dance pose. Silence and misses keep the resting pose. */
export function courtDancePose(latest: RhythmFeedback | undefined, elapsed: number, failure = 0): CourtDancePose {
  if (!latest || latest.direction === 'up' || failure > 0 || latest.judgment !== 'perfect' && latest.judgment !== 'good') return 'idle';
  const age = elapsed - latest.at;
  const duration = latest.direction === 'down' ? musicNodDuration() : sideStepHitDuration(latest.direction);
  return age >= 0 && age < duration ? latest.direction : 'idle';
}

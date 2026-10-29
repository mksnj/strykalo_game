import { COURT_HERO } from '../config';
import type { RhythmDirection, RhythmFeedback } from '../minigames/stars/StarsEngine';

export type CourtDancePose = RhythmDirection | 'idle';

/** Only a successful, current rhythm hit starts a dance pose. Silence and misses keep the resting pose. */
export function courtDancePose(latest: RhythmFeedback | undefined, elapsed: number, failure = 0): CourtDancePose {
  if (!latest || failure > 0 || latest.judgment !== 'perfect' && latest.judgment !== 'good') return 'idle';
  const age = elapsed - latest.at;
  return age >= 0 && age < COURT_HERO.gestureSeconds ? latest.direction : 'idle';
}

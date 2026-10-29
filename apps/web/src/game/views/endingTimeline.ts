import { JOURNEY as C, ENDING_ART } from '../config';
import { smooth } from './arrivalLayout';

const sitAt = C.endingSlowSeconds;
const restAt = sitAt + C.endingSitSeconds;
const standAt = restAt + C.endingRestSeconds;
const walkAt = standAt + C.endingStandSeconds;
const enterAt = walkAt + C.endingWalkSeconds;
const fadeAt = enterAt + C.endingEnterSeconds;

export const ENDING_DURATION = fadeAt + C.endingFadeSeconds;
/** Shared active-time timeline: rest, rise, walk to the existing entrance, then enter. */
export function endingTimeline(t: number) {
  return {
    slow: Math.min(1, Math.max(0, t / sitAt)),
    sit: smooth((t - sitAt) / C.endingSitSeconds),
    // Three separated slow exhales, with a short still interval between them.
    breath: t >= restAt && t < standAt ? Math.sin(Math.min(1, ((t - restAt) % ENDING_ART.breathSeconds) / 1.3) * Math.PI) : 0,
    stand: smooth((t - standAt) / C.endingStandSeconds),
    walk: smooth((t - walkAt) / C.endingWalkSeconds),
    enter: smooth((t - enterAt) / C.endingEnterSeconds),
    fade: smooth((t - fadeAt) / C.endingFadeSeconds),
    walking: t >= walkAt && t < fadeAt,
  };
}

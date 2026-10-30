import { AUTUMN_SCORE as C, JOURNEY, RUNNER } from '../config';
import type { WorldObject } from './generator';

/** World positions are authored once from the score, never chased after the audio clock. */
export function autumnSequence() {
  const start = JOURNEY.balanceAt * RUNNER.pixelsPerUnit;
  const cues = [
    { time: C.musicLeadSeconds + C.singleJumpRunSeconds, id: 'autumn-single' },
    ...C.extraJumpRunSeconds.map((time, i) => ({ time: C.musicLeadSeconds + time, id: `autumn-extra-${i}` })),
    ...C.jumpMarkers.map((time, i) => ({ time, id: `autumn-accent-${i}` })),
  ].sort((a, b) => a.time - b.time);
  const jumps = cues.map(({ time }) => start + (time - C.musicLeadSeconds) * C.speed);
  const objects: WorldObject[] = jumps.map((travel, i) => ({ id: cues[i].id, kind: 'fence',
    x: travel + RUNNER.playerX + C.jumpLead, y: RUNNER.groundY - C.obstacleHeight,
    width: C.obstacleWidth, height: C.obstacleHeight }));
  return { jumps, objects, reservedStart: jumps[0] - C.preparation,
    // Leave the refrain after the authored combination free of random hazards and tapes.
    reservedEnd: Math.max(objects.at(-1)!.x + C.obstacleWidth + C.landingClearance, JOURNEY.starsAt * RUNNER.pixelsPerUnit) };
}

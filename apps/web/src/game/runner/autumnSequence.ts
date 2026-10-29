import { AUTUMN_SCORE as C, JOURNEY, RUNNER } from '../config';
import type { WorldObject } from './generator';

/** World positions are authored once from the score, never chased after the audio clock. */
export function autumnSequence() {
  const start = JOURNEY.balanceAt * RUNNER.pixelsPerUnit;
  const jumps = C.jumpMarkers.map(time => start + (time - C.musicLeadSeconds) * C.speed);
  const objects: WorldObject[] = jumps.map((travel, i) => ({ id: `autumn-accent-${i}`, kind: 'fence',
    x: travel + RUNNER.playerX + C.jumpLead, y: RUNNER.groundY - C.obstacleHeight,
    width: C.obstacleWidth, height: C.obstacleHeight }));
  return { jumps, objects, reservedStart: jumps[0] - C.preparation,
    // Leave the refrain after the authored combination free of random hazards and tapes.
    reservedEnd: Math.max(objects[2].x + C.obstacleWidth + C.landingClearance, JOURNEY.starsAt * RUNNER.pixelsPerUnit) };
}

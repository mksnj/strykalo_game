import { AUTUMN_SCORE as C, JOURNEY, RUNNER, OBSTACLES } from '../config';
import type { WorldObject } from './generator';

/** World positions are authored once from the score, never chased after the audio clock. */
export function autumnSequence() {
  const start = JOURNEY.balanceAt * RUNNER.pixelsPerUnit;
  const cues = [
    { time: C.musicLeadSeconds + ((C.singleObstacleAt - JOURNEY.balanceAt) * RUNNER.pixelsPerUnit - C.jumpLead) / C.speed,
      id: 'autumn-single', kind: 'fence' as const },
    ...C.extraJumpRunSeconds.map((time, i) => ({ time: C.musicLeadSeconds + time, id: `autumn-extra-${i}`, kind: 'fence' as const })),
    ...C.jumpMarkers.map((time, i) => ({ time, id: `autumn-accent-${i}`, kind: 'fence' as const })),
    ...C.closingObstacleAt.map((distance, i) => ({
      time: C.musicLeadSeconds + ((distance - JOURNEY.balanceAt) * RUNNER.pixelsPerUnit - C.jumpLead) / C.speed,
      id: `autumn-closing-${i}`, kind: C.closingObstacleKinds[i],
    })),
    ...C.fillingObstacleAt.map((distance, i) => ({
      time: C.musicLeadSeconds + ((distance - JOURNEY.balanceAt) * RUNNER.pixelsPerUnit - C.jumpLead) / C.speed,
      id: `autumn-filling-${i}`, kind: C.fillingObstacleKinds[i],
    })),
  ].sort((a, b) => a.time - b.time);
  const jumps = cues.map(({ time }) => start + (time - C.musicLeadSeconds) * C.speed);
  const objects: WorldObject[] = jumps.map((travel, i) => {
    const { id, kind } = cues[i];
    const size = kind === 'fence' ? { width: C.obstacleWidth, height: C.obstacleHeight } : OBSTACLES[kind];
    return { id, kind, x: travel + RUNNER.playerX + C.jumpLead, y: RUNNER.groundY - size.height, ...size };
  });
  return { jumps, objects, reservedStart: jumps[0] - C.preparation,
    // Authored closing obstacles fill the route; random spawns remain outside the reserved phrase.
    reservedEnd: Math.max(objects.at(-1)!.x + objects.at(-1)!.width + C.landingClearance, JOURNEY.starsAt * RUNNER.pixelsPerUnit) };
}

import { JOURNEY, RUNNER } from '../config';
import { clamp } from './arrivalLayout';

export const WORLD = { pitSpan: 560, pipeLip: 20, pipeStopAt: JOURNEY.pipeStopAt,
  finalCameraLead: 360, finalCoast: 140 } as const;
/** Landmarks use the same pixels/unit as the collision plane, never a decorative parallax. */
export function pipeBanks(distance: number, scale: number, farSide = false) {
  const near = RUNNER.playerX + (JOURNEY.balanceAt - distance) / scale * RUNNER.pixelsPerUnit + WORLD.pipeLip - (farSide ? WORLD.pitSpan + WORLD.pipeLip * 2 : 0);
  return { near, far: near + WORLD.pitSpan };
}
/** Perspective projection shared by material, pipe joints and the moving trench. */
export function pipeProjection(z: number, camera: number) {
  const depth = Math.max(.7, z - camera);
  return { scale: 1 / depth, y: 235 + 220 / depth, radius: 100 / depth };
}
export function finalQuiet(distance: number) { return clamp((distance - (JOURNEY.waitingAt + 40)) / 35); }

/** Stop the camera six running units before the bench, with identical screen geometry in demo. */
export function finalArrival(distance: number, scale: number) {
  const remaining = (JOURNEY.availableEnd - distance) / scale * RUNNER.pixelsPerUnit;
  return { offset: Math.max(0, remaining - WORLD.finalCameraLead), advance: Math.max(0, WORLD.finalCameraLead - remaining) };
}
export function pipeTurn(progress: number) {
  const p = clamp((progress - WORLD.pipeStopAt) / (1 - WORLD.pipeStopAt));
  return p * p * (3 - 2 * p);
}

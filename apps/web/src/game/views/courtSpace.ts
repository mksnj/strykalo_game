import { RUNNER, STARS } from '../config';
import { COURT_ENTRY } from './courtEntranceLayout';

/** Street preview and the independent painted arena have separate projections.
 * STARS coordinates, speed and collision math stay in simulation space. The same
 * arena mapping is applied to the hero, meteors and collision ellipses. */
export const COURT_SPACE = {
  arenaTop: 280, depthScale: 1.8,
  streetForeshortening: .25,
  back: 80, front: 408, left: 145, right: 855,
  entry: 260, exit: 780, gateWidth: 130,
  insideGateY: 370, streetY: RUNNER.groundY,
  runnerTop: 0, activeTop: 0, portraitActiveTop: 0,
  entryTurn: .45, entryInside: .62,
  exitGate: .43, exitStreet: .65,
} as const;
export function courtForeshortening(focus = 1): number {
  return COURT_SPACE.streetForeshortening + (1 - COURT_SPACE.streetForeshortening) * focus;
}
/** The ground is viewed side-on from the street and more from above on court.
 * One affine ground projection pivots at the street contact line. Upright
 * billboards retain their proportions; this is a 2D change of view, not a ramp. */
export function courtGroundY(y: number, focus = 1): number {
  return RUNNER.groundY + (y - RUNNER.groundY) * courtForeshortening(focus);
}
export function courtPoint(x: number, y: number) {
  return { x, y: COURT_SPACE.arenaTop + (y - STARS.top) * COURT_SPACE.depthScale };
}
export function courtLogicalPoint(x: number, y: number) {
  return { x, y: STARS.top + (y - COURT_SPACE.arenaTop) / COURT_SPACE.depthScale };
}
export const COURT_ARENA = {
  left: STARS.left, right: STARS.right, top: courtPoint(0, STARS.top).y,
  bottom: courtPoint(0, STARS.bottom).y,
};
export const COURT_IMPACT = {
  radiusX: STARS.radius + 16,
  radiusY: (STARS.radius + 16) * STARS.impactAspect * COURT_SPACE.depthScale,
};
export type CourtCameraState = 'RUNNER' | 'COURT_ENTRY' | 'COURT_ACTIVE' | 'COURT_EXIT';
const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export function courtCameraFrame(phase: string, progress = 0, portrait = false) {
  let state: CourtCameraState = 'RUNNER', focus = 0;
  if (phase === 'stars-approach') {
    state = 'COURT_ENTRY'; focus = ease((progress - COURT_ENTRY.blendStart) / (COURT_ENTRY.blendEnd - COURT_ENTRY.blendStart));
  } else if (phase === 'stars' || phase === 'stars-locked' || phase === 'stars-retry' || phase === 'stars-failure') {
    state = 'COURT_ACTIVE'; focus = 1;
  } else if (phase === 'stars-exit') {
    state = 'COURT_EXIT'; focus = 1 - ease((progress - .52) / .26);
  }
  return { state, focus, top: focus === 0 ? 0 : focus * (portrait ? COURT_SPACE.portraitActiveTop : COURT_SPACE.activeTop) };
}

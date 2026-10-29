import { RUNNER } from '../config';

/** A small courtyard entrance in the facade plane, not an extension of the road. */
export const COURT_ENTRY = {
  sourceX: 1240, parallax: .42, triggerX: 560,
  groundY: 435, viewTop: 280, halfOpening: 50, halfWidth: 190,
  blendStart: .56, blendEnd: .74,
} as const;

export function courtEntranceX(travel: number, endTravel: number): number {
  return COURT_ENTRY.triggerX + (endTravel - travel) * COURT_ENTRY.parallax;
}
export function courtFacadeOffset(endTravel: number): number {
  return COURT_ENTRY.sourceX * RUNNER.groundY / 512 - COURT_ENTRY.triggerX - endTravel * COURT_ENTRY.parallax;
}

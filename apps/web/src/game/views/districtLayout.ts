import { RUNNER } from '../config';

/** Authored contact lines in the 1536×512 painted layers, measured at the pavement. */
export const DISTRICT_GROUND = { night: 508, autumn: 486, shadows: 466 } as const;
export type District = keyof typeof DISTRICT_GROUND;
export function districtOffset(region: District): number {
  if (region === 'night') return 0;
  return RUNNER.groundY - 3 - DISTRICT_GROUND[region] * RUNNER.groundY / 512;
}

import type { ObstacleKind } from '../config';

export const GENERATION = {
  recentPatterns: 2,
  jumpLead: 90, // Keep the larger rubble inside the safe window of the unchanged base jump.
  landingRecovery: 60,
  cassetteWidth: 32, cassetteHeight: 20,
  lowCentre: 406, middleCentre: 342,
  // Enough landing recovery, without the former 720px empty stretches.
  rests: [[80, 160], [140, 220], [200, 280]],
  onboardingUnits: 55, seriesStartUnits: 110, progressionUnits: 500,
  cassetteGap: 420, cassetteStride: 280,
  kindWeights: { fence: 3, 'broken-block': 2, debris: 2, rubble: 2 },
} as const;

/** Small, medium and large silhouettes; all fit the same verified jump window. */
export const OBSTACLE_VARIANTS: Record<ObstacleKind, readonly { width: number; height: number }[]> = {
  fence: [{ width: 64, height: 21 }, { width: 72, height: 24 }, { width: 80, height: 26 }],
  'broken-block': [{ width: 56, height: 26 }, { width: 64, height: 30 }, { width: 72, height: 34 }],
  debris: [{ width: 76, height: 46 }, { width: 88, height: 53 }, { width: 100, height: 60 }],
  rubble: [{ width: 78, height: 44 }, { width: 90, height: 51 }, { width: 100, height: 57 }],
};

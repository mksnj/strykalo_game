import danceLayout from './assets/danceLayout.json' with { type: 'json' };

export const RUNNER = {
  width: 960, height: 540, groundY: 438, playerX: 180,
  playerWidth: 30, playerHeight: 76,
  speed: 300, gravity: 1500, jumpVelocity: 610,
  jumpHoldSeconds: 0.16, jumpHoldAcceleration: 400,
  jumpBuffer: 0.18, coyoteTime: 0.12, fixedStep: 1 / 120,
  pixelsPerUnit: 60, stageEnd: 200, firstObstacle: 1060,
  minObstacleGap: 400, maxLives: 3,
} as const;
export const OBSTACLES = {
  fence: { width: 72, height: 24 },
  'broken-block': { width: 64, height: 30 },
  debris: { width: 88, height: 53 },
  rubble: { width: 90, height: 51 },
} as const;
export type ObstacleKind = keyof typeof OBSTACLES;

export const JOURNEY = { balanceAt: 200, starsAt: 400, waitingAt: 600, availableEnd: 700,
  approachSeconds: 4.4, pipeStopAt: .36, exitSeconds: 2.4, sceneTransitionSeconds: 2.6, narrativeSeconds: 3.8,
  courtApproachSeconds: 4.8, roomApproachSeconds: 4.8, roomRestSeconds: 2,
  courtExitSeconds: 4.6,
  endingSlowSeconds: 1.8, endingSitSeconds: 1, endingRestSeconds: 6,
  endingStandSeconds: 0.9, endingWalkSeconds: 1.6, endingEnterSeconds: 1, endingFadeSeconds: 2,
  // Keep the last obstacles clear of scene transitions.
  transitionClearance: 650, shadowStart: 460, shadowEnd: 496 } as const;
export const DEVELOPER = { routeDivisor: 10 } as const;
/** Guaranteed story beat in the cleared area before the pipe camera turn. */
export const STORY_BEER = { pickupSeconds: 1.05, collectAt: .45, ahead: 10, width: 12, height: 36 } as const;
export const REFERENCE_ART = {
  shadowDelayMs: 280, shadowHeight: 106, shadowWidth: 106, shadowBehind: 92,
  shadowOpacity: .72, shadowAppearUnits: 5, shadowFadeUnits: 15,
  televisionAt: 80, televisionWidth: 150, televisionHeight: 37.5, televisionY: 416,
  televisionBodyWidth: 88, televisionBodyHeight: 66, televisionParallax: .42,
  televisionBodyTint: 0x7b8793, televisionWaterTint: 0x727b84,
  televisionSubmerged: 12, televisionSinkDepth: 58, televisionSinkMs: 6000,
} as const;
/** Active-time story beat; thunder follows the same lightning schedule as the drawing. */
export const STORM = { runLeadSeconds: 1.12, lightningInterval: 6.5, thunderDelay: .12, clearSeconds: .5 } as const;
/** Calibrated against a 2.1 m entrance, a 1.75 m adult and a 45 cm bench seat. */
export const ENDING_ART = { standingSize: 106, seatedHeight: 72,
  benchX: 740, benchWidth: 166, benchHeight: 58, breathSeconds: 2 } as const;
export const BALANCE = { duration: 36, fixedStep: RUNNER.fixedStep, limit: 1,
  steering: 3.6, damping: 1.65, instability: .85, lateInstability: 1.05,
  introEnd: 10, finalStart: 25,
  introWind: .18, middleWind: .7, finalWind: 1.15, peakWind: 1.7,
  windFrequency: .9, gustFrequency: 1.65,
} as const;
export const STARS = { successThresholdSeconds: 15, escalationSeconds: 8, speed: 220, radius: 13, impactAspect: .45,
  verticalSpeed: 190, verticalAcceleration: 1800, verticalBraking: 3000,
  left: 180, right: 820, top: 356, bottom: 490,
  initialRate: 2, rateIncrease: 1, spawnTempo: .9, lookSeconds: 2.2,
  minimumSeparation: 44, targetOffsetMin: 14, targetOffsetMax: 92, prediction: .65,
  firstSpawn: .15,
  minimumWarning: .45, minimumFall: .45, impactSeconds: .18, afterglowSeconds: .22,
  // Ordinary impacts linger longer and marks can be closer as the shower thickens.
  impactGrowthSeconds: 60, separationDecaySeconds: 40,
  poolSize: 96, trailLength: 108, drift: 88,
} as const;
/** Entrance ends at the centre of the existing arena; no movement bounds change. */
export const STARS_START = { x: 640, y: (STARS.top + STARS.bottom) / 2 } as const;
/** Linear +10% of initial speed every 2s: 1× at 0s, 2× at 20s. */
export const RHYTHM = { firstSpawn: .35, spawnInterval: 1.2, travelSeconds: 2.1,
  attempts: 5, retrySeconds: 1.25,
  accelerationSeconds: 2, accelerationStep: .1, maxMistakes: 3, maxNotes: 32,
  perfectWindow: .09, goodWindow: .24, feedbackSeconds: .65 } as const;
const autumnMusicStartSeconds = 0;
const autumnEndSeconds = 41;
/** File positions, including the pipe exit and court approach. Accents need listening approval. */
export const AUTUMN_SCORE = {
  endSeconds: autumnEndSeconds, musicStartSeconds: autumnMusicStartSeconds,
  musicLeadSeconds: autumnMusicStartSeconds + JOURNEY.exitSeconds,
  speed: (JOURNEY.starsAt - JOURNEY.balanceAt) * RUNNER.pixelsPerUnit /
    (autumnEndSeconds - autumnMusicStartSeconds - JOURNEY.exitSeconds - JOURNEY.courtApproachSeconds),
  jumpMarkers: [26.79, 28.09, 29.2] as readonly number[],
  jumpLead: 90, preparation: 500, landingClearance: 350,
  obstacleWidth: 72, obstacleHeight: 24, calibration: 'needs-listening' } as const;
export const COURT_HERO = { size: 154, sourceWidth: 128, sourceHeight: 256,
  gestureSeconds: .45, idlePixels: .65, breathMs: 1400, reducedMotionScale: .2, failurePixels: 2 } as const;
export const COURT_DANCE = { ...danceLayout, crossfadeSeconds: .08 } as const;
export const WAITING = { duration: 90, lookAt: 10, lookEnd: 15, flickerAt: 25,
  clockAt: 65, hintSeconds: 4, hintFadeSeconds: 1 } as const;
/** Client-time release notice; can be supplied with a server clock by RunSession. */
export const STARS_ACCESS = { opensAt: '2026-10-30T08:00:00+03:00' } as const;
/** Candidate after the quiet introduction of the installed 05-teni.mp3; confirm by listening. */
export const SHADOWS_SCORE = { musicStartSeconds: 26, calibration: 'needs-listening' } as const;
export const COLLISION_FEEDBACK = { seconds: .8, blinkSeconds: .1 } as const;

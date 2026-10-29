import { RUNNER, JOURNEY, STARS, STARS_START, COURT_HERO, AUTUMN_SCORE } from '../config';
import { COURT_SPACE as SPACE, courtPoint, courtGroundY, courtCameraFrame } from './courtSpace';
import { COURT_ENTRY, courtEntranceX } from './courtEntranceLayout';

export const ARRIVAL = {
  offset: 300, exitAdvance: 1100,
  // Match the open alley at source X=1150, before the autumn tile's right facade.
  districtBoundary: 100 + (1150 - 220) * RUNNER.groundY / 512,
  courtX: STARS_START.x, courtY: STARS_START.y, courtHeroSize: COURT_HERO.size,
  // Visible bounds: front is 248/256 tall, side frames are about 112/128 tall.
  sideToFront: (248 / 256) / (112 / 128),
  doorX: 640, doorY: 418,
  roomOffset: 0, doorArrival: .30, thresholdEnd: .40,
  roomFadeStart: .32, roomCut: .375, roomFadeIn: .40, roomFadeEnd: .48,
  seatArrival: .95, roomEntryX: 865, roomSeatX: 402, roomY: 428,
  courtGateAt: .42, courtInsideAt: .88,
} as const;
/** The entrance meets the sidewalk at groundY; the back of the court recedes into the yard. */
export const COURT = { backY: SPACE.back, frontY: SPACE.front,
  gateY: SPACE.front, gateTop: SPACE.front, gateBottom: RUNNER.groundY,
  pavementLead: 480,
  houseRight: 100, nextDistrictJoinSourceX: 720,
  houseScale: RUNNER.groundY / 512,
  houseSourceWidth: 220, houseSourceFoot: 486, houseGroundY: RUNNER.groundY - 3,
  // The playable arena starts after the facade and an 80 px unobstructed entrance.
  entryX: SPACE.entry, entranceWidth: SPACE.gateWidth,
  markingBackLeft: STARS.left, markingFrontLeft: STARS.left,
  markingBackRight: STARS.right, markingFrontRight: STARS.right,
  // Far-plane furniture: the rim is 134 px above its contact plane. A standing
  // hero at this depth is about 77 px tall (3.05 / 1.75), including sprite padding.
  hoopX: 277, hoopScale: .28, fenceHeight: 78,
  exitX: SPACE.exit, exitApron: 120, sideSplay: 32 } as const;
/** Near-world coordinates use one translation, exactly like the asphalt and arena. */
export function courtHouseRight(offset: number): number {
  return COURT.houseRight + offset;
}
export function courtDistrictBoundary(offset: number): number {
  return ARRIVAL.districtBoundary + offset;
}
export function courtSceneryBounds(offset: number) {
  const houseRight = courtHouseRight(offset);
  return { left: Math.min(offset - COURT.pavementLead, houseRight - COURT.houseSourceWidth * COURT.houseScale),
    right: Math.max(offset + SPACE.right + COURT.exitApron, houseRight) };
}
export const clamp = (value: number): number => Math.max(0, Math.min(1, value));
export const smooth = (value: number): number => { const p = clamp(value); return p * p * (3 - 2 * p); };
export const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;
/** Cubic motion with explicit endpoint velocities, in units per complete transition. */
export function motion(from: number, to: number, startVelocity: number, endVelocity: number, p: number): number {
  const t = clamp(p), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * from + (t3 - 2 * t2 + t) * startVelocity +
    (-2 * t3 + 3 * t2) * to + (t3 - t2) * endVelocity;
}
/** Screen coordinates shared by arrival animation and the destination views. */
export function courtArrival(progress: number, distanceScale = 1) {
  const p = clamp(progress), velocity = (distanceScale === 1 ? AUTUMN_SCORE.speed : RUNNER.speed * .45) * JOURNEY.courtApproachSeconds;
  // Match the runner's incoming speed, then ease to zero without overshooting the 300 px alley.
  const camera = ARRIVAL.offset * (1 - (1 - p) ** (velocity / ARRIVAL.offset));
  const destination = courtPoint(ARRIVAL.courtX, ARRIVAL.courtY);
  const towardGate = clamp(p / SPACE.entryTurn);
  const through = smooth((p - SPACE.entryTurn) / (SPACE.entryInside - SPACE.entryTurn));
  const inside = smooth((p - SPACE.entryInside) / (1 - SPACE.entryInside));
  const gateX = courtEntranceX(camera, 0);
  const x = p <= SPACE.entryTurn ? lerp(RUNNER.playerX, gateX, smooth(towardGate)) :
    lerp(gateX, destination.x, inside);
  const focus = courtCameraFrame('stars-approach', p).focus;
  const streetY = courtGroundY(lerp(RUNNER.groundY, SPACE.insideGateY, through), 0);
  const arenaY = lerp(478, destination.y, smooth((p - COURT_ENTRY.blendEnd) / (1 - COURT_ENTRY.blendEnd)));
  const y = lerp(streetY, arenaY, focus);
  const enter = smooth((p - COURT_ENTRY.blendStart) / (1 - COURT_ENTRY.blendStart));
  return { offset: ARRIVAL.offset - camera, x,
    y,
    size: lerp(106, ARRIVAL.courtHeroSize, enter),
    sideSize: lerp(106, ARRIVAL.courtHeroSize * ARRIVAL.sideToFront, enter), opening: enter };
}
/** Walk through the right-hand opening; scenery translates without changing opacity. */
export function courtDeparture(progress: number, startX: number, startY: number) {
  const p = clamp(progress), velocity = RUNNER.speed * JOURNEY.courtExitSeconds;
  const start = courtPoint(startX, startY);
  const toGate = smooth(p / .52), through = smooth((p - .52) / .26);
  const run = clamp((p - .78) / .22);
  const worldX = p < .52 ? lerp(start.x, SPACE.exit, toGate) :
    motion(SPACE.exit, ARRIVAL.exitAdvance + RUNNER.playerX, 0, velocity * .22, run);
  const camera = motion(0, ARRIVAL.exitAdvance, 0, velocity * .48, (p - .52) / .48);
  const y = p < .52 ? lerp(start.y, 478, toGate) : lerp(478, RUNNER.groundY, through);
  const size = lerp(ARRIVAL.courtHeroSize, 106, through);
  return { camera, offset: -camera, worldX, x: worldX - camera,
    y, size, sideSize: lerp(ARRIVAL.courtHeroSize * ARRIVAL.sideToFront, 106, through) };
}
export function roomEntry(progress: number) {
  return smooth((progress - ARRIVAL.thresholdEnd) / (ARRIVAL.seatArrival - ARRIVAL.thresholdEnd));
}
/** Switch full-frame views only while completely dark. Total fade is about 1.4 seconds. */
export function roomTransition(progress: number) {
  const p = clamp(progress);
  return { interior: p >= ARRIVAL.roomCut,
    shade: p < ARRIVAL.roomCut ? smooth((p - ARRIVAL.roomFadeStart) / (ARRIVAL.roomCut - ARRIVAL.roomFadeStart)) :
      1 - smooth((p - ARRIVAL.roomFadeIn) / (ARRIVAL.roomFadeEnd - ARRIVAL.roomFadeIn)) };
}
export function roomArrival(progress: number) {
  const run = smooth(progress / ARRIVAL.doorArrival);
  const through = smooth((progress - ARRIVAL.doorArrival) / (ARRIVAL.thresholdEnd - ARRIVAL.doorArrival));
  return { camera: 0, x: lerp(RUNNER.playerX, ARRIVAL.doorX, run),
    y: lerp(RUNNER.groundY, ARRIVAL.doorY, run) - through * 5, alpha: 1 - through, size: 106 - through * 8 };
}

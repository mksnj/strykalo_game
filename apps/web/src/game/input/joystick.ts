import { clampVector } from './JourneyInput';
export const JOYSTICK_DEAD_ZONE = .12;
/** Radial dead zone, continuous analogue magnitude, unit maximum speed. */
export function joystickVector(x: number, y: number, radius: number) {
  if (!(radius > 0)) return { x: 0, y: 0 };
  const vector = clampVector(x / radius, y / radius);
  const length = Math.hypot(vector.x, vector.y);
  if (length <= JOYSTICK_DEAD_ZONE) return { x: 0, y: 0 };
  const magnitude = (length - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);
  return { x: vector.x / length * magnitude, y: vector.y / length * magnitude };
}

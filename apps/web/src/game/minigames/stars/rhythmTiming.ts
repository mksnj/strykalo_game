import { RHYTHM as C } from '../../config';
export function rhythmSpeed(time: number): number {
  return 1 + Math.floor(Math.max(0, time) / C.accelerationSeconds + 1e-9) * C.accelerationStep;
}
/** Integrated speed keeps all falling notes continuous across each acceleration. */
export function rhythmPhase(time: number): number {
  const t = Math.max(0, time), n = Math.floor(t / C.accelerationSeconds);
  return C.accelerationSeconds * (n + C.accelerationStep * n * (n - 1) / 2) +
    (t - n * C.accelerationSeconds) * (1 + n * C.accelerationStep);
}
export function rhythmTime(phase: number): number {
  const a = C.accelerationSeconds * C.accelerationStep / 2;
  const b = C.accelerationSeconds * (1 - C.accelerationStep / 2);
  const n = Math.max(0, Math.floor((2 * Math.max(0, phase)) / (Math.sqrt(b * b + 4 * a * Math.max(0, phase)) + b)));
  const base = C.accelerationSeconds * (n + C.accelerationStep * n * (n - 1) / 2);
  return n * C.accelerationSeconds + (phase - base) / (1 + n * C.accelerationStep);
}

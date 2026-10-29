import { STORM } from '../config';
import { smooth } from './arrivalLayout';

export function stormTimeline(t: number, reducedMotion = false) {
  const age = Math.max(0, t) % STORM.lightningInterval;
  const flash = reducedMotion || age >= .65 ? 0 : Math.exp(-age * 7);
  return { flash, dark: smooth(t / .25), rain: smooth(t / .25) };
}

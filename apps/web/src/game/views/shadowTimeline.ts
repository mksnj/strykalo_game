import { JOURNEY, REFERENCE_ART as C, RUNNER } from '../config';
import { smooth, clamp } from './arrivalLayout';

interface Echo { time: number; y: number; frame: number }
export class ShadowTrail {
  private history: Echo[] = [];
  clear(): void { this.history = []; }
  sample(time: number, y: number, frame: number): Echo {
    if ((this.history.at(-1)?.time ?? 0) > time) this.clear();
    if (this.history.at(-1)?.time !== time) this.history.push({ time, y, frame });
    while (this.history.length > 90) this.history.shift();
    for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].time <= time - C.shadowDelayMs) return this.history[i];
    return this.history[0];
  }
}
export function shadowPose(distance: number, echo: Echo) {
  const progress = clamp((distance - JOURNEY.shadowStart) / (JOURNEY.shadowEnd - JOURNEY.shadowStart));
  const alpha = smooth((distance - JOURNEY.shadowStart) / C.shadowAppearUnits) *
    smooth((JOURNEY.shadowEnd - distance) / C.shadowFadeUnits);
  return { progress, alpha: alpha * C.shadowOpacity, x: RUNNER.playerX - C.shadowBehind,
    y: echo.y, frame: echo.frame, flip: false, width: C.shadowWidth, height: C.shadowHeight };
}

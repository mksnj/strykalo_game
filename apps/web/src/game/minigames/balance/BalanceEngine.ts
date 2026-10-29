import { BALANCE as C } from '../../config';
import { seededRandom } from '../../runner/generator';
function smooth(value: number): number { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }

/** Continuous seeded wind, bounded steering and inertia; no sudden random kicks. */
export class BalanceEngine {
  elapsed = 0;
  position = 0;
  velocity = 0;
  outcome: 'passed' | 'fatal-failure' | null = null;
  private readonly sign: number;
  private readonly phase: number;
  constructor(seed: number) {
    const random = seededRandom(seed);
    this.sign = random() < 0.5 ? -1 : 1;
    this.phase = random() * Math.PI * 2;
  }
  get wind(): number {
    return this.windStrength * (Math.sin(this.elapsed * C.windFrequency + this.phase) * .64 +
      Math.sin(this.elapsed * C.gustFrequency + this.phase * 1.7) * .3 +
      this.sign * Math.cos(this.elapsed * .32) * .22);
  }
  get progress(): number { return Math.min(1, this.elapsed / C.duration); }
  get windStrength(): number {
    if (this.elapsed < C.introEnd) return C.introWind + (C.middleWind - C.introWind) * smooth(this.elapsed / C.introEnd);
    if (this.elapsed < C.finalStart) return C.middleWind + (C.finalWind - C.middleWind) * smooth((this.elapsed - C.introEnd) / (C.finalStart - C.introEnd));
    return C.finalWind + (C.peakWind - C.finalWind) * smooth((this.elapsed - C.finalStart) / (C.duration - C.finalStart));
  }
  step(direction: number): void {
    if (this.outcome) return;
    const dt = C.fixedStep;
    const instability = C.instability + this.progress * C.lateInstability;
    this.velocity += (this.position * instability + this.wind + Math.max(-1, Math.min(1, direction)) * C.steering -
      this.velocity * C.damping) * dt;
    this.position += this.velocity * dt;
    this.elapsed = Math.min(C.duration, this.elapsed + dt);
    // Falling takes precedence over reaching the far bank on the same tick.
    if (Math.abs(this.position) >= C.limit) this.outcome = 'fatal-failure';
    else if (this.elapsed >= C.duration) this.outcome = 'passed';
  }
}

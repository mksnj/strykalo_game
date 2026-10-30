import layout from '../assets/shuffleLayout.json';
import type { RhythmDirection } from '../minigames/stars/StarsEngine';

export type ShuffleDirection = RhythmDirection | 'groove';
/** Session-only tuning from the developer preview. Production keeps the packaged default. */
export const shuffleSettings = { durationSeconds: layout.durationSeconds };
export const shuffleFrame = (direction: ShuffleDirection, progress: number): number =>
  layout.frames[direction] + Math.round(Math.max(0, Math.min(1, progress)) * (layout.samples - 1));

/** In-place groove and four accents; one replaceable pending tap, no accumulated translation. */
export class CourtShuffle {
  direction?: ShuffleDirection;
  pending?: ShuffleDirection;
  progress = 0;
  offset = 0;
  duration = layout.durationSeconds;
  private lastTime?: number;
  press(direction: RhythmDirection): void {
    if (this.direction && this.direction !== 'groove') this.pending = direction;
    else this.start(direction);
  }
  private start(direction: ShuffleDirection): void {
    this.direction = direction; this.progress = 0;
  }
  update(time: number, stopping = false, grooving = false): number {
    const delta = this.lastTime === undefined ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    if (!stopping && grooving && !this.direction) this.start('groove');
    if (stopping) this.pending = undefined;
    if (this.direction) {
      this.progress += delta / (this.direction === 'groove' ? layout.grooveSeconds : this.duration);
      while (this.direction && this.progress >= 1) {
        const remainder = this.progress - 1, next = this.pending;
        this.direction = undefined; this.pending = undefined; this.progress = 0;
        if (!stopping && (next || grooving)) {
          this.start(next ?? 'groove');
          if (this.direction) this.progress = remainder;
        }
      }
    }
    return this.direction ? shuffleFrame(this.direction, this.progress) : layout.frames.idle;
  }
  reset(preservePosition = false): void {
    this.direction = undefined; this.pending = undefined; this.progress = 0;
    if (!preservePosition) this.offset = 0;
    this.lastTime = undefined;
  }
}

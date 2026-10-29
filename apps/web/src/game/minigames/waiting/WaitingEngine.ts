import { RUNNER, WAITING as C } from '../../config';
export type RoomEvent = 'look' | 'flicker' | 'clock' | 'door';
const EVENTS: readonly [RoomEvent, number][] = [ ['look', C.lookAt], ['flicker', C.flickerAt],
  ['clock', C.clockAt], ['door', C.duration] ];

/** Only active simulation ticks count; restarting creates a fresh event timeline. */
export class WaitingEngine {
  private ticks = 0;
  private activeTicks = 0;
  private hintUntil = 0;
  private pending: RoomEvent[] = [];
  resets = 0;
  presses = 0;
  outcome: 'passed' | null = null;
  get elapsed(): number { return this.ticks * RUNNER.fixedStep; }
  get looking(): boolean { return this.elapsed >= C.lookAt && this.elapsed < C.lookEnd; }
  get activeTime(): number { return this.activeTicks * RUNNER.fixedStep; }
  get hint(): boolean { return this.activeTicks < this.hintUntil; }
  get hintOpacity(): number { return Math.max(0, Math.min(1,
    (this.hintUntil - this.activeTicks) * RUNNER.fixedStep / C.hintFadeSeconds)); }
  registerPress(): void {
    if (this.outcome) return;
    this.presses++;
  }
  doorInput(): void {
    if (this.outcome) return;
    this.registerPress();
    this.hintUntil = this.activeTicks + Math.round(C.hintSeconds / RUNNER.fixedStep);
  }
  gameplayInput(): void {
    if (this.outcome) return;
    this.ticks = 0; this.resets++; this.pending = [];
    this.registerPress();
  }
  step(held = false): void {
    if (this.outcome) return;
    this.activeTicks++;
    if (held) { this.ticks = 0; return; }
    this.ticks++;
    for (const [event, seconds] of EVENTS) if (this.ticks === Math.round(seconds / RUNNER.fixedStep)) this.pending.push(event);
    if (this.ticks === Math.round(C.duration / RUNNER.fixedStep)) this.outcome = 'passed';
  }
  drainEvents(): RoomEvent[] { const events = this.pending; this.pending = []; return events; }
}

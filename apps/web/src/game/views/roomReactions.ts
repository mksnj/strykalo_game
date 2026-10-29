export type RoomObject = 'lamp' | 'window' | 'clock' | 'hero' | 'door';
export const REACTION_SECONDS = { lamp: 1.6, window: 1.8, clock: 2.4, hero: 1.8, door: .6 } as const;
/** Bounded independent active-time reactions; repeated presses cannot stack timers. */
export class RoomReactions {
  private starts: Partial<Record<RoomObject, number>> = {};
  reset(): void { this.starts = {}; }
  progress(object: RoomObject, time: number): number {
    const at = this.starts[object];
    return at === undefined ? 1 : Math.min(1, Math.max(0, (time - at) / REACTION_SECONDS[object]));
  }
  trigger(object: RoomObject, time: number): boolean {
    if (this.progress(object, time) < 1) return false;
    this.starts[object] = time; return true;
  }
}

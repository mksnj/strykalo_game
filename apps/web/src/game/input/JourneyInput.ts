import { isSystemTarget } from './gameplayTarget';
import type { RhythmDirection } from '../minigames/stars/StarsEngine';
/** Edge-triggered taps only. Never derive notes from a held movement vector. */
export const rhythmControls = {
  pending: [] as RhythmDirection[],
  press(direction: RhythmDirection): void { if (this.pending.length < 16) this.pending.push(direction); },
  drain(): RhythmDirection[] { return this.pending.splice(0); },
  clear(): void { this.pending.length = 0; },
};
type Direction = 'left' | 'right' | 'up' | 'down';
export function clampVector(x: number, y: number): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}
class MovementControls {
  private holds = new Map<string, Direction>();
  private analog = new Map<string, { x: number; y: number }>();
  hold(token: string, direction: Direction): void { this.holds.set(token, direction); }
  move(token: string, x: number, y: number): void { this.analog.set(token, clampVector(x, y)); }
  release(token: string): void { this.holds.delete(token); this.analog.delete(token); }
  clear(): void { this.holds.clear(); this.analog.clear(); }
  get vector(): { x: number; y: number } {
    const directions = [...this.holds.values()];
    let x = Number(directions.includes('right')) - Number(directions.includes('left'));
    let y = Number(directions.includes('down')) - Number(directions.includes('up'));
    for (const vector of this.analog.values()) { x += vector.x; y += vector.y; }
    return clampVector(x, y);
  }
}
export const movementControls = new MovementControls();
const KEYS: Record<string, Direction> = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
export class JourneyInput {
  private holds = new Set<string>();
  constructor(private canvas: HTMLElement, private mode: () => 'stars' | 'waiting' | undefined,
    private gameplayInput: () => void, private unlock: () => void,
    private interact: (event: PointerEvent) => boolean = () => false) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    canvas.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', this.pointerUp);
    canvas.addEventListener('lostpointercapture', this.pointerUp);
  }
  get held(): boolean { return this.holds.size > 0; }
  private down = (event: KeyboardEvent): void => {
    const mode = this.mode();
    if (!mode || (!KEYS[event.code] && event.code !== 'Space')) return;
    if (isSystemTarget(event.target)) return;
    event.preventDefault();
    if (event.repeat || this.holds.has(event.code)) return;
    this.holds.add(event.code); this.unlock();
    if (mode === 'waiting') this.gameplayInput();
    else if (KEYS[event.code]) rhythmControls.press(KEYS[event.code]);
  };
  private up = (event: KeyboardEvent): void => { this.holds.delete(event.code); movementControls.release(event.code); };
  private pointerDown = (event: PointerEvent): void => {
    if (this.mode() !== 'waiting' || isSystemTarget(event.target) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (this.interact(event)) { event.preventDefault(); this.unlock(); return; }
    event.preventDefault(); this.canvas.setPointerCapture(event.pointerId);
    this.holds.add(`pointer-${event.pointerId}`); this.unlock(); this.gameplayInput();
  };
  private pointerUp = (event: PointerEvent): void => { this.holds.delete(`pointer-${event.pointerId}`); };
  clear = (): void => {
    const pointers = [...this.holds].filter(id => id.startsWith('pointer-')).map(id => Number(id.slice(8)));
    this.holds.clear(); movementControls.clear(); rhythmControls.clear();
    for (const id of pointers) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  };
  dispose(): void {
    this.clear(); window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear); this.canvas.removeEventListener('pointerdown', this.pointerDown);
    window.removeEventListener('pointerup', this.pointerUp); window.removeEventListener('pointercancel', this.pointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.pointerUp);
  }
}

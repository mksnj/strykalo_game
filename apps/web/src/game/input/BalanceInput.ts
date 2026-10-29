import { isSystemTarget } from './gameplayTarget';
/** Shared by gameplay keys and gestures on the left/right screen halves. */
class BalanceControls {
  private holds = new Map<string, -1 | 1>();
  hold(token: string, direction: -1 | 1): void { this.holds.set(token, direction); }
  release(token: string): void { this.holds.delete(token); }
  clear(): void { this.holds.clear(); }
  get direction(): number {
    const values = [...this.holds.values()];
    return Number(values.includes(1)) - Number(values.includes(-1));
  }
}
export const balanceControls = new BalanceControls();
export class BalanceInput {
  private pointers = new Set<number>();
  constructor(private enabled: () => boolean, private surface: HTMLElement, private unlock: () => void) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    surface.addEventListener('pointerdown', this.pointerDown);
    surface.addEventListener('pointermove', this.pointerMove);
    surface.addEventListener('lostpointercapture', this.pointerUp);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', this.pointerUp);
    document.addEventListener('visibilitychange', this.visibility);
  }
  private down = (event: KeyboardEvent): void => {
    if (!this.enabled() || event.repeat || !(event.code === 'KeyA' || event.code === 'KeyD' || event.code === 'ArrowLeft' || event.code === 'ArrowRight')) return;
    if (isSystemTarget(event.target)) return;
    event.preventDefault();
    balanceControls.hold(event.code, event.code === 'KeyA' || event.code === 'ArrowLeft' ? -1 : 1);
  };
  private up = (event: KeyboardEvent): void => { balanceControls.release(event.code); };
  private pointerDown = (event: PointerEvent): void => {
    if (!this.enabled() || isSystemTarget(event.target) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.surface.setPointerCapture(event.pointerId);
    this.pointers.add(event.pointerId); this.unlock(); this.pointerMove(event);
  };
  private pointerMove = (event: PointerEvent): void => {
    if (!this.enabled()) { this.clear(); return; }
    if (!this.pointers.has(event.pointerId)) return;
    const bounds = this.surface.getBoundingClientRect();
    balanceControls.hold(`pointer-${event.pointerId}`, event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
  };
  private pointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId); balanceControls.release(`pointer-${event.pointerId}`);
  };
  private visibility = (): void => { if (document.hidden) this.clear(); };
  clear = (): void => {
    const pointers = [...this.pointers];
    this.pointers.clear(); balanceControls.clear();
    for (const id of pointers) if (this.surface.hasPointerCapture(id)) this.surface.releasePointerCapture(id);
  };
  dispose(): void {
    this.clear(); window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up); window.removeEventListener('blur', this.clear);
    this.surface.removeEventListener('pointerdown', this.pointerDown);
    this.surface.removeEventListener('pointermove', this.pointerMove);
    this.surface.removeEventListener('lostpointercapture', this.pointerUp);
    window.removeEventListener('pointerup', this.pointerUp); window.removeEventListener('pointercancel', this.pointerUp);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}

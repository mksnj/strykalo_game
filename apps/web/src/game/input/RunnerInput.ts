import type { RunnerEngine } from '../runner/engine';
import { isSystemTarget } from './gameplayTarget';
/** One DOM pointer path covers the stage, letterbox and passive HUD. */
export class RunnerInput {
  private held = new Set<string>();
  constructor(private surface: HTMLElement, private engine: () => Pick<RunnerEngine, 'press' | 'release'> | undefined,
    private enabled: () => boolean, private unlockAudio: () => void) {
    surface.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', this.pointerUp);
    surface.addEventListener('lostpointercapture', this.pointerUp);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clear);
  }
  private press(id: string): void {
    if (!this.enabled() || this.held.has(id)) return;
    const first = this.held.size === 0;
    this.held.add(id);
    this.unlockAudio();
    if (first) this.engine()?.press();
  }
  private release(id: string): void {
    if (this.held.delete(id) && this.held.size === 0) this.engine()?.release();
  }
  private pointerDown = (event: PointerEvent): void => {
    if (!this.enabled() || isSystemTarget(event.target) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.surface.setPointerCapture(event.pointerId);
    this.press(`pointer-${event.pointerId}`);
  };
  private pointerUp = (event: PointerEvent): void => { this.release(`pointer-${event.pointerId}`); };
  private keyDown = (event: KeyboardEvent): void => {
    if (!['Space', 'ArrowUp'].includes(event.code) || isSystemTarget(event.target)) return;
    if (this.enabled()) event.preventDefault();
    if (!event.repeat) this.press(event.code);
  };
  private keyUp = (event: KeyboardEvent): void => { this.release(event.code); };
  private visibility = (): void => { if (document.hidden) this.clear(); };
  clear = (): void => {
    if (this.held.size) this.engine()?.release();
    const pointers = [...this.held].filter(id => id.startsWith('pointer-')).map(id => Number(id.slice(8)));
    this.held.clear();
    for (const id of pointers) if (this.surface.hasPointerCapture(id)) this.surface.releasePointerCapture(id);
  };
  dispose(): void {
    this.clear();
    this.surface.removeEventListener('pointerdown', this.pointerDown);
    window.removeEventListener('pointerup', this.pointerUp);
    window.removeEventListener('pointercancel', this.pointerUp);
    this.surface.removeEventListener('lostpointercapture', this.pointerUp);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clear);
  }
}

import Phaser from 'phaser';
import { COURT_HERO as C, COURT_DANCE as D } from '../config';
import type { RhythmFeedback } from '../minigames/stars/StarsEngine';
import { courtDancePose, type CourtDancePose } from './courtDancePose';

/** The owner's four complete dance poses, crossfaded at a shared foot anchor. */
export class CourtHero {
  private parts: Phaser.GameObjects.Sprite[];
  private current: CourtDancePose = 'idle';
  private previous: CourtDancePose = 'idle';
  private changedAt = 0;
  private lastElapsed = -Infinity;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(scene: Phaser.Scene) {
    this.parts = [0, 1].map(() => scene.add.sprite(0, 0, 'hero-front').setOrigin(.5, 1).setDepth(40).setVisible(false));
  }
  hide(): void { this.parts.forEach(part => part.setVisible(false)); }
  render(x: number, y: number, size: number, time: number, latest?: RhythmFeedback, elapsed = 0, failure = 0): void {
    const amount = this.reduced ? C.reducedMotionScale : 1;
    const animationTime = elapsed + failure;
    if (elapsed < this.lastElapsed || !latest) {
      this.current = 'idle'; this.previous = 'idle'; this.changedAt = animationTime;
    }
    this.lastElapsed = elapsed;
    const pose = courtDancePose(latest, elapsed, failure);
    if (pose !== this.current) { this.previous = this.current; this.current = pose; this.changedAt = animationTime; }
    const blend = this.reduced || this.previous === this.current ? 1 :
      Math.max(0, Math.min(1, (animationTime - this.changedAt) / D.crossfadeSeconds));
    const settle = failure ? Math.sin(Math.min(1, failure / C.gestureSeconds) * Math.PI) * amount : 0;
    const breath = Math.sin(time / C.breathMs) * C.idlePixels * amount;
    const footY = y + breath + settle * C.failurePixels;
    this.draw(this.parts[0], this.previous, x, footY, size, 1 - blend, failure > 0);
    this.draw(this.parts[1], this.current, x, footY, size, blend, failure > 0);
  }
  private draw(sprite: Phaser.GameObjects.Sprite, pose: CourtDancePose, x: number, y: number,
    size: number, alpha: number, failure: boolean): void {
    if (pose === 'idle') sprite.setTexture('hero-front', '__BASE').setScale(size / C.sourceHeight);
    else sprite.setTexture(D.key, D.frames[pose]).setScale(size * D.idleVisibleFraction / D.bodyHeight);
    sprite.setPosition(x, y).setAlpha(alpha).setVisible(alpha > .001).setRotation(0).setFlipX(false).clearTint();
    if (failure) sprite.setTint(0xadb7c1);
  }
  dispose(): void { this.parts.forEach(part => part.destroy()); }
}

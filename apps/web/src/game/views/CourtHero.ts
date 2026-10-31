import Phaser from 'phaser';
import type { RhythmFeedback } from '../minigames/stars/StarsEngine';
import { courtDancePose, type CourtDancePose } from './courtDancePose';
import nod from '../assets/musicNodLayout.json' with { type: 'json' };
import { MUSIC_NOD_CLIP, musicNodFrame } from './musicNodAnimation';
import steps from '../assets/sideStepLayout.json' with { type: 'json' };
import { sideStepFrame, sideStepHitFrame, type SideStepClip } from './sideStepAnimation';
import sizing from '../assets/courtHeroLayout.json' with { type: 'json' };

/** Left/right hits play steps; down plays one nod; all other time uses the ordinary model. */
export class CourtHero {
  private parts: Phaser.GameObjects.Sprite[];
  private current: CourtDancePose = 'idle';
  private startedAt = 0;
  private lastElapsed = -Infinity;
  private lastFeedback?: RhythmFeedback;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(scene: Phaser.Scene) {
    this.parts = [0, 1].map(() => scene.add.sprite(0, 0, 'hero-front').setOrigin(.5, 1).setDepth(40).setVisible(false));
  }
  hide(): void {
    this.parts.forEach(part => part.setVisible(false));
  }
  render(x: number, y: number, size: number, _time: number, latest?: RhythmFeedback, elapsed = 0, failure = 0): void {
    if (elapsed < this.lastElapsed) this.lastFeedback = undefined;
    this.lastElapsed = elapsed;
    // Keep a running clip after feedback is pruned; up never starts or extends it.
    if (latest && latest.direction !== 'up') this.lastFeedback = latest;
    this.current = courtDancePose(this.lastFeedback, elapsed, failure);
    this.startedAt = this.lastFeedback?.at ?? elapsed;
    const age = elapsed - this.startedAt, sprite = this.parts[1];
    this.parts[0].setVisible(false);
    if (this.current === 'left' || this.current === 'right') this.applyStep(sprite, sideStepHitFrame(this.current, age, this.reduced), size);
    else if (this.current === 'down') {
      sprite.setTexture(MUSIC_NOD_CLIP.key, musicNodFrame(age, nod.bpm, this.reduced));
      this.applySize(sprite, 'nod', size);
    } else {
      sprite.setTexture('hero-front', '__BASE');
      this.applySize(sprite, 'reference', size);
    }
    sprite.setPosition(x, y).setAlpha(1).setVisible(true).setRotation(0).setFlipX(false).clearTint();
    if (failure) sprite.setTint(0xadb7c1);
  }
  private applyStep(sprite: Phaser.GameObjects.Sprite, frame: number, size: number): void {
    sprite.setTexture(steps.key, frame);
    this.applySize(sprite, 'step', size);
  }
  private applySize(sprite: Phaser.GameObjects.Sprite, kind: keyof typeof sizing, size: number): void {
    const source = sizing[kind], reference = sizing.reference, referenceScale = size / reference.cellHeight;
    sprite.setOrigin(.5, source.footY / source.cellHeight).setScale(
      referenceScale * reference.torsoWidth / source.torsoWidth,
      referenceScale * reference.visibleHeight / source.visibleHeight);
  }
  /** Standalone source-clip preview; gameplay still requires left/right hit feedback. */
  renderClip(clip: SideStepClip, x: number, y: number, size: number, age: number): void {
    this.parts[0].setVisible(false);
    const sprite = this.parts[1];
    this.applyStep(sprite, sideStepFrame(clip, age, this.reduced), size);
    sprite.setPosition(x, y).setAlpha(1).setVisible(true).setRotation(0).setFlipX(false).clearTint();
  }
  dispose(): void { this.parts.forEach(part => part.destroy()); }
}

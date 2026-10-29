import Phaser from 'phaser';
import { RUNNER, REFERENCE_ART as C } from '../config';

/** A courtyard CRT sinks through a fixed water surface, behind the running lane. */
export class TelevisionPuddle {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private startedAt?: number;
  constructor(scene: Phaser.Scene) {
    const water = scene.add.image(0, 0, 'television-water')
      .setDisplaySize(C.televisionWidth, C.televisionHeight);
    this.body = scene.add.image(0, C.televisionSubmerged, 'television-crt').setOrigin(.5, 1)
      .setDisplaySize(C.televisionBodyWidth, C.televisionBodyHeight);
    const frontWater = scene.add.image(0, 0, 'television-water')
      .setDisplaySize(C.televisionWidth, C.televisionHeight).setCrop(0, 96, 768, 96);
    // Match the cold, low-contrast courtyard lighting; keep the mud dark and the CRT screen subdued.
    water.setTint(C.televisionWaterTint); frontWater.setTint(C.televisionWaterTint);
    this.body.setTint(C.televisionBodyTint);
    this.container = scene.add.container(0, C.televisionY, [water, this.body, frontWater]);
  }
  reset(): void { this.startedAt = undefined; }
  render(distance: number, scale: number, visualTime: number, enabled: boolean): void {
    const x = RUNNER.playerX + (C.televisionAt - distance) / scale * RUNNER.pixelsPerUnit * C.televisionParallax;
    const halfView = Math.max(RUNNER.width, this.container.scene.scale.width) / 2;
    const halfProp = C.televisionWidth / 2;
    this.container.setPosition(x, C.televisionY)
      .setVisible(enabled && x + halfProp > RUNNER.width / 2 - halfView && x - halfProp < RUNNER.width / 2 + halfView);
    if (!this.container.visible) return;
    this.startedAt ??= visualTime;
    const progress = Phaser.Math.Clamp((visualTime - this.startedAt) / C.televisionSinkMs, 0, 1);
    this.body.y = C.televisionSubmerged + C.televisionSinkDepth * progress;
    // Crop at the stationary waterline; opaque water hides the submerged portion, without fading the case.
    const height = Math.max(0, (C.televisionBodyHeight - this.body.y) / this.body.scaleY);
    this.body.setVisible(height > 0).setCrop(0, 0, this.body.width, height);
  }
}

import type Phaser from 'phaser';
import { repeatPanorama } from './repeatPanorama';

/** Independent painted arena. One original wet ground image, extended on wide
 * screens without repeating markings. Upright artwork retains uniform scale. */
export class CourtArena {
  readonly container: Phaser.GameObjects.Container;
  readonly floor: Phaser.GameObjects.Image;
  readonly hoop: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene) {
    const sky = scene.add.tileSprite(480, 0, 2400, 600, repeatPanorama(scene)).setOrigin(.5, 0).setTileScale(.78).setTint(0x8493ac);
    sky.tilePositionX = 210;
    this.floor = scene.add.image(0, 260, 'court-original', 'floor').setOrigin(0);
    const fence = scene.add.tileSprite(480, 170, 2400, 90, 'court-original', 'mesh').setOrigin(.5, 0);
    this.hoop = scene.add.image(107, 265, 'court-hoop').setOrigin(0, 1).setScale(.30);
    const branches = scene.add.tileSprite(480, -24, 2400, 175, 'night-front', 'canopy')
      .setOrigin(.5, 0).setTileScale(.65).setAlpha(.65);
    this.container = scene.add.container(0, 0, [sky, fence, this.floor, this.hoop, branches]);
  }
  render(opacity: number): void {
    this.container.setVisible(opacity > 0).setAlpha(opacity);
    // Phaser rounds the camera viewport to whole pixels; overdraw one texel
    // per side so a fractional ultrawide viewport cannot expose a thin gap.
    const width = Math.max(960, Math.ceil(this.scene.scale.width)) + 2;
    this.floor.setX((960 - width) / 2).setDisplaySize(width, 340);
  }
}

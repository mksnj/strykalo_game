import type Phaser from 'phaser';
import { COURT_ENTRY as C } from './courtEntranceLayout';

/** Painted fence sections frame a real open passage. A glimpse of the original
 * court sits behind it; no arena floor is stretched across the runner street. */
export class CourtEntrance {
  readonly container: Phaser.GameObjects.Container;
  private view: Phaser.GameObjects.Container;
  private clip: Phaser.GameObjects.Graphics;
  private mask: Phaser.Display.Masks.GeometryMask;
  constructor(private scene: Phaser.Scene) {
    const court = scene.add.image(-90, 252, 'court-original', '__BASE').setOrigin(0).setDisplaySize(480, 270);
    // Keep the street's actual sky visible through the original alpha artwork.
    this.view = scene.add.container(0, 0, [court]);
    this.clip = scene.make.graphics({ x: 0, y: 0 });
    this.mask = this.clip.createGeometryMask(); this.view.setMask(this.mask);
    const left = scene.add.image(-C.halfOpening, C.groundY, 'court-original', 'gate-panel').setOrigin(1, 1);
    const right = scene.add.image(C.halfOpening, C.groundY, 'court-original', 'gate-panel').setOrigin(0, 1).setFlipX(true);
    const posts = [-C.halfOpening, C.halfOpening].map(x =>
      scene.add.image(x, C.groundY, 'court-original', 'gate-jamb').setOrigin(.5, 1));
    this.container = scene.add.container(0, 0, [this.view, left, right, ...posts]).setVisible(false);
  }
  render(x: number, enabled: boolean): void {
    const width = Math.max(960, this.scene.scale.width), left = (960 - width) / 2;
    this.container.setPosition(x, 0).setVisible(enabled && x + C.halfWidth > left && x - C.halfWidth < left + width);
    this.clip.clear().fillStyle(0xffffff).fillRect(x - C.halfOpening, C.viewTop,
      C.halfOpening * 2, C.groundY - C.viewTop);
  }
  dispose(): void {
    this.view.clearMask(false); this.mask.destroy(); this.clip.destroy(); this.container.destroy(true);
  }
}

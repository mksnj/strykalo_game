import Phaser from 'phaser';
import type { BalanceEngine } from '../minigames/balance/BalanceEngine';
import { panoramaLayout } from './panoramaLayout';

/** Still illustrated first-person view, without projected walls or moving materials. */
export class PipeView {
  readonly container: Phaser.GameObjects.Container;
  private pipe: Phaser.GameObjects.Image;
  private scenery: Phaser.GameObjects.Container;
  private aspect: number;
  constructor(private scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(20).setVisible(false);
    const construction = scene.add.image(480, 270, 'pipe-sunset', '__BASE');
    this.aspect = construction.width / construction.height;
    const layout = panoramaLayout(scene.scale.width, this.aspect);
    construction.setDisplaySize(layout.width, 540);
    // A single continuous painted sky avoids a moving seam over the authored trench.
    this.scenery = scene.add.container(0, 0, [construction]);
    this.pipe = scene.add.image(480, 255, 'pipe-illustration').setOrigin(.5, 0).setScale(330 / scene.textures.get('pipe-illustration').get('__BASE').height).setTint(0xb4bfcc);
    this.container.add([this.scenery, this.pipe]);
  }
  render(balance: BalanceEngine | undefined, opening: number, _approachTime: number, _falling: boolean,
    _mode: 'approach' | 'balance' | 'exit' = 'balance', _baseTravel = 12000): void {
    this.container.setVisible(opening > 0).setAlpha(opening);
    if (opening <= 0) return;
    const layout = panoramaLayout(this.scene.scale.width, this.aspect);
    this.scenery.setScale(layout.scale).setPosition(layout.x, layout.y);
    this.pipe.x = 480 - (balance?.position ?? 0) * 24;
  }
  dispose(): void { this.container.destroy(true); }
}

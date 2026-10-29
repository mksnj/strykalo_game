import Phaser from 'phaser';
import { ShadowTrail, shadowPose } from './shadowTimeline';

/** A single upright silhouette runs behind the protagonist, then fades away. */
export class ShadowsEpisode {
  readonly container: Phaser.GameObjects.Container;
  private echo: Phaser.GameObjects.Sprite;
  private trail = new ShadowTrail();
  constructor(scene: Phaser.Scene) {
    this.echo = scene.add.sprite(0, 438, 'night-hero', 0).setOrigin(.5, 1).setTintFill(0x080f18);
    this.container = scene.add.container(0, 0, [this.echo]);
  }
  reset(): void { this.trail.clear(); this.container.setVisible(false); }
  render(distance: number, time: number, y: number, frame: number, visible: boolean): void {
    const echo = this.trail.sample(time, y, frame), pose = shadowPose(distance, echo);
    this.container.setVisible(visible && pose.alpha > 0);
    if (!this.container.visible) return;
    this.echo.setPosition(pose.x, pose.y).setDisplaySize(pose.width, pose.height)
      .setFrame(pose.frame).setFlipX(false).setAlpha(pose.alpha);
  }
}

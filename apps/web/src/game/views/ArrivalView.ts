import Phaser from 'phaser';
import { JOURNEY, RUNNER } from '../config';
import type { RunSession } from '../state/RunSession';
import { ARRIVAL as C, clamp, smooth, roomArrival, roomTransition } from './arrivalLayout';
import { coverScenery } from './sceneryWings';

/** Room exterior only. The basketball arena is shown exclusively by StarsView. */
export class ArrivalView {
  readonly container: Phaser.GameObjects.Container;
  private exterior: Phaser.GameObjects.Container;
  private hero: Phaser.GameObjects.Sprite;
  private shade: Phaser.GameObjects.Rectangle;
  private ownsHero: boolean;
  constructor(scene: Phaser.Scene, sharedHero?: Phaser.GameObjects.Sprite) {
    this.container = scene.add.container(0, 0).setDepth(10);
    this.exterior = scene.add.container(0, 0, [scene.add.image(0, 0, 'room-entrance').setOrigin(0)
      .setCrop(0, 0, RUNNER.width, RUNNER.groundY - 3)]);
    this.hero = sharedHero ?? scene.add.sprite(180, 438, 'night-hero', 0).setOrigin(.5, 1).setDisplaySize(106, 106);
    this.ownsHero = !sharedHero;
    if (this.ownsHero) this.hero.setVisible(false);
    this.container.add([this.exterior, ...(!sharedHero ? [this.hero] : [])]);
    this.shade = scene.add.rectangle(480, 270, 960, 540, 0x0c1621).setDepth(100).setAlpha(0);
  }
  render(session: RunSession | undefined, visualTime: number, menu: boolean): void {
    coverScenery(this.shade);
    const phase = session?.phase, p = clamp(session?.transitionProgress ?? 0);
    const approach = phase === 'room-approach';
    const room = phase === 'runner' && session?.runner.artStartDistance === JOURNEY.starsAt;
    const offset = C.roomOffset + (JOURNEY.waitingAt - (session?.runner.artDistance ?? 0)) /
      (session?.route.scale ?? 1) * RUNNER.pixelsPerUnit;
    const preview = room && offset < RUNNER.width;
    const visible = !menu && (approach || preview);
    this.container.setVisible(visible);
    this.shade.setAlpha(menu ? 0 : approach ? roomTransition(p).shade :
      phase === 'room-exit' ? smooth((p - .7) / .3) :
      phase === 'final-run' ? 1 - smooth(((session?.runner.artDistance ?? JOURNEY.waitingAt) - JOURNEY.waitingAt) / 4) : 0);
    if (!visible) return;
    this.exterior.setPosition(offset, 0);
    if (!approach) { if (this.ownsHero) this.hero.setVisible(false); return; }
    this.hero.setVisible(p < C.roomCut).setAlpha(1).setFlipX(false).setTexture('night-hero', Math.floor(visualTime / 110) % 4);
    const pose = roomArrival(p);
    this.exterior.setPosition(C.roomOffset - pose.camera, 0);
    this.hero.setPosition(pose.x, pose.y - Math.max(0, RUNNER.groundY - (session?.runner.player.y ?? RUNNER.groundY)))
      .setDisplaySize(pose.size, pose.size).setAlpha(pose.alpha);
  }
  dispose(): void { this.shade.destroy(); this.container.destroy(true); }
}

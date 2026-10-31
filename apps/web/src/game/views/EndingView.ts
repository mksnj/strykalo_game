import Phaser from 'phaser';
import { RUNNER, ENDING_ART as A } from '../config';
import type { RunSession } from '../state/RunSession';
import { finalArrival, WORLD } from './worldLayout';
import { SeatedHero } from './SeatedHero';
import { endingFlicker } from './endingLight';
import { sceneryWings, coverScenery } from './sceneryWings';
import { endingTimeline } from './endingTimeline';

/** Architecture stays at world scale; the camera stops and the protagonist runs to the bench. */
export class EndingView {
  readonly container: Phaser.GameObjects.Container;
  private architecture: Phaser.GameObjects.Container;
  private wings: Phaser.GameObjects.TileSprite[];
  private hero: Phaser.GameObjects.Sprite;
  private seated: SeatedHero;
  private fade: Phaser.GameObjects.Rectangle;
  private lamp: Phaser.GameObjects.Ellipse;
  private cover: Phaser.GameObjects.Rectangle;
  private contact: Phaser.GameObjects.Ellipse;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(30);
    const facade = scene.add.image(0, 0, 'ending-facade').setOrigin(0)
      .setCrop(0, 0, RUNNER.width, RUNNER.groundY - 3);
    const bench = scene.add.image(A.benchX, RUNNER.groundY, 'ending-bench').setOrigin(.5, 1)
      .setDisplaySize(A.benchWidth, A.benchHeight).setTint(0xc5c9cf);
    const shadows = scene.add.graphics();
    // Footings, jambs and bench legs share the same street plane.
    shadows.fillStyle(0x080f19, .22).fillEllipse(204, RUNNER.groundY + 3, 368, 12)
      .fillEllipse(793, RUNNER.groundY + 3, 334, 12)
      .fillEllipse(740, RUNNER.groundY + 3, 196, 14);
    shadows.fillStyle(0x070c14, .42).fillEllipse(661, RUNNER.groundY + 1, 28, 5)
      .fillEllipse(819, RUNNER.groundY + 1, 28, 5);
    this.lamp = scene.add.ellipse(480, 354, 110, 140, 0xb4c4d1, .04);
    this.cover = scene.add.rectangle(480, 248, 12, 7, 0x26313b).setAlpha(0);
    this.wings = sceneryWings(scene, facade);
    this.architecture = scene.add.container(0, 0, [...this.wings, facade, shadows, this.lamp, this.cover, bench]);
    this.hero = scene.add.sprite(180, 438, 'night-hero', 0).setOrigin(.5, 1).setDisplaySize(106, 106);
    // Pelvis at the seat top (Y≈404); soles and bench feet touch Y=438.
    this.seated = new SeatedHero(scene, A.benchX, RUNNER.groundY, A.seatedHeight, 'hero-rest');
    this.contact = scene.add.ellipse(180, RUNNER.groundY + 1, 49, 7, 0x070d16, .34);
    this.fade = scene.add.rectangle(480, 270, 960, 540, 0x0c1621).setAlpha(0);
    this.container.add([this.architecture, this.contact, this.hero, this.seated.container, this.fade]);
  }
  render(session: RunSession | undefined, visible: boolean, visualTime: number): void {
    this.container.setVisible(visible);
    if (!visible || !session) return;
    coverScenery(this.fade);
    // Extend only the margins outside the original frame. Full-screen wings used to
    // arrive long before the entrance as a wall of repeated windows and drainpipes.
    const wingWidth = Math.max(0, (this.container.scene.scale.width - RUNNER.width) / 2);
    this.wings.forEach((wing, i) => wing.setVisible(wingWidth > 0)
      .setSize(Math.max(1, wingWidth), RUNNER.groundY - 3).setX(i ? RUNNER.width : -wingWidth)
      .setTileScale(Math.max(1, wingWidth / 192), 1));
    const ending = session.phase === 'ending', t = ending ? session.phaseTime : 0;
    const pose = finalArrival(session.runner.artDistance, session.route.scale);
    this.architecture.setPosition(pose.offset, 0).setScale(1);
    const { slow, sit, stand, walk, enter, fade, breath, walking } = endingTimeline(t);
    const coast = WORLD.finalCoast * (1 - (1 - slow) ** 2);
    const benchX = A.benchX;
    const approachX = RUNNER.playerX + pose.advance + coast;
    const x = approachX + (benchX - approachX) * sit + (480 - benchX) * walk;
    this.hero.setPosition(x, RUNNER.groundY + sit * (1 - stand) * 10 - enter * 8);
    this.hero.setTexture(slow === 1 && !walking ? 'hero-idle' : 'night-hero',
      slow === 1 && !walking ? 0 : Math.floor(walking ? t * 10 : ending ? coast / 18 : visualTime / 110) % 4);
    // Run through the rectangular doorway; disappear only after crossing its threshold.
    const inside = Math.max(0, (enter - .35) / .65);
    this.hero.setFlipX(walk > 0).setVisible(true).setAlpha((1 - sit + sit * stand) * (1 - inside));
    this.hero.setDisplaySize(A.standingSize, A.standingSize);
    this.seated.container.setVisible(sit > 0 && stand < 1).setAlpha(sit * (1 - stand))
      .setScale(1).setY(RUNNER.groundY);
    this.seated.breathe(this.reducedMotion ? 0 : breath);
    this.contact.setPosition(x, RUNNER.groundY + 1).setScale(1 - enter * .5, 1).setAlpha(.34 * (1 - enter));
    const flicker = endingFlicker(visualTime, this.reducedMotion);
    this.lamp.setAlpha(flicker ? 0 : .07); this.cover.setAlpha(flicker ? .9 : 0);
    this.fade.setAlpha(.10 * enter + .90 * fade);
  }
  dispose(): void { this.container.destroy(true); }
}

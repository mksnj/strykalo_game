import Phaser from 'phaser';
import { WAITING as C } from '../config';
import type { WaitingEngine } from '../minigames/waiting/WaitingEngine';
import { ARRIVAL, lerp, smooth } from './arrivalLayout';
import { SeatedHero } from './SeatedHero';
import { coverScenery } from './sceneryWings';
import { panoramaLayout, ROOM_ART as R } from './panoramaLayout';
import { WindowWeather } from './WindowWeather';
import { RoomReactions, type RoomObject } from './roomReactions';
import { stormTimeline } from './stormTimeline';
import { roomGraffiti } from './roomGraffiti';

export class WaitingView {
  readonly container: Phaser.GameObjects.Container;
  private hero: SeatedHero;
  private enteringHero: Phaser.GameObjects.Sprite;
  private clock: Phaser.GameObjects.Graphics;
  private light: Phaser.GameObjects.Rectangle;
  private door: Phaser.GameObjects.Image;
  private composition: Phaser.GameObjects.Container;
  private aspect: number;
  private weather: WindowWeather;
  private lampResponse: Phaser.GameObjects.Rectangle;
  private reactions = new RoomReactions();
  private visualTime = 0;
  private engine?: WaitingEngine;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(30);
    const background = scene.add.image(480, 270, 'waiting-room');
    this.aspect = background.width / background.height;
    background.setDisplaySize(540 * this.aspect, 540);
    this.door = scene.add.image(R.doorX, R.doorY, 'room-door', 'leaf').setOrigin(0).setDisplaySize(R.doorWidth, R.doorHeight);
    const stool = scene.add.image(398, 428, 'room-stool').setOrigin(.5, 1).setDisplaySize(52, 64).setTint(0xc5c9cf);
    this.hero = new SeatedHero(scene, ARRIVAL.roomSeatX, ARRIVAL.roomY, 150);
    this.enteringHero = scene.add.sprite(R.entryX, R.entryY, 'night-hero', 0).setOrigin(.5, 1).setDisplaySize(106, 106).setFlipX(true);
    const graffiti = scene.add.image(255, 182, roomGraffiti(scene)).setDisplaySize(216, 72).setAngle(-4).setAlpha(.85);
    const clockFace = scene.add.image(R.clockX, R.clockY, 'room-clock').setDisplaySize(R.clockSize, R.clockSize).setTint(0xa6b3c3);
    this.clock = scene.add.graphics();
    this.weather = new WindowWeather(scene);
    this.lampResponse = scene.add.rectangle(480, 270, 960, 540, 0x000000).setAlpha(0);
    this.light = scene.add.rectangle(480, 270, 960, 540, 0x060f1c).setAlpha(.08);
    this.composition = scene.add.container(0, 0, [background, this.weather.graphics, graffiti, this.door, stool,
      this.hero.container, this.enteringHero, clockFace, this.clock]);
    this.container.add([this.composition, this.light, this.lampResponse]);
  }
  render(engine: WaitingEngine | undefined, alpha: number, exitProgress = 0, entryProgress = 1, visualTime = 0,
    weatherTime?: number, weatherStrength = 1): void {
    this.container.setVisible(alpha > 0).setAlpha(alpha);
    if (alpha <= 0) return;
    if (engine !== this.engine) { this.engine = engine; this.reactions.reset(); }
    this.visualTime = visualTime / 1000;
    const layout = panoramaLayout(this.scene.scale.width, this.aspect);
    this.composition.setScale(layout.scale).setPosition(layout.x, layout.y);
    coverScenery(this.light);
    coverScenery(this.lampResponse);
    const elapsed = engine?.elapsed ?? 0;
    const sitting = entryProgress >= .98 && exitProgress < .08;
    this.hero.container.setVisible(sitting);
    const heroReaction = this.reactions.progress('hero', this.visualTime);
    this.hero.look(elapsed, this.reduced ? 0 : Math.sin(heroReaction * Math.PI));
    this.enteringHero.setVisible(!sitting)
      .setPosition(lerp(R.entryX, ARRIVAL.roomSeatX, entryProgress), lerp(R.entryY, ARRIVAL.roomY, entryProgress))
      .setDisplaySize(lerp(106, 180, entryProgress), lerp(106, 180, entryProgress))
      .setTexture('night-hero', Math.floor(visualTime / 110) % 4).setFlipX(true);
    if (exitProgress > 0) {
      const walk = smooth((exitProgress - .08) / .92);
      const floor = walk < .75 ? lerp(ARRIVAL.roomY, 449, smooth(walk / .15)) : lerp(449, R.entryY, smooth((walk - .75) / .25));
      this.enteringHero.setPosition(lerp(ARRIVAL.roomSeatX, R.entryX, walk), floor).setFlipX(false);
    }
    this.door.setDisplaySize(R.doorWidth * (1 - exitProgress * .96) * (.12 + .88 * smooth(entryProgress / .25)), R.doorHeight);
    const flicker = !this.reduced && elapsed >= C.flickerAt && elapsed < C.flickerAt + 2.5 && Math.sin((elapsed - C.flickerAt) * 31) > 0;
    const storm = weatherTime === undefined ? undefined : stormTimeline(weatherTime, this.reduced);
    this.light.setAlpha(flicker ? .43 : .08 - (storm?.flash ?? 0) * .065 * weatherStrength);
    this.clock.clear();
    const lamp = this.reactions.progress('lamp', this.visualTime);
    this.lampResponse.setAlpha(lamp < 1 && (this.reduced || lamp < .2 || lamp > .42 && lamp < .65) ? .26 : 0);
    this.weather.render(weatherTime ?? this.visualTime, storm ? weatherStrength : 0,
      (storm?.flash ?? 0) * weatherStrength, this.reactions.progress('window', this.visualTime), this.reduced);
    const cx = R.clockX, cy = R.clockY;
    const clock = this.reactions.progress('clock', this.visualTime);
    const spin = this.reduced || clock === 1 ? 0 : (1 - (1 - clock) ** 3) * Math.PI * 2;
    const second = visualTime / 1000 / 60 * Math.PI * 2;
    this.clock.lineStyle(.7, 0x404957).lineBetween(cx, cy, cx + Math.sin(second) * 16, cy - Math.cos(second) * 16);
    this.clock.lineStyle(1.4, 0x303945).lineBetween(cx, cy, cx + Math.sin(second / 60 + 2 + spin) * 12, cy - Math.cos(second / 60 + 2 + spin) * 12);
    const hour = Math.atan2(-10, -2) + spin;
    this.clock.lineBetween(cx, cy, cx + Math.sin(hour) * 10.2, cy - Math.cos(hour) * 10.2);
    this.clock.fillStyle(0x303945).fillCircle(cx, cy, 1.4);
  }
  /** Returns true for a prop even during its cooldown, so a tap never resets waiting. */
  interact(worldX: number, worldY: number): boolean {
    if (!this.container.visible || !this.engine) return false;
    const x = (worldX - this.composition.x) / this.composition.scaleX;
    const y = (worldY - this.composition.y) / this.composition.scaleY;
    let object: RoomObject | undefined;
    if (x >= R.doorX && x <= R.doorX + R.doorWidth && y >= R.doorY && y <= R.doorY + R.doorHeight) object = 'door';
    else if (x >= 374 && x <= 484 && y >= 100 && y <= 210) object = 'lamp';
    else if (x >= 510 && x <= 665 && y >= 111 && y <= 296) object = 'window';
    else if (x >= 663 && x <= 773 && y >= 90 && y <= 200) object = 'clock';
    else if (x >= 348 && x <= 456 && y >= 276 && y <= 438) object = 'hero';
    if (!object) return false;
    if (object === 'door') this.engine.doorInput();
    else this.engine.registerPress();
    this.reactions.trigger(object, this.visualTime); return true;
  }
  dispose(): void { this.container.destroy(true); }
}

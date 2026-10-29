import Phaser from 'phaser';
import { RUNNER as C, JOURNEY, STORY_BEER as BEER } from '../config';
import type { RunnerEngine } from '../runner/engine';
import { NightDistrictArt } from './NightDistrictArt';
import { PipeCrossing } from './PipeCrossing';
import { finalQuiet, WORLD } from './worldLayout';
import { ShadowsEpisode } from './ShadowsEpisode';
import { ARRIVAL } from './arrivalLayout';
import { TelevisionPuddle } from './TelevisionPuddle';
import { CourtEntrance } from './CourtEntrance';
import { courtEntranceX, courtFacadeOffset } from './courtEntranceLayout';

export class RunnerView {
  readonly container: Phaser.GameObjects.Container;
  readonly groundLayer: Phaser.GameObjects.Container;
  readonly hero: Phaser.GameObjects.Sprite;
  private beer: Phaser.GameObjects.Image;
  private shadows: ShadowsEpisode;
  private references: Phaser.GameObjects.Graphics;
  private crossing: PipeCrossing;
  private objects = new Map<string, Phaser.GameObjects.Image>();
  private hitTime?: number;
  private nightArt: NightDistrictArt;
  private television: TelevisionPuddle;
  readonly courtEntrance: CourtEntrance;
  constructor(private scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0);
    this.nightArt = new NightDistrictArt(scene);
    this.courtEntrance = new CourtEntrance(scene);
    this.groundLayer = scene.add.container(0, 0, [this.nightArt.ground]);
    this.shadows = new ShadowsEpisode(scene);
    this.references = scene.add.graphics();
    this.television = new TelevisionPuddle(scene);
    this.crossing = new PipeCrossing(scene, this.nightArt.ground, this.nightArt.foreground, this.nightArt.foundation);
    this.hero = scene.add.sprite(C.playerX, C.groundY, 'night-hero', 0).setOrigin(0.5, 1).setDisplaySize(106, 106).setDepth(40);
    this.beer = scene.add.image(0, C.groundY, 'story-beer').setOrigin(.5, 1).setVisible(false);
    this.container.add([this.nightArt.backdrop, this.courtEntrance.container,
      this.references, this.television.container, this.groundLayer,
      this.shadows.container, this.crossing.container, this.nightArt.foreground]);
  }
  reset(): void {
    this.hitTime = undefined; this.hero.setAngle(0).setAlpha(1);
    this.shadows.reset();
    this.television.reset();
    for (const image of this.objects.values()) image.destroy();
    this.objects.clear();
    this.container.setPosition(0, 0).setScale(1).setAlpha(1);
    this.beer.setVisible(false);
  }
  renderBeer(engine: RunnerEngine | undefined, active: boolean, pickup: boolean, elapsed: number, collected: boolean): void {
    const distance = engine?.artDistance ?? 0, scale = engine?.distanceScale ?? 1;
    const x = C.playerX + (JOURNEY.balanceAt - distance) / scale * C.pixelsPerUnit + BEER.ahead;
    const lift = Math.max(0, Math.min(1, (elapsed - BEER.collectAt) / .4));
    this.beer.setVisible(active && distance <= JOURNEY.balanceAt && (!collected || pickup && lift < 1))
      .setDepth(pickup ? 41 : 39).setDisplaySize(BEER.width, BEER.height).setPosition(x + lift * 32, C.groundY - lift * 48)
      .setAngle(-lift * 48).setAlpha(1 - Math.max(0, (lift - .55) / .45)).setTint(0xa8b3bd);
    // In the clear gameplay plane above scenery; briefly in front of the hand during pickup.
    if (pickup && engine?.player.grounded) {
      const bend = Math.sin(Math.min(1, elapsed / BEER.pickupSeconds) * Math.PI);
      this.hero.setTexture('hero-idle', 0).setAngle(bend * 16).setDisplaySize(106, 106 - bend * 10);
    }
  }
  render(engine: RunnerEngine | undefined, visualTime: number, time: number, menuTravel?: number, approach = 0, onward = 0, showHero = true, courtCamera?: number): void {
    const menu = menuTravel !== undefined;
    const travel = menu ? menuTravel : (engine?.travel ?? 0) + onward;
    this.hero.setVisible(showHero);
    this.hero.setDisplaySize(106, 106).setFlipX(false).setAngle(0).clearTint();
    const stopped = approach >= WORLD.pipeStopAt;
    this.hero.setTexture(stopped ? 'hero-idle' : 'night-hero', 0);
    const distance = menu ? 0 : engine?.artDistance ?? 0;
    const scale = engine?.distanceScale ?? 1;
    const autumn = !menu && (engine?.artStartDistance ?? 0) >= JOURNEY.balanceAt && (engine?.artStartDistance ?? 0) < JOURNEY.starsAt;
    const district = !menu && (engine?.artStartDistance ?? 0) >= JOURNEY.starsAt;
    const afterCourt = !menu && engine?.artStartDistance === JOURNEY.starsAt;
    const sceneryLead = afterCourt ? ARRIVAL.offset + ARRIVAL.exitAdvance : 0;
    const endTravel = JOURNEY.starsAt / scale * C.pixelsPerUnit;
    this.nightArt.render(travel + sceneryLead, autumn ? 'autumn' : district ? 'shadows' : 'night', finalQuiet(distance),
      autumn ? courtFacadeOffset(endTravel) : 0);
    if (courtCamera !== undefined) this.nightArt.render((engine?.travel ?? 0) + ARRIVAL.offset + courtCamera,
      'shadows');
    const entranceX = courtCamera !== undefined ? 780 - courtCamera : afterCourt ?
      780 - ARRIVAL.exitAdvance - (distance - JOURNEY.starsAt) / scale * C.pixelsPerUnit : courtEntranceX(travel, endTravel);
    this.courtEntrance.render(entranceX, !menu && (autumn || afterCourt || courtCamera !== undefined));
    this.hero.y = menu ? C.groundY : engine?.player.y ?? C.groundY;
    this.crossing.render(distance, scale, !menu && (distance <= JOURNEY.balanceAt || autumn), autumn, approach);
    this.container.setScale(1).setPosition(0, 0);
    this.hero.setAlpha(1);
    this.hero.x = C.playerX + (approach > 0 ? WORLD.pipeLip * (1 - (1 - Math.min(1, approach / WORLD.pipeStopAt)) ** 2) : 0);
    this.renderReferences(distance, menu);
    this.television.render(distance, scale, visualTime, !menu && !autumn && !district);
    this.shadows.render(distance, visualTime, engine?.player.y ?? C.groundY,
      engine?.player.grounded ? Math.floor(visualTime / 110) % 4 : 2, !menu && district);
    if (!menu && engine?.result?.reason === 'collision') {
      this.hitTime ??= time;
      const progress = Math.min(1, (time - this.hitTime) / 260);
      this.hero.setAngle(65 * progress).setAlpha(1 - progress * 0.3);
      this.hero.y = C.groundY - 8;
    } else this.hero.setFrame(stopped ? 0 : menu || engine?.player.grounded ? Math.floor(visualTime / 110) % 4 : 2);
    if (!menu && !engine?.result && engine?.damageFlash) this.hero.setAlpha(.5).setTint(0xe6b3aa);
    const live = new Set(engine?.objects.map(o => o.id));
    for (const [id, image] of this.objects) if (!live.has(id)) { image.destroy(); this.objects.delete(id); }
    for (const object of engine?.objects ?? []) {
      const texture = object.kind === 'tape' ? 'tape' : `night-${object.kind}`;
      let image = this.objects.get(object.id);
      if (!image) {
        image = this.scene.add.image(0, 0, texture);
        this.container.add(image); this.objects.set(object.id, image);
      }
      image.setPosition(object.x - travel + object.width / 2, object.y + object.height / 2);
      if (image.texture.key !== texture) image.setTexture(texture);
      if (object.kind === 'tape') image.setDisplaySize(44, 28);
      else {
        const scale = Math.min((object.width + 6) / image.width, (object.height + 4) / image.height);
        image.setScale(scale).setY(C.groundY + 2 - image.displayHeight / 2);
      }
      if (object.kind === 'tape') {
        image.y += Math.sin(visualTime / 340 + object.x) * 3;
        image.setRotation(Math.sin(visualTime / 500 + object.x) * 0.09);
      }
      image.setVisible(!menu && courtCamera === undefined);
    }
    // Hazards and collectibles belong in front of scenery, behind the protagonist.
    // This texture is empty around the gameplay plane: branches above, rubble below.
    this.container.bringToTop(this.nightArt.foreground);
  }
  private renderReferences(distance: number, menu: boolean): void {
    this.references.clear();
    if (!menu && distance < JOURNEY.balanceAt) {
      // «Ускользает»: cold fog thickens; the distant light fades before it is reached.
      this.references.fillStyle(0x829db9, Math.min(0.09, distance / 200 * 0.09)).fillRect(0, 90, 960, 310);
      const light = distance > 45 && distance < 85 ? Math.sin((distance - 45) / 40 * Math.PI) : 0;
      this.references.fillStyle(0xc8d8e7, light * 0.65).fillCircle(810 - (distance - 45) * 8, 124, 2.2);
    }
  }
  dispose(): void {
    this.objects.clear(); this.hero.destroy(); this.beer.destroy(); this.crossing.dispose(); this.courtEntrance.dispose(); this.nightArt.dispose();
    this.container.destroy(true);
  }
}

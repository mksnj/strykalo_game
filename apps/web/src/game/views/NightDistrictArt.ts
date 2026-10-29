import Phaser from 'phaser';
import { RUNNER as C } from '../config';
import { DISTRICT_GROUND, districtOffset } from './districtLayout';
import { repeatPanorama, courtSkyPanorama } from './repeatPanorama';

/** Ordinary street and facades. No arena cutouts or changing ground projection. */
export class NightDistrictArt {
  readonly backdrop: Phaser.GameObjects.Container;
  readonly midground: Phaser.GameObjects.Container;
  readonly ground: Phaser.GameObjects.TileSprite;
  readonly foundation: Phaser.GameObjects.TileSprite;
  readonly foreground: Phaser.GameObjects.TileSprite;
  private far: Phaser.GameObjects.TileSprite;
  private farKey = 'night-far-repeat';
  private skyKey: string;
  private court: Phaser.GameObjects.TileSprite;
  private courtKey = 'night-court';
  private canopyOnly = false;
  private fenceClip: Phaser.GameObjects.Graphics;
  private fenceMask: Phaser.Display.Masks.GeometryMask;

  constructor(scene: Phaser.Scene) {
    this.fenceClip = scene.make.graphics({ x: 0, y: 0 });
    this.fenceMask = this.fenceClip.createGeometryMask();
    this.far = scene.add.tileSprite(0, 0, C.width, C.groundY, repeatPanorama(scene)).setOrigin(0);
    this.skyKey = courtSkyPanorama(scene);
    this.court = scene.add.tileSprite(0, 0, C.width, C.groundY, 'night-court').setOrigin(0).setTileScale(C.groundY / 512);
    this.midground = scene.add.container(0, 0, [this.court]);
    this.foundation = scene.add.tileSprite(0, 348.5, C.width, C.height - 348.5, 'shared-asphalt')
      .setOrigin(0).setTileScale(.5, .125);
    this.backdrop = scene.add.container(0, 0, [this.far, this.foundation, this.midground]);
    this.ground = scene.add.tileSprite(0, C.groundY - 3, C.width, C.height - C.groundY + 3, 'night-ground')
      .setOrigin(0).setTileScale((C.height - C.groundY + 3) / 164);
    this.foreground = scene.add.tileSprite(0, 0, C.width, C.height, 'night-front')
      .setOrigin(0).setTileScale(C.height / 512);
  }
  render(travel: number, region: 'night' | 'autumn' | 'shadows', quiet = 0, facadeOffset = 0): void {
    const width = Math.max(C.width, this.ground.scene.scale.width), left = (C.width - width) / 2;
    for (const layer of [this.far, this.court, this.ground, this.foundation, this.foreground]) {
      if (layer.width !== width) layer.setSize(width, layer.height);
      layer.x = left;
    }
    // The 200–400 segment follows the painted fence, not the legacy city facades.
    // Select its source here so seed/restart/checkpoint all use the same region policy.
    const court = region === 'night' ? 'night-court' : region === 'autumn' ? 'court-original' : 'journey-shadows';
    if (this.courtKey !== court) {
      this.court.setTexture(court, region === 'night' ? '__BASE' : region === 'autumn' ? 'mesh' : 'facades'); this.courtKey = court;
    }
    const fence = region === 'autumn';
    this.court.setTileScale(fence ? 1.1 : C.groundY / 512)
      .setSize(width, fence ? 99 : region === 'night' ? C.groundY : DISTRICT_GROUND[region] * C.groundY / 512)
      .setY(fence ? 336 : districtOffset(region));
    this.court.clearMask(false);
    if (fence) {
      // Opening and street entrance share the exact same parallax/anchor.
      const gate = 1240 * C.groundY / 512 - travel * .42 - facadeOffset;
      this.fenceClip.clear().fillStyle(0xffffff)
        .fillRect(left, 0, Math.max(0, Math.min(width, gate - 50 - left)), 540)
        .fillRect(Math.max(left, gate + 50), 0, Math.max(0, left + width - Math.max(left, gate + 50)), 540);
      this.court.setMask(this.fenceMask);
    }
    // Keep the opening street's asphalt and scale for the entire running route.
    this.ground.setVisible(true);
    this.foundation.setVisible(false);
    // The return street meets the facade feet, not the arena's distant baseline.
    const pavementTop = region !== 'night' ? C.groundY - 3 : 348.5;
    this.foundation.setY(pavementTop).setSize(width, C.height - pavementTop);
    if (this.canopyOnly !== (region !== 'night')) {
      this.canopyOnly = region !== 'night';
      this.foreground.setTexture('night-front', this.canopyOnly ? 'canopy' : '__BASE');
      this.foreground.setSize(width, this.canopyOnly ? 400 * C.height / 512 : C.height);
    }
    const farScale = region === 'night' ? C.groundY / 512 : .5;
    const farKey = region === 'night' ? 'night-far-repeat' : this.skyKey;
    if (this.farKey !== farKey) { this.far.setTexture(farKey); this.farKey = farKey; }
    this.far.setTileScale(farScale).setY(region === 'night' ? 0 : pavementTop - 1024 * farScale)
      .setSize(width, (region === 'night' ? 512 : 1024) * farScale).clearTint();
    this.foreground.setY(region === 'night' ? 0 : -115).setAlpha(1 - quiet);
    const shade = Math.round(255 - quiet * 38);
    this.court.setTint((shade << 16) | (Math.min(255, shade + 5) << 8) | Math.min(255, shade + 12));
    this.far.tilePositionX = (travel * .16 + left) / this.far.tileScaleX;
    this.court.tilePositionX = (travel * .42 + left + facadeOffset) / this.court.tileScaleX;
    this.ground.tilePositionX = (travel + left) / this.ground.tileScaleX;
    this.foundation.tilePositionX = (travel + left) / this.foundation.tileScaleX;
    this.foreground.tilePositionX = (travel * 1.12 + left) / this.foreground.tileScaleX;
  }
  dispose(): void {
    this.foreground.clearMask(false); this.court.clearMask(false);
    this.fenceMask.destroy(); this.fenceClip.destroy();
  }
}

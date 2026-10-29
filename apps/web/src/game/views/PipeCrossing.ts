import Phaser from 'phaser';
import { RUNNER } from '../config';
import { pipeBanks } from './worldLayout';

/** Side-on, world-anchored crossing. The road is masked out between the banks. */
export class PipeCrossing {
  readonly container: Phaser.GameObjects.Container;
  private pit: Phaser.GameObjects.Graphics;
  private pipe: Phaser.GameObjects.Image;
  private excavation: Phaser.GameObjects.Image;
  private roadMask: Phaser.GameObjects.Graphics;
  private mask: Phaser.Display.Masks.GeometryMask;
  private frontClip: Phaser.GameObjects.Graphics;
  private frontMask: Phaser.Display.Masks.GeometryMask;
  private pipeClip: Phaser.GameObjects.Graphics;
  private pipeMask: Phaser.Display.Masks.GeometryMask;
  constructor(scene: Phaser.Scene, private road: Phaser.GameObjects.TileSprite,
    private foreground: Phaser.GameObjects.TileSprite, private courtyardRoad?: Phaser.GameObjects.TileSprite) {
    this.container = scene.add.container(0, 0).setVisible(false);
    this.pit = scene.add.graphics();
    this.excavation = scene.add.image(0, RUNNER.groundY, 'pipe-side-excavation').setOrigin(0);
    // Use only the straight shaft; the elbowed supports from the old sheet are excluded.
    this.pipe = scene.add.image(0, RUNNER.groundY, 'pipe-side-illustration', 'shaft').setOrigin(0);
    this.pipeClip = scene.make.graphics({ x: 0, y: 0 });
    this.pipeMask = this.pipeClip.createGeometryMask(); this.pipe.setMask(this.pipeMask);
    this.container.add([this.excavation, this.pit, this.pipe]);
    this.roadMask = scene.make.graphics({ x: 0, y: 0 });
    this.mask = this.roadMask.createGeometryMask();
    this.frontClip = scene.make.graphics({ x: 0, y: 0 });
    this.frontMask = this.frontClip.createGeometryMask();
    road.setMask(this.mask); foreground.setMask(this.frontMask);
    // The return street uses the courtyard pavement rather than night-ground.
    // Preserve its upper yard plane, and cut only the road inside the pit.
    courtyardRoad?.setMask(this.frontMask);
  }
  render(distance: number, scale: number, visible: boolean, farSide: boolean, _approach = 0): void {
    const { near, far } = pipeBanks(distance, scale, farSide);
    const left = this.road.x, right = left + this.road.width;
    // Update even offscreen: a resize or a route reset must never expose stale geometry.
    this.pipe.setPosition(near, RUNNER.groundY - 1).setScale((far - near) / 480);
    // One world pixel inside each bank also guards against CSS upsampling of
    // the canvas bleeding an edge texel back onto the asphalt.
    this.pipeClip.clear().fillStyle(0xffffff).fillRect(near + 1, RUNNER.groundY - 2, far - near - 2, RUNNER.height - RUNNER.groundY + 2);
    this.excavation.setPosition(near, RUNNER.groundY).setDisplaySize(far - near, RUNNER.height - RUNNER.groundY);
    const g = this.pit; g.clear();
    g.lineStyle(5, 0x69717b).lineBetween(near - 34, RUNNER.groundY, near, RUNNER.groundY)
      .lineBetween(far, RUNNER.groundY, far + 34, RUNNER.groundY);
    this.container.setVisible(visible && near - 34 < right && far + 34 > left);
    this.roadMask.clear().fillStyle(0xffffff);
    this.roadMask.setScale(1).setPosition(0, 0);
    this.frontClip.clear().fillStyle(0xffffff);
    if (!visible || far <= left || near >= right) {
      this.frontClip.fillRect(left - 100, -1000, this.road.width + 200, 2000);
      this.roadMask.fillRect(left - 100, -1000, this.road.width + 200, 2000); return;
    }
    // The courtyard is behind the excavation. Cutting its entire height creates a vertical collage seam.
    // Canopy and wires can extend above the opening; only the rubble below the street is removed.
    this.frontClip.fillRect(left - 100, -1000, this.road.width + 200, RUNNER.groundY + 1000)
      .fillRect(left - 100, RUNNER.groundY, Math.max(0, near - left + 100), 1000)
      .fillRect(far, RUNNER.groundY, Math.max(0, right - far + 100), 1000);
    this.roadMask.fillRect(left - 100, -1000, Math.max(0, near - left + 100), 2000)
      .fillRect(far, -1000, Math.max(0, right - far + 100), 2000);
  }
  dispose(): void {
    this.road.clearMask(false); this.foreground.clearMask(false); this.courtyardRoad?.clearMask(false);
    this.pipe.clearMask(false); this.pipeMask.destroy(); this.pipeClip.destroy();
    this.mask.destroy(); this.frontMask.destroy(); this.frontClip.destroy(); this.roadMask.destroy(); this.container.destroy(true);
  }
}

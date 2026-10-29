import Phaser from 'phaser';
import { stormTimeline } from './stormTimeline';
import { coverScenery } from './sceneryWings';

/** Outdoor storm. The subsequent existing room approach owns the actual entrance. */
export class StormView {
  readonly container: Phaser.GameObjects.Container;
  private rain: Phaser.GameObjects.Graphics;
  private shade: Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Rectangle;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private scene: Phaser.Scene) {
    this.rain = scene.add.graphics();
    this.shade = scene.add.rectangle(480, 270, 960, 540, 0x080e1b);
    this.glow = scene.add.rectangle(480, 270, 960, 540, 0xa5b8d1);
    this.container = scene.add.container(0, 0, [this.shade, this.rain, this.glow]).setDepth(60).setVisible(false);
  }
  render(visible: boolean, t: number): void {
    this.container.setVisible(visible);
    if (!visible) return;
    const p = stormTimeline(t, this.reduced);
    this.container.setAlpha(1);
    coverScenery(this.shade); coverScenery(this.glow);
    this.shade.setAlpha(.22 * p.dark); this.glow.setAlpha(p.flash * .065);
    const g = this.rain.clear(), width = Math.max(960, this.scene.scale.width), left = (960 - width) / 2;
    if (p.flash) g.lineStyle(1.5, 0xc4d1df, p.flash * .7).beginPath()
      .moveTo(640, 55).lineTo(618, 102).lineTo(637, 98).lineTo(601, 154).strokePath();
    g.lineStyle(.7, 0xa8b8cb, p.rain * .34);
    for (let n = 0; n < 100; n++) {
      const x = left + (n * 193.7 + (this.reduced ? 0 : t * 30)) % width;
      const y = (n * 47 + (this.reduced ? 0 : t * 330)) % 540;
      g.lineBetween(x, y, x - 10, Math.min(540, y + 24));
    }
  }
  dispose(): void { this.container.destroy(true); }
}

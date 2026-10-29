import Phaser from 'phaser';

/** Pane interiors measured in the existing 1620×540 room plane. Frames are never painted over. */
export const ROOM_PANES = [
  { x: 527, y: 124, width: 74, height: 155 },
  { x: 614, y: 124, width: 38, height: 155 },
] as const;
export class WindowWeather {
  readonly graphics: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) { this.graphics = scene.add.graphics(); }
  render(t: number, rain: number, flash: number, gust = 0, reduced = false): void {
    const g = this.graphics.clear();
    for (const pane of ROOM_PANES) {
      const { x, y, width: w, height: h } = pane;
      if (rain > 0) g.fillStyle(0x151f30, .85 * rain).fillRect(x, y, w, h);
      if (flash > 0) {
        g.fillStyle(0x9cacc1, flash * .26).fillRect(x, y, w, h);
      }
      if (rain > 0) {
        const sway = reduced ? 0 : Math.sin(t * 2.2) * 2.5;
        g.lineStyle(1.6, 0x111923, .85).beginPath()
          .moveTo(x + 9, y + h).lineTo(x + 17 + sway, y + 68).lineTo(x + 4, y + 32)
          .moveTo(x + 17 + sway, y + 78).lineTo(x + w - 4, y + 49).strokePath();
        g.lineStyle(.7, 0x91a2b7, .38 * rain);
        for (let n = 0; n < 38; n++) {
          const px = x + 10 + (n * 19.7) % Math.max(1, w - 12);
          const py = y + 4 + ((n * 29 + (reduced ? 0 : t * 225)) % (h - 24));
          g.lineBetween(px, py, px - 7, py + 18);
        }
      }
      if (gust > 0 && gust < 1) {
        for (let n = 0; n < 5; n++) {
          const p = reduced ? n / 5 : (gust * 1.6 + n * .17) % 1, px = x + 4 + p * (w - 9);
          const py = y + 25 + n * 22 + Math.sin(p * 7 + n) * (reduced ? 1 : 8);
          g.fillStyle(n % 2 ? 0x81745e : 0x625b51, .85 * Math.sin(gust * Math.PI))
            .fillTriangle(px - 3, py, px + 4, py - 2, px + 1, py + 3);
        }
      }
    }
  }
}

import type Phaser from 'phaser';

export function drawMeteor(g: Phaser.GameObjects.Graphics, x: number, y: number, length: number, alpha: number, lean = .2): void {
  for (let i = 0; i < 3; i++) {
    const start = i / 3, end = (i + 1) / 3;
    g.lineStyle(1.6 - i * .4, 0xbecbdd, alpha * (.5 - i * .15));
    g.lineBetween(x - lean * length * start, y - length * start, x - lean * length * end, y - length * end);
  }
  g.fillStyle(0xb2c6dc, alpha * .08).fillCircle(x, y, 7);
  g.fillStyle(0xc5d4e6, alpha * .2).fillCircle(x, y, 3.6);
  g.fillStyle(0xe2e9ee, alpha).fillEllipse(x, y, 2.6, 5);
}

/** The same sky is visible from the street and after the player enters the court. */
export function drawDistantMeteors(g: Phaser.GameObjects.Graphics, elapsed: number, alpha = 1): void {
  for (let i = 0; i < 8; i++) {
    const cycle = (elapsed * (.19 + i * .009) + i * .137) % 1;
    drawMeteor(g, (i * 131 + cycle * 38 + 45) % 960, 5 + cycle * 188,
      18 + i % 3 * 9, Math.sin(cycle * Math.PI) * .34 * alpha, .32);
  }
}

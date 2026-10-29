import type Phaser from 'phaser';

/** Repeat only the outer masonry. Never mirror the entrance or repeat its doorway and lamp. */
export function sceneryWings(scene: Phaser.Scene, image: Phaser.GameObjects.Image): Phaser.GameObjects.TileSprite[] {
  return ['wall-left', 'wall-right'].map((frame, i) => scene.add.tileSprite(i ? 960 : -960, 0, 960, 540, image.texture.key, frame)
    .setOrigin(0).setTint(image.tintTopLeft, image.tintTopRight, image.tintBottomLeft, image.tintBottomRight).setAlpha(image.alpha));
}

export function coverScenery(shade: Phaser.GameObjects.Rectangle): void {
  shade.setDisplaySize(Math.max(960, shade.scene.scale.width), 540);
}

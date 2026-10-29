import type Phaser from 'phaser';
import { ASSETS } from './manifest';
export function loadAssets(scene: Phaser.Scene): void {
  // Register crops once, before any view is created, and keep full illustrations as defaults.
  // Texture.add() would otherwise make its first crop the implicit frame for all later images.
  scene.load.once('complete', () => {
    for (const asset of ASSETS) {
      if (asset.type !== 'image' || !scene.textures.exists(asset.key)) continue;
      const texture = scene.textures.get(asset.key);
      for (const frame of asset.frames ?? []) if (!texture.has(frame.name)) {
        texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
      }
      texture.firstFrame = '__BASE';
    }
  });
  for (const asset of ASSETS) {
    if (asset.type === 'sheet') scene.load.spritesheet(asset.key, asset.url, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
    else scene.load.image(asset.key, asset.url);
  }
}

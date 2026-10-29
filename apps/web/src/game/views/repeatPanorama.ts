import type Phaser from 'phaser';

/** Join the painted panorama's unequal ends once, before horizontal repetition.
 * Only the overlap is composited; the rest retains the original source pixels.
 * This is a cached render texture, not another scrolling scenery layer.
 */
export function repeatPanorama(scene: Phaser.Scene): string {
  const key = 'night-far-repeat';
  if (scene.textures.exists(key)) return key;
  const source = scene.textures.get('night-far').getSourceImage() as HTMLImageElement;
  const overlap = 128, width = source.width - overlap, height = source.height;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, overlap, 0, width, height, 0, 0, width, height);
  const tail = ctx.getImageData(width - overlap, 0, overlap, height);
  const headCanvas = document.createElement('canvas'); headCanvas.width = overlap; headCanvas.height = height;
  const headContext = headCanvas.getContext('2d')!;
  headContext.drawImage(source, 0, 0);
  const head = headContext.getImageData(0, 0, overlap, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < overlap; x++) {
    const i = (y * overlap + x) * 4, t = x / (overlap - 1);
    for (let c = 0; c < 4; c++) tail.data[i + c] = Math.round(tail.data[i + c] * (1 - t) + head.data[i + c] * t);
  }
  ctx.putImageData(tail, width - overlap, 0);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** Continue the painted sky using only its upper 128 rows (no buildings).
 * Reflected rows retain cloud texture, rather than stretching a single edge
 * into vertical streaks. The original city pixels are preserved exactly. */
export function courtSkyPanorama(scene: Phaser.Scene): string {
  const key = 'night-far-court-sky';
  if (scene.textures.exists(key)) return key;
  const source = scene.textures.get(repeatPanorama(scene)).getSourceImage() as HTMLCanvasElement;
  const extension = 512, canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height + extension;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, extension);
  for (let y = 0; y < extension; y++) {
    const distance = (extension - 1 - y) % 256;
    const row = distance < 128 ? distance : 255 - distance;
    ctx.drawImage(source, 0, row, canvas.width, 1, 0, y, canvas.width, 1);
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

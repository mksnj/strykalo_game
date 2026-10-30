import layout from '../assets/shuffleLayout.json';
import type { ShuffleDirection } from './courtShuffle';

const smooth = (n: number) => { const p = Math.max(0, Math.min(1, n)); return p * p * (3 - 2 * p); };
export function shufflePose(progress: number, direction: ShuffleDirection = 'right') {
  const p = Math.max(0, Math.min(1, progress));
  const next = layout.keys.findIndex(key => key.at >= p);
  const b = layout.keys[Math.max(0, next)], a = layout.keys[Math.max(0, next - 1)];
  const t = b.at === a.at ? 0 : smooth((p - a.at) / (b.at - a.at));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  let leadLift = lerp(a.leadLift, b.leadLift), followLift = lerp(a.followLift, b.followLift);
  let leadX = lerp(a.leadX, b.leadX), followX = lerp(a.followX, b.followX);
  // Plant one foot before lifting the other, including between authored keys.
  if (a.leadLift > 0 && b.followLift > 0 && a.followLift === 0 && b.leadLift === 0) {
    leadLift = a.leadLift * (1 - smooth(t * 2)); followLift = b.followLift * smooth(t * 2 - 1);
    leadX = a.leadX + (b.leadX - a.leadX) * smooth(t * 2);
    followX = a.followX + (b.followX - a.followX) * smooth(t * 2 - 1);
  }
  if (a.followLift > 0 && b.leadLift > 0 && a.leadLift === 0 && b.followLift === 0) {
    followLift = a.followLift * (1 - smooth(t * 2)); leadLift = b.leadLift * smooth(t * 2 - 1);
    followX = a.followX + (b.followX - a.followX) * smooth(t * 2);
    leadX = a.leadX + (b.leadX - a.leadX) * smooth(t * 2 - 1);
  }
  const profile = layout.profiles[direction];
  return { leadX: leadX * profile.travel, followX: followX * profile.travel,
    leadLift: leadLift * profile.lift, followLift: followLift * profile.lift,
    weight: lerp(a.weight, b.weight) * profile.sway, dip: lerp(a.dip, b.dip) * profile.dip,
    lean: lerp(a.lean, b.lean) * profile.lean, knee: lerp(a.knee, b.knee) * profile.knee };
}

/** Offline layered animation of the existing transparent sprite. No colour key, rotation or scale changes.
 * Inverse bilinear mapping avoids cracks and preserves the hood's black pixels and alpha.
 * Each trouser leg bends from the shared hip towards an independently translated, rigid shoe.
 */
export function drawShuffleFrame(ctx: CanvasRenderingContext2D, source: ImageData, direction: ShuffleDirection, progress: number): void {
  const pose = shufflePose(progress, direction), sign = layout.profiles[direction].sign;
  const { width, height, x: padX, y: padY } = layout.source;
  if (pose.weight === 0 && pose.dip === 0 && pose.lean === 0 && pose.knee === 0 &&
    pose.leadX === 0 && pose.followX === 0 && pose.leadLift === 0 && pose.followLift === 0) {
    ctx.clearRect(0, 0, layout.cellWidth, layout.cellHeight); ctx.putImageData(source, padX + sign * pose.weight, padY); return;
  }
  const output = ctx.createImageData(layout.cellWidth, layout.cellHeight);
  const sample = (x: number, y: number, channel: number, half?: number): number => {
    if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
    if (half !== undefined && (half === 0 ? x >= 64 : x < 64)) return 0;
    return source.data[(Math.floor(y) * width + Math.floor(x)) * 4 + channel];
  };
  const paint = (dx: number, dy: number, sx: number, sy: number, half?: number) => {
    const x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0;
    const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    const xs = [x0, x0 + 1, x0, x0 + 1], ys = [y0, y0, y0 + 1, y0 + 1];
    const alphas = weights.map((weight, i) => weight * sample(xs[i], ys[i], 3, half));
    const alpha = alphas.reduce((sum, a) => sum + a, 0);
    if (!alpha) return;
    const at = (dy * layout.cellWidth + dx) * 4;
    const oldAlpha = output.data[at + 3] / 255, a = alpha / 255, merged = a + oldAlpha * (1 - a);
    for (let c = 0; c < 3; c++) {
      const rgb = alphas.reduce((sum, w, i) => sum + w * sample(xs[i], ys[i], c, half), 0) / alpha;
      output.data[at + c] = (rgb * a + output.data[at + c] * oldAlpha * (1 - a)) / merged;
    }
    output.data[at + 3] = merged * 255;
  };
  // A single upper body follows the knees and rolls subtly over the supporting hip.
  // Inverse mapping fills every destination row, including the moving waist seam.
  for (let y = 0; y < 132 + pose.dip; y++) {
    const sy = y - pose.dip;
    const shift = sign * (pose.weight + pose.lean * (1 - smooth((sy - 72) / 60)));
    for (let x = 0; x < layout.cellWidth; x++) paint(x, y + padY, x - padX - shift, sy);
  }
  for (const half of [0, 1]) {
    const lead = half === (sign < 0 ? 0 : 1);
    const footX = sign * (lead ? pose.leadX : pose.followX), lift = lead ? pose.leadLift : pose.followLift;
    const mapY = (y: number) => y + pose.dip * (1 - smooth((y - 132) / 104)) - lift * smooth((y - 132) / 104);
    for (let y = Math.ceil(132 + pose.dip); y < height; y++) {
      let low = 132, high = height + 4;
      for (let i = 0; i < 16; i++) { const mid = (low + high) / 2; if (mapY(mid) < y) low = mid; else high = mid; }
      const sy = (low + high) / 2;
      const bend = smooth((sy - 132) / 104);
      const shift = sign * pose.weight * (1 - bend) + footX * bend + (half ? 1 : -1) * pose.knee * Math.sin(Math.PI * bend);
      for (let x = 0; x < layout.cellWidth; x++) paint(x, y + padY, x - padX - shift, sy, half);
    }
  }
  ctx.putImageData(output, 0, 0);
}

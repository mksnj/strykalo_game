import type Phaser from 'phaser';
import type { JourneyPhase } from './state/RunSession';
import { courtCameraFrame } from './views/courtSpace';
/** Extend the visible world horizontally; do not enlarge or crop the original frame. */
export function gameViewport(width: number, height: number, portrait: boolean) {
  return { width: portrait ? 720 : Math.max(960, 540 * width / Math.max(1, height)), height: 540 };
}
/** Camera framing follows the existing transition; it never changes simulation. */
export function portraitCamera(phase: JourneyPhase, progress = 0): { width: number; centreX: number } {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const mix = (from: number, to: number) => from + (to - from) * eased;
  if (phase === 'runner' || phase === 'beer-pickup') return { width: 720, centreX: 420 };
  if (phase === 'balance') return { width: 720, centreX: 480 };
  if (phase === 'pipe-approach') return { width: 720, centreX: mix(420, 480) };
  if (phase === 'pipe-exit') return { width: 720, centreX: mix(480, 420) };
  if (phase === 'stars-approach') {
    const { focus } = courtCameraFrame(phase, progress);
    return { width: 720 + 80 * focus, centreX: 420 + 60 * focus };
  }
  if (phase === 'stars' || phase === 'stars-locked' || phase === 'stars-retry' || phase === 'stars-failure') return { width: 800, centreX: 480 };
  if (phase === 'stars-exit') {
    const { focus } = courtCameraFrame(phase, progress);
    return { width: 720 + 80 * focus, centreX: 420 + 60 * focus };
  }
  if (phase === 'room-approach') return { width: mix(720, 960), centreX: mix(420, 480) };
  return { width: 960, centreX: 480 };
}
export function layoutCamera(camera: Phaser.Cameras.Scene2D.Camera, portrait: boolean, phase: JourneyPhase, progress = 0): void {
  const { top } = courtCameraFrame(phase, progress, portrait);
  if (!portrait) { camera.setZoom(1).setScroll((960 - camera.width) / 2, top); return; }
  const { width, centreX } = portraitCamera(phase, progress);
  // Phaser zooms about the viewport centre. Keep 600 world pixels ahead of
  // the runner (2 s at unchanged speed), and the entire arena in mini-games.
  const zoom = 720 / width;
  camera.setZoom(zoom).setScroll(centreX - 360, top - camera.height / 2 + camera.height / (2 * zoom));
}

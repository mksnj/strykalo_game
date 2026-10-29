import { PIPE_ART as P } from '../assets/pipeLayout';
export interface Point { x: number; y: number }
export interface PipeCamera { progress: number; opening: number; nearX: number; lean: number }
export function projectPipe(x: number, y: number, z: number, camera: PipeCamera): Point {
  const depth = Math.max(P.nearClip, z - camera.progress * P.cameraTravel);
  const frontX = 480 + (x - camera.lean * .055) * P.focal / depth;
  const frontY = P.horizon + (P.eyeHeight - y) * P.focal / depth;
  const sideX = camera.nearX + z / P.length * P.sideSpan;
  const sideY = P.sideGround + (P.radius - y) * P.sideScale;
  // Blend camera matrices in homogeneous space. Interpolating divided screen coordinates
  // bends a straight pipe because every depth then follows a different curve.
  const sideWeight = (1 - camera.opening) * 24;
  const frontWeight = camera.opening * depth;
  const weight = sideWeight + frontWeight;
  return { x: (sideX * sideWeight + frontX * frontWeight) / weight,
    y: (sideY * sideWeight + frontY * frontWeight) / weight };
}
export function mirroredMaterial(z: number): number {
  const t = (z / P.textureRepeat % 2 + 2) % 2;
  return t <= 1 ? t : 2 - t;
}

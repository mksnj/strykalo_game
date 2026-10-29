/** Shared by renderer and sound observer; driven only by active visual time. */
export function endingFlicker(visualTime: number, reducedMotion: boolean): boolean {
  const cycle = visualTime / 1000 % 9.7;
  return !reducedMotion && (cycle > 2.1 && cycle < 2.25 || cycle > 6.4 && cycle < 6.85);
}

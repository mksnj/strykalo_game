/** Uniformly cover the viewport with one panorama; all attached props share the transform. */
export function panoramaLayout(viewportWidth: number, aspect: number) {
  const width = 540 * aspect;
  const scale = Math.max(1, viewportWidth / width);
  return { width, scale, x: 480 * (1 - scale), y: 270 * (1 - scale) };
}

// Coordinates in the room's 1620×540 design plane, centred on the original world x=480.
export const ROOM_ART = {
  clockX: 717, clockY: 145, clockSize: 40,
  doorX: 748, doorY: 164, doorWidth: 108, doorHeight: 226,
  entryX: 802, entryY: 400,
} as const;

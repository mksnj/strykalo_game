import { describe, expect, it } from 'vitest';
import { panoramaLayout, ROOM_ART } from '../../apps/web/src/game/views/panoramaLayout';

describe('единая широкая иллюстрация', () => {
  it.each([720, 960, 1620, 1786, 2400])('покрывает ширину %i равномерно вместе с предметами', width => {
    const layout = panoramaLayout(width, 3);
    const left = layout.x + (480 - layout.width / 2) * layout.scale;
    const right = left + layout.width * layout.scale;
    expect(left).toBeLessThanOrEqual(480 - width / 2);
    expect(right).toBeGreaterThanOrEqual(480 + width / 2);
    expect(layout.y).toBeLessThanOrEqual(0);
    expect(layout.y + 540 * layout.scale).toBeGreaterThanOrEqual(540);
    // Clock and doorway stay in view even when the panorama grows on very wide screens.
    for (const x of [ROOM_ART.clockX, ROOM_ART.entryX]) {
      const actual = layout.x + x * layout.scale;
      expect(actual).toBeGreaterThan(480 - Math.max(960, width) / 2);
      expect(actual).toBeLessThan(480 + Math.max(960, width) / 2);
    }
  });
});

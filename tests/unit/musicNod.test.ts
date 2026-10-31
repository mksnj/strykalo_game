import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { musicNodFrame, musicNodDuration } from '../../apps/web/src/game/views/musicNodAnimation';
import layout from '../../apps/web/src/game/assets/musicNodLayout.json';

describe('down-arrow nod clip', () => {
  it('uses only the first nod in the two-nod source sheet, then stops', () => {
    expect(Array.from({ length: 4 }, (_, i) => musicNodFrame(i / 8))).toEqual([0, 1, 2, 3]);
    expect(musicNodFrame(.25)).toBe(2);
    expect(musicNodDuration()).toBe(.5);
    expect(musicNodFrame(.5)).toBe(3); expect(musicNodFrame(100)).toBe(3);
  });
  it('scales clip duration by BPM and falls back for invalid tempo', () => {
    expect(musicNodFrame(.25, 60)).toBe(1); expect(musicNodDuration(60)).toBe(1);
    expect(musicNodFrame(.125, 240)).toBe(2); expect(musicNodDuration(240)).toBe(.25);
    expect(musicNodFrame(.125, NaN)).toBe(1); expect(musicNodFrame(.125, 0)).toBe(1);
  });
  it('keeps a resting frame for reduced motion and preserves the original RGBA PNG', () => {
    expect(musicNodFrame(.25, 120, true)).toBe(0);
    expect(readFileSync(`apps/web/public${layout.url}`).equals(readFileSync(`${layout.source}/sprite_sheet_4x2.png`))).toBe(true);
  });
});

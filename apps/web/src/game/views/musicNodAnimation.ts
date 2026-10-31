import layout from '../assets/musicNodLayout.json' with { type: 'json' };

// A down-arrow hit starts one complete clip. Music playback alone never selects it.
export const MUSIC_NOD_CLIP = { key: layout.key, frames: layout.hitFrames, repeat: 0 } as const;
function tempo(bpm: number): number { return Number.isFinite(bpm) && bpm > 0 ? bpm : layout.bpm; }
export function musicNodDuration(bpm = layout.bpm): number { return layout.hitFrames.length / (layout.frameCount * tempo(bpm) / 120); }
export function musicNodFrame(elapsed: number, bpm = layout.bpm, reduced = false): number {
  if (reduced) return 0;
  const clock = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return layout.hitFrames[Math.min(layout.hitFrames.length - 1, Math.floor(clock * layout.frameCount * tempo(bpm) / 120))];
}

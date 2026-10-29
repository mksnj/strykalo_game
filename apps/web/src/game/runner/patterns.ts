import { RUNNER as C } from '../config';
import { GENERATION as G } from './generationConfig';
import { RunnerPhysics } from './physics';

export interface CassetteSlot { x: number; y: number }
export interface SpawnPattern {
  id: string; weight: number; length: number;
  hazards: readonly number[];
  tapes: readonly CassetteSlot[];
  /** A complete safe reference route, including optional jumps for high rewards. */
  jumpStarts: readonly number[];
}

// Sample the actual fixed-step jump once. The artwork does not define reachability.
const jump = new RunnerPhysics();
jump.press();
const heights = [jump.y];
for (let tick = 1; tick <= 100; tick++) { jump.step(C.fixedStep); heights.push(jump.y); }
function arc(start: number, times: readonly number[], offset = 42): CassetteSlot[] {
  return times.map(time => {
    const tick = Math.round(time / C.fixedStep);
    return { x: start + tick * C.fixedStep * C.speed - G.cassetteWidth / 2,
      y: heights[tick] - offset - G.cassetteHeight / 2 };
  });
}
function bank(start: number, count: number, centre: number = G.lowCentre): CassetteSlot[] {
  return Array.from({ length: count }, (_, i) => ({ x: start + i * 68, y: centre - G.cassetteHeight / 2 }));
}

/** Authored phrases, not one reward signal repeated before every obstacle. */
export const SPAWN_PATTERNS: readonly SpawnPattern[] = [
  { id: 'single', weight: 6, length: 320, hazards: [], tapes: bank(110, 1), jumpStarts: [] },
  { id: 'pair', weight: 3, length: 360, hazards: [], tapes: bank(80, 2), jumpStarts: [] },
  { id: 'bare', weight: .4, length: 320, hazards: [0], tapes: [], jumpStarts: [-G.jumpLead] },
  { id: 'approach', weight: 2, length: 640, hazards: [330], tapes: bank(0, 3), jumpStarts: [330 - G.jumpLead] },
  { id: 'landing', weight: 2, length: 640, hazards: [0], tapes: bank(360, 1), jumpStarts: [-G.jumpLead] },
  { id: 'vault', weight: 3, length: 440, hazards: [G.jumpLead], tapes: arc(0, [.24, .48]), jumpStarts: [0] },
  { id: 'crest', weight: 1.5, length: 440, hazards: [G.jumpLead], tapes: arc(0, [.24, .40, .56], 64), jumpStarts: [0] },
  { id: 'long-arc', weight: .25, length: 440, hazards: [G.jumpLead], tapes: arc(0, [.09, .25, .41, .57, .73], 56), jumpStarts: [0] },
  { id: 'two-jumps', weight: 1.5, length: 840, hazards: [G.jumpLead, G.jumpLead + 400],
    tapes: [...arc(0, [.24, .48]), ...arc(400, [.24, .48], 64)], jumpStarts: [0, 400] },
  { id: 'between', weight: 1, length: 940, hazards: [G.jumpLead, G.jumpLead + 500], tapes: bank(340, 2), jumpStarts: [0, 500] },
  { id: 'low-bank', weight: .25, length: 360, hazards: [], tapes: bank(0, 5), jumpStarts: [] },
  { id: 'middle-bank', weight: 1, length: 400, hazards: [], tapes: arc(-70, [.24, .44]), jumpStarts: [-70] },
  { id: 'free-arc', weight: .6, length: 440, hazards: [], tapes: arc(0, [.24, .48], 64), jumpStarts: [0] },
  { id: 'breath', weight: .25, length: 240, hazards: [], tapes: [], jumpStarts: [] },
];

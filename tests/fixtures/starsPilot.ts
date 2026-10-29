import { RUNNER } from '../../apps/web/src/game/config';
import type { StarsEngine } from '../../apps/web/src/game/minigames/stars/StarsEngine';

/** Test player presses the actual chart near its timing targets; no outcome edits. */
export function starsPilot(engine: StarsEngine): { x: number; y: number } {
  for (const note of engine.notes) if (note.state === 'pending' && Math.abs(note.at - engine.elapsed) <= RUNNER.fixedStep) engine.press(note.direction);
  return { x: 0, y: 0 };
}

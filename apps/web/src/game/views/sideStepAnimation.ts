import animation from '../assets/sideStepAnimations.json' with { type: 'json' };
import layout from '../assets/sideStepLayout.json' with { type: 'json' };

export type SideStepClip = keyof typeof animation.animations;
type StepDirection = 'left' | 'right';
const hitClips = { left: 'step_left', right: 'step_right' } as const;
const frames = new Map(animation.frames.map(frame => [frame.name, frame]));
export function sideStepDuration(clip: SideStepClip): number {
  return animation.animations[clip].frames.reduce((sum, name) => sum + frames.get(name)!.duration_ms, 0) / 1000;
}

function leadInSeconds(direction: StepDirection): number {
  const first = animation.animations[hitClips[direction]].frames[0];
  return frames.get(first)!.duration_ms / 1000;
}

/** A rhythm hit starts moving immediately; the source's idle lead-in belongs to the preview. */
export function sideStepHitDuration(direction: StepDirection): number {
  return sideStepDuration(hitClips[direction]) - leadInSeconds(direction);
}

export function sideStepHitFrame(direction: StepDirection, elapsed: number, reduced = false): number {
  return sideStepFrame(hitClips[direction], Math.max(0, elapsed) + leadInSeconds(direction), reduced);
}

/** Sample the supplied clips on simulation time so pause/retry cannot advance an animation. */
export function sideStepFrame(clip: SideStepClip, elapsed: number, reduced = false): number {
  const sequence = animation.animations[clip];
  const duration = sideStepDuration(clip) * 1000;
  let milliseconds = Math.max(0, elapsed * 1000);
  if (sequence.loop) milliseconds %= duration;
  else if (milliseconds >= duration) return frames.get(sequence.frames.at(-1)!)!.index;
  if (reduced) {
    if (clip === 'step_left') return layout.reducedFrame.left;
    if (clip === 'step_right') return layout.reducedFrame.right;
    return 0;
  }
  for (const name of sequence.frames) {
    const frame = frames.get(name)!;
    if (milliseconds < frame.duration_ms) return frame.index;
    milliseconds -= frame.duration_ms;
  }
  return frames.get(sequence.frames.at(-1)!)!.index;
}

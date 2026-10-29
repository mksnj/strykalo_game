import { RHYTHM as C, RUNNER, STARS_START } from '../../config';
import { seededRandom } from '../../runner/generator';
import { rhythmPhase, rhythmSpeed, rhythmTime } from './rhythmTiming';

export const DIRECTIONS = ['left', 'down', 'up', 'right'] as const;
export type RhythmDirection = typeof DIRECTIONS[number];
export type Judgment = 'perfect' | 'good' | 'miss' | 'empty';
export interface RhythmNote { id: number; direction: RhythmDirection; at: number; spawnPhase: number; state: 'pending' | 'hit' | 'missed' }
export interface RhythmFeedback { direction: RhythmDirection; judgment: Judgment; at: number; noteId?: number }

/** Endless accelerating rhythm, ending only on the third mistake. */
export class StarsEngine {
  readonly x = STARS_START.x;
  readonly y = STARS_START.y;
  tick = 0;
  readonly notes: RhythmNote[] = [];
  hits = 0;
  misses = 0;
  feedback: RhythmFeedback[] = [];
  outcome: 'narrative-failure' | null = null;
  private serial = 0;
  private shift: number;
  constructor(seed: number) { this.shift = Math.floor(seededRandom(seed)() * 4); this.fill(); }
  get elapsed(): number { return this.tick * RUNNER.fixedStep; }
  get speed(): number { return rhythmSpeed(this.elapsed); }
  get remainingMistakes(): number { return C.maxMistakes - this.misses; }
  get platformOpacity(): number { return this.remainingMistakes / C.maxMistakes; }
  progress(note: RhythmNote): number { return (rhythmPhase(this.elapsed) - note.spawnPhase) / C.travelSeconds; }
  press(direction: RhythmDirection): Judgment | undefined {
    if (this.outcome) return;
    const candidates = this.notes.filter(n => n.state === 'pending' && this.progress(n) >= 0)
      .sort((a, b) => Math.abs(a.at - this.elapsed) - Math.abs(b.at - this.elapsed));
    const hit = candidates.find(n => n.direction === direction && Math.abs(n.at - this.elapsed) <= C.goodWindow + 1e-8);
    if (hit) {
      hit.state = 'hit'; this.hits++;
      const judgment = Math.abs(hit.at - this.elapsed) <= C.perfectWindow + 1e-8 ? 'perfect' : 'good';
      this.respond(direction, judgment, hit.id); return judgment;
    }
    // A visible note receives at most one penalty, including a wrong/early press.
    const note = candidates[0];
    if (note) { this.miss(note); return 'miss'; }
    this.respond(direction, 'empty'); return 'empty';
  }
  private respond(direction: RhythmDirection, judgment: Judgment, noteId?: number): void {
    this.feedback.push({ direction, judgment, at: this.elapsed, noteId });
    this.feedback = this.feedback.slice(-8);
  }
  private miss(note: RhythmNote): void {
    if (note.state !== 'pending' || this.outcome) return;
    note.state = 'missed'; this.misses++;
    this.respond(note.direction, 'miss', note.id);
    if (this.misses >= C.maxMistakes) this.outcome = 'narrative-failure';
  }
  private fill(): void {
    const horizon = rhythmPhase(this.elapsed) + C.travelSeconds;
    const phrase = [0, 1, 3, 2, 1, 0, 2, 3];
    for (let work = 0; work < C.maxNotes && !this.outcome; work++) {
      const spawnPhase = C.firstSpawn + this.serial * C.spawnInterval;
      if (spawnPhase > horizon || this.notes.length >= C.maxNotes) break;
      const id = this.serial++;
      const note: RhythmNote = { id, spawnPhase, at: rhythmTime(spawnPhase + C.travelSeconds),
        direction: DIRECTIONS[(phrase[id % phrase.length] + this.shift) % 4], state: 'pending' };
      this.notes.push(note);
      if (note.at + C.goodWindow < this.elapsed) this.miss(note);
    }
  }
  step(musicTime?: number): void {
    if (this.outcome) return;
    const next = musicTime !== undefined && Number.isFinite(musicTime) ? Math.floor(Math.max(0, musicTime) / RUNNER.fixedStep) : this.tick + 1;
    this.tick = Math.max(this.tick, next);
    for (const note of this.notes) if (note.state === 'pending' && this.elapsed > note.at + C.goodWindow + 1e-8) this.miss(note);
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      if (n.state !== 'pending' && n.at < this.elapsed - C.feedbackSeconds) this.notes.splice(i, 1);
    }
    this.fill();
    this.feedback = this.feedback.filter(f => this.elapsed - f.at <= C.feedbackSeconds).slice(-8);
  }
}

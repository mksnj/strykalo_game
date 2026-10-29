import { readDemoRecord, saveDemoRecord } from '../../services/demoRecord';
import { readMuted, saveMuted, readVolume, saveVolume } from '../../services/audioSettings';
import { AUDIO } from '../audio/catalog';
import { RUNNER } from '../config';
import type { RunResult } from '../../../../../packages/shared/src/contracts';
import type { JourneyPhase, Region, RunSession, RunCheckpoint } from './RunSession';
import { isDebugStartPoint, isMiniGameStartPoint, type DebugStartPoint, type MiniGameStartPoint } from './debugStart';
export type Screen = 'loading' | 'menu' | 'playing' | 'game-over' | 'stage-complete' | 'completed' | 'error';
export interface Snapshot {
  musicVolume: number; effectsVolume: number; ambientVolume: number;
  screen: Screen; score: number; distance: number; best: number; lives: number;
  paused: boolean; muted: boolean; seed: number; runNumber: number; error: string; developer: boolean;
  debugStart?: DebugStartPoint;
  bypassStarsGate: boolean;
  phase: JourneyPhase; region: Region; balancePosition: number; balanceProgress: number; waitingHint: boolean;
  checkpointDistance: number | null; continueNumber: number; continued: boolean;
  checkpointPhase?: RunCheckpoint['phase'];
  starsGateNumber: number; starsGateAction: 'play' | 'skip'; waitingHintOpacity: number;
  balanceIntroOpen: boolean; balanceStartNumber: number;
  starsIntroOpen: boolean; starsStartNumber: number;
  rhythmDirection: string; rhythmJudgment: string; rhythmFeedbackAt: number; rhythmElapsed: number; rhythmHits: number;
  rhythmMistakes: number; rhythmSpeed: number;
}
class GameStore {
  private snapshot: Snapshot = { screen: 'loading', score: 0, distance: 0, best: readDemoRecord(), lives: RUNNER.maxLives,
    musicVolume: readVolume('music', AUDIO.musicVolume), effectsVolume: readVolume('effects', AUDIO.effectsVolume),
    ambientVolume: readVolume('ambient', AUDIO.ambientVolume),
    paused: false, muted: readMuted(), seed: 1, runNumber: 0, error: '', developer: false, bypassStarsGate: false,
    phase: 'runner', region: 'night', balancePosition: 0, balanceProgress: 0, waitingHint: false,
    checkpointDistance: null, continueNumber: 0, continued: false, balanceIntroOpen: false, balanceStartNumber: 0,
    starsGateNumber: 0, starsGateAction: 'play', waitingHintOpacity: 0,
    starsIntroOpen: false, starsStartNumber: 0, rhythmDirection: '', rhythmJudgment: '', rhythmFeedbackAt: 0, rhythmElapsed: 0, rhythmHits: 0,
    rhythmMistakes: 0, rhythmSpeed: 1 };
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = (): Snapshot => this.snapshot;
  private update(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(fn => fn());
  }
  ready(): void { if (this.snapshot.screen === 'loading') this.update({ screen: 'menu' }); }
  start(developer = false, debugStart?: DebugStartPoint, seed?: number, bypassStarsGate = false): void {
    if (!['menu', 'game-over', 'stage-complete', 'completed'].includes(this.snapshot.screen)) return;
    if (!import.meta.env.DEV && (developer || bypassStarsGate || debugStart && !isMiniGameStartPoint(debugStart))) return;
    this.update({ screen: 'playing', score: 0, distance: 0, lives: RUNNER.maxLives, paused: false, developer,
      debugStart, bypassStarsGate, phase: 'runner', region: 'night', balancePosition: 0, balanceProgress: 0, waitingHint: false,
      checkpointDistance: null, checkpointPhase: undefined, continued: false, balanceIntroOpen: false, starsIntroOpen: false, waitingHintOpacity: 0,
      rhythmDirection: '', rhythmJudgment: '', rhythmFeedbackAt: 0, rhythmElapsed: 0, rhythmHits: 0, rhythmMistakes: 0, rhythmSpeed: 1,
      seed: seed ?? crypto.getRandomValues(new Uint32Array(1))[0], runNumber: this.snapshot.runNumber + 1 });
  }
  startDebug(point: DebugStartPoint, seed?: number): void {
    if (!import.meta.env.DEV || !isDebugStartPoint(point) ||
      seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) return;
    this.start(false, point, seed, true);
  }
  startMiniGame(point: MiniGameStartPoint, seed?: number): void {
    if (!isMiniGameStartPoint(point) ||
      seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) return;
    this.start(false, point, seed);
  }
  progress(session: RunSession): void {
    if (this.snapshot.screen !== 'playing') return;
    const next = { score: session.score, lives: session.lives, distance: Math.floor(session.distance), phase: session.phase, region: session.region,
      checkpointDistance: session.checkpoint?.start ?? null, continued: session.continued,
      checkpointPhase: session.checkpoint?.phase,
      balanceIntroOpen: session.balanceIntroPending,
      starsIntroOpen: session.starsIntroPending,
      rhythmDirection: session.stars?.feedback.at(-1)?.direction ?? '',
      rhythmJudgment: session.stars?.feedback.at(-1)?.judgment ?? '',
      rhythmFeedbackAt: session.stars?.feedback.at(-1)?.at ?? 0,
      rhythmElapsed: session.stars?.elapsed ?? 0, rhythmHits: session.stars?.hits ?? 0,
      rhythmMistakes: session.stars?.misses ?? 0, rhythmSpeed: session.stars?.speed ?? 1,
      balancePosition: Math.round((session.balance?.position ?? 0) * 100) / 100,
      balanceProgress: (session.balance?.progress ?? 0) * 100, waitingHint: session.phase === 'waiting' && (session.waiting?.hint ?? false),
      waitingHintOpacity: session.waiting?.hintOpacity ?? 0 };
    if (Object.entries(next).some(([key, value]) => value !== this.snapshot[key as keyof Snapshot])) this.update(next);
  }
  finish(result: RunResult): void {
    if (this.snapshot.screen !== 'playing') return;
    this.update({ screen: result.reason === 'completed' ? 'completed' : result.reason === 'stage-complete' ? 'stage-complete' : 'game-over',
      score: result.score, distance: Math.floor(result.distance),
      lives: ['collision', 'fall', 'star-hit'].includes(result.reason) ? 0 : this.snapshot.lives,
      best: this.snapshot.developer || this.snapshot.debugStart ? this.snapshot.best : Math.max(this.snapshot.best, saveDemoRecord(result.score)), paused: false });
  }
  startBalance(): void {
    if (this.snapshot.screen !== 'playing' || this.snapshot.phase !== 'balance' || !this.snapshot.balanceIntroOpen) return;
    this.update({ balanceIntroOpen: false, paused: false, balanceStartNumber: this.snapshot.balanceStartNumber + 1 });
  }
  startStars(): void {
    if (this.snapshot.screen !== 'playing' || this.snapshot.phase !== 'stars' || !this.snapshot.starsIntroOpen) return;
    this.update({ starsIntroOpen: false, paused: false, starsStartNumber: this.snapshot.starsStartNumber + 1 });
  }
  pause(): void { if (this.snapshot.screen === 'playing' && !this.snapshot.balanceIntroOpen && !this.snapshot.starsIntroOpen) this.update({ paused: true }); }
  resolveStarsGate(action: 'play' | 'skip'): void {
    if (this.snapshot.screen !== 'playing' || this.snapshot.phase !== 'stars-locked') return;
    this.update({ starsGateAction: action, starsGateNumber: this.snapshot.starsGateNumber + 1, paused: false });
  }
  continueFromCheckpoint(): void {
    if (this.snapshot.screen !== 'game-over' || this.snapshot.checkpointDistance === null) return;
    this.update({ screen: 'playing', lives: RUNNER.maxLives, paused: false, continued: true, continueNumber: this.snapshot.continueNumber + 1 });
  }
  resume(): void { if (this.snapshot.screen === 'playing') this.update({ paused: false }); }
  menu(): void { this.update({ screen: 'menu', paused: false }); }
  toggleMute(): void {
    const muted = !this.snapshot.muted;
    saveMuted(muted);
    this.update({ muted });
  }
  setVolume(channel: 'music' | 'effects' | 'ambient', value: number): void {
    if (!Number.isFinite(value)) return;
    const volume = Math.min(1, Math.max(0, value));
    saveVolume(channel, volume);
    this.update(channel === 'music' ? { musicVolume: volume } : channel === 'effects' ? { effectsVolume: volume } : { ambientVolume: volume });
  }
  fail(error: string): void { this.update({ screen: 'error', error }); }
}
export const gameStore = new GameStore();

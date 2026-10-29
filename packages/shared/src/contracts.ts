/** Production implementations must validate authentication and replay on the server. */
export interface VerifiedPlayer { id: string; displayName: string; bestScore: number }
export interface RunTicket { id: string; seed: number }
export interface RunInput { tick: number; action: 'press' | 'release' }
export interface RunResult { score: number; distance: number; reason: 'collision' | 'fall' | 'star-hit' | 'stage-complete' | 'completed' }
export interface AuthService { authenticate(initData: string): Promise<VerifiedPlayer> }
export interface RunService {
  start(): Promise<RunTicket>;
  // The server derives score from deterministic replay; never accepts a claimed score.
  finish(id: string, inputs: readonly RunInput[]): Promise<RunResult>;
}
export interface LeaderboardEntry { rank: number; displayName: string; score: number }
export interface LeaderboardService {
  top(): Promise<readonly LeaderboardEntry[]>;
  personal(): Promise<LeaderboardEntry | null>;
}
export type MiniGameId = 'balance' | 'stars' | 'waiting';
export type MiniGameOutcome = 'passed' | 'narrative-failure' | 'fatal-failure';
export interface MiniGameModule {
  id: MiniGameId;
  enter(context: { score: number; distance: number }): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

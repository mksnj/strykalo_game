import { JOURNEY as C, RUNNER, STORY_BEER, STORM, RHYTHM } from '../config';
import type { DebugStartPoint } from './debugStart';
import { RunnerEngine } from '../runner/engine';
import { BalanceEngine } from '../minigames/balance/BalanceEngine';
import { StarsEngine } from '../minigames/stars/StarsEngine';
import type { RhythmDirection } from '../minigames/stars/StarsEngine';
import { WaitingEngine } from '../minigames/waiting/WaitingEngine';
import type { RunResult } from '../../../../../packages/shared/src/contracts';
import { journeyRoute } from './route';
import { ENDING_DURATION } from '../views/endingTimeline';
import { starsAvailable } from './starsAccess';

export interface RunCheckpoint {
  start: number; end: number; score: number; seed: number; empty: boolean;
  phase?: 'runner' | 'final-run' | 'balance' | 'stars' | 'waiting'; runnerStart?: number
}

export type JourneyPhase = 'runner' | 'beer-pickup' | 'pipe-approach' | 'balance' | 'pipe-exit' |
  'stars-approach' | 'stars-locked' | 'stars' | 'stars-retry' | 'stars-failure' | 'stars-exit' |
  'room-approach' | 'waiting' | 'room-rest' | 'room-exit' | 'final-run' | 'ending';
export type Region = 'night' | 'autumn' | 'shadows' | 'archway';
/** Owns a single attempt across gameplay modes. Pausing means not calling step(). */
export class RunSession {
  readonly route: ReturnType<typeof journeyRoute>;
  runner: RunnerEngine;
  balance?: BalanceEngine;
  stars?: StarsEngine;
  waiting?: WaitingEngine;
  phase: JourneyPhase = 'runner';
  phaseTime = 0;
  result: RunResult | null = null;
  checkpoint?: Readonly<RunCheckpoint>;
  continued = false;
  beerCollected = false;
  balanceIntroPending = false;
  starsIntroPending = false;
  starsRound = 0;
  starsDefeats = 0;
  private starsIntroSeen = false;
  weatherStarted = false;
  weatherCleared = false;
  weatherElapsed = 0;
  constructor(readonly seed: number, readonly developer = false, readonly debugStart?: DebugStartPoint,
    private readonly now: () => number = Date.now, private readonly bypassStarsGate = !!debugStart) {
    this.route = journeyRoute(developer);
    this.runner = this.createRunner(seed, 0, this.route.balanceAt, 0);
    if (debugStart) this.initializeDebugStart(debugStart);
  }
  /** Same engines and route transitions as a normal run; UI never edits session internals. */
  private initializeDebugStart(point: DebugStartPoint): void {
    const r = this.route;
    const start = point === 'first-run' ? 0 : point === 'balance' || point === 'second-run' ? r.balanceAt :
      point === 'stars' || point === 'third-run' ? r.starsAt : r.waitingAt;
    const segmentStart = point === 'balance' ? 0 : point === 'stars' ? r.balanceAt : point === 'waiting' ? r.starsAt : start;
    const end = segmentStart === 0 ? r.balanceAt : segmentStart === r.balanceAt ? r.starsAt :
      segmentStart === r.starsAt ? r.waitingAt : r.availableEnd;
    const segmentSeed = segmentStart === r.balanceAt ? this.seed ^ 0x1a77 : segmentStart === r.starsAt ? this.seed ^ 0x54b2 : this.seed;
    this.runner = this.createRunner(segmentSeed, segmentStart, end, 0, point === 'final-run');
    this.runner.travel = start * RUNNER.pixelsPerUnit;
    if (point !== 'first-run') this.beerCollected = true;
    if (point === 'balance') { this.saveMiniCheckpoint('balance'); this.balance = new BalanceEngine(this.seed ^ 0x7f31); this.balanceIntroPending = true; this.changePhase('balance'); }
    else if (point === 'stars') { this.saveMiniCheckpoint('stars'); this.enterStars(); }
    else if (point === 'waiting') { this.saveMiniCheckpoint('waiting'); this.waiting = new WaitingEngine(); this.weatherStarted = true; this.changePhase('waiting'); }
    else {
      if (start) this.saveCheckpoint(segmentSeed, start, end, point === 'final-run');
      this.changePhase(point === 'final-run' ? 'final-run' : 'runner');
    }
  }
  get distance(): number { return this.runner.distance; }
  get score(): number { return this.runner.score; }
  get lives(): number { return this.runner.lives; }
  get region(): Region {
    return this.runner.artStartDistance >= C.waitingAt ? 'archway' : this.runner.artStartDistance >= C.starsAt ? 'shadows' :
      this.runner.artStartDistance >= C.balanceAt ? 'autumn' : 'night';
  }
  get transitionProgress(): number {
    return this.phaseTime / (this.phase === 'pipe-approach' ? C.approachSeconds :
      this.phase === 'stars-approach' ? C.courtApproachSeconds : this.phase === 'room-approach' ? C.roomApproachSeconds :
        this.phase === 'stars-exit' ? C.courtExitSeconds :
          this.phase === 'pipe-exit' ? C.exitSeconds : C.sceneTransitionSeconds);
  }
  get endingDuration(): number { return ENDING_DURATION; }
  continueFromCheckpoint(): boolean {
    if (!this.result || this.result.reason === 'completed' || !this.checkpoint) return false;
    const point = this.checkpoint;
    this.runner = this.createRunner(point.seed, point.runnerStart ?? point.start, point.end, point.score, point.empty);
    this.runner.travel = point.start * RUNNER.pixelsPerUnit;
    this.runner.lives = RUNNER.maxLives;
    this.balance = undefined; this.stars = undefined; this.waiting = undefined;
    this.balanceIntroPending = false; this.starsIntroPending = false;
    this.starsDefeats = 0; this.starsRound = 0; this.starsIntroSeen = false;
    this.weatherStarted = false; this.weatherCleared = false; this.weatherElapsed = 0;
    this.result = null; this.continued = true;
    if (point.phase === 'balance') {
      this.runner.objects = [];
      this.balance = new BalanceEngine(this.seed ^ 0x7f31); this.balanceIntroPending = true;
      this.changePhase('balance');
    } else if (point.phase === 'stars') { this.runner.objects = []; this.enterStars(); }
    else if (point.phase === 'waiting') {
      this.runner.objects = []; this.waiting = new WaitingEngine(); this.weatherStarted = true; this.changePhase('waiting');
    } else this.changePhase(point.empty ? 'final-run' : 'runner');
    return true;
  }
  private saveCheckpoint(seed: number, start: number, end: number, empty = false): void {
    this.checkpoint = Object.freeze({ start, end, seed, score: this.score, empty, phase: empty ? 'final-run' : 'runner' });
  }
  private saveMiniCheckpoint(phase: 'balance' | 'stars' | 'waiting'): void {
    this.checkpoint = Object.freeze({
      phase, start: this.distance, end: this.distance,
      runnerStart: this.runner.startDistance, seed: this.runner.seed, score: this.score, empty: false
    });
  }
  private enterStars(optIn = false): void {
    if (!optIn && !starsAvailable(this.now(), this.developer || this.bypassStarsGate)) {
      this.starsIntroPending = false; this.changePhase('stars-locked'); return;
    }
    this.stars = new StarsEngine(this.seed ^ 0x82c4);
    this.starsIntroPending = !this.starsIntroSeen;
    this.changePhase('stars');
  }
  refreshStarsAccess(): boolean {
    if (this.phase !== 'stars-locked' || !starsAvailable(this.now(), this.developer || this.bypassStarsGate)) return false;
    this.enterStars(); return true;
  }
  resolveStarsGate(action: 'play' | 'skip'): boolean {
    if (this.result || this.phase !== 'stars-locked') return false;
    if (action === 'play') this.enterStars(true);
    else this.leaveStars();
    return true;
  }
  private leaveStars(): void {
    this.saveCheckpoint(this.seed ^ 0x54b2, this.route.starsAt, this.route.waitingAt);
    this.runner = this.createRunner(this.seed ^ 0x54b2, this.route.starsAt, this.route.waitingAt, this.score);
    this.changePhase('stars-exit');
  }
  gameplayInput(): void { if (!this.result && this.phase === 'waiting') this.waiting!.gameplayInput(); }
  press(): void { if (!this.result && this.phase === 'runner') this.runner.press(); }
  release(): void { if (!this.result && this.phase === 'runner') this.runner.release(); }
  startBalance(): boolean {
    if (this.phase !== 'balance' || !this.balanceIntroPending || this.result) return false;
    this.balance = new BalanceEngine(this.seed ^ 0x7f31);
    this.balanceIntroPending = false;
    return true;
  }
  startStars(): boolean {
    if (this.phase !== 'stars' || !this.starsIntroPending || this.result) return false;
    this.resetStarsRound();
    this.starsIntroPending = false; this.starsIntroSeen = true;
    return true;
  }
  private resetStarsRound(): void {
    this.stars = new StarsEngine(this.seed ^ 0x82c4);
    this.starsRound++;
  }
  rhythmPress(direction: RhythmDirection): void {
    if (!this.result && this.phase === 'stars' && !this.starsIntroPending) this.stars?.press(direction);
  }
  step(direction = 0, _vertical = 0, held = false, musicTime?: number): void {
    if (this.result) return;
    if (this.weatherStarted && !this.weatherCleared) this.weatherElapsed += RUNNER.fixedStep;
    if (this.phase === 'runner' || this.phase === 'final-run') {
      this.runner.step();
      if (this.phase === 'runner' && this.runner.startDistance === this.route.starsAt && !this.weatherStarted &&
        (this.route.waitingAt - this.distance) * RUNNER.pixelsPerUnit <= RUNNER.speed * STORM.runLeadSeconds) {
        this.weatherStarted = true;
      }
      if (this.runner.result?.reason === 'collision') this.result = this.runner.result;
      else if (this.runner.result) {
        if (this.distance === this.route.balanceAt) { this.saveMiniCheckpoint('balance'); this.runner.player.release(); this.changePhase('beer-pickup'); }
        else if (this.distance === this.route.starsAt) { this.saveMiniCheckpoint('stars'); this.runner.player.release(); this.changePhase('stars-approach'); }
        else if (this.distance === this.route.waitingAt) { this.saveMiniCheckpoint('waiting'); this.runner.player.release(); this.changePhase('room-approach'); }
        else this.changePhase('ending');
      }
    } else if (this.phase === 'beer-pickup') {
      // Finish any last jump before reaching down. No seed, collision or input can skip the beat.
      this.runner.player.step(RUNNER.fixedStep);
      if (!this.runner.player.grounded) return;
      this.phaseTime += RUNNER.fixedStep;
      if (this.phaseTime >= STORY_BEER.collectAt) this.beerCollected = true;
      if (this.phaseTime >= STORY_BEER.pickupSeconds) this.changePhase('pipe-approach');
    } else if (this.phase === 'balance') {
      if (this.balanceIntroPending) return;
      this.balance!.step(direction);
      if (this.balance!.outcome === 'fatal-failure') this.failMiniGame('fall');
      else if (this.balance!.outcome === 'passed') {
        this.saveCheckpoint(this.seed ^ 0x1a77, this.route.balanceAt, this.route.starsAt);
        this.runner = this.createRunner(this.seed ^ 0x1a77, this.route.balanceAt, this.route.starsAt, this.score);
        this.changePhase('pipe-exit');
      }
    } else if (this.phase === 'stars-locked') {
      this.refreshStarsAccess();
    } else if (this.phase === 'stars') {
      if (this.starsIntroPending) return;
      this.stars!.step(musicTime);
      if (this.stars!.outcome === 'narrative-failure') {
        this.starsDefeats++;
        this.changePhase(this.starsDefeats < RHYTHM.attempts ? 'stars-retry' : 'stars-failure');
      }
    } else if (this.phase === 'stars-retry') {
      this.phaseTime += RUNNER.fixedStep;
      if (this.phaseTime >= RHYTHM.retrySeconds) { this.resetStarsRound(); this.changePhase('stars'); }
    } else if (this.phase === 'waiting') {
      this.waiting!.step(held);
      if (this.waiting!.outcome) { this.weatherCleared = true; this.changePhase('room-rest'); }
    } else if (this.phase === 'room-rest') {
      this.phaseTime += RUNNER.fixedStep;
      if (this.phaseTime >= C.roomRestSeconds) this.changePhase('room-exit');
    } else {
      if (this.phase.endsWith('approach')) this.runner.player.step(RUNNER.fixedStep);
      this.phaseTime += RUNNER.fixedStep;
      if (this.phase === 'ending') {
        if (this.phaseTime >= this.endingDuration) this.result = { score: this.score, distance: this.distance, reason: 'completed' };
      } else if (this.phase === 'stars-failure') {
        if (this.phaseTime >= C.narrativeSeconds) {
          this.leaveStars();
        }
      } else if (this.transitionProgress >= (this.phase === 'pipe-approach' ? C.pipeStopAt : 1)) {
        switch (this.phase) {
          case 'pipe-approach':
            // Show the first-person scene and its blocking rules together at the pipe lip.
            this.balance = new BalanceEngine(this.seed ^ 0x7f31); this.balanceIntroPending = true;
            this.changePhase('balance'); break;
          case 'stars-approach':
            this.enterStars(); break;
          case 'room-approach': this.waiting = new WaitingEngine(); this.changePhase('waiting'); break;
          case 'room-exit':
            this.saveCheckpoint(this.seed, this.route.waitingAt, this.route.availableEnd, true);
            this.runner = this.createRunner(this.seed, this.route.waitingAt, this.route.availableEnd, this.score, true);
            this.changePhase('final-run'); break;
          default: this.changePhase('runner');
        }
      }
    }
  }
  private createRunner(seed: number, start: number, end: number, score: number, empty = false): RunnerEngine {
    return new RunnerEngine(seed, {
      start, end, score, empty, clearance: this.route.clearance,
      noObstacles: this.developer, distanceScale: this.route.scale, lives: this.runner?.lives ?? RUNNER.maxLives
    });
  }
  private failMiniGame(reason: 'fall' | 'star-hit'): void {
    this.runner.lives = 0;
    this.result = { score: this.score, distance: this.distance, reason };
  }
  private changePhase(phase: JourneyPhase): void { this.phase = phase; this.phaseTime = 0; }
}

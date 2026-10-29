import type { RunSession } from '../state/RunSession';
import { JOURNEY, RUNNER, STORM } from '../config';
import type { AudioManager } from './AudioManager';
import { endingFlicker } from '../views/endingLight';
import { musicCue } from './catalog';
import { endingTimeline } from '../views/endingTimeline';

/** Observes the simulation; never changes movement, timers or outcomes. Called once per fixed tick. */
export class GameplaySoundscape {
  private phase = '';
  private grounded = true;
  private stepTime = 0;
  private left = false;
  private tickSecond = -1;
  private creakTime = 0;
  private gustTime = 0;
  private rhythmHits = 0;
  private lamp = false;
  private resultHeard = false;
  private thunderIndex = -1;
  private lives: number = RUNNER.maxLives;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private audio: AudioManager) {}
  reset(): void {
    this.phase = ''; this.grounded = true; this.stepTime = 0; this.tickSecond = -1;
    this.creakTime = 0; this.gustTime = 0; this.rhythmHits = 0; this.lamp = false;
    this.resultHeard = false;
    this.thunderIndex = -1;
    this.lives = RUNNER.maxLives;
  }
  step(session: RunSession): void {
    const phase = session.phase, changed = this.phase !== phase;
    if (changed) {
      this.phase = phase; this.stepTime = 0;
      this.creakTime = 0; this.gustTime = 0;
    }
    this.audio.setScene(musicCue(session));
    const running = phase === 'runner' || phase === 'final-run';
    if (running && session.lives < this.lives) void this.audio.effect('collision');
    this.lives = session.lives;
    if (session.weatherStarted && !session.weatherCleared) {
      const thunder = Math.floor((session.weatherElapsed - STORM.thunderDelay) / STORM.lightningInterval);
      if (thunder >= 0 && thunder !== this.thunderIndex) {
        this.thunderIndex = thunder; void this.audio.effect('thunder', phase === 'waiting' ? .45 : .8);
      }
      this.gustTime -= RUNNER.fixedStep;
      if (this.gustTime <= 0) { void this.audio.effect('gust', .5); this.gustTime = 4; }
    }
    if (running) {
      const grounded = session.runner.player.grounded;
      if (this.grounded && !grounded) void this.audio.effect('jump');
      if (!this.grounded && grounded) void this.audio.effect('land');
      this.grounded = grounded;
      if (grounded) this.footstep(RUNNER.fixedStep * session.runner.speed / RUNNER.speed);
      else this.stepTime = 0;
    } else if (phase === 'stars' && session.stars) {
      if (session.stars.hits > this.rhythmHits) void this.audio.effect('star', .35);
      this.rhythmHits = session.stars.hits;
    } else if (phase === 'balance' && session.balance) {
      this.creakTime -= RUNNER.fixedStep; this.gustTime -= RUNNER.fixedStep;
      if (this.creakTime <= 0) { void this.audio.effect('pipe', .4 + Math.min(.6, Math.abs(session.balance.position))); this.creakTime = 3.7; }
      if (this.gustTime <= 0 && Math.abs(session.balance.wind) > .035) {
        void this.audio.effect('gust', Math.min(1, .45 + Math.abs(session.balance.wind))); this.gustTime = 4.3;
      }
    } else if (phase === 'waiting' && session.waiting) {
      const second = Math.floor(session.waiting.activeTime);
      if (second !== this.tickSecond) { this.tickSecond = second; void this.audio.effect('tick'); }
    } else if (phase === 'ending' && endingTimeline(session.phaseTime).walking) {
      this.footstep(RUNNER.fixedStep * .65);
    } else if (phase.endsWith('approach') || phase === 'stars-exit' || phase === 'room-exit' || phase === 'ending' && session.phaseTime < JOURNEY.endingSlowSeconds) {
      this.footstep(RUNNER.fixedStep * (phase === 'ending' ? Math.max(.2, 1 - session.phaseTime / JOURNEY.endingSlowSeconds) : .8));
    }
    if (changed && phase === 'stars-failure') void this.audio.effect('starHit');
    if (changed && phase === 'room-exit') void this.audio.effect('door');
    if (session.result && !this.resultHeard) {
      this.resultHeard = true;
      if (session.result.reason === 'star-hit') void this.audio.effect('starHit');
      if (session.result.reason === 'fall') void this.audio.effect('collision');
    }
  }
  light(session: RunSession, visualTime: number): void {
    const lamp = (session.phase === 'final-run' || session.phase === 'ending') && endingFlicker(visualTime, this.reducedMotion);
    if (lamp && !this.lamp) void this.audio.effect('neon', .6);
    this.lamp = lamp;
  }
  private footstep(dt: number): void {
    this.stepTime += dt;
    if (this.stepTime < .4) return;
    this.stepTime %= .4; this.left = !this.left;
    void this.audio.effect(this.left ? 'stepLeft' : 'stepRight');
  }
}

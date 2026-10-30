import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTUMN_SCORE, JOURNEY, RHYTHM, RUNNER } from '../../apps/web/src/game/config';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { DEBUG_START_POINTS } from '../../apps/web/src/game/state/debugStart';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { autumnSequence } from '../../apps/web/src/game/runner/autumnSequence';
import { musicCue, soundscape } from '../../apps/web/src/game/audio/catalog';
import { AudioManager } from '../../apps/web/src/game/audio/AudioManager';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('five rhythm rounds in one session', () => {
  it('only defeat five advances the story; every retry has fresh notes, hits, mistakes and clock', () => {
    const s = new RunSession(42, false, 'stars');
    expect(s.startStars()).toBe(true);
    s.runner.score = 17; s.runner.lives = 2;
    for (let round = 1; round <= RHYTHM.attempts; round++) {
      const e = s.stars!;
      expect(s.starsRound).toBe(round);
      expect([e.elapsed, e.hits, e.misses, e.feedback.length]).toEqual([0, 0, 0, 0]);
      expect(e.notes.every(n => n.state === 'pending')).toBe(true);
      // A paused session gets no steps, including between retries.
      const notes = structuredClone(e.notes); expect(e.notes).toEqual(notes);
      const hit = e.notes[0]; s.step(0, 0, false, hit.at); s.rhythmPress(hit.direction);
      expect(e.hits).toBe(1);
      for (let miss = 1; miss <= 3; miss++) {
        const n = e.notes.find(n => n.state === 'pending')!;
        s.step(0, 0, false, n.at + RHYTHM.goodWindow + .02);
        expect(e.misses).toBe(miss);
        expect(s.phase).toBe(miss < 3 ? 'stars' : round < 5 ? 'stars-retry' : 'stars-failure');
      }
      expect(s.starsDefeats).toBe(round);
      expect([s.distance, s.score, s.lives]).toEqual([400, 17, 2]);
      if (round < 5) {
        for (let i = 0; i < Math.floor(RHYTHM.retrySeconds / RUNNER.fixedStep); i++) s.step();
        for (let i = 0; i < 2 && s.phase === 'stars-retry'; i++) s.step();
        expect(s.phase).toBe('stars'); expect(s.stars).not.toBe(e);
      }
    }
    for (let i = 0; i < (JOURNEY.narrativeSeconds - .1) / RUNNER.fixedStep; i++) s.step();
    expect(s.phase).toBe('stars-failure');
    while (s.phase === 'stars-failure') s.step();
    expect(s.phase).toBe('stars-exit'); expect(s.checkpoint).toMatchObject({ start: 400, end: 600, score: 17 });
    while (s.phase === 'stars-exit') s.step();
    expect([s.phase, s.region, s.distance, s.lives]).toEqual(['runner', 'shadows', 400, 2]);
  });
  it('audio restart removes the previous voice and resets the stalled-clock grace period', () => {
    const a = new AudioManager(), state = a as any;
    const stop = vi.fn(), select = vi.fn();
    state.context = { currentTime: 80 }; state.music = { stop, select }; state.scene = 'stars';
    state.lastMusicPosition = 70; state.lastMusicAdvanceAt = 12;
    a.restartMusic();
    expect(stop).toHaveBeenCalledOnce(); expect(select).toHaveBeenCalledOnce();
    expect(state.lastMusicPosition).toBeUndefined(); expect(state.lastMusicAdvanceAt).toBe(80);
  });
});

describe('authored autumn combination', () => {
  it.each([0, 1, 7, 42, 2026, 0xffffffff])('six authored obstacles with protected preparation and landing: seed %i', seed => {
    const e = new RunnerEngine(seed, { start: 200, end: 400, score: 0, clearance: JOURNEY.transitionClearance });
    const authored = autumnSequence(), seen = new Map<string, (typeof e.objects)[number]>();
    const jumped = new Set<string>(); let peak = 0;
    while (!e.result) {
      for (const o of e.objects) seen.set(o.id, o);
      const next = e.objects.find(o => o.kind !== 'tape' && !jumped.has(o.id) && o.x - e.travel - RUNNER.playerX <= AUTUMN_SCORE.jumpLead);
      if (next && e.player.grounded) { e.press(); e.release(); jumped.add(next.id); }
      e.step(); peak = Math.max(peak, e.objects.length);
    }
    expect(e.result.reason).toBe('stage-complete'); expect(e.lives).toBe(3); expect(peak).toBeLessThan(30);
    const authoredObjects = [...seen.values()].filter(o => o.id.startsWith('autumn-'));
    expect(authoredObjects).toEqual(authored.objects);
    expect(authoredObjects.filter(o => o.id === 'autumn-single')).toHaveLength(1);
    expect(authoredObjects.filter(o => o.id.startsWith('autumn-extra'))).toHaveLength(2);
    expect(authoredObjects.filter(o => o.id.startsWith('autumn-accent'))).toHaveLength(3);
    expect([...seen.values()].filter(o => !o.id.startsWith('autumn-')).every(o =>
      o.x + o.width < authored.reservedStart || o.x > authored.reservedEnd)).toBe(true);
    expect(authoredObjects.every(o => o.x + o.width < 400 * 60 - JOURNEY.transitionClearance)).toBe(true);
    expect(e.tick * RUNNER.fixedStep + AUTUMN_SCORE.musicLeadSeconds + JOURNEY.courtApproachSeconds).toBeCloseTo(AUTUMN_SCORE.endSeconds, 1);
  });
  it('the single jump, two extra obstacles and three accents allow short taps and separate landings', () => {
    const jumpTimes = [15, 18, 29, ...AUTUMN_SCORE.jumpMarkers.map(time => time - AUTUMN_SCORE.musicLeadSeconds)].sort((a, b) => a - b);
    for (const offset of [-.04, 0, .04]) {
      const e = new RunnerEngine(42, { start: 200, end: 400, score: 0, clearance: JOURNEY.transitionClearance });
      const authored = autumnSequence(); let jump = 0, landings = 0, grounded = true;
      while (!e.result) {
        // Isolate authored phrase; the preceding seeded route is covered above.
        e.objects = e.objects.filter(o => o.id.startsWith('autumn-'));
        if (jump < jumpTimes.length && e.tick * RUNNER.fixedStep >= jumpTimes[jump] + offset) {
          expect(e.player.grounded).toBe(true); e.press(); e.release(); jump++;
        }
        e.step();
        if (!grounded && e.player.grounded) landings++;
        grounded = e.player.grounded;
      }
      expect(jump).toBe(6); expect(landings).toBe(6); expect(e.lives).toBe(3);
      expect(authored.jumps[2] - authored.jumps[1]).toBeGreaterThan(300);
    }
  });
});

describe('direct stage initialization', () => {
  const expected = [
    ['runner', 'night', 0, 200, 'runner-intro'], ['balance', 'night', 200, 200, 'balance'],
    ['runner', 'autumn', 200, 400, 'runner-autumn'], ['stars', 'autumn', 400, 400, 'stars-intro'],
    ['runner', 'shadows', 400, 600, 'runner-shadows'], ['waiting', 'shadows', 600, 600, 'room-storm'],
    ['final-run', 'archway', 600, 700, 'final-run'],
  ] as const;
  it.each(DEBUG_START_POINTS.map((p, i) => [p.id, expected[i]] as const))('%s uses normal distances and correct engines/cues', (point, [phase, region, distance, end, cue]) => {
    const s = new RunSession(42, false, point);
    expect([s.phase, s.region, s.distance, musicCue(s)]).toEqual([phase, region, distance, cue]);
    expect(s.route.scale).toBe(1); expect(s.score).toBe(0); expect(s.lives).toBe(3);
    if (point === 'balance') { expect(s.balance).toBeDefined(); s.startBalance(); }
    if (point === 'stars') { expect(s.stars).toBeDefined(); s.startStars(); }
    if (point === 'waiting') expect(s.waiting).toBeDefined();
    expect(soundscape(musicCue(s)).music).toBe(point === 'stars' ? 'stars' : soundscape(cue).music);
    if (s.phase === 'runner' || s.phase === 'final-run') {
      s.runner.travel = Number(end) * RUNNER.pixelsPerUnit - .1; s.step();
      expect(s.distance).toBe(end); expect(s.phase).not.toBe('runner');
    }
  });
  it('mini-game shortcuts work in production without writing records; other debug entries remain closed', async () => {
    const save = vi.fn(); vi.stubGlobal('localStorage', { getItem: () => null, setItem: save });
    const { gameStore } = await import('../../apps/web/src/game/state/store');
    gameStore.ready();
    gameStore.startDebug('stars', 42);
    expect(gameStore.getSnapshot()).toMatchObject({ debugStart: 'stars', seed: 42, developer: false, bypassStarsGate: true });
    gameStore.finish({ reason: 'completed', score: 999, distance: 700 }); expect(save).not.toHaveBeenCalled();
    gameStore.menu(); vi.stubEnv('DEV', false);
    gameStore.startDebug('stars', 42); expect(gameStore.getSnapshot().screen).toBe('menu');
    gameStore.start(true); expect(gameStore.getSnapshot().screen).toBe('menu');
    gameStore.start(false, 'second-run'); expect(gameStore.getSnapshot().screen).toBe('menu');
    gameStore.start(false, 'stars', 42, true); expect(gameStore.getSnapshot().screen).toBe('menu');
    for (const point of ['balance', 'stars', 'waiting'] as const) {
      gameStore.startMiniGame(point, 42);
      expect(gameStore.getSnapshot()).toMatchObject({ screen: 'playing', debugStart: point, seed: 42, bypassStarsGate: false });
      gameStore.finish({ reason: 'completed', score: 999, distance: 700 }); expect(save).not.toHaveBeenCalled();
      gameStore.menu();
    }
    gameStore.start(); expect(gameStore.getSnapshot()).toMatchObject({ screen: 'playing', debugStart: undefined, developer: false });
  });
});

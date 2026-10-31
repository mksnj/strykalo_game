import { describe, expect, it, vi } from 'vitest';
import { AUTUMN_SCORE, JOURNEY, RUNNER, SHADOWS_SCORE, WAITING } from '../../apps/web/src/game/config';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { starsAvailable, starsOpensAt } from '../../apps/web/src/game/state/starsAccess';
import { RunnerEngine } from '../../apps/web/src/game/runner/engine';
import { AudioManager } from '../../apps/web/src/game/audio/AudioManager';
import { autumnMusicTime, MUSIC } from '../../apps/web/src/game/audio/catalog';
import { StreamingMusicChannel } from '../../apps/web/src/game/audio/StreamingMusicChannel';
import { WaitingEngine } from '../../apps/web/src/game/minigames/waiting/WaitingEngine';

function reachStars(now: () => number) {
  const s = new RunSession(42, false, undefined, now);
  s.runner = new RunnerEngine(42, { start: 200, end: 400, score: 17, empty: true });
  s.runner.travel = 400 * RUNNER.pixelsPerUnit - 1;
  s.step();
  for (let i = 0; i < 580 && s.phase === 'stars-approach'; i++) s.step();
  return s;
}

describe('mini-game entry checkpoints', () => {
  it('reaching the pipe saves the score, and repeated losses return directly to a clean pipe', () => {
    const s = new RunSession(42);
    s.runner.score = 23; s.runner.travel = 200 * RUNNER.pixelsPerUnit - .1; s.runner.objects = [];
    s.step(); expect(s.checkpoint).toMatchObject({ phase: 'balance', start: 200, score: 23 });
    while (s.phase !== 'balance') s.step();
    const point = s.checkpoint;
    for (let retry = 0; retry < 4; retry++) {
      expect(s.startBalance()).toBe(true);
      const before = s.balance;
      while (!s.result) s.step(1);
      expect(s.result?.reason).toBe('fall'); expect(s.lives).toBe(0);
      expect(s.continueFromCheckpoint()).toBe(true);
      expect(s.balance).not.toBe(before);
      expect([s.phase, s.phaseTime, s.balance?.elapsed, s.distance, s.score, s.lives]).toEqual(['balance', 0, 0, 200, 23, 3]);
      expect(s.balanceIntroPending).toBe(true); expect(s.checkpoint).toBe(point);
      expect(s.runner.inputs).toEqual([]); expect(s.runner.player.grounded).toBe(true);
      expect(s.runner.objects).toEqual([]); expect(s.continueFromCheckpoint()).toBe(false);
    }
    // Success still saves the post-pipe runner checkpoint; runner collisions remain fatal.
    s.startBalance(); s.balance!.outcome = 'passed'; s.step();
    expect(s.phase).toBe('pipe-exit'); expect(s.score).toBe(23);
    expect(s.checkpoint).toMatchObject({ phase: 'runner', start: 200, end: 400, score: 23 });
  });
  it('stars retry restores its entry, not the preceding runner, and resets all five-round state', () => {
    const s = reachStars(() => starsOpensAt);
    expect(s.checkpoint).toMatchObject({ phase: 'stars', start: 400, score: 17 }); s.startStars();
    s.starsDefeats = 4; s.starsRound = 5;
    s.result = { reason: 'star-hit', distance: 400, score: 17 };
    expect(s.continueFromCheckpoint()).toBe(true);
    expect([s.phase, s.starsDefeats, s.starsRound, s.stars?.elapsed, s.score, s.distance]).toEqual(['stars', 0, 0, 0, 17, 400]);
    s.startStars(); expect(s.starsRound).toBe(1);
  });
  it('room arrival saves a checkpoint and retains the existing success-only waiting mechanic', () => {
    const s = new RunSession(4, false, 'third-run');
    s.runner.travel = 600 * 60 - .1; s.runner.objects = []; s.runner.score = 29; s.step();
    expect(s.checkpoint).toMatchObject({ phase: 'waiting', start: 600, score: 29 });
    while (s.phase === 'room-approach') s.step();
    for (let i = 0; i < WAITING.duration / RUNNER.fixedStep; i++) s.step();
    expect(s.phase).toBe('room-rest'); expect(s.result).toBeNull(); expect(s.score).toBe(29);
  });
});

describe('release notice with an injectable absolute clock', () => {
  it('handles the exact boundary independently of timezone notation', () => {
    expect(starsOpensAt).toBe(Date.parse('2026-10-30T05:00:00Z'));
    for (const stamp of ['2026-10-30T07:59:59.999+03:00', '2026-10-29T23:59:59.999-05:00']) {
      expect(starsAvailable(Date.parse(stamp))).toBe(false);
    }
    for (const stamp of ['2026-10-30T08:00:00+03:00', '2026-10-30T00:00:00-05:00', '2027-01-01T00:00:00Z']) {
      expect(starsAvailable(Date.parse(stamp))).toBe(true);
    }
    expect(starsAvailable(starsOpensAt - 1, true)).toBe(true);
  });
  it('checks the real scene transition, then opens the same session without a reload', () => {
    let now = starsOpensAt - 1;
    const s = reachStars(() => now);
    expect(s.phase).toBe('stars-locked'); expect(s.stars).toBeUndefined();
    expect(s.startStars()).toBe(false); expect(s.refreshStarsAccess()).toBe(false);
    now++; expect(s.refreshStarsAccess()).toBe(true);
    expect(s.phase).toBe('stars'); expect(s.starsIntroPending).toBe(true);
    expect([s.distance, s.score, s.starsDefeats]).toEqual([400, 17, 0]);
  });
  it.each(['play', 'skip'] as const)('explicit %s works before release without changing score or distance', action => {
    const s = reachStars(() => starsOpensAt - 10000);
    expect(s.resolveStarsGate(action)).toBe(true);
    expect(s.phase).toBe(action === 'play' ? 'stars' : 'stars-exit');
    expect([s.score, s.distance, s.lives]).toEqual([17, 400, 3]);
    expect(s.resolveStarsGate(action)).toBe(false);
  });
  it('direct developer entries bypass the notice', () => {
    const s = new RunSession(1, false, 'stars', () => 0, true);
    expect(s.phase).toBe('stars'); expect(s.startStars()).toBe(true);
  });
  it.each(['play', 'skip'] as const)('public menu shortcut shows the notice and supports %s', action => {
    const s = new RunSession(1, false, 'stars', () => 0, false);
    expect(s.phase).toBe('stars-locked'); expect(s.stars).toBeUndefined();
    expect(s.startStars()).toBe(false); expect(s.refreshStarsAccess()).toBe(false);
    expect(s.checkpoint).toMatchObject({ phase: 'stars', start: 400 });
    expect(s.resolveStarsGate(action)).toBe(true);
    if (action === 'play') {
      expect(s.phase).toBe('stars'); expect(s.startStars()).toBe(true);
      expect(s.starsRound).toBe(1); expect(s.starsDefeats).toBe(0);
    } else {
      while (s.phase === 'stars-exit') s.step();
      expect(s.phase).toBe('runner'); expect(s.region).toBe('shadows');
    }
    expect([s.distance, s.score, s.lives]).toEqual([400, 0, 3]);
  });
});

describe('route, collision feedback and music', () => {
  it('a delayed media start seeks to active gameplay time without moving the runner', () => {
    const s = new RunSession(42, false, 'second-run');
    const events = new Map<string, () => void>();
    const audio = { currentTime: 0, duration: 193, readyState: 4, paused: false, seeking: false,
      play: () => Promise.resolve(), canPlayType: () => 'probably', load: vi.fn(), pause: vi.fn(),
      addEventListener: (name: string, handler: () => void) => events.set(name, handler), removeAttribute: vi.fn() };
    const gain = { gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    const source = { connect: () => gain, disconnect: vi.fn() };
    const context = { currentTime: 0, createGain: () => gain, createMediaElementSource: () => source };
    vi.stubGlobal('document', { createElement: () => audio });
    try {
      const channel = new StreamingMusicChannel(context as any, {} as any, vi.fn());
      channel.select(MUSIC.autumn, AUTUMN_SCORE.musicLeadSeconds, () => autumnMusicTime(s));
      channel.resume();
      // Simulate a buffer delay, with the game staying responsive throughout.
      for (let i = 0; i < 90; i++) s.step();
      events.get('loadedmetadata')!(); expect(audio.currentTime).toBeCloseTo(3.15);
      for (let i = 0; i < 30; i++) s.step();
      events.get('playing')!(); expect(audio.currentTime).toBeCloseTo(3.4);
      const travel = s.runner.travel;
      audio.currentTime = 9; events.get('playing')!(); expect(audio.currentTime).toBe(9);
      expect(s.runner.travel).toBe(travel); channel.dispose();
    } finally { vi.unstubAllGlobals(); }
  });
  it('authored second run remains fair on 100 seeds at the constant configured tempo', () => {
    for (let seed = 0; seed < 100; seed++) {
      const e = new RunnerEngine(seed, { start: 200, end: 400, score: 0, clearance: JOURNEY.transitionClearance });
      const jumped = new Set<string>(), seen = new Set<string>();
      expect(e.speed).toBe(RUNNER.speed);
      while (!e.result) {
        const next = e.objects.find(o => o.kind !== 'tape' && !jumped.has(o.id) && o.x - e.travel - RUNNER.playerX <= AUTUMN_SCORE.jumpLead);
        if (next && e.player.grounded) { e.press(); e.release(); jumped.add(next.id); }
        for (const o of e.objects) if (o.id.startsWith('autumn-accent')) seen.add(o.id);
        e.step();
      }
      expect(e.lives, `seed ${seed}`).toBe(3); expect(seen.size).toBe(3);
      expect(e.speed).toBe(RUNNER.speed);
      expect(e.tick * RUNNER.fixedStep).toBe(40);
      expect(e.tick * RUNNER.fixedStep + JOURNEY.exitSeconds + JOURNEY.courtApproachSeconds).toBeCloseTo(47.2, 1);
    }
  });
  it('third run takes 40 seconds, with shadows, weather and room entrance preserved', () => {
    const s = new RunSession(1, false, 'third-run');
    let shadow = false, storm = false;
    for (let i = 0; i < 5000 && s.phase === 'runner'; i++) {
      s.runner.objects = []; s.step();
      shadow ||= s.distance >= JOURNEY.shadowStart && s.distance <= JOURNEY.shadowEnd;
      storm ||= s.weatherStarted;
    }
    expect([s.distance, s.phase, shadow, storm]).toEqual([600, 'room-approach', true, true]);
    expect(s.runner.tick * RUNNER.fixedStep).toBe(40);
    expect(40 + JOURNEY.courtExitSeconds + JOURNEY.roomApproachSeconds).toBeLessThanOrEqual(60);
  });
  it('each hit flashes, overlapping frames do not deduct again, and a new obstacle can still hit', () => {
    const e = new RunnerEngine(1);
    const obstacle = (id: string) => ({ id, kind: 'fence' as const, x: e.travel + RUNNER.playerX, y: 400, width: 80, height: 38 });
    e.objects = [obstacle('a')]; e.step(); expect(e.damageFlash).toBe(true); expect(e.lives).toBe(2);
    for (let i = 0; i < 10; i++) e.step(); expect(e.lives).toBe(2);
    e.objects.push(obstacle('b')); e.step(); expect(e.lives).toBe(1);
    e.objects.push(obstacle('c')); e.step(); expect(e.result?.reason).toBe('collision');
  });
  it('real music selection skips the shadows intro once and keeps the file through weather cues', () => {
    const a = new AudioManager(), state = a as any, select = vi.fn(), seek = vi.fn();
    state.music = { select, seek, prepare: vi.fn() }; a.setScene('stars-exit');
    expect(select).toHaveBeenLastCalledWith(MUSIC.shadows, SHADOWS_SCORE.musicStartSeconds, undefined, { fadeOut: 6, fadeIn: 3.5 }, false);
    a.setScene('runner-shadows'); a.setScene('runner-storm');
    expect(seek).not.toHaveBeenCalled();
    a.setScene('pipe-exit'); expect(select).toHaveBeenLastCalledWith(MUSIC.autumn, 0, undefined, { fadeOut: 6, fadeIn: 3.5 }, false);
    a.setScene('runner-autumn'); expect(seek).toHaveBeenCalledWith(MUSIC.autumn, JOURNEY.exitSeconds);
  });
  it('rhythm reaction cues keep playing the same phrase; only restartMusic requests a new stream', () => {
    const a = new AudioManager(), state = a as any, select = vi.fn(), seek = vi.fn();
    state.music = { select, seek, prepare: vi.fn() };
    for (const cue of ['stars', 'stars-retry', 'stars-failure']) a.setScene(cue);
    expect(seek).not.toHaveBeenCalled();
    expect(select.mock.calls.every(call => call[4] === false)).toBe(true);
    a.restartMusic(); expect(select.mock.calls.at(-1)?.[4]).toBe(true);
  });
});

it('door reaction fades, repeats without stacking, and never prevents room completion', () => {
  const e = new WaitingEngine();
  for (let i = 0; i < 80 / RUNNER.fixedStep; i++) e.step();
  for (let i = 0; i < 3; i++) e.gameplayInput(); expect(e.hint).toBe(false);
  for (let i = 0; i < 80 / RUNNER.fixedStep; i++) e.step();
  const elapsed = e.elapsed; e.doorInput(); e.doorInput();
  expect(e.elapsed).toBe(elapsed); expect(e.resets).toBe(3); expect(e.hintOpacity).toBe(1);
  for (let i = 0; i < 3.5 / RUNNER.fixedStep; i++) e.step();
  expect(e.hintOpacity).toBeCloseTo(.5); e.doorInput(); expect(e.hintOpacity).toBe(1);
  while (!e.outcome) e.step(); expect(e.elapsed).toBe(90); expect(e.outcome).toBe('passed');
});

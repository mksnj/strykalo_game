import { expect, it, vi } from 'vitest';
import { AudioManager } from '../../apps/web/src/game/audio/AudioManager';
import { MUSIC } from '../../apps/web/src/game/audio/catalog';
import { StreamingMusicChannel } from '../../apps/web/src/game/audio/StreamingMusicChannel';
it('an unavailable or paused mixer uses active-time fallback', () => {
  const manager = new AudioManager(); expect(manager.musicPosition('stars')).toBeUndefined();
});
it('a stalled audio voice falls back; resumed music becomes the master again', () => {
  const manager = new AudioManager(), state = manager as any;
  const context = { currentTime: 0 }, voice = { url: MUSIC.stars.urls[0], fading: false, position: 0 };
  state.context = context; state.paused = false; state.music = { status: [voice] };
  expect(manager.musicPosition('stars')).toBe(0);
  context.currentTime = 3.1; expect(manager.musicPosition('stars')).toBeUndefined();
  voice.position = .3; context.currentTime = 3.2; expect(manager.musicPosition('stars')).toBe(.3);
  context.currentTime = 6.3; expect(manager.musicPosition('stars')).toBeUndefined();
  voice.position = .7; expect(manager.musicPosition('stars')).toBe(.7);
});
it('a playing voice follows its track even when volume is muted', () => {
  const manager = new AudioManager(), state = manager as any;
  state.context = { currentTime: 12 }; state.paused = false; state.muted = true;
  state.music = { status: [{ url: MUSIC.stars.urls[0], fading: false, position: 7.25 }] };
  expect(manager.musicPosition('stars')).toBe(7.25);
});
it('music loops keep a continuous clock for an unlimited rhythm attempt', () => {
  const channel = new StreamingMusicChannel({ currentTime: 0 } as AudioContext, {} as AudioNode, () => {});
  const audio = { currentTime: 9.9, duration: 10 };
  (channel as any).voices.add({ audio, gain: { gain: { value: 1 } }, url: 'music', lastPosition: 0, loopOffset: 0 });
  expect(channel.status[0].elapsed).toBe(9.9);
  audio.currentTime = .1; expect(channel.status[0].elapsed).toBe(10.1);
  expect(channel.status[0].elapsed).toBe(10.1);
  audio.currentTime = 9.95; expect(channel.status[0].elapsed).toBe(19.95);
  audio.currentTime = .2; expect(channel.status[0].elapsed).toBe(20.2);
});
it('the requested music offset survives load and a seek made before metadata arrives', () => {
  const events = new Map<string, () => void>();
  const audio = { currentTime: 0, readyState: 0, canPlayType: () => 'probably',
    addEventListener: (name: string, fn: () => void) => events.set(name, fn),
    load: () => { audio.currentTime = 0; } };
  vi.stubGlobal('document', { createElement: () => audio });
  const gain = { gain: { setValueAtTime: vi.fn() }, connect: vi.fn() };
  const context = { currentTime: 0, createGain: () => gain, createMediaElementSource: () => ({ connect: () => gain }) };
  try {
    const channel = new StreamingMusicChannel(context as any, {} as AudioNode, () => {});
    channel.select(MUSIC.autumn, 4.6);
    channel.seek(MUSIC.autumn, 7);
    // Media initialization can reset an early currentTime assignment.
    audio.currentTime = 0; audio.readyState = 1; events.get('loadedmetadata')?.();
    expect(audio.currentTime).toBe(7);
  } finally { vi.unstubAllGlobals(); }
});

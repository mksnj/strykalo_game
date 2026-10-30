import type { JourneyPhase, RunSession } from '../state/RunSession';
import { AUTUMN_SCORE, JOURNEY, RUNNER } from '../config';
import installed from './installedInstrumentals.json';
export type SoundFile = { urls: readonly string[]; gain: number };
const file = (name: string, gain = 1): SoundFile => ({ urls: [`/audio/original-v1/${name}.ogg`, `/audio/original-v1/${name}.mp3`], gain });
/** Locally imported instrumentals. Empty slots keep the original soundtrack. */
export const INSTRUMENTAL_SLOTS = [
  'uskolszaet', 'o-brat', '92', 'delat-eto-trezvym',
  'teni', 'bespolezno', 'reshitsya-samo-soboy', 'podvorotnya-moy-dom',
] as const;
export type InstrumentalSlot = typeof INSTRUMENTAL_SLOTS[number];
const installedTracks = installed as Partial<Record<InstrumentalSlot, string>>;
const originalRunner = file('music-runner', .77);
const originalBalance = file('music-balance', .75);
const originalStars = file('music-stars', .73);
const originalWaiting = file('music-waiting', .72);
const originalEnding = file('music-ending', .78);
/** A missing optional instrumental always falls back to the shipped music. */
function instrumental(slot: InstrumentalSlot, fallback: SoundFile): SoundFile {
  const path = installedTracks[slot];
  return path ? { urls: [`/audio/user-instrumentals/${path}`, ...fallback.urls.filter(url => url.endsWith('.mp3'))], gain: fallback.gain }
    : fallback;
}
export const MUSIC = {
  intro: instrumental('uskolszaet', originalRunner),
  neighborhood: instrumental('o-brat', originalRunner),
  autumn: instrumental('92', originalRunner),
  balance: instrumental('delat-eto-trezvym', originalBalance),
  shadows: instrumental('teni', originalRunner),
  stars: instrumental('bespolezno', originalStars),
  waiting: instrumental('reshitsya-samo-soboy', originalWaiting),
  ending: instrumental('podvorotnya-moy-dom', originalEnding),
} as const;
export type MusicScene = keyof typeof MUSIC;
export const AMBIENCE = {
  storm: { urls: ['/audio/visual-v12/rain.wav'], gain: .7 },
  street: file('ambient-street', .18), pipe: file('ambient-pipe', .18), room: file('ambient-room', .15), ending: file('ambient-ending', .16),
} as const;
export const EFFECTS = {
  thunder: { urls: ['/audio/visual-v12/thunder.wav'], gain: .6 },
  cassette: file('cassette', .75), jump: file('jump', .43), land: file('land', .46),
  stepLeft: file('step-left', .18), stepRight: file('step-right', .18), collision: file('collision', .8),
  pipe: file('pipe-creak', .3), gust: file('wind-gust', .28), star: file('star-fall', .16), starHit: file('star-hit', .8),
  tick: file('clock-tick', .16), clock: file('clock-chime', .55), neon: file('neon-flicker', .22), door: file('door-creak', .65),
} as const;
export type Effect = keyof typeof EFFECTS;
export const AMBIENT_EFFECTS = new Set<Effect>(['stepLeft', 'stepRight', 'pipe', 'gust', 'tick', 'neon']);
export const AUDIO = { crossfade: 1.4, maxEffects: 12, effectCooldown: .055, starCooldown: .22,
  musicVolume: .85, effectsVolume: .6, ambientVolume: .15 } as const;
/** Initial streamed playback may buffer while simulation continues; align once when it becomes audible. */
export function autumnMusicTime(session?: RunSession): number | undefined {
  if (!session) return undefined;
  if (session.phase === 'pipe-exit') return AUTUMN_SCORE.musicStartSeconds + session.phaseTime;
  if (session.runner.artStartDistance !== JOURNEY.balanceAt) return undefined;
  const running = AUTUMN_SCORE.musicLeadSeconds + session.runner.tick * RUNNER.fixedStep;
  if (session.phase === 'runner') return running;
  if (session.phase === 'stars-approach') return running + session.phaseTime;
  return undefined;
}
/** Keep the authored obstacles on the media clock, including slow frames and buffering. */
export function autumnStepBudget(session: RunSession, musicTime: number | undefined): number | undefined {
  if (session.phase !== 'runner' || session.route.scale !== 1 ||
    session.runner.startDistance !== JOURNEY.balanceAt || musicTime === undefined || !Number.isFinite(musicTime)) return undefined;
  return Math.min(AUTUMN_SCORE.maxCatchUpSeconds,
    Math.max(0, musicTime - AUTUMN_SCORE.musicLeadSeconds - session.runner.tick * RUNNER.fixedStep));
}
/** Transition phases share the destination score, with no extra transition players. */
export function soundscape(phase: JourneyPhase | string): { music: MusicScene; ambience: keyof typeof AMBIENCE } {
  if (phase === 'runner-storm') return { music: 'shadows', ambience: 'storm' };
  if (phase === 'room-storm') return { music: 'waiting', ambience: 'storm' };
  if (phase === 'stars-intro' || phase === 'stars-locked') return { music: 'autumn', ambience: 'street' };
  if (phase === 'balance' || phase === 'pipe-approach') return { music: 'balance', ambience: 'pipe' };
  if (phase === 'stars' || phase === 'stars-approach' || phase === 'stars-retry' || phase === 'stars-failure') return { music: 'stars', ambience: 'street' };
  if (phase === 'waiting' || phase === 'room-approach' || phase === 'room-rest' || phase === 'room-exit') return { music: 'waiting', ambience: 'room' };
  if (phase === 'final-run') return { music: 'waiting', ambience: 'ending' };
  if (phase === 'ending') return { music: 'ending', ambience: 'ending' };
  if (phase === 'runner-neighborhood') return { music: 'neighborhood', ambience: 'street' };
  if (phase === 'runner-autumn' || phase === 'pipe-exit') return { music: 'autumn', ambience: 'street' };
  if (phase === 'runner-shadows' || phase === 'stars-exit') return { music: 'shadows', ambience: 'street' };
  return { music: 'intro', ambience: 'street' };
}

/** Changing the audio cue never changes gameplay or the simulation's phase. */
export function musicCue(session: { phase: JourneyPhase; distance: number; route?: { scale: number }; starsIntroPending?: boolean;
  weatherStarted?: boolean; weatherCleared?: boolean }): string {
  if (session.weatherStarted && !session.weatherCleared) return session.phase === 'runner' ? 'runner-storm' : 'room-storm';
  if (session.phase === 'stars-approach' || session.starsIntroPending) return 'stars-intro';
  if (session.phase === 'beer-pickup') return 'runner-neighborhood';
  if (session.phase !== 'runner') return session.phase;
  const distance = session.distance * (session.route?.scale ?? 1);
  if (distance < JOURNEY.balanceAt / 2) return 'runner-intro';
  if (distance < JOURNEY.balanceAt) return 'runner-neighborhood';
  if (distance < JOURNEY.starsAt) return 'runner-autumn';
  return 'runner-shadows';
}

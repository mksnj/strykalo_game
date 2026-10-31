import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameplaySoundscape } from '../../apps/web/src/game/audio/GameplaySoundscape';
import type { AudioManager } from '../../apps/web/src/game/audio/AudioManager';
import { MUSIC, musicCue, soundscape } from '../../apps/web/src/game/audio/catalog';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { WaitingEngine } from '../../apps/web/src/game/minigames/waiting/WaitingEngine';
import { StarsEngine } from '../../apps/web/src/game/minigames/stars/StarsEngine';
import installed from '../../apps/web/src/game/audio/installedInstrumentals.json';
import { RHYTHM } from '../../apps/web/src/game/config';

beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) }));
afterEach(() => vi.unstubAllGlobals());
const setup = () => {
  const audio = { effect: vi.fn(), setScene: vi.fn() };
  return { audio, observer: new GameplaySoundscape(audio as unknown as AudioManager), session: new RunSession(1, true) };
};
describe('звук наблюдает игровую симуляцию', () => {
  it('гром повторяется под дождём до конца ожидания, дверь звучит только после двух секунд покоя', () => {
    const { audio, observer, session } = setup();
    session.phase = 'waiting'; session.waiting = new WaitingEngine(); session.weatherStarted = true;
    session.weatherElapsed = .12;
    observer.step(session); observer.step(session);
    expect(audio.effect.mock.calls.filter(c => c[0] === 'thunder')).toHaveLength(1);
    session.weatherElapsed = 6.62; observer.step(session);
    expect(audio.effect.mock.calls.filter(c => c[0] === 'thunder')).toHaveLength(2);
    session.weatherCleared = true; session.phase = 'room-rest'; session.weatherElapsed = 100;
    observer.step(session);
    expect(audio.effect.mock.calls.filter(c => c[0] === 'thunder')).toHaveLength(2);
    expect(audio.effect.mock.calls.filter(c => c[0] === 'door')).toHaveLength(0);
    session.phase = 'room-exit'; observer.step(session); observer.step(session);
    expect(audio.effect.mock.calls.filter(c => c[0] === 'door')).toHaveLength(1);
  });
  it('каждое из трёх препятствий звучит один раз, включая фатальное', () => {
    const { audio, observer, session } = setup();
    for (let hit = 1; hit <= 3; hit++) {
      const r = session.runner;
      r.objects = [{ id: `sound-hit-${hit}`, kind: 'fence', x: r.travel + 180, y: 400, width: 80, height: 38 }];
      for (let i = 0; i < 5; i++) { session.step(); observer.step(session); }
      expect(audio.effect.mock.calls.filter(c => c[0] === 'collision')).toHaveLength(hit);
    }
    expect(session.result?.reason).toBe('collision');
  });
  it('один прыжок и одно приземление на реальной физике; шагов в воздухе нет', () => {
    const { audio, observer, session } = setup();
    session.press();
    session.step(); observer.step(session);
    expect(audio.effect.mock.calls.map(c => c[0])).toEqual(['jump']);
    for (let i = 0; i < 25; i++) { session.step(); observer.step(session); }
    expect(audio.effect.mock.calls.map(c => c[0])).toEqual(['jump']);
    session.release();
    while (!session.runner.player.grounded) { session.step(); observer.step(session); }
    expect(audio.effect.mock.calls.map(c => c[0])).toEqual(['jump', 'land']);
    expect(session.score).toBe(0); expect(session.result).toBeNull();
  });
  it('успешное попадание звучит один раз, удержание не создаёт новых звуков', () => {
    const { audio, observer, session } = setup();
    session.phase = 'stars'; session.stars = new StarsEngine(1);
    observer.step(session); expect(audio.effect).not.toHaveBeenCalled();
    const note = session.stars.notes[0];
    session.stars.step(RHYTHM.musicStartSeconds + note.at); session.rhythmPress(note.direction);
    for (let i = 0; i < 120; i++) observer.step(session);
    expect(audio.effect.mock.calls.map(c => c[0])).toEqual(['star']);
    expect(session.stars.hits).toBe(1);
  });
  it('тиканье идёт по активному времени и не повторяется при сбросе бездействия', () => {
    const { audio, observer, session } = setup();
    session.phase = 'waiting'; session.waiting = new WaitingEngine();
    for (let i = 0; i < 180; i++) { session.step(); observer.step(session); }
    expect(audio.effect.mock.calls.filter(c => c[0] === 'tick')).toHaveLength(2);
    session.gameplayInput(); observer.step(session);
    expect(audio.effect.mock.calls.filter(c => c[0] === 'tick')).toHaveLength(2);
    expect(session.waiting.resets).toBe(1);
  });
  it('переходы используют те же композиции, не создавая отдельных дорожек', () => {
    expect(soundscape('pipe-approach')).toEqual(soundscape('balance'));
    expect(soundscape('stars-approach')).toEqual(soundscape('stars'));
    expect(soundscape('stars-failure')).toEqual(soundscape('stars'));
    expect(soundscape('room-rest')).toEqual({ music: 'ending', ambience: 'room' });
    expect(soundscape('room-exit')).toEqual(soundscape('room-rest'));
    expect(soundscape('final-run').music).toBe('ending');
    expect(soundscape('ending').music).toBe('ending');
  });

  it('восемь музыкальных эпизодов соответствуют этапам альбома', () => {
    expect(soundscape('runner').music).toBe('intro');
    expect(soundscape('runner-neighborhood').music).toBe('neighborhood');
    expect(soundscape('runner-autumn').music).toBe('autumn');
    expect(soundscape('runner-shadows').music).toBe('shadows');
    expect(soundscape('balance').music).toBe('balance');
    expect(soundscape('stars').music).toBe('stars');
    expect(soundscape('waiting').music).toBe('waiting');
    expect(soundscape('ending').music).toBe('ending');
    expect(soundscape('pipe-exit').music).toBe('autumn');
    expect(soundscape('stars-exit').music).toBe('shadows');
  });
  it('дистанция переключает только музыкальный эпизод; без пользовательских файлов остаётся старый саундтрек', () => {
    const runner = (distance: number) => musicCue({ phase: 'runner', distance });
    expect([0, 99, 100, 199, 200, 399, 400].map(runner)).toEqual([
      'runner-intro', 'runner-intro', 'runner-neighborhood', 'runner-neighborhood',
      'runner-autumn', 'runner-autumn', 'runner-shadows',
    ]);
    for (const [slot, scene] of [['uskolszaet', 'intro'], ['o-brat', 'neighborhood'], ['92', 'autumn'], ['teni', 'shadows']] as const) {
      expect(MUSIC[scene].urls.at(-1)).toBe('/audio/original-v1/music-runner.mp3');
      if (!(slot in installed)) expect(MUSIC[scene].urls[0]).toBe('/audio/original-v1/music-runner.ogg');
    }
  });
  it('сокращённый маршрут сохраняет все музыкальные эпизоды', () => {
    const runner = (distance: number) => musicCue({ phase: 'runner', distance, route: { scale: 10 } });
    expect([0, 9.9, 10, 19.9, 20, 39.9, 40].map(runner)).toEqual([
      'runner-intro', 'runner-intro', 'runner-neighborhood', 'runner-neighborhood',
      'runner-autumn', 'runner-autumn', 'runner-shadows',
    ]);
    expect(musicCue({ phase: 'balance', distance: 20, route: { scale: 10 } })).toBe('balance');
    expect(musicCue({ phase: 'beer-pickup', distance: 20, route: { scale: 10 } })).toBe('runner-neighborhood');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BALANCE, JOURNEY, WAITING } from '../../apps/web/src/game/config';
import { starsPilot } from '../fixtures/starsPilot';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { journeyRoute } from '../../apps/web/src/game/state/route';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('отдельный маршрут для разработчика', () => {
  it('сокращает все участки в десять раз, обычные границы сохраняет', () => {
    const normal = journeyRoute(), short = journeyRoute(true);
    for (const key of ['balanceAt', 'starsAt', 'waitingAt', 'availableEnd', 'clearance'] as const) {
      expect(short[key] * 10).toBe(normal[key]);
    }
    expect([short.balanceAt, short.starsAt, short.waitingAt, short.availableEnd]).toEqual([20, 40, 60, 70]);
    expect(normal.availableEnd).toBe(JOURNEY.availableEnd);
    expect(new RunSession(1).developer).toBe(false);
  });
  it('без прыжков, с балансом и уклонением от звёзд проходит все сцены на 20 seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const session = new RunSession(seed, true);
      const entries: [string, number][] = [];
      const regions = new Set<string>();
      for (let tick = 0; tick < 50000 && !session.result; tick++) {
        const phase = session.phase, distance = session.distance, score = session.score;
        regions.add(session.region);
        if (session.runner.objects.some(object => object.kind !== 'tape')) throw new Error(`Препятствие: ${phase}, seed ${seed}`);
        const moving = phase === 'runner' || phase === 'final-run';
        const balance = session.balance;
        session.startBalance();
        session.startStars();
        const movement = phase === 'stars' && session.stars!.elapsed < 20 ? starsPilot(session.stars!) : { x: 0, y: 0 };
        session.step(phase === 'balance' && balance && Math.abs(balance.position) > .06 ? -Math.sign(balance.position) : movement.x, movement.y);
        if (!moving && (session.distance !== distance || session.score !== score)) throw new Error(`Переход изменил дистанцию/счёт: ${phase}`);
        if (phase !== session.phase && ['pipe-approach', 'stars-approach', 'room-approach'].includes(session.phase)) {
          entries.push([session.phase, session.distance]);
          expect(session.runner.artDistance).toBe(session.distance * 10);
        }
      }
      expect(entries).toEqual([['pipe-approach', 20], ['stars-approach', 40], ['room-approach', 60]]);
      expect(session.result).toEqual({ reason: 'completed', distance: 70, score: session.score });
      expect(regions).toEqual(new Set(['night', 'autumn', 'shadows', 'archway']));
      expect(session.balance?.elapsed).toBe(BALANCE.duration);
      expect(session.waiting?.elapsed).toBe(WAITING.duration);
      expect(session.runner.objects).toEqual([]);
    }
  }, 30_000);
  it('большой счёт не запускает мини-игру раньше дистанции 20; прыжок доступен', () => {
    const session = new RunSession(3, true);
    session.runner.score = 100;
    session.press(); session.step();
    expect(session.runner.player.grounded).toBe(false);
    expect(session.phase).toBe('runner');
    while (session.distance < 19.9) session.step();
    expect(session.phase).toBe('runner');
    for (let i = 0; i < 100 && session.phase === 'runner'; i++) session.step();
    expect(session.phase).toBe('beer-pickup'); expect(session.distance).toBe(20);
    for (let i = 0; i < 200 && session.phase === 'beer-pickup'; i++) session.step();
    expect(session.phase).toBe('pipe-approach');
    expect(session.runner.inputs[0]).toEqual({ tick: 0, action: 'press' });
  });
  it('тестовый результат не изменяет рекорд, следующая обычная попытка снова сохраняется', async () => {
    const stored = new Map([['razvlechenie.demo.best.v1', '7']]);
    const save = vi.fn((key: string, value: string) => stored.set(key, value));
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: save });
    const { gameStore } = await import('../../apps/web/src/game/state/store');
    gameStore.ready(); gameStore.start(true);
    expect(gameStore.getSnapshot().developer).toBe(true);
    gameStore.finish({ score: 999, distance: 20, reason: 'fall' });
    expect(gameStore.getSnapshot().best).toBe(7); expect(save).not.toHaveBeenCalled();
    gameStore.start();
    expect(gameStore.getSnapshot().developer).toBe(false);
    gameStore.finish({ score: 8, distance: 10, reason: 'collision' });
    expect(gameStore.getSnapshot().best).toBe(8);
    expect(stored.get('razvlechenie.demo.best.v1')).toBe('8');
  });
});

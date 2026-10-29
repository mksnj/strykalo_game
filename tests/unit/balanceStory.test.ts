import { describe, expect, it } from 'vitest';
import { RunSession } from '../../apps/web/src/game/state/RunSession';
import { BALANCE, JOURNEY, RUNNER, STORY_BEER } from '../../apps/web/src/game/config';

function arrive(seed = 1, developer = false, jumping = false) {
  const s = new RunSession(seed, developer);
  s.runner.travel = s.route.balanceAt * RUNNER.pixelsPerUnit - 1;
  s.runner.score = 17;
  if (jumping) s.press();
  s.step();
  expect(s.phase).toBe('beer-pickup');
  return s;
}

function reachIntro(s: RunSession) {
  for (let i = 0; i < 1000 && s.phase !== 'balance'; i++) s.step(1, 1, true);
  expect(s.phase).toBe('balance');
  expect(s.balanceIntroPending).toBe(true);
}

describe('сюжетная бутылка и обучение балансированию', () => {
  it.each([false, true])('правила появляются у края трубы без отдельного ожидания смены камеры, developer=%s', developer => {
    const s = arrive(1, developer);
    while (s.phase === 'beer-pickup') s.step();
    let elapsed = 0;
    while (s.phase === 'pipe-approach') { s.step(); elapsed += RUNNER.fixedStep; }
    expect(elapsed).toBeCloseTo(JOURNEY.approachSeconds * JOURNEY.pipeStopAt, 1);
    expect(s.phase).toBe('balance'); expect(s.balanceIntroPending).toBe(true);
    expect(s.balance!.elapsed).toBe(0);
  });
  it('store публикует обучение, исключает вторую паузу и принимает подтверждение только один раз', async () => {
    const { gameStore } = await import('../../apps/web/src/game/state/store');
    gameStore.ready(); gameStore.start(true);
    const s = arrive(1, true); reachIntro(s); gameStore.progress(s);
    expect(gameStore.getSnapshot().balanceIntroOpen).toBe(true);
    gameStore.pause(); expect(gameStore.getSnapshot().paused).toBe(false);
    const command = gameStore.getSnapshot().balanceStartNumber;
    gameStore.startBalance(); gameStore.startBalance();
    expect(gameStore.getSnapshot().balanceStartNumber).toBe(command + 1);
    expect(gameStore.getSnapshot().balanceIntroOpen).toBe(false);
    s.startBalance(); gameStore.progress(s);
    gameStore.pause(); expect(gameStore.getSnapshot().paused).toBe(true);
    gameStore.menu(); gameStore.start(true);
    expect(gameStore.getSnapshot().balanceIntroOpen).toBe(false);
  });
  it('подбор гарантирован на 128 seed в обоих маршрутах, без кассет, препятствий и прибавки очков', () => {
    for (const developer of [false, true]) for (let seed = 0; seed < 128; seed++) {
      const s = arrive(seed, developer);
      const distance = s.distance;
      expect(s.beerCollected).toBe(false);
      const bottleX = s.runner.travel + RUNNER.playerX + STORY_BEER.ahead;
      expect(s.runner.objects.every(o => o.x + o.width < bottleX - STORY_BEER.width / 2)).toBe(true);
      reachIntro(s);
      expect(s.beerCollected).toBe(true);
      expect(s.distance).toBe(distance); expect(s.score).toBe(17);
      expect(s.runner.objects.every(o => o.kind !== ('story-beer' as string))).toBe(true);
    }
  });
  it('подбор ждёт приземления последнего прыжка, затем происходит ровно в своём такте', () => {
    const s = arrive(3, false, true);
    while (!s.runner.player.grounded) {
      expect(s.beerCollected).toBe(false); expect(s.phaseTime).toBe(0); s.step();
    }
    while (s.phaseTime + RUNNER.fixedStep < STORY_BEER.collectAt) {
      expect(s.beerCollected).toBe(false); s.step();
    }
    s.step(); expect(s.beerCollected).toBe(true);
    expect(s.phase).toBe('beer-pickup');
    reachIntro(s); expect(s.beerCollected).toBe(true);
  });
  it('обучение блокирует время, ветер и падение даже при прямом вызове step; старт всегда с нуля', () => {
    const s = arrive(); reachIntro(s);
    const initial = [s.balance!.elapsed, s.balance!.position, s.balance!.velocity, s.balance!.wind];
    for (let i = 0; i < 120 * 120; i++) s.step(i % 2 ? -1 : 1);
    expect([s.balance!.elapsed, s.balance!.position, s.balance!.velocity, s.balance!.wind]).toEqual(initial);
    expect(s.result).toBeNull(); expect(s.phaseTime).toBe(0);
    expect(s.startBalance()).toBe(true); expect(s.startBalance()).toBe(false);
    expect([s.balance!.elapsed, s.balance!.position, s.balance!.velocity]).toEqual([0, 0, 0]);
    s.step(); expect(s.balance!.elapsed).toBe(RUNNER.fixedStep);
  });
  it('после обучения сохраняются 36 секунд, успех, checkpoint, поражение и новая попытка', () => {
    const s = arrive(7, true); reachIntro(s); s.startBalance();
    for (let i = 0; i < 5000 && s.phase === 'balance'; i++) {
      const b = s.balance!;
      s.step(Math.abs(b.position + b.velocity * .35) > .06 ? -Math.sign(b.position + b.velocity * .35) : 0);
    }
    expect(s.balance!.elapsed).toBe(BALANCE.duration); expect(s.balance!.progress).toBe(1);
    expect(s.phase).toBe('pipe-exit'); expect(s.checkpoint?.start).toBe(20); expect(s.score).toBe(17);
    s.runner.lives = 0; s.result = { score: 17, distance: 21, reason: 'collision' };
    expect(s.continueFromCheckpoint()).toBe(true); expect(s.phase).toBe('runner');
    expect(s.balanceIntroPending).toBe(false); expect(s.balance).toBeUndefined(); expect(s.lives).toBe(3);
    const next = arrive(7, true); reachIntro(next); next.startBalance();
    for (let i = 0; i < 4000 && !next.result; i++) next.step(1);
    expect(next.result?.reason).toBe('fall'); expect(next.lives).toBe(0);
    const restart = arrive(7, true); expect(restart.beerCollected).toBe(false); reachIntro(restart);
    expect(restart.balanceIntroPending).toBe(true);
  });
});

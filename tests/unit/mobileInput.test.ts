import { afterEach, expect, test } from 'vitest';
import { movementControls } from '../../apps/web/src/game/input/JourneyInput';
import { joystickVector } from '../../apps/web/src/game/input/joystick';
import { portraitCamera, gameViewport } from '../../apps/web/src/game/viewport';
afterEach(() => movementControls.clear());

test('широкий экран заполнен: ширина мира растёт, исходный кадр и пропорции сохраняются', () => {
  const wide = gameViewport(1230, 372, false);
  expect(wide.width / wide.height).toBeCloseTo(1230 / 372);
  expect(wide.width).toBeGreaterThan(1700); expect(wide.height).toBe(540);
  expect(gameViewport(1920, 1080, false)).toEqual({ width: 960, height: 540 });
  expect(gameViewport(390, 293, true)).toEqual({ width: 720, height: 540 });
});

test('портретная камера: переходы непрерывны на обоих концах, поле звёзд полностью видно', () => {
  for (const [before, transition, after] of [
    ['runner', 'pipe-approach', 'balance'], ['balance', 'pipe-exit', 'runner'],
    ['runner', 'stars-approach', 'stars'], ['stars-failure', 'stars-exit', 'runner'],
    ['runner', 'room-approach', 'waiting'],
  ] as const) {
    expect(portraitCamera(transition, 0)).toEqual(portraitCamera(before));
    expect(portraitCamera(transition, 1)).toEqual(portraitCamera(after));
  }
  const camera = portraitCamera('stars');
  expect(camera.centreX - camera.width / 2).toBeLessThan(180);
  expect(camera.centreX + camera.width / 2).toBeGreaterThan(820);
});

test('джойстик: радиальная мёртвая зона, непрерывная тяга и ограничение за краем', () => {
  expect(joystickVector(3, 3, 40)).toEqual({ x: 0, y: 0 });
  const half = joystickVector(20, 0, 40);
  expect(half.x).toBeGreaterThan(.4); expect(half.x).toBeLessThan(.5);
  const diagonal = joystickVector(100, -100, 40);
  expect(diagonal.x).toBeCloseTo(Math.SQRT1_2);
  expect(diagonal.y).toBeCloseTo(-Math.SQRT1_2);
  expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
});
test('клавиатура и аналоговый ввод совместимы; отпускание одного источника сохраняет другой', () => {
  movementControls.hold('ArrowRight', 'right');
  movementControls.move('thumb', 0, -1);
  expect(movementControls.vector.x).toBeCloseTo(Math.SQRT1_2);
  expect(movementControls.vector.y).toBeCloseTo(-Math.SQRT1_2);
  movementControls.release('thumb'); expect(movementControls.vector).toEqual({ x: 1, y: 0 });
  movementControls.move('thumb', -.4, 0); movementControls.release('ArrowRight');
  expect(movementControls.vector.x).toBeCloseTo(-.4);
  movementControls.clear(); expect(movementControls.vector).toEqual({ x: 0, y: 0 });
});

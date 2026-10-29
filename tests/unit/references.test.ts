import { describe, expect, it } from 'vitest';
import { JOURNEY, RUNNER, REFERENCE_ART } from '../../apps/web/src/game/config';
import { DISTRICT_GROUND, districtOffset } from '../../apps/web/src/game/views/districtLayout';
import { ShadowTrail, shadowPose } from '../../apps/web/src/game/views/shadowTimeline';

describe('приземлённое окружение и тени', () => {
  it.each(['autumn', 'shadows'] as const)('основания слоя %s совпадают с асфальтом', region => {
    expect(DISTRICT_GROUND[region] * RUNNER.groundY / 512 + districtOffset(region)).toBe(RUNNER.groundY - 3);
  });
  it('тень бежит позади героя и повторяет прошлый кадр и прыжок без смены масштаба', () => {
    const trail = new ShadowTrail();
    trail.sample(0, RUNNER.groundY, 0);
    trail.sample(100, RUNNER.groundY - 90, 2);
    trail.sample(200, RUNNER.groundY, 0);
    const echo = trail.sample(380, RUNNER.groundY, 0);
    const following = shadowPose(470, echo), later = shadowPose(480, echo);
    expect(echo.y).toBe(RUNNER.groundY - 90);
    expect(following.y).toBe(echo.y);
    expect(following.frame).toBe(2);
    expect(later.x).toBe(following.x); expect(later.y).toBe(following.y);
    expect(later.frame).toBe(following.frame); expect(later.alpha).toBe(following.alpha);
    expect(following.x).toBe(RUNNER.playerX - REFERENCE_ART.shadowBehind);
    expect(following.height).toBe(106); expect(following.width).toBe(106);
    expect(shadowPose(JOURNEY.shadowStart, echo).alpha).toBe(0);
    expect(shadowPose(JOURNEY.shadowEnd, echo).alpha).toBe(0);
  });
  it('тень держится за персонажем весь эпизод и плавно исчезает только в конце', () => {
    const echo = { time: 1000, y: RUNNER.groundY, frame: 1 };
    for (let distance = 465; distance <= 481; distance++) {
      const pose = shadowPose(distance, echo);
      expect(pose.alpha).toBe(REFERENCE_ART.shadowOpacity);
      expect(pose.x).toBeLessThan(RUNNER.playerX - 70);
    }
    expect(shadowPose(486, echo).alpha).toBeGreaterThan(shadowPose(491, echo).alpha);
    expect(shadowPose(491, echo).alpha).toBeGreaterThan(0);
    expect(shadowPose(497, echo).alpha).toBe(0);
  });
  it('пауза и сброс попытки не оставляют старые позы тени', () => {
    const trail = new ShadowTrail();
    trail.sample(0, 438, 0); trail.sample(100, 300, 2);
    const before = trail.sample(400, 438, 0);
    for (let i = 0; i < 1000; i++) expect(trail.sample(400, 438, 0)).toEqual(before);
    expect(trail.sample(0, 438, 1).frame).toBe(1);
    trail.clear(); expect(trail.sample(100, 438, 3).frame).toBe(3);
  });
});

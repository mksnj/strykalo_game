import Phaser from 'phaser';
import { JOURNEY, RUNNER, RHYTHM as C } from '../config';
import { DIRECTIONS, type StarsEngine, type RhythmDirection } from '../minigames/stars/StarsEngine';
import { ARRIVAL, clamp, courtArrival, courtDeparture } from './arrivalLayout';
import { CourtArena } from './CourtArena';
import { coverScenery } from './sceneryWings';
import { courtCameraFrame } from './courtSpace';
import { CourtHero } from './CourtHero';

export const RHYTHM_FIELD = { columns: [270, 345, 420, 495] as readonly number[], top: 145, target: 402 };
const glyphs: Record<RhythmDirection, string> = { left: '←', down: '↓', up: '↑', right: '→' };

/** Same painted schoolyard, now a sparse four-column rhythm composition. */
export class StarsView {
  readonly container: Phaser.GameObjects.Container;
  readonly arena: CourtArena;
  private marks: Phaser.GameObjects.Graphics;
  private targets: Phaser.GameObjects.Text[];
  private arrows: Phaser.GameObjects.Text[];
  private hero: Phaser.GameObjects.Sprite;
  private shade: Phaser.GameObjects.Rectangle;
  private feedback: Phaser.GameObjects.Text;
  private platform: Phaser.GameObjects.Image;
  private platformClip: Phaser.GameObjects.Graphics;
  private platformMask: Phaser.Display.Masks.GeometryMask;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private actor: CourtHero;
  constructor(scene: Phaser.Scene, sharedHero?: Phaser.GameObjects.Sprite) {
    this.container = scene.add.container(0, 0).setDepth(30);
    this.actor = new CourtHero(scene);
    this.arena = new CourtArena(scene);
    this.marks = scene.add.graphics();
    this.hero = sharedHero ?? scene.add.sprite(ARRIVAL.courtX, ARRIVAL.courtY, 'hero-front').setOrigin(.5, 1);
    this.platform = scene.add.image(ARRIVAL.courtX, 420, 'court-original', 'rhythm-platform')
      .setDisplaySize(162, 54).setTint(0x93a2af).setAlpha(.5);
    this.platformClip = scene.make.graphics({ x: 0, y: 0 });
    this.platformClip.fillStyle(0xffffff).fillEllipse(ARRIVAL.courtX, 420, 162, 54);
    this.platformMask = this.platformClip.createGeometryMask(); this.platform.setMask(this.platformMask);
    this.targets = DIRECTIONS.map((direction, i) => scene.add.text(RHYTHM_FIELD.columns[i], RHYTHM_FIELD.target,
      glyphs[direction], { fontFamily: 'Georgia', fontSize: '35px', color: '#9babb8' }).setOrigin(.5));
    this.arrows = Array.from({ length: 4 }, () => scene.add.text(0, 0, '',
      { fontFamily: 'Georgia', fontSize: '27px', color: '#14212d' }).setOrigin(.5).setVisible(false));
    this.feedback = scene.add.text(382, 438, '', { fontFamily: 'Georgia', fontSize: '16px', fontStyle: 'italic', color: '#bac7d0' }).setOrigin(.5);
    this.shade = scene.add.rectangle(480, 270, 960, 540, 0x101822).setAlpha(0);
    this.container.add([this.arena.container, this.platform, this.marks, ...this.targets, ...this.arrows,
    ...(!sharedHero ? [this.hero] : []), this.feedback, this.shade]);
  }
  renderArrival(_offset: number, progress: number | undefined, visualTime: number, playerY: number = RUNNER.groundY, distanceScale = 1): void {
    this.actor.hide();
    this.container.setVisible(true).setAlpha(1);
    const focus = progress === undefined ? 0 : courtCameraFrame('stars-approach', progress).focus;
    this.arena.render(focus); this.marks.clear();
    this.platform.setVisible(false); this.targets.forEach(t => t.setVisible(false)); this.arrows.forEach(a => a.setVisible(false));
    this.feedback.setVisible(false); this.shade.setAlpha(0);
    if (progress === undefined) return;
    const pose = courtArrival(progress, distanceScale);
    const front = progress >= 1;
    this.hero.setTexture(front ? 'hero-front' : 'night-hero', front ? '__BASE' : Math.floor(visualTime / 110) % 4)
      .setVisible(true).setPosition(pose.x, pose.y - Math.max(0, RUNNER.groundY - playerY))
      .setDisplaySize(front ? pose.size * .5 : pose.sideSize, front ? pose.size : pose.sideSize)
      .setFlipX(false).setAngle(0).clearTint();
  }
  render(engine: StarsEngine | undefined, alpha: number, failureTime = 0,
    _worldTravel: number = JOURNEY.starsAt * RUNNER.pixelsPerUnit + ARRIVAL.offset, _distanceScale = 1,
    exitProgress = 0, visualTime = 0): void {
    this.container.setVisible(alpha > 0).setAlpha(alpha);
    this.actor.hide();
    this.arena.render(alpha > 0 ? courtCameraFrame('stars-exit', exitProgress).focus : 0);
    if (alpha <= 0) return;
    coverScenery(this.shade); this.shade.setAlpha(0);
    const pose = courtDeparture(exitProgress, engine?.x ?? ARRIVAL.courtX, engine?.y ?? ARRIVAL.courtY);
    const elapsed = engine?.elapsed ?? 0;
    this.hero.setTexture(exitProgress ? 'night-hero' : 'hero-front', exitProgress ? Math.floor(visualTime / 110) % 4 : '__BASE')
      .setVisible(true).setPosition(pose.x, pose.y).setDisplaySize(exitProgress ? pose.sideSize : pose.size * .5, exitProgress ? pose.sideSize : pose.size)
      .setFlipX(false).setAlpha(1).clearTint().setAngle(0);
    const latest = engine?.feedback.at(-1), age = elapsed - (latest?.at ?? -Infinity);
    if (!exitProgress) {
      this.hero.setAlpha(0);
      // ИСХОДНАЯ СТРОКА ОТРИСОВКИ ГЕРОЯ:
      // this.actor.render(pose.x, pose.y, pose.size, visualTime, latest, elapsed, failureTime);

      // ЗАМЕНИТЕ ЕЁ НА ВАРИАНТ СЕБЕ ДЛЯ РЕГУЛИРОВАНИЯ:
      const myXOffset = 80;      // Сдвиг по горизонтали (например: +50 вправо, -50 влево)
      const myYOffset = 180;      // Сдвиг по вертикали (например: -30 вверх, +30 вниз)
      const mySizeMultiplier = 3.0; // Множитель размера (например: 1.5 для увеличения)

      this.actor.render(
        pose.x + myXOffset,
        pose.y + myYOffset,
        pose.size * mySizeMultiplier,
        visualTime,
        latest,
        elapsed,
        failureTime
      );
    }
    const active = !exitProgress && !failureTime;
    this.platform.setVisible(!exitProgress).setAlpha((engine?.platformOpacity ?? 1) * .48);
    const g = this.marks.clear();
    this.arrows.forEach(a => a.setVisible(false));
    for (const [i, x] of RHYTHM_FIELD.columns.entries()) {
      this.targets[i].setVisible(active).setAlpha(.75).setColor('#9babb8');
      if (!active) continue;
      g.lineStyle(1, 0x728494, .12).lineBetween(x, RHYTHM_FIELD.top, x, RHYTHM_FIELD.target - 27);
      g.lineStyle(1, 0x7c8e9b, .35).strokeCircle(x, RHYTHM_FIELD.target, 26);
      const response = engine?.feedback.filter(f => f.direction === DIRECTIONS[i] && elapsed - f.at < .4).at(-1);
      if (response) {
        const hit = response.judgment === 'perfect' || response.judgment === 'good';
        const fade = 1 - (elapsed - response.at) / .4;
        this.targets[i].setColor(hit ? '#d3d9cf' : '#867d7e').setAlpha(1);
        g.fillStyle(hit ? 0xb7c9c0 : 0x75646a, fade * .14).fillCircle(x, RHYTHM_FIELD.target, 26);
        if (hit) g.lineStyle(1.5, 0xb7c9c0, fade * .6).strokeCircle(x, RHYTHM_FIELD.target, 26 + (this.reduced ? 0 : (1 - fade) * 12));
      }
    }
    let drawn = 0;
    for (const note of engine?.notes ?? []) {
      const progress = engine?.progress(note) ?? -1, until = note.at - elapsed;
      if (!active || note.state !== 'pending' || progress < 0 || until < -C.goodWindow || drawn >= this.arrows.length) continue;
      const x = RHYTHM_FIELD.columns[DIRECTIONS.indexOf(note.direction)];
      const y = RHYTHM_FIELD.top + (RHYTHM_FIELD.target - RHYTHM_FIELD.top) * Math.min(1.08, progress);
      g.fillStyle(0xa8b5b7, .83).lineStyle(1, 0xc0cccd, .4).beginPath();
      for (let n = 0; n < 10; n++) {
        const a = -Math.PI / 2 + n * Math.PI / 5, r = n % 2 ? 14 : 25;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (n) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath().fillPath().strokePath();
      this.arrows[drawn++].setText(glyphs[note.direction]).setPosition(x, y - 1).setVisible(true);
    }
    this.feedback.setVisible(active && !!latest && age < C.feedbackSeconds)
      .setText(latest?.judgment === 'perfect' ? 'Вовремя' : latest?.judgment === 'good' ? 'Почти в такт' : latest?.judgment === 'miss' ? 'Мимо' : '')
      .setAlpha(clamp(1 - age / C.feedbackSeconds));
  }
  dispose(): void {
    this.actor.dispose();
    this.platform.clearMask(false); this.platformMask.destroy(); this.platformClip.destroy(); this.container.destroy(true);
  }
}

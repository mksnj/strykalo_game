import Phaser from 'phaser';
import { smooth } from './arrivalLayout';
import { WAITING } from '../config';

/** Shared seated anatomy; only the hood pivots when looking up. Feet and pelvis stay fixed. */
export class SeatedHero {
  readonly container: Phaser.GameObjects.Container;
  private head: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private headY: number;
  constructor(scene: Phaser.Scene, x: number, floor: number, size: number, texture = 'hero-seated') {
    const scale = size / 256;
    this.headY = -(texture === 'hero-rest' ? 184 : 186) * scale;
    this.body = scene.add.image(0, 0, texture, 'body').setOrigin(.5, 1).setScale(scale);
    this.head = scene.add.image(0, this.headY, texture, 'head').setOrigin(.5, 1).setScale(scale);
    this.container = scene.add.container(x, floor, [this.body, this.head]);
  }
  look(elapsed: number, response = 0): void {
    const turn = smooth((elapsed - WAITING.lookAt) / .5) * (1 - smooth((elapsed - (WAITING.lookEnd - .5)) / .5));
    this.head.setAngle(-8 * turn + response * 5).setY(this.headY + response * 1.5);
  }
  breathe(amount: number): void {
    this.body.setScale(this.body.scaleX, this.body.scaleX * (1 - amount * .018));
    this.head.setY(this.headY + amount * 1.3).setAngle(amount * 2);
  }
}

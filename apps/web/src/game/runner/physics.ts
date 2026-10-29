import { RUNNER as C } from '../config';
export interface Rect { x: number; y: number; width: number; height: number }
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export class RunnerPhysics {
  y: number = C.groundY;
  velocity = 0;
  grounded = true;
  private grace: number = C.coyoteTime;
  private buffer = 0;
  private held = false;
  private holdTime = 0;
  press(): void { this.held = true; this.buffer = C.jumpBuffer; }
  release(): void {
    this.held = false;
  }
  step(dt: number): void {
    this.grace = this.grounded ? C.coyoteTime : Math.max(0, this.grace - dt);
    if (this.buffer > 0 && this.grace > 0) {
      // Even a press/release between simulation ticks gets the full base impulse.
      this.velocity = -C.jumpVelocity;
      this.holdTime = 0;
      this.grounded = false;
      this.buffer = 0;
      this.grace = 0;
    }
    this.buffer = Math.max(0, this.buffer - dt);
    if (!this.grounded) {
      if (this.held && this.velocity < 0 && this.holdTime < C.jumpHoldSeconds) {
        this.velocity -= C.jumpHoldAcceleration * Math.min(dt, C.jumpHoldSeconds - this.holdTime);
      }
      this.holdTime += dt;
      this.velocity += C.gravity * dt;
      this.y += this.velocity * dt;
      if (this.y >= C.groundY) {
        this.y = C.groundY;
        this.velocity = 0;
        this.grounded = true;
      }
    }
  }
  get bounds(): Rect {
    return { x: C.playerX - C.playerWidth / 2, y: this.y - C.playerHeight, width: C.playerWidth, height: C.playerHeight };
  }
}

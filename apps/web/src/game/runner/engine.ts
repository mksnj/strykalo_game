import { RUNNER as C, JOURNEY, AUTUMN_SCORE, COLLISION_FEEDBACK } from '../config';
import { autumnSequence } from './autumnSequence';
import { RunnerPhysics, intersects } from './physics';
import { WorldGenerator, type WorldObject } from './generator';
import type { RunInput, RunResult } from '../../../../../packages/shared/src/contracts';

/** Browser-independent, fixed-step simulation; usable by a future server replay. */
export class RunnerEngine {
  readonly player = new RunnerPhysics();
  readonly inputs: RunInput[] = [];
  objects: WorldObject[] = [];
  travel = 0;
  score = 0;
  lives: number;
  tick = 0;
  private lastHitTick = -Infinity;
  get damageAge(): number { return (this.tick - this.lastHitTick) * C.fixedStep; }
  get damageFlash(): boolean { return this.damageAge < COLLISION_FEEDBACK.seconds &&
    Math.floor(this.damageAge / COLLISION_FEEDBACK.blinkSeconds) % 2 === 0; }
  result: RunResult | null = null;
  private readonly generator: WorldGenerator;
  private readonly collected = new Set<string>();
  private readonly hitObstacles = new Set<string>();
  constructor(readonly seed: number, private segment: { start: number; end: number; score: number; clearance?: number; empty?: boolean;
    noObstacles?: boolean; distanceScale?: number; lives?: number } =
    { start: 0, end: C.stageEnd, score: 0 }) {
    this.travel = segment.start * C.pixelsPerUnit;
    this.score = segment.score;
    this.lives = segment.lives ?? C.maxLives;
    this.generator = new WorldGenerator(seed, segment.empty ? 0 : segment.end * C.pixelsPerUnit - (segment.clearance ?? 0),
      this.travel, segment.start ? `courtyard-${segment.start}-` : '', segment.distanceScale,
      this.isScoredAutumn ? autumnSequence() : undefined);
    this.objects = this.generate();
  }
  press(): void {
    if (this.result) return;
    this.inputs.push({ tick: this.tick, action: 'press' });
    this.player.press();
  }
  release(): void {
    if (this.result) return;
    this.inputs.push({ tick: this.tick, action: 'release' });
    this.player.release();
  }
  collect(id: string): boolean {
    if (this.result || this.collected.has(id) || !this.objects.some(o => o.id === id && o.kind === 'tape')) return false;
    this.collected.add(id);
    this.score++;
    this.objects = this.objects.filter(o => o.id !== id);
    return true;
  }
  step(): void {
    if (this.result) return;
    this.tick++;
    this.travel = Math.min(this.segment.end * C.pixelsPerUnit, this.travel + this.speed * C.fixedStep);
    this.player.step(C.fixedStep);
    this.objects.push(...this.generate());
    for (const object of [...this.objects]) {
      if (!intersects(this.player.bounds, { ...object, x: object.x - this.travel })) continue;
      if (object.kind === 'tape') this.collect(object.id);
      else if (!this.hitObstacles.has(object.id)) {
        this.hitObstacles.add(object.id);
        this.lastHitTick = this.tick;
        this.lives = Math.max(0, this.lives - 1);
        if (!this.lives) { this.finish('collision'); return; }
      }
    }
    this.objects = this.objects.filter(o => {
      if (o.x + o.width > this.travel - 100) return true;
      this.hitObstacles.delete(o.id);
      return false;
    });
    if (this.distance >= this.segment.end) this.finish('stage-complete');
  }
  get distance(): number { return this.travel / C.pixelsPerUnit; }
  get startDistance(): number { return this.segment.start; }
  get distanceScale(): number { return this.segment.distanceScale ?? 1; }
  get artDistance(): number { return this.distance * this.distanceScale; }
  get artStartDistance(): number { return this.startDistance * this.distanceScale; }
  private get isScoredAutumn(): boolean {
    return this.distanceScale === 1 && this.segment.start === JOURNEY.balanceAt && this.segment.end === JOURNEY.starsAt;
  }
  get speed(): number {
    if (this.segment.empty) return C.speed;
    const speed = this.isScoredAutumn ? AUTUMN_SCORE.speed : C.speed;
    const clearance = this.segment.clearance ?? 0;
    const end = this.segment.end * this.distanceScale;
    if (this.isScoredAutumn || !clearance || (end !== C.stageEnd && end !== JOURNEY.starsAt)) return speed;
    const remaining = this.segment.end * C.pixelsPerUnit - this.travel;
    return speed * Math.max(0.45, Math.min(1, remaining / clearance));
  }
  private generate(): WorldObject[] {
    if (this.segment.empty) return [];
    const objects = this.generator.generateUntil(this.travel + C.width + 400);
    return this.segment.noObstacles ? objects.filter(object => object.kind === 'tape') : objects;
  }
  private finish(reason: RunResult['reason']): void {
    this.result = { score: this.score, distance: this.distance, reason };
  }
}

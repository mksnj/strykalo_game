import { RUNNER as C, type ObstacleKind } from '../config';
import type { Rect } from './physics';
import { GENERATION as G, OBSTACLE_VARIANTS } from './generationConfig';
import { SPAWN_PATTERNS } from './patterns';
import type { autumnSequence } from './autumnSequence';
export interface WorldObject extends Rect { id: string; kind: ObstacleKind | 'tape' }
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class WorldGenerator {
  private readonly random: () => number;
  private nextX: number;
  private index = 0;
  private lastHazardX = -Infinity;
  private recent: string[] = [];
  private kinds: ObstacleKind[] = [];
  private lastTapeX: number;
  private authoredIndex = 0;
  constructor(seed: number, private endX: number = C.stageEnd * C.pixelsPerUnit,
    startX: number = 0, private prefix = '', private distanceScale = 1,
    private authored?: ReturnType<typeof autumnSequence>) {
    this.random = seededRandom(seed);
    this.nextX = startX + C.firstObstacle;
    this.lastTapeX = this.nextX;
  }
  generateUntil(worldX: number): WorldObject[] {
    const result: WorldObject[] = [];
    while (this.nextX <= worldX && this.nextX < this.endX) {
      const index = this.index++;
      const distance = this.nextX / C.pixelsPerUnit * this.distanceScale;
      const difficulty = Math.min(1, distance / G.progressionUnits);
      const available = SPAWN_PATTERNS.filter(pattern => !this.recent.includes(pattern.id) &&
        (distance >= G.seriesStartUnits || pattern.hazards.length < 2) &&
        (distance >= G.onboardingUnits || !['crest', 'long-arc', 'bare', 'breath'].includes(pattern.id)) &&
        (pattern.tapes.length > 0 || this.lastTapeX >= this.nextX - G.cassetteGap));
      const pattern = index === 0 ? SPAWN_PATTERNS.find(p => p.id === 'approach')! :
        this.pick(available, item => item.weight * (item.hazards.length > 1 ? .25 + .75 * difficulty : 1));
      this.recent.push(pattern.id);
      if (this.recent.length > G.recentPatterns) this.recent.shift();
      pattern.hazards.forEach((offset, slot) => {
        const choices = (Object.keys(G.kindWeights) as ObstacleKind[]).filter(kind =>
          !(this.kinds.length === 2 && this.kinds.every(previous => previous === kind)));
        const kind = index === 0 ? 'fence' : this.pick(choices, key => G.kindWeights[key]);
        const variants = OBSTACLE_VARIANTS[kind];
        const size = variants[Math.floor(this.random() * (distance < G.onboardingUnits ? 1 : variants.length))];
        const x = this.nextX + offset;
        if (x + size.width > this.endX) return;
        result.push({ id: `${this.prefix}obstacle-${index}-${slot}`, kind, x, y: C.groundY - size.height, ...size });
        this.lastHazardX = x;
        this.kinds.push(kind); if (this.kinds.length > 2) this.kinds.shift();
      });
      pattern.tapes.forEach((tape, slot) => {
        const x = this.nextX + tape.x;
        if (x + G.cassetteWidth <= this.endX) result.push({
          id: `${this.prefix}tape-${index}-${slot}`, kind: 'tape', x, y: tape.y,
          width: G.cassetteWidth, height: G.cassetteHeight,
        });
      });
      const tapes = result.filter(object => object.kind === 'tape');
      if (tapes.length) this.lastTapeX = Math.max(this.lastTapeX, ...tapes.map(tape => tape.x));
      const rest = G.rests[Math.floor(this.random() * G.rests.length)];
      const phraseEnd = this.nextX + pattern.length;
      // Ordinary ground cassettes bridge safe, flat gaps between phrases only.
      // Keep clear of the full take-off/landing window of both neighboring hazards.
      for (let x = this.lastTapeX + G.cassetteStride; x < phraseEnd - G.jumpLead - 100; x += G.cassetteStride) {
        if (x < this.nextX || x < this.lastHazardX + 300 || x + G.cassetteWidth > this.endX) continue;
        result.push({ id: `${this.prefix}tape-${index}-bridge-${Math.round(x)}`, kind: 'tape', x,
          y: G.lowCentre - G.cassetteHeight / 2, width: G.cassetteWidth, height: G.cassetteHeight });
        this.lastTapeX = x;
      }
      this.nextX = Math.max(phraseEnd + rest[0] + this.random() * (rest[1] - rest[0]) + (1 - difficulty) * 80,
        this.lastHazardX + C.minObstacleGap);
    }
    const filtered = this.authored ? result.filter(object => object.x + object.width < this.authored!.reservedStart ||
      object.x > this.authored!.reservedEnd) : result;
    while (this.authored && this.authoredIndex < this.authored.objects.length && this.authored.objects[this.authoredIndex].x <= worldX) {
      filtered.push({ ...this.authored.objects[this.authoredIndex++] });
    }
    return filtered;
  }
  private pick<T>(items: readonly T[], weight: (item: T) => number): T {
    let roll = this.random() * items.reduce((sum, item) => sum + weight(item), 0);
    for (const item of items) { roll -= weight(item); if (roll < 0) return item; }
    return items[items.length - 1];
  }
}

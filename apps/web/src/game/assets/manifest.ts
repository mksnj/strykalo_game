import provided from './providedAssets.json' with { type: 'json' };
import dance from './danceLayout.json' with { type: 'json' };
import cometLayout from './cometLayout.json' with { type: 'json' };

export interface AssetFrame { name: string; x: number; y: number; width: number; height: number }
export type Asset = { key: string; url: string; width: number; height: number } &
  ({ type: 'image'; frames?: readonly AssetFrame[] } | { type: 'sheet'; frameWidth: number; frameHeight: number });

export const ASSETS: readonly Asset[] = [
  {
    key: dance.key, url: dance.url, type: 'sheet', width: dance.cellSize * dance.directions.length,
    height: dance.cellSize, frameWidth: dance.cellSize, frameHeight: dance.cellSize
  },
  {
    key: 'ending-facade', url: '/assets/visual-v12/facade.webp', type: 'image', width: 960, height: 540,
    frames: [{ name: 'wall-left', x: 210, y: 0, width: 192, height: 540 },
    { name: 'wall-right', x: 600, y: 0, width: 192, height: 540 }]
  },
  { key: 'pipe-sunset', url: '/assets/visual-v12/pipe.webp', type: 'image', width: 1920, height: 640 },
  {
    key: 'hero-front', url: '/assets/visual-v12/front.webp', type: 'image', width: 128, height: 256,
    frames: [{ name: 'body', x: 0, y: 72, width: 128, height: 184 }, { name: 'head', x: 0, y: 0, width: 128, height: 72 }]
  },
  {
    key: 'hero-rest', url: '/assets/visual-v12/seated.webp', type: 'image', width: 128, height: 256,
    frames: [{ name: 'body', x: 0, y: 72, width: 128, height: 184 }, { name: 'head', x: 0, y: 0, width: 128, height: 72 }]
  },
  { key: 'room-graffiti', url: '/assets/visual-v12/graffiti.webp', type: 'image', width: 480, height: 160 },
  {
    key: 'journey-autumn', url: '/assets/journey-v1/autumn.webp', type: 'image', width: 1536, height: 512,
    frames: [{ name: 'facades', x: 0, y: 0, width: 1536, height: 486 }]
  },
  {
    key: 'journey-shadows', url: '/assets/journey-v1/shadows.webp', type: 'image', width: 1536, height: 512,
    frames: [{ name: 'facades', x: 0, y: 0, width: 1536, height: 466 }]
  },
  { key: 'night-far', url: '/assets/runner-v1/far.webp', type: 'image', width: 1536, height: 512 },
  { key: 'night-court', url: '/assets/runner-v1/court.webp', type: 'image', width: 1536, height: 512 },
  {
    key: 'night-ground', url: '/assets/runner-v1/ground.webp', type: 'image', width: 1536, height: 164,
    frames: [{ name: 'asphalt', x: 0, y: 24, width: 1536, height: 140 }]
  },
  {
    key: 'night-front', url: '/assets/runner-v1/front.webp', type: 'image', width: 1536, height: 512,
    frames: [{ name: 'canopy', x: 0, y: 0, width: 1536, height: 400 }]
  },
  { key: 'night-hero', url: '/assets/runner-v1/hero.webp', type: 'sheet', width: 512, height: 128, frameWidth: 128, frameHeight: 128 },
  { key: 'night-fence', type: 'image', ...provided.barrier },
  { key: 'night-broken-block', type: 'image', ...provided['broken-block'] },
  { key: 'night-debris', type: 'image', ...provided.debris },
  { key: 'night-rubble', type: 'image', ...provided.rubble },
  { key: 'tape', url: '/assets/runner-v1/cassette.webp', type: 'image', width: 132, height: 84 },
  { key: 'story-beer', url: '/assets/balance-story/beer.webp', type: 'image', width: 80, height: 240 },
  { key: 'pipe-illustration', url: '/assets/journey-v1/pipe.webp', type: 'image', width: 340, height: 381 },
  { key: 'pipe-construction', type: 'image', ...provided.pipe },
  { key: 'pipe-sky-clouds', url: '/assets/pipe-v2/sky-clouds.webp', type: 'image', width: 1536, height: 512 },
  {
    key: 'pipe-side-illustration', url: '/assets/pipe-v2/side.webp', type: 'image', width: 640, height: 140,
    frames: [{ name: 'shaft', x: 80, y: 48, width: 480, height: 48 }]
  },
  { key: 'pipe-side-excavation', url: '/assets/location-v7/excavation.webp', type: 'image', width: 1120, height: 204 },
  { key: 'room-stool', url: '/assets/repairs-v6/stool.webp', type: 'image', width: 192, height: 192 },
  { key: 'room-clock', url: '/assets/props-v5/clock.webp', type: 'image', width: 192, height: 192 },
  { key: 'room-sign', url: '/assets/props-v5/sign.webp', type: 'image', width: 480, height: 160 },
  { key: 'ending-bench', url: '/assets/repairs-v6/bench.webp', type: 'image', width: 480, height: 192 },
  { key: 'television-crt', url: '/assets/references-v13/television.webp', type: 'image', width: 384, height: 288 },
  { key: 'television-water', url: '/assets/references-v13/puddle.webp', type: 'image', width: 768, height: 192 },
  { key: 'court-hoop', url: '/assets/court-v4/hoop.webp', type: 'image', width: 384, height: 640 },
  {
    key: 'court-original', url: '/assets/court-original/court.webp', type: 'image', width: 960, height: 540,
    frames: [{ name: 'rhythm-platform', x: 340, y: 350, width: 280, height: 120 },
    { name: 'floor', x: 0, y: 320, width: 960, height: 220 },
    { name: 'mesh', x: 260, y: 230, width: 700, height: 90 },
    { name: 'gate-panel', x: 640, y: 210, width: 140, height: 110 },
    { name: 'gate-jamb', x: 270, y: 216, width: 7, height: 104 }]
  },
  { key: 'shared-asphalt', url: '/assets/court-v4/asphalt.webp', type: 'image', width: 3072, height: 420 },
  { key: 'room-entrance', url: '/assets/transitions-v4/facade.webp', type: 'image', width: 960, height: 540 },
  { key: 'waiting-room', type: 'image', ...provided.room },
  {
    key: 'room-door', url: '/assets/journey-v1/door.webp', type: 'image', width: 96, height: 258,
    frames: [{ name: 'leaf', x: 11, y: 20, width: 75, height: 228 }]
  },
  {
    key: 'hero-seated', url: '/assets/transitions-v4/seated.webp', type: 'image', width: 256, height: 256,
    frames: [{ name: 'body', x: 0, y: 70, width: 256, height: 186 }, { name: 'head', x: 0, y: 0, width: 256, height: 70 }]
  },
  { key: 'hero-idle', url: '/assets/journey-v1/idle.webp', type: 'sheet', width: 512, height: 128, frameWidth: 128, frameHeight: 128 },
  {
    key: 'archway', url: '/assets/entrance-v1/entrance.webp', type: 'image', width: 960, height: 540,
    frames: [{ name: 'wall-left', x: 210, y: 0, width: 192, height: 540 },
    { name: 'wall-right', x: 600, y: 0, width: 192, height: 540 }]
  },
  {
    key: cometLayout.key, url: cometLayout.url, type: 'sheet', width: 512, height: 256,
    frameWidth: cometLayout.cellWidth, frameHeight: cometLayout.cellHeight
  }
];


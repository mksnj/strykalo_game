import { defineConfig } from '@playwright/test';
export default defineConfig({
  // Each worker renders a full Phaser/WebGL scene; avoid GPU contention on local machines.
  testDir: 'tests/browser', fullyParallel: false, workers: 2,
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 960, height: 540 },
    channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
});

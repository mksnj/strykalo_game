import type { Page } from '@playwright/test';

/** Test-only chart reader: sends physical key edges; fake-clock tests use the deterministic fallback. */
export async function installStarsPilot(page: Page, untilSeconds = 20): Promise<void> {
  await page.evaluate(async until => {
    const path = '/src/game/views/RunnerView.ts', { RunnerView } = await import(/* @vite-ignore */ path);
    const render = RunnerView.prototype.render; let scene: any;
    RunnerView.prototype.render = function(...args: any[]) {
      scene = (this as any).scene;
      scene.audio.musicPosition = () => undefined;
      return render.apply(this, args as any);
    };
    const drive = () => {
      const s = scene?.session;
      if (s?.phase === 'stars' && !s.starsIntroPending && !s.result && !document.querySelector('main[data-paused=true]') && s.stars.elapsed < until) {
        const n = s.stars.notes.find((n: any) => n.state === 'pending' && Math.abs(n.at - s.stars.elapsed) < .05);
        if (n) {
          const code = ({ left: 'ArrowLeft', down: 'ArrowDown', up: 'ArrowUp', right: 'ArrowRight' } as any)[n.direction];
          window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
        }
      }
      requestAnimationFrame(drive);
    };
    requestAnimationFrame(drive);
  }, untilSeconds);
}

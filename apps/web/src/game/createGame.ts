import Phaser from 'phaser';
import { RUNNER } from './config';
import { RunnerScene } from './scenes/RunnerScene';
import { gameViewport } from './viewport';
export function createGame(parent: HTMLElement): Phaser.Game {
  const size = () => {
    const bounds = parent.getBoundingClientRect();
    return gameViewport(bounds.width, bounds.height, window.matchMedia('(orientation: portrait)').matches);
  };
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, ...size(),
    backgroundColor: '#222b39', scene: [RunnerScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    input: { activePointers: 3 }, audio: { noAudio: true },
  });
  let lastSize = '', frame = 0;
  const observer = new ResizeObserver(([entry]) => {
    const key = `${entry.contentRect.width}:${entry.contentRect.height}`;
    if (key === lastSize) return;
    lastSize = key;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const { width } = size();
      if (game.scale.width !== width) game.scale.setGameSize(width, RUNNER.height);
      else game.scale.refresh();
    });
  });
  observer.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => { observer.disconnect(); cancelAnimationFrame(frame); });
  return game;
}

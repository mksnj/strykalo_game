import { useEffect, useRef } from 'react';
import { gameStore } from '../game/state/store';
export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let game: { destroy(removeCanvas: boolean): void } | undefined;
    void import('../game/createGame').then(({ createGame }) => {
      if (!disposed && host.current) game = createGame(host.current);
    }).catch(() => gameStore.fail('Не удалось запустить игру. Обновите страницу.'));
    return () => { disposed = true; game?.destroy(true); };
  }, []);
  return <div className="game-canvas" ref={host} aria-label="Игровая область. Нажмите и удерживайте для прыжка." />;
}

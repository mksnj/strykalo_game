import { useState } from 'react';
import { DEBUG_MINIGAME_POINTS, DEBUG_START_POINTS, isMiniGameStartPoint, type DebugStartPoint } from '../game/state/debugStart';
import { gameStore } from '../game/state/store';

export function DebugMenu() {
  const [seed, setSeed] = useState('');
  const [stage, setStage] = useState<DebugStartPoint>('first-run');
  const parsed = seed === '' ? undefined : Number(seed);
  const valid = parsed === undefined || Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff;
  const launch = (point: DebugStartPoint, developerEntry = false) => {
    if (developerEntry) gameStore.startDebug(point, parsed);
    else if (isMiniGameStartPoint(point)) gameStore.startMiniGame(point, parsed);
    else gameStore.startDebug(point, parsed);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  return <section className="debug-launch" aria-label="Тестирование мини-игр" data-system-ui>
    <div className="stage-picker">
      <label htmlFor="stage-select">Выбор этапа</label>
      <div><select id="stage-select" value={stage} onChange={event => setStage(event.target.value as DebugStartPoint)}>
        {DEBUG_START_POINTS.map(point => <option key={point.id} value={point.id}>{point.label}</option>)}
      </select><button disabled={!valid} onClick={() => {
        gameStore.startStage(stage, parsed); (document.activeElement as HTMLElement | null)?.blur();
      }}>Начать этап →</button></div>
    </div>
    <div className="debug-minigames">{DEBUG_MINIGAME_POINTS.map(point => <button key={point.id}
      disabled={!valid} title={point.label} onClick={() => launch(point.id)}>Мини-игра {point.miniGame}</button>)}</div>
    {import.meta.env.DEV && <details className="debug-menu">
    <summary>Тестирование этапов</summary>
    <label>Seed (пусто — случайный) <input aria-label="Seed" type="number" min="0" max="4294967295"
      value={seed} onChange={event => setSeed(event.target.value)} /></label>
    {!valid && <p role="alert">Введите целое число от 0 до 4294967295</p>}
    <div>{DEBUG_START_POINTS.map(point => <button key={point.id} disabled={!valid}
      onClick={() => launch(point.id, true)}>{point.label}</button>)}</div>
    </details>}
  </section>;
}

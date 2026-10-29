import { useSyncExternalStore } from 'react';
import { rhythmControls } from '../game/input/JourneyInput';
import { DIRECTIONS, type RhythmDirection } from '../game/minigames/stars/StarsEngine';
import { gameStore } from '../game/state/store';
import { RHYTHM } from '../game/config';
const glyphs = { left: '←', down: '↓', up: '↑', right: '→' };
const labels = { left: 'влево', down: 'вниз', up: 'вверх', right: 'вправо' };

export function StarsHud({ paused }: { paused: boolean }) {
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
  const fresh = state.rhythmElapsed - state.rhythmFeedbackAt < .4;
  const press = (direction: RhythmDirection) => { if (!paused) rhythmControls.press(direction); };
  return <section className="rhythm-hud" aria-label="Ритм падающих звёзд">
    <p className="rhythm-title">Лови ритм падающих звёзд<span>Нажми направление в момент совпадения</span></p>
    <p className="rhythm-attempts" role="status">Ошибки {state.rhythmMistakes} / {RHYTHM.maxMistakes}<span>Скорость ×{state.rhythmSpeed.toFixed(1)}</span></p>
    <div className="rhythm-controls" data-system-ui>
      <div className="rhythm-keys">
        {DIRECTIONS.map(direction => <button key={direction} data-direction={direction}
          className={fresh && state.rhythmDirection === direction ? state.rhythmJudgment : ''}
          aria-label={'Ритм: ' + labels[direction]} disabled={paused}
          onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); press(direction); }}
          onClick={event => { if (event.detail === 0) press(direction); }}
          onKeyDown={event => { if (event.repeat) event.preventDefault(); }}>{glyphs[direction]}</button>)}
      </div>
      <small>← ↓ ↑ → / WASD · Нажимай стрелки на экране</small>
    </div>
  </section>;
}

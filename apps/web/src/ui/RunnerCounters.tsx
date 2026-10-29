import { RUNNER } from '../game/config';

export function RunnerCounters({ score, lives }: { score: number; lives: number }) {
  return <div className="hud-status">
    <div className="score"><img src="/assets/runner-v1/cassette.webp" alt="" />
      <strong key={score} className={score ? 'cassette-change' : ''}>{score}</strong><span>кассет</span></div>
    <div key={lives} className={`lives${lives < RUNNER.maxLives ? ' life-change' : ''}`}
      role="img" aria-label={`Жизни: ${lives} из ${RUNNER.maxLives}`}>
      <b aria-hidden="true">{lives}</b>{Array.from({ length: RUNNER.maxLives }, (_, i) =>
        <span key={i} className={i < lives ? 'life-full' : 'life-empty'} aria-hidden="true">♥</span>)}
    </div>
  </div>;
}

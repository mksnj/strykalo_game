import { useEffect, useState, useSyncExternalStore } from 'react';
import { gameStore } from '../game/state/store';
import { GameCanvas } from './GameCanvas';
import { shareResult } from '../services/share';
import { BalanceHud, BalanceInstructions } from './BalanceHud';
import { StarsHud } from './StarsHud';
import { MiniGameHeading } from './MiniGameHeading';
import { albumUrl } from '../services/album';
import { journeyRoute } from '../game/state/route';
import { Tutorial } from './Tutorial';
import { BalanceTutorial } from './BalanceTutorial';
import { StarsTutorial } from './StarsTutorial';
import { RunnerCounters } from './RunnerCounters';
import { DebugMenu } from './DebugMenu';
import { isMiniGameStartPoint } from '../game/state/debugStart';

const buildVersion = import.meta.env.VITE_BUILD_ID ? new Date(import.meta.env.VITE_BUILD_ID).toLocaleString('ru-RU', {
  timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : 'разработка';

export function App() {
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
  const [notice, setNotice] = useState('');
  const [developer, setDeveloper] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(false);
  useEffect(() => {
    let portrait = window.matchMedia('(orientation: portrait)').matches;
    const resize = () => {
      const next = window.matchMedia('(orientation: portrait)').matches;
      if (portrait !== next) gameStore.pause();
      portrait = next;
    };
    const visibility = () => { if (document.hidden) gameStore.pause(); };
    const blur = () => gameStore.pause();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => { setNotice(''); }, [state.runNumber, state.screen]);
  const completed = state.screen === 'completed';
  const finished = state.screen === 'game-over' || state.screen === 'stage-complete' || completed;
  const playing = state.screen === 'playing';
  const testing = state.developer || state.bypassStarsGate;
  const balanceHeading = playing && state.phase === 'balance' && !state.balanceIntroOpen;
  const starsHeading = playing && ['stars', 'stars-retry', 'stars-failure'].includes(state.phase) && !state.starsIntroOpen;
  const waitingHeading = playing && state.phase === 'waiting';
  const start = () => { if (state.debugStart && finished) {
    if (state.bypassStarsGate) gameStore.startDebug(state.debugStart, state.seed);
    else if (isMiniGameStartPoint(state.debugStart)) gameStore.startMiniGame(state.debugStart, state.seed);
    else gameStore.startStage(state.debugStart, state.seed);
  }
    else gameStore.start(developer); (document.activeElement as HTMLElement | null)?.blur(); };
  const begin = () => {
    if (!developer && !tutorialSeen) setTutorialOpen(true);
    else start();
  };
  const routeEnd = journeyRoute(state.developer).availableEnd;
  const resume = () => { gameStore.resume(); (document.activeElement as HTMLElement | null)?.blur(); };
  const district = state.phase.startsWith('pipe') || state.phase === 'balance' ? 'ГОРОДСКОЙ КОТЛОВАН' :
    state.phase.startsWith('stars') ? 'ЗАБРОШЕННАЯ ПЛОЩАДКА' : state.phase.startsWith('room') || state.phase === 'waiting' ? 'ПРОХОДНАЯ КОМНАТА' :
    { night: 'НОЧНОЙ РАЙОН', autumn: 'ОСЕННИЕ ДВОРЫ', shadows: 'ТЁМНЫЕ ДВОРЫ', archway: 'ПОДЪЕЗД' }[state.region];
  return <main className="app" tabIndex={-1} data-screen={state.screen} data-paused={state.paused} data-phase={state.phase} data-developer={state.developer} data-minigame-heading={balanceHeading || starsHeading || waitingHeading}>
    <GameCanvas />
    <div className="grain" aria-hidden="true" />
    <header className="top-bar">
      <div className="brand">ВАЛЕНТИН СТРЫКАЛО <span> / </span> <span className="brand-years">2016—∞</span></div>
      {balanceHeading && <BalanceInstructions />}
      {starsHeading && <MiniGameHeading className="rhythm-title" title="Бесполезно" hint="Нажми направление в момент совпадения" />}
      {waitingHeading && <MiniGameHeading title="Решится само собой" />}
      <div className="system-controls">
        <span className="demo-label">{testing && playing ? 'ДЛЯ РАЗРАБОТЧИКА' : 'ДЕМО · ДОРОГА ДОМОЙ'}</span>
        <button className="quiet-button" onClick={() => gameStore.toggleMute()} aria-label={state.muted ? 'Включить звук' : 'Выключить звук'} aria-pressed={state.muted}>{state.muted ? 'Звук выкл.' : 'Звук вкл.'}</button>
        <details className="audio-settings"><summary>Громкость</summary><div>
          <label>Музыка <input aria-label="Громкость музыки" type="range" min="0" max="1" step="0.05" value={state.musicVolume} onChange={e => gameStore.setVolume('music', Number(e.target.value))} /></label>
          <label>Окружение <input aria-label="Громкость окружения" type="range" min="0" max="1" step="0.05" value={state.ambientVolume} onChange={e => gameStore.setVolume('ambient', Number(e.target.value))} /></label>
          <label>Эффекты <input aria-label="Громкость эффектов" type="range" min="0" max="1" step="0.05" value={state.effectsVolume} onChange={e => gameStore.setVolume('effects', Number(e.target.value))} /></label>
        </div></details>
        {playing && state.phase !== 'stars-locked' && !state.balanceIntroOpen && !state.starsIntroOpen && <button className="quiet-button" onClick={() => gameStore.pause()}>Пауза</button>}
        {(import.meta.env.DEV || state.debugStart) && playing && <button className="quiet-button" onClick={() => gameStore.menu()}>К этапам</button>}
      </div>
    </header>
    {state.screen === 'loading' && <section className="overlay"><div className="panel"><p className="eyebrow">ПО ДОРОГЕ ДОМОЙ</p><h1>Город просыпается</h1><p role="status">Загружаем улицы и обрывки воспоминаний…</p></div></section>}
    {state.screen === 'error' && <section className="overlay"><div className="panel"><h1>Не получилось начать</h1><p role="alert">{state.error}</p><button onClick={() => location.reload()}>Попробовать снова</button></div></section>}
    {state.screen === 'menu' && !tutorialOpen && <section className="menu">
      <div className="menu-copy">
        <p className="eyebrow">ДЕСЯТЬ ЛЕТ АЛЬБОМУ</p>
        <h1>Развлечение<span>дорога домой</span></h1>
        <p className="intro">Ночной город. Старые кассеты.<br />И ещё немного пути.</p>
        <div className="menu-actions"><button className="primary" onClick={begin}>Начать путь <span aria-hidden="true">→</span></button><span className="record">Рекорд на устройстве <strong>{state.best}</strong></span>{import.meta.env.DEV && <label className="developer-option"><input type="checkbox" checked={developer} onChange={event => setDeveloper(event.target.checked)} aria-describedby="launch-instructions" />Для разработчика</label>}</div>
        <p className="instructions" id="launch-instructions">{developer ? <>Маршрут 0–70 без препятствий.<br />Мини-игры на 20, 40 и 60; их длительность сохранена.</> : <>Касание, пробел или ↑ — прыжок.<br />Удерживайте дольше, чтобы прыгнуть выше.</>}</p>
        <DebugMenu />
      </div>
      <div className="menu-foot"><span title={import.meta.env.VITE_BUILD_ID}>Версия {buildVersion} МСК</span><p>Локальная пробная версия. Результаты не попадают в общий рейтинг.</p></div>
    </section>}
    {state.screen === 'menu' && tutorialOpen && <Tutorial onStart={() => {
      setTutorialSeen(true); setTutorialOpen(false); start();
    }} onBack={() => {
      setTutorialOpen(false);
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.menu-actions .primary')?.focus());
    }} />}
    {playing && <>
      <section className="hud" aria-label="Результат попытки"><RunnerCounters score={state.score} lives={state.lives} />
        <div className="distance">{testing && <b className="developer-badge">ДЛЯ РАЗРАБОТЧИКА</b>}{district} <span>{state.distance} / {routeEnd}</span><div className="progress"><i style={{ width: `${state.distance / routeEnd * 100}%` }} /></div></div></section>
      {state.phase === 'runner' && <div className="jump-guide" aria-hidden="true">КАСАНИЕ — ПРЫЖОК</div>}
      {state.phase === 'balance' && !state.balanceIntroOpen && <BalanceHud position={state.balancePosition} progress={state.balanceProgress} />}
      {state.balanceIntroOpen && <BalanceTutorial onBack={state.debugStart ? () => gameStore.menu() : undefined} onStart={() => {
        gameStore.startBalance();
        requestAnimationFrame(() => document.querySelector<HTMLElement>('.app')?.focus({ preventScroll: true }));
      }} />}
      {state.starsIntroOpen && <StarsTutorial onBack={state.debugStart ? () => gameStore.menu() : undefined} onStart={() => {
        gameStore.startStars();
        requestAnimationFrame(() => document.querySelector<HTMLElement>('.app')?.focus({ preventScroll: true }));
      }} />}
      {['stars', 'stars-retry', 'stars-failure'].includes(state.phase) && !state.starsIntroOpen &&
        <StarsHud paused={state.paused || state.phase !== 'stars'} />}
      {state.phase === 'stars-retry' && <div className="transition-caption" role="status">Ещё раз</div>}
      {state.phase === 'stars-locked' && <section className="overlay stars-gate" data-system-ui>
        <div className="panel" role="dialog" aria-modal="true" aria-labelledby="stars-gate-title">
          <h1 id="stars-gate-title">Звезд пока нет</h1>
          <p className="gate-date">По прогнозам, звездопад начнется 30.10 в 08:00</p>
          <div className="actions"><button className="primary" onClick={() => gameStore.resolveStarsGate('play')}>Пройти на площадку на свой страх и риск</button>
            <button onClick={() => gameStore.resolveStarsGate('skip')}>Пройти дальше</button></div>
        </div>
      </section>}
      {state.phase === 'stars-failure' && <div className="narrative-caption" role="status">бесполезно</div>}
      {state.phase === 'waiting' && state.waitingHint && <div className="waiting-hint" style={{ opacity: state.waitingHintOpacity }} role="status">Ты куда-то торопишься?</div>}
      {state.phase === 'room-rest' && <div className="transition-caption" role="status">Дождь стих</div>}
      {state.phase === 'stars-approach' && <div className="transition-caption" role="status">Небо становится ближе</div>}
      {state.phase === 'pipe-exit' && <div className="transition-caption" role="status">Другая сторона</div>}
      {state.paused && state.phase !== 'stars-locked' && !state.balanceIntroOpen && !state.starsIntroOpen && <section className="overlay"><div className="panel"><p className="eyebrow">ГОРОД ПОДОЖДЁТ</p><h1>Пауза</h1><p>Вернитесь, когда будете готовы.</p><div className="actions"><button className="primary" onClick={resume}>Продолжить →</button><button onClick={() => gameStore.menu()}>В меню</button></div></div></section>}
    </>}
    {finished && <section className="overlay result"><div className="panel">
      <p className="eyebrow">{testing ? 'ДЛЯ РАЗРАБОТЧИКА · ТЕСТОВАЯ ПОПЫТКА' : completed ? 'ДЕСЯТЬ ЛЕТ АЛЬБОМУ · 2016—∞' : 'ПОПЫТКА ЗАКОНЧЕНА'}</p>
      <h1>{completed ? 'Путь домой завершён' : 'Не в этот раз'}</h1>
      <p>{completed ? 'Город остался за дверью.' : state.phase === 'balance' ? 'Не удалось удержаться на трубе. Можно попробовать ещё.' : 'Город остаётся. Можно попробовать ещё.'}</p>
      <div className="result-numbers"><div><strong>{state.score}</strong><span>собрано кассет</span></div><div><strong>{state.best}</strong><span>рекорд на устройстве</span></div><div><strong>{state.distance}</strong><span>пройдено / {routeEnd}</span></div></div>
      {completed && <div className="actions album-actions"><button disabled={!albumUrl} title={albumUrl ? undefined : 'Ссылка на альбом ещё не добавлена'} onClick={() => { if (albumUrl) window.open(albumUrl, '_blank', 'noopener,noreferrer'); }}>Переслушать альбом</button><button onClick={() => setNotice('Общий рейтинг будет доступен после подключения Telegram и сервера. Сейчас рекорд хранится на устройстве.')}>Таблица лидеров</button></div>}
      {state.screen === 'game-over' && state.checkpointDistance !== null && <div className="actions"><button className="primary" onClick={() => { gameStore.continueFromCheckpoint(); (document.activeElement as HTMLElement | null)?.blur(); }}>{['balance', 'stars', 'waiting'].includes(state.checkpointPhase ?? '') ? 'Играть ещё раз' : `Продолжить с ${state.checkpointDistance}`}</button></div>}
      <div className="actions"><button className="primary" onClick={start}>{completed ? 'Играть снова' : ['balance', 'stars', 'waiting'].includes(state.checkpointPhase ?? '') ? 'С начала' : 'Ещё раз'} <span aria-hidden="true">↗</span></button><button disabled={testing || !!state.debugStart} onClick={() => { void shareResult(state.score).then(setNotice); }}>Поделиться</button><button className="text-button" onClick={() => gameStore.menu()}>В меню</button></div>
      <p className="notice" role="status">{testing ? 'Тестовый результат не сохраняется в рекорд.' : state.debugStart ? 'Результат отдельного этапа не сохраняется в рекорд.' : notice || 'Деморезультат сохраняется только на этом устройстве.'}</p>
    </div></section>}
    {playing && !state.paused && <div className="portrait-guide" aria-hidden="true">
      {state.phase === 'runner' ? <><strong>Дорога продолжается</strong><span>Касайтесь экрана для прыжка.<br />Удерживайте, чтобы прыгнуть выше.</span></> :
       null}
    </div>}
  </main>;
}

import { useEffect, useRef, useState } from 'react';
import D from '../game/assets/shuffleLayout.json';
import { CourtShuffle, shuffleFrame, shuffleSettings } from '../game/views/courtShuffle';
import type { RhythmDirection } from '../game/minigames/stars/StarsEngine';
import '../dance-preview.css';

export function DancePreview({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef(new CourtShuffle());
  const clock = useRef({ time: 0, playing: false, loop: false, direction: 'left' as RhythmDirection });
  const [playing, setPlaying] = useState(false), [loop, setLoop] = useState(false);
  const [duration, setDuration] = useState(shuffleSettings.durationSeconds);
  const [progress, setProgress] = useState(0), [direction, setDirection] = useState<RhythmDirection>('left');
  const [error, setError] = useState('');
  const play = (direction: RhythmDirection) => {
    clock.current.direction = direction; clock.current.playing = true;
    player.current.press(direction); setDirection(direction); setPlaying(true);
  };
  useEffect(() => {
    const modal = dialog.current!; modal.showModal();
    const image = new Image(); image.src = D.url;
    image.onerror = () => setError('Не удалось загрузить анимацию. Закройте просмотр и попробуйте снова.');
    let frame = 0, previous: number | undefined, disposed = false;
    const render = (time: number) => {
      if (disposed) return;
      const delta = previous === undefined ? 0 : Math.min(.05, (time - previous) / 1000); previous = time;
      const state = clock.current, shuffle = player.current;
      if (state.playing && !document.hidden) {
        state.time += delta; shuffle.duration = shuffleSettings.durationSeconds;
        shuffle.update(state.time);
        if (!shuffle.direction) {
          if (state.loop) {
            state.direction = state.direction === 'left' ? 'right' : 'left';
            shuffle.press(state.direction);
          }
          else { state.playing = false; setPlaying(false); }
        }
        setDirection(shuffle.direction && shuffle.direction !== 'groove' ? shuffle.direction : state.direction); setProgress(shuffle.progress);
      }
      const ctx = canvas.current?.getContext('2d');
      if (ctx && image.complete && image.naturalWidth) {
        ctx.clearRect(0, 0, 520, 384); ctx.fillStyle = '#25303c'; ctx.fillRect(0, 0, 520, 384);
        ctx.strokeStyle = '#46515c'; ctx.beginPath(); ctx.moveTo(30, 346); ctx.lineTo(490, 346); ctx.stroke();
        const tile = shuffle.direction ? shuffleFrame(shuffle.direction, shuffle.progress) : D.frames.idle;
        for (const [x, size] of [[170, 308], [412, 154]]) {
          const scale = size / D.source.height;
          ctx.drawImage(image, tile % D.columns * D.cellWidth, Math.floor(tile / D.columns) * D.cellHeight,
            D.cellWidth, D.cellHeight, x + (shuffle.offset - D.anchor.x) * scale, 346 - D.anchor.y * scale, D.cellWidth * scale, D.cellHeight * scale);
        }
        ctx.fillStyle = '#c1cbd5'; ctx.font = '13px Arial'; ctx.textAlign = 'center';
        ctx.fillText('×2', 170, 372); ctx.fillText('В игре · 154 px', 412, 372);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const direction = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[event.code as 'ArrowLeft'];
      if (direction) {
        event.preventDefault(); if (!event.repeat) play(direction);
      }
    };
    modal.addEventListener('keydown', key);
    return () => { disposed = true; cancelAnimationFrame(frame); modal.removeEventListener('keydown', key); modal.close(); };
  }, []);
  const phase = D.keys.filter(key => key.at <= progress).at(-1)?.phase;
  return <dialog ref={dialog} className="dance-preview" aria-labelledby="dance-title" data-system-ui onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="dance-title">Тихий танец</h2><button onClick={onClose} autoFocus>Закрыть просмотр</button></header>
    <div className="dance-preview-body">
      <canvas ref={canvas} width={520} height={384} role="img" aria-label="Анимация героя: увеличенный вид и игровой размер" />
      <div className="dance-preview-controls">
        <p>Четыре стрелки — танцевальные акценты на месте. Руки в карманах, мягкие колени и перенос веса.</p>
        <div><button onClick={() => play('left')}>Акцент влево</button><button onClick={() => play('down')}>Коленями вниз</button><button onClick={() => play('up')}>На носок</button><button onClick={() => play('right')}>Акцент вправо</button></div>
        <button onClick={() => {
          const next = !clock.current.playing; clock.current.playing = next; setPlaying(next);
          if (next && !player.current.direction) player.current.press(direction);
        }}>{playing ? 'Остановить анимацию' : 'Воспроизвести'}</button>
        <label><input type="checkbox" checked={loop} onChange={e => { setLoop(e.target.checked); clock.current.loop = e.target.checked; }} /> Повторять танец влево / вправо</label>
        <label>Длительность акцента: {duration.toFixed(2)} с
          <input aria-label="Длительность акцента" type="range" min="0.45" max="1.1" step="0.01" value={duration}
            onChange={e => { const value = Number(e.target.value); setDuration(value); shuffleSettings.durationSeconds = value; }} />
        </label>
        <label>Фаза: {Math.round(progress * 100)}% · {direction === 'left' ? 'влево' : 'вправо'}
          <input aria-label="Фаза танца" type="range" min="0" max="1" step="0.025" value={progress} onChange={e => {
            const value = Number(e.target.value); clock.current.playing = false; setPlaying(false);
            player.current.direction = direction; player.current.pending = undefined; player.current.offset = 0; player.current.progress = value; setProgress(value);
          }} />
        </label>
        <output>{phase}</output>
        <button onClick={() => {
          shuffleSettings.durationSeconds = D.durationSeconds; setDuration(D.durationSeconds);
          player.current.reset(); clock.current.playing = false; setPlaying(false); setProgress(0);
          clock.current.loop = false; setLoop(false);
        }}>Сбросить настройки</button>
        <p>Темп применяется в игре до перезагрузки страницы. Амплитуда и девять фаз задаются в <code>shuffleLayout.json</code>; после правки выполните <code>node tools/prepare-court-shuffle.mjs</code>.</p>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  </dialog>;
}

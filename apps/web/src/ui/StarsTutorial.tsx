import { useEffect, useRef } from 'react';

/** Uses the balance lesson's dialog, typography and controls; demo is CSS only. */
export function StarsTutorial({ onStart, onBack }: { onStart: () => void; onBack?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useRef<HTMLHeadingElement>(null), start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current!; element.showModal(); title.current?.focus({ preventScroll: true });
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="balance-tutorial stars-tutorial" aria-labelledby="stars-tutorial-title"
    aria-describedby="stars-tutorial-intro" data-system-ui onCancel={event => event.preventDefault()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Tab') {
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = index < 0 ? event.shiftKey ? buttons.length - 1 : 0 :
          (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }} onPointerDown={event => event.stopPropagation()}>
    <div className="balance-tutorial-copy">
      <p className="eyebrow">02 / ЗАБРОШЕННАЯ ПЛОЩАДКА</p>
      <h1 id="stars-tutorial-title" ref={title} tabIndex={-1}>БЕСПОЛЕЗНО</h1>
      <p id="stars-tutorial-intro">Лови ритм падающих звёзд.<br />Нажимай стрелки в момент, когда звезда совпадает с отметкой.</p>
    </div>
    <div className="balance-demo" role="img" aria-label="Звезда со стрелкой вниз опускается к цели. При совпадении нажми вниз.">
      <div className="rhythm-lesson" aria-hidden="true"><i className="rhythm-lesson-note">✦<b>↓</b></i><span>↓</span></div>
      <div className="lesson-arrows" aria-hidden="true"><span>←</span><span className="rhythm-lesson-key">↓</span><span>↑</span><span>→</span></div>
    </div>
    <div className="balance-tutorial-controls">
      <p><kbd>← ↓ ↑ →</kbd> — управление</p>
      <p>На телефоне — нажимай стрелки на экране.</p>
      <p>Три ошибки сбивают ритм. Звёзды постепенно ускоряются.</p>
      <button ref={start} className="primary" onClick={onStart}>Начать →</button>
      {onBack && <button className="text-button" onClick={onBack}>К этапам</button>}
    </div>
  </dialog>;
}

import { useLayoutEffect, useRef } from 'react';
import { BalanceMeter } from './BalanceHud';

export function BalanceTutorial({ onStart, onBack }: { onStart: () => void; onBack?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal(); title.current?.focus({ preventScroll: true });
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="balance-tutorial" aria-labelledby="balance-tutorial-title"
    aria-describedby="balance-tutorial-intro" data-system-ui onCancel={event => event.preventDefault()}
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
      <p className="eyebrow">01 / ГОРОДСКОЙ КОТЛОВАН</p>
      <h1 id="balance-tutorial-title" tabIndex={-1} ref={title}>ДЕЛАТЬ ЭТО ТРЕЗВЫМ</h1>
      <p id="balance-tutorial-intro">Кажется, ты немного нетрезв.<br />Держи равновесие, чтобы не свалиться с трубы!</p>
    </div>
    <div className="balance-demo" role="img" aria-label="Героя уводит вправо — нажми влево, чтобы вернуть его к центру. Затем наоборот.">
      <BalanceMeter demo />
      <div className="demo-keys" aria-hidden="true"><span className="demo-left">← / A</span><small>Вернись к центру</small><span className="demo-right">D / →</span></div>
    </div>
    <div className="balance-tutorial-controls">
      <p><kbd>← / A</kbd> — балансировать влево<br /><kbd>→ / D</kbd> — балансировать вправо</p>
      <p>На телефоне — удерживай левую или правую половину экрана.</p>
      <button ref={start} className="primary" onClick={onStart}>Понятно, пошатываемся →</button>
      {onBack && <button className="text-button" onClick={onBack}>К этапам</button>}
    </div>
  </dialog>;
}

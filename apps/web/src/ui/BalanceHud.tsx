export function BalanceMeter({ position = 0, demo = false }: { position?: number; demo?: boolean }) {
  const bounded = Math.max(-1, Math.min(1, position));
  return <div className={`balance-meter${Math.abs(bounded) > .7 ? ' unstable' : ''}${demo ? ' demo-meter' : ''}`}
    role={demo ? undefined : 'meter'} aria-label={demo ? undefined : 'Отклонение от центра трубы'}
    aria-valuemin={demo ? undefined : -100} aria-valuemax={demo ? undefined : 100}
    aria-valuenow={demo ? undefined : Math.round(bounded * 100)}>
    <i className="meter-center" aria-hidden="true" />
    <span className="meter-position" aria-hidden="true" style={demo ? undefined : {
      left: `${50 + bounded * 44}%`, transform: `translateX(-50%) rotate(${bounded * 18}deg)`,
    }}><span className="balance-hero" /></span>
  </div>;
}

export function BalanceHud({ position, progress }: { position: number; progress: number }) {
  const percent = Math.max(0, Math.min(100, progress));
  return <section className="balance-hud" aria-label="Равновесие на трубе">
    <div className="balance-instructions"><p>Делать это трезвым</p><span>← / A · ДЕРЖИСЬ ПО ЦЕНТРУ · D / →</span></div>
    <div className="balance-instruments">
      <div className="balance-label"><span>Равновесие</span><span>{Math.abs(position) > .7 ? 'Осторожно, край' : 'Держись по центру'}</span></div>
      <BalanceMeter position={position} />
      <div className="crossing-progress" role="progressbar" aria-label={`Труба пройдена на ${Math.round(percent)} процентов`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent.toFixed(2))}>
        <div className="pipe-channel"><i style={{ width: `${percent}%` }} /></div>
        <i className="pipe-collar pipe-start" aria-hidden="true" /><i className="pipe-collar pipe-end" aria-hidden="true" />
      </div>
      <div className="pipe-label"><span>Начало</span><span>Труба · {Math.round(percent)}%</span><span>Берег</span></div>
    </div>
  </section>;
}

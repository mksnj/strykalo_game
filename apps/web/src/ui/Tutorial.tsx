import { useEffect, useRef } from 'react';

interface TutorialProps {
  onStart: () => void;
  onBack: () => void;
}

export function Tutorial({ onStart, onBack }: TutorialProps) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  return <section className="overlay tutorial" aria-labelledby="tutorial-title" data-system-ui>
    <div className="tutorial-content">
      <p className="eyebrow">ДВА ПРАВИЛА В ДОРОГУ</p>
      <h1 id="tutorial-title" ref={title} tabIndex={-1}>Как играть</h1>
      <p className="tutorial-intro">3 жизни. Третье столкновение — конец забега. Проигрыш в мини-игре обнуляет жизни.</p>
      <div className="tutorial-rules">
        <article className="tutorial-rule">
          <div className="tutorial-examples tutorial-obstacles">
            <img src="/assets/provided-v4/barrier.webp" alt="Бетонный блок" />
            <img src="/assets/provided-v4/broken-block.webp" alt="Разбитый блок" />
            <img src="/assets/provided-v4/debris.webp" alt="Мусор" />
            <img src="/assets/provided-v4/rubble.webp" alt="Обломки" />
          </div>
          <h2><span aria-hidden="true">01 / </span>Перепрыгивайте препятствия</h2>
          <p>На пути встречаются блоки, мусор и обломки. <strong>Коснитесь экрана, чтобы перепрыгнуть их.</strong></p>
          <p className="tutorial-hint">На компьютере — пробел или ↑.</p>
        </article>
        <article className="tutorial-rule">
          <div className="tutorial-examples tutorial-tape"><img src="/assets/runner-v1/cassette.webp" alt="Аудиокассета" /></div>
          <h2><span aria-hidden="true">02 / </span>Собирайте кассеты</h2>
          <p>Подбирайте кассеты по дороге. <strong>Каждая кассета — одно очко.</strong></p>
        </article>
      </div>
      <div className="actions tutorial-actions">
        <button className="primary" onClick={onStart}>Понятно, в путь <span aria-hidden="true">→</span></button>
        <button className="text-button" onClick={onBack}>Назад</button>
      </div>
    </div>
  </section>;
}

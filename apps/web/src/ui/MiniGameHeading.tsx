export function MiniGameHeading({ title, hint, className = '' }: { title: string; hint?: string; className?: string }) {
  return <div className={`minigame-heading ${className}`}><p>{title}</p>{hint && <span>{hint}</span>}</div>;
}

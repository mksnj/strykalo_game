const KEY = 'razvlechenie.demo.best.v1';
export function readDemoRecord(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}
export function saveDemoRecord(score: number): number {
  const best = Math.max(readDemoRecord(), score);
  try { localStorage.setItem(KEY, String(best)); } catch { /* Private WebViews can deny storage. */ }
  return best;
}

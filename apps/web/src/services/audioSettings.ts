const KEY = 'razvlechenie.audio.muted.v1';
export function readMuted(): boolean {
  try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
}
export function saveMuted(muted: boolean): void {
  try { localStorage.setItem(KEY, String(muted)); } catch { /* Optional preference. */ }
}
export function readVolume(channel: 'music' | 'effects' | 'ambient', fallback: number): number {
  try {
    const raw = localStorage.getItem(`razvlechenie.audio.${channel}.v1`);
    const value = raw === null ? fallback : Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  } catch { return fallback; }
}
export function saveVolume(channel: 'music' | 'effects' | 'ambient', value: number): void {
  try { localStorage.setItem(`razvlechenie.audio.${channel}.v1`, String(value)); } catch { /* Optional preference. */ }
}

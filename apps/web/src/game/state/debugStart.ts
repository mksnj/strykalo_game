export const DEBUG_START_POINTS = [
  { id: 'first-run', label: 'Первый забег · 0–200' },
  { id: 'balance', label: 'Мини-игра с трубой', miniGame: 1 },
  { id: 'second-run', label: 'Второй забег · 200–400' },
  { id: 'stars', label: 'Мини-игра со звёздами', miniGame: 2 },
  { id: 'third-run', label: 'Третий забег · 400–600' },
  { id: 'waiting', label: 'Мини-игра в комнате', miniGame: 3 },
  { id: 'final-run', label: 'Финальный забег · 600–700' },
] as const;
export const DEBUG_MINIGAME_POINTS = DEBUG_START_POINTS.filter(point => 'miniGame' in point);
export type MiniGameStartPoint = typeof DEBUG_MINIGAME_POINTS[number]['id'];
export function isMiniGameStartPoint(value: unknown): value is MiniGameStartPoint {
  return DEBUG_MINIGAME_POINTS.some(point => point.id === value);
}
export type DebugStartPoint = typeof DEBUG_START_POINTS[number]['id'];
export function isDebugStartPoint(value: unknown): value is DebugStartPoint {
  return DEBUG_START_POINTS.some(point => point.id === value);
}

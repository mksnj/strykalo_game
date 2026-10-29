import { DEVELOPER, JOURNEY } from '../config';
import type { MiniGameId, MiniGameOutcome } from '../../../../../packages/shared/src/contracts';

export const ROUTE: readonly { id: MiniGameId; distance: number }[] = [
  { id: 'balance', distance: JOURNEY.balanceAt },
  { id: 'stars', distance: JOURNEY.starsAt },
  { id: 'waiting', distance: JOURNEY.waitingAt },
];
export function endsRun(id: MiniGameId, outcome: MiniGameOutcome): boolean {
  return id !== 'stars' && outcome === 'fatal-failure';
}

/** Alternate route parameters belong to the attempt; the normal route stays unchanged. */
export function journeyRoute(developer = false) {
  const scale = developer ? DEVELOPER.routeDivisor : 1;
  return {
    scale, balanceAt: JOURNEY.balanceAt / scale, starsAt: JOURNEY.starsAt / scale,
    waitingAt: JOURNEY.waitingAt / scale, availableEnd: JOURNEY.availableEnd / scale,
    clearance: JOURNEY.transitionClearance / scale,
  };
}

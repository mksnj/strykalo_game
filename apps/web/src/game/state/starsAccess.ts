import { STARS_ACCESS } from '../config';

export const starsOpensAt = Date.parse(STARS_ACCESS.opensAt);
/** Local release UX, not a server-enforced restriction. Explicit opt-in is handled by the session. */
export function starsAvailable(now: number, testing = false): boolean {
  return testing || now >= starsOpensAt;
}

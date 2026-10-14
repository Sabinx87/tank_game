import { shuffle } from '@shared/tank';

/**
 * Turn order and the turn timer. The order is shuffled once per round; each
 * call to advance() moves to the next eligible player (alive + connected).
 */
export class TurnSystem {
  order: string[] = [];
  currentPlayerId: string | null = null;
  private index = -1;
  private endsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  startRound(playerIds: string[], rng: () => number = Math.random): void {
    this.clearTimer();
    this.order = shuffle(playerIds, rng);
    this.index = -1;
    this.currentPlayerId = null;
  }

  /** Move to the next eligible player. Returns null if nobody can play right now. */
  advance(isEligible: (playerId: string) => boolean): string | null {
    this.clearTimer();
    const n = this.order.length;
    for (let step = 1; step <= n; step++) {
      const i = (this.index + step) % n;
      if (isEligible(this.order[i])) {
        this.index = i;
        this.currentPlayerId = this.order[i];
        return this.currentPlayerId;
      }
    }
    this.currentPlayerId = null;
    return null;
  }

  startTimer(ms: number, onTimeout: () => void): void {
    this.clearTimer();
    this.endsAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      onTimeout();
    }, ms);
  }

  clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.endsAt = 0;
  }

  timeLeftMs(): number {
    return this.timer ? Math.max(0, this.endsAt - Date.now()) : 0;
  }

  isCurrent(playerId: string): boolean {
    return this.currentPlayerId === playerId;
  }
}

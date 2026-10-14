import { POINTS_PER_DAMAGE, POINTS_PER_KILL, SURVIVAL_BONUS } from '@shared/constants';
import type { RoundResults, ShotResult } from '@shared/types';
import type { Player } from '../Player';

interface RoundStats {
  kills: number;
  damageDealt: number;
}

/** Tracks kills / damage during a round and converts them to points at the end. */
export class Scoring {
  private stats = new Map<string, RoundStats>();

  startRound(playerIds: string[]): void {
    this.stats = new Map(playerIds.map((id) => [id, { kills: 0, damageDealt: 0 }]));
  }

  recordShot(shot: ShotResult): void {
    for (const ex of shot.explosions) {
      for (const d of ex.damage) {
        if (d.playerId === d.sourceId) continue; // hurting yourself earns nothing
        const s = this.stats.get(d.sourceId);
        if (s) s.damageDealt += d.amount;
      }
      for (const victim of ex.killed) {
        if (victim === shot.shooterId) continue;
        const s = this.stats.get(shot.shooterId);
        if (s) s.kills += 1;
      }
    }
  }

  /** Award points to players (mutates them) and build the results table. */
  finishRound(players: Player[], aliveIds: Set<string>, round: number, totalRounds: number): RoundResults {
    const entries = players.map((p) => {
      const s = this.stats.get(p.id) ?? { kills: 0, damageDealt: 0 };
      const survived = aliveIds.has(p.id);
      const pointsEarned =
        s.kills * POINTS_PER_KILL + Math.round(s.damageDealt * POINTS_PER_DAMAGE) + (survived ? SURVIVAL_BONUS : 0);
      p.points += pointsEarned;
      return { playerId: p.id, kills: s.kills, damageDealt: s.damageDealt, survived, pointsEarned, totalPoints: p.points };
    });
    entries.sort((a, b) => b.pointsEarned - a.pointsEarned);
    return {
      round,
      totalRounds,
      winnerId: aliveIds.size === 1 ? [...aliveIds][0] : null,
      entries,
      isFinal: round >= totalRounds,
    };
  }
}

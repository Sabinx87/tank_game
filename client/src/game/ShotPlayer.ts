import Phaser from 'phaser';
import { trackPositionAt } from '@shared/physics';
import type { ExplosionEvent, ShotResult } from '@shared/types';
import { getWeapon } from '@shared/weapons';

const TRAIL_SECONDS = 0.35;
const TRAIL_DOTS = 8;

/**
 * Replays a server-simulated shot: moves projectiles along their recorded
 * tracks and fires explosion events at the right moment.
 */
export class ShotPlayer {
  private t = 0;
  private nextExplosion = 0;

  constructor(
    readonly shot: ShotResult,
    private readonly gfx: Phaser.GameObjects.Graphics,
    private readonly onExplosion: (ev: ExplosionEvent) => void,
  ) {}

  get finished(): boolean {
    return this.t > this.shot.duration + 0.2 && this.nextExplosion >= this.shot.explosions.length;
  }

  update(dt: number): void {
    this.t += dt;
    const { explosions } = this.shot;
    while (this.nextExplosion < explosions.length && explosions[this.nextExplosion].t <= this.t) {
      this.onExplosion(explosions[this.nextExplosion++]);
    }
    this.draw();
  }

  /** Jump to the end (applies all remaining explosions without waiting). */
  skipToEnd(): void {
    while (this.nextExplosion < this.shot.explosions.length) this.onExplosion(this.shot.explosions[this.nextExplosion++]);
    this.t = this.shot.duration + 1;
    this.gfx.clear();
  }

  private draw(): void {
    const g = this.gfx.clear();
    for (const track of this.shot.projectiles) {
      const pos = trackPositionAt(track, this.t);
      if (!pos) continue;
      const fancy = getWeapon(track.weaponId)?.trail;
      if (fancy) {
        // Weapon-specific trail: colours blend from head to tail, dots grow then shrink.
        const dots = TRAIL_DOTS * 2;
        for (let i = dots; i >= 1; i--) {
          const p = trackPositionAt(track, Math.max(track.startTime, this.t - (fancy.seconds * i) / dots));
          if (!p) continue;
          const k = i / (dots + 1);
          const color = fancy.colors[Math.min(fancy.colors.length - 1, Math.floor(k * fancy.colors.length))];
          const flicker = 0.85 + Math.random() * 0.3;
          const r = track.radius * fancy.size * (1 - k * 0.6) * flicker;
          g.fillStyle(fancy.colors[fancy.colors.length - 1], 0.18 * (1 - k)).fillCircle(p.x, p.y, r * 1.9); // glow
          g.fillStyle(color, 0.95 * (1 - k * 0.8)).fillCircle(p.x, p.y, r);
        }
      } else {
        // Fading trail
        for (let i = TRAIL_DOTS; i >= 1; i--) {
          const p = trackPositionAt(track, Math.max(track.startTime, this.t - (TRAIL_SECONDS * i) / TRAIL_DOTS));
          if (p) g.fillStyle(track.color, 0.35 * (1 - i / (TRAIL_DOTS + 1))).fillCircle(p.x, p.y, track.radius * 0.7);
        }
      }
      if (pos.y < 0) {
        // Above the screen: show an arrow marker at the top edge.
        g.fillStyle(track.color, 1).fillTriangle(pos.x - 7, 16, pos.x + 7, 16, pos.x, 4);
        continue;
      }
      g.fillStyle(0x000000, 0.5).fillCircle(pos.x, pos.y, track.radius + 1.5);
      g.fillStyle(track.color, 1).fillCircle(pos.x, pos.y, track.radius);
    }
  }
}

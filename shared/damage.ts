/** Explosion damage, crater carving and tanks falling onto the new ground. */
import {
  FALL_DAMAGE_ENABLED,
  FALL_DAMAGE_PER_PIXEL,
  FALL_DAMAGE_THRESHOLD,
  TANK_HEIGHT,
  TANK_HIT_RADIUS,
} from './constants';
import { carveCrater, heightAt } from './terrain';
import type { DamageEvent, ExplosionEvent } from './types';

export interface SimTank {
  playerId: string;
  x: number;
  y: number;
  health: number;
  alive: boolean;
}

/** Linear falloff: full damage at the centre, zero at the edge of the blast. */
export function falloffDamage(baseDamage: number, radius: number, distance: number): number {
  if (distance >= radius) return 0;
  return baseDamage * (1 - Math.max(0, distance) / radius);
}

/** Distance from a blast centre to the edge of a tank's body. */
export function distanceToTank(tank: SimTank, x: number, y: number): number {
  const cx = tank.x;
  const cy = tank.y - TANK_HEIGHT / 2;
  return Math.max(0, Math.hypot(cx - x, cy - y) - TANK_HIT_RADIUS);
}

export function fallDamage(fallDistance: number): number {
  if (!FALL_DAMAGE_ENABLED || fallDistance <= FALL_DAMAGE_THRESHOLD) return 0;
  return Math.round((fallDistance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_PIXEL);
}

export interface BlastSpec {
  x: number;
  y: number;
  t: number;
  weaponId: string;
  color: number;
  damage: number;
  explosionRadius: number;
  craterRadius: number;
  sourceId: string;
}

/**
 * Resolve one explosion: carve the crater, damage tanks (shooter included),
 * drop tanks onto the new ground, mark destroyed tanks. Mutates terrain + tanks.
 */
export function applyExplosion(terrain: number[], tanks: SimTank[], blast: BlastSpec): ExplosionEvent {
  carveCrater(terrain, blast.x, blast.y, blast.craterRadius);

  const damage: DamageEvent[] = [];
  const hurt = (tank: SimTank, amount: number, cause: DamageEvent['cause']) => {
    const applied = Math.min(tank.health, Math.round(amount));
    if (applied <= 0) return;
    tank.health -= applied;
    damage.push({ playerId: tank.playerId, amount: applied, sourceId: blast.sourceId, cause });
  };

  for (const tank of tanks) {
    if (!tank.alive) continue;
    hurt(tank, falloffDamage(blast.damage, blast.explosionRadius, distanceToTank(tank, blast.x, blast.y)), 'explosion');
  }

  // Gravity: every tank (wrecks too) settles onto the ground below it.
  for (const tank of tanks) {
    const ground = heightAt(terrain, tank.x);
    if (ground > tank.y) {
      const fall = ground - tank.y;
      tank.y = ground;
      if (tank.alive) hurt(tank, fallDamage(fall), 'fall');
    }
  }

  const killed: string[] = [];
  for (const tank of tanks) {
    if (tank.alive && tank.health <= 0) {
      tank.alive = false;
      tank.health = 0;
      killed.push(tank.playerId);
    }
  }

  return {
    t: blast.t,
    x: Math.round(blast.x * 10) / 10,
    y: Math.round(blast.y * 10) / 10,
    weaponId: blast.weaponId,
    color: blast.color,
    explosionRadius: blast.explosionRadius,
    craterRadius: blast.craterRadius,
    damage,
    tanks: tanks.map(({ playerId, x, y, health, alive }) => ({ playerId, x, y, health, alive })),
    killed,
  };
}

/** Explosion damage, crater carving and tanks falling onto the new ground. */
import {
  DAMAGE_FALLOFF_EXPONENT,
  DIRECT_HIT_DISTANCE,
  DIRECT_HIT_MULTIPLIER,
  FALL_DAMAGE_ENABLED,
  FALL_DAMAGE_PER_PIXEL,
  FALL_DAMAGE_THRESHOLD,
  SHIELDS_ABSORB_FALL_DAMAGE,
  TANK_HEIGHT,
  TANK_HIT_RADIUS,
} from './constants';
import { absorbDamage } from './shields';
import { maxPowerFor } from './tank';
import { carveCrater, heightAt } from './terrain';
import type { ActiveShield, DamageEvent, ExplosionEvent } from './types';

export interface SimTank {
  playerId: string;
  x: number;
  y: number;
  health: number;
  alive: boolean;
  /** Recomputed from health + powerBoost whenever the tank is hurt. */
  maxPower: number;
  /** Extra max power from repair kits this round. */
  powerBoost: number;
  shield: ActiveShield | null;
}

/**
 * Near-hit falloff: full damage at the centre, zero at the edge of the blast,
 * curved by DAMAGE_FALLOFF_EXPONENT (2 = quadratic, so closer = much more damage).
 */
export function falloffDamage(baseDamage: number, radius: number, distance: number): number {
  if (distance >= radius) return 0;
  return baseDamage * (1 - Math.max(0, distance) / radius) ** DAMAGE_FALLOFF_EXPONENT;
}

/** Damage for a direct hit: no falloff, multiplied. */
export function directHitDamage(baseDamage: number): number {
  return baseDamage * DIRECT_HIT_MULTIPLIER;
}

/** Distance from a point to the centre of a tank's body. */
export function distanceToTankCenter(tank: SimTank, x: number, y: number): number {
  return Math.hypot(tank.x - x, tank.y - TANK_HEIGHT / 2 - y);
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
  /** Tank the projectile physically struck, if any (always a direct hit). */
  hitTankId?: string;
}

/**
 * Resolve one explosion: carve the crater, damage tanks (shooter included),
 * drop tanks onto the new ground, mark destroyed tanks. Mutates terrain + tanks.
 */
export function applyExplosion(terrain: number[], tanks: SimTank[], blast: BlastSpec): ExplosionEvent {
  carveCrater(terrain, blast.x, blast.y, blast.craterRadius);

  const damage: DamageEvent[] = [];
  const hurt = (tank: SimTank, raw: number, cause: DamageEvent['cause'], direct = false) => {
    let amount = Math.round(raw);
    if (amount <= 0) return;
    let absorbed = 0;
    let shieldBroken = false;
    if (tank.shield && (cause === 'explosion' || SHIELDS_ABSORB_FALL_DAMAGE)) {
      const a = absorbDamage(tank.shield, amount);
      absorbed = a.absorbed;
      shieldBroken = a.broken;
      amount = a.passed;
      if (a.broken) tank.shield = null;
    }
    const applied = Math.min(tank.health, amount);
    if (applied <= 0 && absorbed <= 0) return;
    tank.health -= applied;
    tank.maxPower = maxPowerFor(tank.health, tank.powerBoost);
    damage.push({ playerId: tank.playerId, amount: applied, absorbed, shieldBroken, direct, sourceId: blast.sourceId, cause });
  };

  for (const tank of tanks) {
    if (!tank.alive) continue;
    const direct = tank.playerId === blast.hitTankId || distanceToTankCenter(tank, blast.x, blast.y) <= DIRECT_HIT_DISTANCE;
    const raw = direct
      ? directHitDamage(blast.damage)
      : falloffDamage(blast.damage, blast.explosionRadius, distanceToTank(tank, blast.x, blast.y));
    hurt(tank, raw, 'explosion', direct);
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
    tanks: tanks.map(({ playerId, x, y, health, alive, maxPower, shield }) => ({
      playerId,
      x,
      y,
      health,
      alive,
      maxPower,
      shield: shield ? { ...shield } : null,
    })),
    killed,
  };
}

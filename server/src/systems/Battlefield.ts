import {
  BASE_MAX_POWER,
  DEFAULT_POWER,
  DEFAULT_WEAPON_ID,
  MAX_HEALTH,
  MAX_WIND,
  MOVE_LIMIT_PER_TURN,
  REPAIR_KIT_HEALTH_RESTORE,
  REPAIR_KIT_POWER_RESTORE,
  REPAIR_KIT_RESTORES_HEALTH,
  WIND_STEP,
  WORLD_WIDTH,
} from '@shared/constants';
import type { SimTank } from '@shared/damage';
import { generateDecorations, survivingDecorations, type MapDef } from '@shared/maps';
import { simulateShot } from '@shared/physics';
import { getShield } from '@shared/shields';
import { clampAngle, clampPower, healthPowerCap, maxPowerFor, spawnPositions, stepTankMovement } from '@shared/tank';
import { carveCrater, generateTerrain, heightAt } from '@shared/terrain';
import type { Decoration, ShotResult, TankState, TankUpdate } from '@shared/types';
import type { WeaponDef } from '@shared/weapons';

/** The authoritative world for one round: map, terrain, tanks and wind. */
export class Battlefield {
  readonly terrain: number[];
  decorations: Decoration[];
  readonly tanks = new Map<string, TankState>();
  /** Extra max power from repair kits, per tank (server-side only). */
  private readonly powerBoost = new Map<string, number>();
  wind = 0;
  /** Movement intention of the current player. */
  moveDir: -1 | 0 | 1 = 0;
  shotInProgress = false;

  constructor(
    playerIds: string[],
    readonly map: MapDef,
    private rng: () => number = Math.random,
  ) {
    this.terrain = generateTerrain(rng, map.terrain);
    this.decorations = generateDecorations(map, rng);
    const xs = spawnPositions(playerIds.length, rng);
    playerIds.forEach((id, i) => {
      const x = xs[i];
      this.powerBoost.set(id, 0);
      this.tanks.set(id, {
        playerId: id,
        x,
        y: heightAt(this.terrain, x),
        health: MAX_HEALTH,
        alive: true,
        angle: x < WORLD_WIDTH / 2 ? 45 : 135, // aim toward the middle
        power: DEFAULT_POWER,
        maxPower: BASE_MAX_POWER,
        shield: null,
        fuel: 0,
        weaponId: DEFAULT_WEAPON_ID,
      });
    });
  }

  /** Random wind for a new turn, capped at ±MAX_WIND × the map's wind multiplier. */
  rollWind(): number {
    const max = MAX_WIND * (this.map.modifiers?.windMultiplier ?? 1);
    const raw = (this.rng() * 2 - 1) * max;
    this.wind = Math.round(raw / WIND_STEP) * WIND_STEP || 0;
    return this.wind;
  }

  beginTurn(playerId: string): void {
    this.moveDir = 0;
    const tank = this.tanks.get(playerId);
    if (tank) tank.fuel = MOVE_LIMIT_PER_TURN;
  }

  aliveIds(): Set<string> {
    return new Set([...this.tanks.values()].filter((t) => t.alive).map((t) => t.playerId));
  }

  /** Advance the current player's driving by dt seconds. Returns an update if they moved. */
  tickMovement(playerId: string, dt: number): TankUpdate | null {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive || this.shotInProgress || this.moveDir === 0) return null;
    if (!stepTankMovement(this.terrain, tank, this.moveDir, dt)) return null;
    return { ...tank };
  }

  setAim(playerId: string, angle: number, power: number, weaponId: string): TankUpdate | null {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive) return null;
    tank.angle = clampAngle(angle);
    tank.power = clampPower(power, tank.maxPower);
    tank.weaponId = weaponId;
    return { ...tank };
  }

  /**
   * Use one repair kit charge: raise max power (and optionally health).
   * Returns an error message if it would do nothing, otherwise null.
   */
  repair(playerId: string): string | null {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive) return 'Your tank is destroyed';
    const healthGain = REPAIR_KIT_RESTORES_HEALTH ? Math.min(REPAIR_KIT_HEALTH_RESTORE, MAX_HEALTH - tank.health) : 0;
    if (tank.maxPower >= BASE_MAX_POWER && healthGain <= 0) return 'Your tank is already at full power';
    tank.health += healthGain;
    // Never store more boost than can be used right now, so later damage still bites.
    const room = BASE_MAX_POWER - healthPowerCap(tank.health);
    const boost = Math.min(room, (this.powerBoost.get(playerId) ?? 0) + REPAIR_KIT_POWER_RESTORE);
    this.powerBoost.set(playerId, boost);
    tank.maxPower = maxPowerFor(tank.health, boost);
    return null;
  }

  /** Switch on a shield. Returns an error message, or null on success. */
  activateShield(playerId: string, shieldId: string): string | null {
    const tank = this.tanks.get(playerId);
    const def = getShield(shieldId);
    if (!tank || !tank.alive) return 'Your tank is destroyed';
    if (!def) return 'Unknown shield';
    if (tank.shield) return 'You already have a shield up';
    tank.shield = { shieldId: def.id, hp: def.hp };
    return null;
  }

  /** Run the full shot simulation and apply its results to the world. */
  fire(playerId: string, weapon: WeaponDef, angle: number, power: number): ShotResult {
    const tank = this.tanks.get(playerId)!;
    tank.angle = clampAngle(angle);
    tank.power = clampPower(power, tank.maxPower);
    tank.weaponId = weapon.id;
    this.moveDir = 0;

    const before = [...this.terrain];
    const sim: SimTank[] = [...this.tanks.values()].map(({ playerId, x, y, health, alive, maxPower, shield }) => ({
      playerId,
      x,
      y,
      health,
      alive,
      maxPower,
      powerBoost: this.powerBoost.get(playerId) ?? 0,
      shield: shield ? { ...shield } : null,
    }));
    const shot = simulateShot({
      terrain: this.terrain, // carved in place
      tanks: sim,
      shooterId: playerId,
      weapon,
      angle: tank.angle,
      power: tank.power,
      wind: this.wind,
    });
    for (const s of sim) {
      const t = this.tanks.get(s.playerId)!;
      Object.assign(t, { x: s.x, y: s.y, health: s.health, alive: s.alive, maxPower: s.maxPower, shield: s.shield });
      t.power = clampPower(t.power, t.maxPower);
    }
    // Replay the craters on the pre-shot ground exactly like clients do, to drop blown-away decorations.
    for (const ev of shot.explosions) {
      this.decorations = survivingDecorations(this.decorations, before, ev.x, ev.y, ev.craterRadius);
      carveCrater(before, ev.x, ev.y, ev.craterRadius);
    }
    return shot;
  }
}

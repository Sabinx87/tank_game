import { DEFAULT_POWER, DEFAULT_WEAPON_ID, MAX_HEALTH, MAX_WIND, MOVE_LIMIT_PER_TURN, WIND_STEP, WORLD_WIDTH } from '@shared/constants';
import type { SimTank } from '@shared/damage';
import { simulateShot } from '@shared/physics';
import { clampAngle, clampPower, spawnPositions, stepTankMovement } from '@shared/tank';
import { generateTerrain, heightAt } from '@shared/terrain';
import type { ShotResult, TankState, TankUpdate } from '@shared/types';
import type { WeaponDef } from '@shared/weapons';

/** The authoritative world for one round: terrain, tanks and wind. */
export class Battlefield {
  readonly terrain: number[];
  readonly tanks = new Map<string, TankState>();
  wind = 0;
  /** Movement intention of the current player. */
  moveDir: -1 | 0 | 1 = 0;
  shotInProgress = false;

  constructor(playerIds: string[], private rng: () => number = Math.random) {
    this.terrain = generateTerrain(rng);
    const xs = spawnPositions(playerIds.length, rng);
    playerIds.forEach((id, i) => {
      const x = xs[i];
      this.tanks.set(id, {
        playerId: id,
        x,
        y: heightAt(this.terrain, x),
        health: MAX_HEALTH,
        alive: true,
        angle: x < WORLD_WIDTH / 2 ? 45 : 135, // aim toward the middle
        power: DEFAULT_POWER,
        fuel: 0,
        weaponId: DEFAULT_WEAPON_ID,
      });
    });
  }

  /** Random wind for a new turn, capped at ±MAX_WIND. */
  rollWind(): number {
    const raw = (this.rng() * 2 - 1) * MAX_WIND;
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
    return toUpdate(tank);
  }

  setAim(playerId: string, angle: number, power: number, weaponId: string): TankUpdate | null {
    const tank = this.tanks.get(playerId);
    if (!tank || !tank.alive) return null;
    tank.angle = clampAngle(angle);
    tank.power = clampPower(power);
    tank.weaponId = weaponId;
    return toUpdate(tank);
  }

  /** Run the full shot simulation and apply its results to the world. */
  fire(playerId: string, weapon: WeaponDef, angle: number, power: number): ShotResult {
    const tank = this.tanks.get(playerId)!;
    tank.angle = clampAngle(angle);
    tank.power = clampPower(power);
    tank.weaponId = weapon.id;
    this.moveDir = 0;

    const sim: SimTank[] = [...this.tanks.values()].map(({ playerId, x, y, health, alive }) => ({ playerId, x, y, health, alive }));
    const shot = simulateShot({
      terrain: this.terrain, // carved in place
      tanks: sim,
      shooterId: playerId,
      weapon,
      angle: tank.angle,
      power: tank.power,
      wind: this.wind,
    });
    for (const s of sim) Object.assign(this.tanks.get(s.playerId)!, { x: s.x, y: s.y, health: s.health, alive: s.alive });
    return shot;
  }
}

function toUpdate(t: TankState): TankUpdate {
  return { playerId: t.playerId, x: t.x, y: t.y, angle: t.angle, power: t.power, fuel: t.fuel, weaponId: t.weaponId };
}

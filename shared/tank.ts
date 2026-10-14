/** Tank geometry and movement rules (shared so client previews match the server). */
import {
  BARREL_LENGTH,
  MAX_ANGLE,
  MAX_CLIMB_SLOPE,
  MAX_POWER,
  MIN_ANGLE,
  MIN_POWER,
  POWER_TO_SPEED,
  TANK_SPEED,
  TANK_WIDTH,
  TURRET_PIVOT_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { heightAt, type Rng } from './terrain';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const clampAngle = (a: number) => clamp(a, MIN_ANGLE, MAX_ANGLE);
export const clampPower = (p: number) => clamp(p, MIN_POWER, MAX_POWER);

const DEG = Math.PI / 180;

/** World position of the muzzle tip for a tank whose ground point is (x, y). */
export function barrelTip(x: number, y: number, angleDeg: number): { x: number; y: number } {
  return {
    x: x + Math.cos(angleDeg * DEG) * BARREL_LENGTH,
    y: y - TURRET_PIVOT_HEIGHT - Math.sin(angleDeg * DEG) * BARREL_LENGTH,
  };
}

export function launchVelocity(angleDeg: number, power: number): { vx: number; vy: number } {
  const speed = power * POWER_TO_SPEED;
  return { vx: Math.cos(angleDeg * DEG) * speed, vy: -Math.sin(angleDeg * DEG) * speed };
}

export interface MovableTank {
  x: number;
  y: number;
  fuel: number;
}

/**
 * Drive a tank along the terrain for one tick. Mutates `tank`.
 * Returns true if the tank actually moved.
 */
export function stepTankMovement(terrain: number[], tank: MovableTank, dir: -1 | 0 | 1, dt: number): boolean {
  if (dir === 0 || tank.fuel <= 0) return false;
  let dx = dir * TANK_SPEED * dt;
  if (Math.abs(dx) > tank.fuel) dx = dir * tank.fuel;
  const nx = clamp(tank.x + dx, TANK_WIDTH / 2, WORLD_WIDTH - 1 - TANK_WIDTH / 2);
  const run = Math.abs(nx - tank.x);
  if (run < 1e-6) return false;
  const ny = heightAt(terrain, nx);
  const rise = tank.y - ny; // positive = uphill
  if (rise > MAX_CLIMB_SLOPE * Math.max(run, 1)) return false; // too steep
  tank.x = Math.round(nx * 100) / 100;
  tank.y = ny;
  tank.fuel = Math.max(0, Math.round((tank.fuel - run) * 100) / 100);
  return true;
}

/** Spread `count` tanks across the map: one per equal-width slot, jittered, slots shuffled. */
export function spawnPositions(count: number, rng: Rng = Math.random): number[] {
  const margin = TANK_WIDTH * 2;
  const usable = WORLD_WIDTH - margin * 2;
  const slot = usable / count;
  const xs = Array.from({ length: count }, (_, i) =>
    Math.round(margin + slot * i + slot * (0.3 + rng() * 0.4)),
  );
  return shuffle(xs, rng);
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

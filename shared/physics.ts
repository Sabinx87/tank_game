/**
 * Deterministic fixed-timestep projectile simulation.
 * The server runs a whole shot to completion in one call and broadcasts the
 * result; clients replay the recorded tracks and explosion events.
 */
import { BEHAVIORS, type Impact, type Projectile, type ProjectileSpawn, type SimContext } from './behaviors';
import {
  GRAVITY,
  MAX_ALTITUDE_ABOVE_SCREEN,
  MAX_SHOT_SECONDS,
  PHYSICS_DT,
  TANK_HEIGHT,
  TANK_WIDTH,
  TRACK_SAMPLE_EVERY,
  WORLD_WIDTH,
} from './constants';
import { applyExplosion, type SimTank } from './damage';
import { barrelTip, launchVelocity } from './tank';
import { isSolid } from './terrain';
import type { ExplosionEvent, ProjectileTrack, ShotResult } from './types';
import type { WeaponDef } from './weapons';

export interface ShotInput {
  /** Mutated in place (craters). Pass a copy if you need the original. */
  terrain: number[];
  /** Mutated in place (health, position, alive). */
  tanks: SimTank[];
  shooterId: string;
  weapon: WeaponDef;
  angle: number;
  power: number;
  wind: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function insideTank(tank: SimTank, x: number, y: number, pad: number): boolean {
  return (
    Math.abs(x - tank.x) <= TANK_WIDTH / 2 + pad &&
    y >= tank.y - TANK_HEIGHT - 4 - pad && // a little extra for the turret dome
    y <= tank.y + pad
  );
}

interface TrackBuilder {
  track: ProjectileTrack;
  steps: number;
}

export function simulateShot(input: ShotInput): ShotResult {
  const { terrain, tanks, shooterId, weapon, wind } = input;
  const shooter = tanks.find((t) => t.playerId === shooterId);
  if (!shooter) throw new Error(`Shooter ${shooterId} has no tank`);

  const live: Projectile[] = [];
  const tracks = new Map<number, TrackBuilder>();
  const explosions: ExplosionEvent[] = [];
  let step = 0;
  let nextId = 1;
  const now = () => step * PHYSICS_DT;

  const finishTrack = (p: Projectile, end: ProjectileTrack['end']) => {
    const b = tracks.get(p.id)!;
    if (b.steps % TRACK_SAMPLE_EVERY !== 0 || b.track.points.length === 0) {
      b.track.points.push(r1(p.x), r1(p.y));
    }
    b.track.endTime = r3(b.track.startTime + b.steps * PHYSICS_DT);
    b.track.end = end;
  };

  const create = (p: Projectile) => {
    live.push(p);
    tracks.set(p.id, {
      steps: 0,
      track: {
        id: p.id,
        weaponId: p.weaponId,
        color: p.color,
        radius: p.radius,
        startTime: r3(now()),
        endTime: r3(now()),
        sampleDt: r3(PHYSICS_DT * TRACK_SAMPLE_EVERY),
        points: [r1(p.x), r1(p.y)],
        end: 'timeout',
      },
    });
    return p;
  };

  const ctx: SimContext = {
    terrain,
    wind,
    dt: PHYSICS_DT,
    get time() {
      return now();
    },
    spawn(parent: Projectile, o: ProjectileSpawn) {
      return create({
        ...parent,
        ...o,
        id: nextId++,
        params: o.params ?? parent.params,
        state: {},
        hitTankId: undefined,
        age: 0,
        alive: true,
      });
    },
    explode(p) {
      if (!p.alive) return;
      p.alive = false;
      finishTrack(p, 'explode');
      explosions.push(
        applyExplosion(terrain, tanks, {
          x: p.x,
          y: p.y,
          t: r3(now()),
          weaponId: p.weaponId,
          color: p.color,
          damage: p.damage,
          explosionRadius: p.explosionRadius,
          craterRadius: p.craterRadius,
          sourceId: p.ownerId,
          hitTankId: p.hitTankId,
        }),
      );
    },
    remove(p, reason) {
      if (!p.alive) return;
      p.alive = false;
      finishTrack(p, reason);
    },
  };

  // Launch from the muzzle.
  const tip = barrelTip(shooter.x, shooter.y, input.angle);
  const v = launchVelocity(input.angle, input.power);
  create({
    id: nextId++,
    ownerId: shooterId,
    weaponId: weapon.id,
    behavior: weapon.behavior,
    x: tip.x,
    y: tip.y,
    vx: v.vx,
    vy: v.vy,
    age: 0,
    damage: weapon.damage,
    explosionRadius: weapon.explosionRadius,
    craterRadius: weapon.craterRadius,
    color: weapon.color,
    radius: weapon.projectileRadius,
    params: { ...(weapon.params ?? {}) },
    state: {},
    armed: false,
    alive: true,
  });

  const maxSteps = Math.ceil(MAX_SHOT_SECONDS / PHYSICS_DT);
  while (live.some((p) => p.alive) && step < maxSteps) {
    step++;
    // Iterate over a snapshot: behaviors may spawn projectiles mid-step.
    for (const p of [...live]) {
      if (!p.alive) continue;
      const behavior = BEHAVIORS[p.behavior];

      // A behavior may move the projectile itself (e.g. rolling along the ground).
      if (!behavior.integrate?.(p, ctx)) {
        p.vx += wind * PHYSICS_DT;
        p.vy += GRAVITY * PHYSICS_DT;
        p.x += p.vx * PHYSICS_DT;
        p.y += p.vy * PHYSICS_DT;
      }
      p.age += PHYSICS_DT;

      const b = tracks.get(p.id)!;
      if (!p.alive) continue; // exploded inside integrate(): finishTrack already recorded its end
      b.steps++;
      if (b.steps % TRACK_SAMPLE_EVERY === 0) b.track.points.push(r1(p.x), r1(p.y));

      if (p.x < 0 || p.x >= WORLD_WIDTH || p.y < -MAX_ALTITUDE_ABOVE_SCREEN) {
        ctx.remove(p, 'lost');
        continue;
      }

      if (!p.armed && !insideTank(shooter, p.x, p.y, p.radius)) p.armed = true;

      let impact: Impact | null = null;
      for (const tank of tanks) {
        if (!tank.alive) continue;
        if (tank.playerId === p.ownerId && !p.armed) continue;
        if (insideTank(tank, p.x, p.y, p.radius * 0.5)) {
          impact = { kind: 'tank', playerId: tank.playerId };
          break;
        }
      }
      if (!impact && isSolid(terrain, p.x, p.y)) impact = { kind: 'terrain' };

      if (impact) {
        if (impact.kind === 'tank') p.hitTankId = impact.playerId;
        if (behavior.onImpact) behavior.onImpact(p, ctx, impact);
        else ctx.explode(p);
        if (!p.alive) continue;
      }
      behavior.update?.(p, ctx);
    }
    for (let i = live.length - 1; i >= 0; i--) if (!live[i].alive) live.splice(i, 1);
  }
  for (const p of live) {
    if (!p.alive) continue;
    p.alive = false;
    finishTrack(p, 'timeout');
  }

  const projectiles = [...tracks.values()].map((b) => b.track);
  return {
    shooterId,
    weaponId: weapon.id,
    angle: input.angle,
    power: input.power,
    wind,
    projectiles,
    explosions,
    duration: r3(Math.max(0, ...projectiles.map((t) => t.endTime))),
  };
}

/** Interpolated position of a recorded track at shot time t (null if not in flight). */
export function trackPositionAt(track: ProjectileTrack, t: number): { x: number; y: number } | null {
  if (t < track.startTime || t > track.endTime) return null;
  const n = track.points.length / 2;
  if (n === 1) return { x: track.points[0], y: track.points[1] };
  const timeOf = (i: number) => (i === n - 1 ? track.endTime : track.startTime + i * track.sampleDt);
  let i = Math.min(n - 2, Math.floor((t - track.startTime) / track.sampleDt));
  while (i < n - 2 && timeOf(i + 1) < t) i++;
  const t0 = timeOf(i);
  const t1 = timeOf(i + 1);
  const k = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  return {
    x: track.points[i * 2] + (track.points[i * 2 + 2] - track.points[i * 2]) * k,
    y: track.points[i * 2 + 1] + (track.points[i * 2 + 3] - track.points[i * 2 + 1]) * k,
  };
}

/**
 * BEHAVIOR REGISTRY — the logic that makes kinds of bombs different.
 *
 * A behavior can hook two moments of a projectile's life:
 *   update(p, ctx)            every physics step while flying
 *   onImpact(p, ctx, impact)  when it touches terrain or a tank (default: explode)
 *
 * Through `ctx` it can spawn new projectiles, explode, or remove a projectile.
 * To add a new kind of bomb, add one entry here and reference its key from a
 * weapon in weapons.ts.
 */
import { heightAt, surfaceNormal } from './terrain';

export interface Projectile {
  id: number;
  ownerId: string;
  weaponId: string;
  behavior: BehaviorKey;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since this projectile was spawned. */
  age: number;
  damage: number;
  explosionRadius: number;
  craterRadius: number;
  color: number;
  radius: number;
  /** Weapon's static behavior settings. */
  params: Record<string, number>;
  /** Per-projectile scratch space for behaviors (e.g. bounces used). */
  state: Record<string, number>;
  /** False until the projectile leaves the shooter's own hitbox. */
  armed: boolean;
  alive: boolean;
}

/** Fields a behavior can override when spawning a child projectile. */
export type ProjectileSpawn = Partial<
  Pick<
    Projectile,
    'behavior' | 'x' | 'y' | 'vx' | 'vy' | 'damage' | 'explosionRadius' | 'craterRadius' | 'color' | 'radius' | 'params'
  >
>;

export type Impact = { kind: 'terrain' } | { kind: 'tank'; playerId: string };

export interface SimContext {
  readonly terrain: number[];
  readonly wind: number;
  /** Seconds since the shot was fired. */
  readonly time: number;
  /** Create a new projectile, copying anything not overridden from `parent`. */
  spawn(parent: Projectile, overrides: ProjectileSpawn): Projectile;
  explode(p: Projectile): void;
  /** Remove without exploding (e.g. after splitting). */
  remove(p: Projectile, reason: 'split' | 'lost'): void;
}

export interface Behavior {
  update?(p: Projectile, ctx: SimContext): void;
  onImpact?(p: Projectile, ctx: SimContext, impact: Impact): void;
}

const single: Behavior = {};

/** Breaks into `count` bomblets at the top of its arc. */
const split: Behavior = {
  update(p, ctx) {
    if (p.vy < 0) return; // still climbing
    const count = Math.max(1, Math.round(p.params.count ?? 5));
    const spread = p.params.spread ?? 60;
    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * spread;
      ctx.spawn(p, {
        behavior: 'single',
        vx: p.vx + offset,
        vy: p.vy,
        damage: p.params.childDamage ?? p.damage * 0.8,
        explosionRadius: p.params.childExplosionRadius ?? p.explosionRadius * 0.8,
        craterRadius: p.params.childCraterRadius ?? p.craterRadius * 0.8,
        radius: Math.max(2, p.radius - 2),
        params: {},
      });
    }
    ctx.remove(p, 'split');
  },
};

/** Bounces off the ground `bounces` times, then explodes on the next impact. */
const bounce: Behavior = {
  onImpact(p, ctx, impact) {
    const used = p.state.bounces ?? 0;
    if (impact.kind !== 'terrain' || used >= (p.params.bounces ?? 1)) {
      ctx.explode(p);
      return;
    }
    p.state.bounces = used + 1;
    const { nx, ny } = surfaceNormal(ctx.terrain, p.x);
    const dot = p.vx * nx + p.vy * ny;
    const e = p.params.restitution ?? 0.6;
    p.vx = (p.vx - 2 * dot * nx) * e;
    p.vy = (p.vy - 2 * dot * ny) * e;
    p.y = heightAt(ctx.terrain, p.x) - 1;
  },
};

export const BEHAVIORS = { single, split, bounce } satisfies Record<string, Behavior>;

export type BehaviorKey = keyof typeof BEHAVIORS;

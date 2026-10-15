/**
 * WEAPON REGISTRY — weapons are pure data.
 *
 * To add a new bomb: add an entry below. That's it — the shop, weapon picker,
 * physics and damage all read from this list.
 * To add a new *kind* of bomb (new flight/impact logic): add a behavior in
 * behaviors.ts and reference its key here.
 */
import type { BehaviorKey } from './behaviors';

export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  /** Shop price in points. 0 + unlimited = always available. */
  cost: number;
  unlimited?: boolean;
  /**
   * Base damage. A direct hit deals damage × DIRECT_HIT_MULTIPLIER; a near hit
   * deals up to `damage`, falling off to 0 at explosionRadius (see damage.ts).
   */
  damage: number;
  explosionRadius: number;
  craterRadius: number;
  /** Projectile colour (0xRRGGBB) and draw radius in px. */
  color: number;
  projectileRadius: number;
  /** Which behavior function drives this projectile (see behaviors.ts). */
  behavior: BehaviorKey;
  /** Behavior-specific settings, e.g. split count or bounce count. */
  params?: Record<string, number>;
  /** Optional fancier trail (purely visual): colours from head to tail, length in seconds, dot size factor. */
  trail?: { colors: number[]; seconds: number; size: number };
}

// Balance: with DIRECT_HIT_MULTIPLIER = 2 and MAX_HEALTH = 100, a direct Volcano
// hit takes 38 HP and a direct Atom hit 96 HP (almost a one-shot kill).
export const WEAPONS: WeaponDef[] = [
  {
    id: 'volcano',
    name: 'Volcano Bomb',
    description: 'Free starter shell. Small blast.',
    cost: 0,
    unlimited: true,
    damage: 19,
    explosionRadius: 42,
    craterRadius: 26,
    color: 0xff7b29,
    projectileRadius: 4,
    behavior: 'single',
  },
  {
    id: 'shower',
    name: 'Shower Bomb',
    description: 'Splits into 5 bomblets at the top of its arc.',
    cost: 120,
    damage: 14,
    explosionRadius: 34,
    craterRadius: 22,
    color: 0x5ad1ff,
    projectileRadius: 5,
    behavior: 'split',
    params: { count: 5, spread: 70, childDamage: 13, childExplosionRadius: 34, childCraterRadius: 20 },
  },
  {
    id: 'hot-shower',
    name: 'Hot Shower',
    description: 'A blazing Shower Bomb: 8 bigger, hotter bomblets.',
    cost: 260,
    damage: 18,
    explosionRadius: 42,
    craterRadius: 26,
    color: 0xff4a1c,
    projectileRadius: 6,
    behavior: 'split',
    params: { count: 8, spread: 95, childDamage: 17, childExplosionRadius: 42, childCraterRadius: 25 },
    trail: { colors: [0xffe45c, 0xff9a1f, 0xff4a10, 0xc41a00], seconds: 0.45, size: 1.3 },
  },
  {
    id: 'digger',
    name: 'Digger',
    description: 'Carves a huge crater, barely scratches tanks.',
    cost: 80,
    damage: 6,
    explosionRadius: 45,
    craterRadius: 80,
    color: 0xc49a6c,
    projectileRadius: 5,
    behavior: 'single',
  },
  {
    id: 'bouncer',
    name: 'Bouncer',
    description: 'Bounces off the ground once before exploding.',
    cost: 150,
    damage: 26,
    explosionRadius: 55,
    craterRadius: 34,
    color: 0x7dff7a,
    projectileRadius: 5,
    behavior: 'bounce',
    params: { bounces: 1, restitution: 0.65 },
  },
  {
    id: 'ball-v2',
    name: 'Ball V2',
    description: 'Lands, rolls uphill to the nearest peak, then explodes. Great vs. hill campers.',
    cost: 180,
    damage: 28,
    explosionRadius: 60,
    craterRadius: 36,
    color: 0xd9d9e8,
    projectileRadius: 6,
    behavior: 'climbToPeak',
    params: { maxRoll: 320, rollSpeed: 160, minClimb: 3 },
  },
  {
    id: 'atom',
    name: 'Atom Bomb',
    description: 'Enormous blast. Expensive. Keep your distance.',
    cost: 400,
    damage: 48,
    explosionRadius: 150,
    craterRadius: 95,
    color: 0xfff35c,
    projectileRadius: 7,
    behavior: 'single',
  },
];

const BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

export function getWeapon(id: string): WeaponDef | undefined {
  return BY_ID.get(id);
}

/** How many of a weapon a player owns (Infinity for unlimited weapons). */
export function ownedCount(inventory: Record<string, number>, weaponId: string): number {
  const w = getWeapon(weaponId);
  if (!w) return 0;
  if (w.unlimited) return Infinity;
  return inventory[weaponId] ?? 0;
}

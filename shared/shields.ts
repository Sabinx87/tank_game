/**
 * SHIELD REGISTRY — shield levels are pure data.
 *
 * To add a new shield level: add an entry below. The shop, the in-game shield
 * buttons, server validation and damage absorption all read from this list.
 */
import type { ActiveShield } from './types';

export interface ShieldDef {
  id: string;
  name: string;
  /** Shown as "L1", "L2"… and used to pick the best shield for the E key. */
  level: number;
  description: string;
  /** Shop price in points. */
  cost: number;
  /** Fraction (0–1) of every incoming hit the shield soaks up. */
  absorb: number;
  /** Total damage the shield can soak up before it pops. */
  hp: number;
  /** Bubble / HUD colour (0xRRGGBB). */
  color: number;
}

export const SHIELDS: ShieldDef[] = [
  {
    id: 'shield-1',
    name: 'Light Shield',
    level: 1,
    description: 'A thin bubble. Takes the edge off a hit or two.',
    cost: 60,
    absorb: 0.3,
    hp: 30,
    color: 0x8fe3ff,
  },
  {
    id: 'shield-2',
    name: 'Guard Shield',
    level: 2,
    description: 'Solid protection that halves incoming damage.',
    cost: 140,
    absorb: 0.5,
    hp: 60,
    color: 0x4aa8ff,
  },
  {
    id: 'shield-3',
    name: 'Fortress Shield',
    level: 3,
    description: 'Heavy barrier. Shrugs off most of a big blast.',
    cost: 260,
    absorb: 0.7,
    hp: 100,
    color: 0x8a7dff,
  },
];

const BY_ID = new Map(SHIELDS.map((s) => [s.id, s]));

export function getShield(id: string): ShieldDef | undefined {
  return BY_ID.get(id);
}

/** Owned shields, best (highest level) first. */
export function ownedShields(shields: Record<string, number>): ShieldDef[] {
  return SHIELDS.filter((s) => (shields[s.id] ?? 0) > 0).sort((a, b) => b.level - a.level);
}

export interface Absorption {
  /** Damage the shield soaked up (subtracted from its HP). */
  absorbed: number;
  /** Damage that gets through to the tank. */
  passed: number;
  /** True if this hit took the shield to 0 HP. */
  broken: boolean;
}

/**
 * Split a (whole-number) hit between an active shield and the tank. Mutates
 * `shield.hp`. Once the shield runs out, the rest of the hit goes to the tank.
 */
export function absorbDamage(shield: ActiveShield, amount: number): Absorption {
  const def = getShield(shield.shieldId);
  if (!def || shield.hp <= 0 || amount <= 0) return { absorbed: 0, passed: amount, broken: false };
  const absorbed = Math.min(shield.hp, Math.round(amount * def.absorb));
  shield.hp -= absorbed;
  return { absorbed, passed: amount - absorbed, broken: shield.hp <= 0 };
}

/**
 * The shop catalogue, built from the registries. Each section turns registry
 * entries into ShopItems; the shop page renders sections in order and the
 * server buys through the same functions, so there's one source of truth.
 */
import { REPAIR_KIT_CAPACITY, REPAIR_KIT_HEALTH_RESTORE, REPAIR_KIT_POWER_RESTORE, REPAIR_KIT_PRICE, REPAIR_KIT_RESTORES_HEALTH } from './constants';
import { SHIELDS } from './shields';
import type { Holdings } from './types';
import { WEAPONS, ownedCount } from './weapons';

export type ShopCategory = 'weapon' | 'shield' | 'repair';

export interface ShopItem {
  category: ShopCategory;
  id: string;
  name: string;
  description: string;
  /** One-line stats, e.g. "DMG 19 · Blast 40". */
  stats: string;
  cost: number;
  color: number;
  /** Free and unlimited: shown in the shop but can't be bought. */
  free?: boolean;
  /** Most a player may hold (undefined = no limit). */
  max?: number;
}

/** Id of the single repair-kit shop item. */
export const REPAIR_KIT_ITEM_ID = 'repair-kit';

interface Section {
  category: ShopCategory;
  title: string;
  items: ShopItem[];
  owned(h: Holdings, id: string): number;
  /** Give one of `id` to the player (after the price has been paid). */
  grant(h: Holdings, id: string): void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const SHOP_SECTIONS: Section[] = [
  {
    category: 'weapon',
    title: 'Bombs',
    items: WEAPONS.map((w) => ({
      category: 'weapon',
      id: w.id,
      name: w.name,
      description: w.description,
      stats: `DMG ${w.params?.childDamage ?? w.damage}${w.params?.count ? ` ×${w.params.count}` : ''} · Blast ${w.params?.childExplosionRadius ?? w.explosionRadius} · Crater ${w.params?.childCraterRadius ?? w.craterRadius}`,
      cost: w.cost,
      color: w.color,
      free: w.unlimited,
    })),
    owned: (h, id) => ownedCount(h.inventory, id),
    grant: (h, id) => {
      h.inventory[id] = (h.inventory[id] ?? 0) + 1;
    },
  },
  {
    category: 'shield',
    title: 'Shields',
    items: SHIELDS.map((s) => ({
      category: 'shield',
      id: s.id,
      name: `${s.name} (L${s.level})`,
      description: s.description,
      stats: `Absorbs ${pct(s.absorb)} · Shield HP ${s.hp}`,
      cost: s.cost,
      color: s.color,
    })),
    owned: (h, id) => h.shields[id] ?? 0,
    grant: (h, id) => {
      h.shields[id] = (h.shields[id] ?? 0) + 1;
    },
  },
  {
    category: 'repair',
    title: 'Repair Kits',
    items: [
      {
        category: 'repair',
        id: REPAIR_KIT_ITEM_ID,
        name: 'Repair Kit charge',
        description: 'Press R on your turn to restore firing power. Does not end your turn.',
        stats: `+${REPAIR_KIT_POWER_RESTORE} max power${REPAIR_KIT_RESTORES_HEALTH ? ` · +${REPAIR_KIT_HEALTH_RESTORE} HP` : ''} · Holds ${REPAIR_KIT_CAPACITY}`,
        cost: REPAIR_KIT_PRICE,
        color: 0x9be37a,
        max: REPAIR_KIT_CAPACITY,
      },
    ],
    owned: (h) => h.repairKits,
    grant: (h) => {
      h.repairKits = Math.min(REPAIR_KIT_CAPACITY, h.repairKits + 1);
    },
  },
];

export const isShopCategory = (v: unknown): v is ShopCategory => SHOP_SECTIONS.some((s) => s.category === v);

function section(category: ShopCategory): Section {
  return SHOP_SECTIONS.find((s) => s.category === category)!;
}

export function findShopItem(category: ShopCategory, id: string): ShopItem | undefined {
  return section(category).items.find((i) => i.id === id);
}

export function ownedOf(h: Holdings, category: ShopCategory, id: string): number {
  return section(category).owned(h, id);
}

/**
 * Buy one item: checks the price and the holding limit, then deducts points
 * and grants it. Returns an error message, or null on success. Mutates `buyer`.
 */
export function buyItem(buyer: Holdings & { points: number }, category: ShopCategory, id: string): string | null {
  const item = findShopItem(category, id);
  if (!item) return 'Unknown item';
  if (item.free) return `${item.name} is free and unlimited`;
  if (item.max !== undefined && ownedOf(buyer, category, id) >= item.max) return `You can't carry more than ${item.max}`;
  if (buyer.points < item.cost) return 'Not enough points';
  buyer.points -= item.cost;
  section(category).grant(buyer, id);
  return null;
}

import { getWeapon } from '@shared/weapons';
import type { Player } from '../Player';

/** Buying weapons between rounds. Returns an error message, or null on success. */
export function buyWeapon(player: Player, weaponId: string): string | null {
  const weapon = getWeapon(weaponId);
  if (!weapon) return 'Unknown weapon';
  if (weapon.unlimited) return `${weapon.name} is free and unlimited`;
  if (player.points < weapon.cost) return 'Not enough points';
  player.points -= weapon.cost;
  player.inventory[weapon.id] = (player.inventory[weapon.id] ?? 0) + 1;
  return null;
}

/** True if the player may fire this weapon right now. */
export function canUseWeapon(player: Player, weaponId: string): boolean {
  const weapon = getWeapon(weaponId);
  if (!weapon) return false;
  return weapon.unlimited === true || (player.inventory[weaponId] ?? 0) > 0;
}

/** Remove one round of ammunition (no-op for unlimited weapons). */
export function consumeWeapon(player: Player, weaponId: string): void {
  const weapon = getWeapon(weaponId);
  if (!weapon || weapon.unlimited) return;
  const left = (player.inventory[weaponId] ?? 0) - 1;
  if (left > 0) player.inventory[weaponId] = left;
  else delete player.inventory[weaponId];
}

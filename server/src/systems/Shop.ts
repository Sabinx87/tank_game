import { getWeapon } from '@shared/weapons';
import type { Player } from '../Player';

// Buying is shared with the shop page: see buyItem() in shared/shop.ts.

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

/** Take one shield out of the player's stock. */
export function consumeShield(player: Player, shieldId: string): void {
  const left = (player.shields[shieldId] ?? 0) - 1;
  if (left > 0) player.shields[shieldId] = left;
  else delete player.shields[shieldId];
}

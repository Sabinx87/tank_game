/** Guards for every value that arrives from a client. Never trust the wire. */
import { MAX_NAME_LENGTH, PLAYER_COLORS, ROOM_CODE_LENGTH } from '@shared/constants';
import type { ColorId } from '@shared/types';
import { getWeapon } from '@shared/weapons';

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const isRoomCode = (v: unknown): v is string =>
  typeof v === 'string' && new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(v);

export const isColorId = (v: unknown): v is ColorId =>
  typeof v === 'string' && PLAYER_COLORS.some((c) => c.id === v);

export const isMoveDir = (v: unknown): v is -1 | 0 | 1 => v === -1 || v === 0 || v === 1;

export const isWeaponId = (v: unknown): v is string => typeof v === 'string' && getWeapon(v) !== undefined;

/** Trim, collapse whitespace, strip control characters; null if empty or too long. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

/** Wrap a possibly-missing ack callback so handlers can always call it. */
export function safeAck<T extends (...args: never[]) => void>(ack: unknown): T {
  return (typeof ack === 'function' ? ack : () => {}) as T;
}

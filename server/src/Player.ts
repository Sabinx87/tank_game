import { randomBytes, randomUUID } from 'node:crypto';
import { STARTING_INVENTORY, STARTING_POINTS } from '@shared/constants';
import type { ColorId, Inventory, PlayerInfo } from '@shared/types';

/** Server-side record of a seat in a room. The token is secret and never broadcast. */
export class Player {
  readonly id = randomUUID();
  readonly token = randomBytes(18).toString('base64url');
  socketId: string | null;
  name = '';
  color: ColorId | null = null;
  points = STARTING_POINTS;
  inventory: Inventory = { ...STARTING_INVENTORY };
  ready = false;
  /** Epoch ms when the socket dropped; null while connected. */
  disconnectedAt: number | null = null;
  /** Set when the player left on purpose — their seat cannot be reclaimed. */
  left = false;

  constructor(socketId: string) {
    this.socketId = socketId;
  }

  get connected(): boolean {
    return this.socketId !== null;
  }

  get hasProfile(): boolean {
    return this.name.length > 0 && this.color !== null;
  }

  resetForNewGame(): void {
    this.points = STARTING_POINTS;
    this.inventory = { ...STARTING_INVENTORY };
    this.ready = false;
  }

  toInfo(hostId: string): PlayerInfo {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      isHost: this.id === hostId,
      connected: this.connected,
      points: this.points,
      inventory: { ...this.inventory },
      ready: this.ready,
    };
  }
}

import { ROOM_CODE_LENGTH } from '@shared/constants';
import { GameRoom } from './GameRoom';
import type { IO } from './io';

/** Creates rooms with unique random codes and deletes them once they're empty. */
export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();

  constructor(private readonly io: IO) {}

  create(): GameRoom | null {
    const code = this.generateCode();
    if (!code) return null;
    const room = new GameRoom(code, this.io, (r) => this.rooms.delete(r.code));
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Stop every room's timers (used on shutdown). */
  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.destroy();
  }

  private generateCode(): string | null {
    const min = 10 ** (ROOM_CODE_LENGTH - 1); // no leading zeros: easier to read aloud
    const span = 10 ** ROOM_CODE_LENGTH - min;
    if (this.rooms.size >= span) return null;
    for (let attempt = 0; attempt < 1000; attempt++) {
      const code = String(min + Math.floor(Math.random() * span));
      if (!this.rooms.has(code)) return code;
    }
    for (let n = min; n < min + span; n++) if (!this.rooms.has(String(n))) return String(n);
    return null;
  }
}

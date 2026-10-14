import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types';

export interface SocketData {
  code?: string;
  playerId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type IO = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

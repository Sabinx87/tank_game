/** Typed Socket.IO connection + promise wrappers for request/response events. */
import { io, type Socket } from 'socket.io-client';
import type { ShopCategory } from '@shared/shop';
import type { AckResult, ClientToServerEvents, ColorId, JoinedRoom, ServerToClientEvents } from '@shared/types';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same origin: Vite proxies /socket.io in dev, the Node server serves both in prod.
export const socket: ClientSocket = io();

const call = <T>(send: (ack: (res: AckResult<T>) => void) => void, timeoutMs = 8000) =>
  new Promise<AckResult<T>>((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'Server did not respond' }), timeoutMs);
    send((res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });

export const api = {
  createRoom: () => call<JoinedRoom>((ack) => socket.emit('room:create', ack)),
  joinRoom: (code: string) => call<JoinedRoom>((ack) => socket.emit('room:join', { code }, ack)),
  rejoinRoom: (code: string, token: string) => call<JoinedRoom>((ack) => socket.emit('room:rejoin', { code, token }, ack)),
  leaveRoom: () => socket.emit('room:leave'),
  setProfile: (profile: { name?: string; color?: ColorId }) => call<null>((ack) => socket.emit('room:profile', profile, ack)),
  setMap: (mapId: string) => call<null>((ack) => socket.emit('room:map', { mapId }, ack)),
  startGame: () => call<null>((ack) => socket.emit('room:start', ack)),
  backToLobby: () => socket.emit('room:backToLobby'),

  move: (dir: -1 | 0 | 1) => socket.emit('game:move', { dir }),
  aim: (angle: number, power: number, weaponId: string) => socket.emit('game:aim', { angle, power, weaponId }),
  fire: (angle: number, power: number, weaponId: string) =>
    call<null>((ack) => socket.emit('game:fire', { angle, power, weaponId }, ack)),
  repair: () => call<null>((ack) => socket.emit('game:repair', ack)),
  activateShield: (shieldId: string) => call<null>((ack) => socket.emit('game:shield', { shieldId }, ack)),

  buy: (category: ShopCategory, itemId: string) => call<null>((ack) => socket.emit('shop:buy', { category, itemId }, ack)),
  setReady: (ready: boolean) => socket.emit('shop:ready', { ready }),
};

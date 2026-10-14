import type { Ack, JoinedRoom } from '@shared/types';
import type { GameSocket, IO } from './io';
import type { RoomManager } from './RoomManager';
import { isObject, isRoomCode, safeAck } from './validation';

/** Wires every client event to the room the socket belongs to. */
export function registerSocketHandlers(io: IO, rooms: RoomManager): void {
  io.on('connection', (socket: GameSocket) => {
    const currentRoom = () => {
      const { code, playerId } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      return room && playerId ? { room, playerId } : null;
    };

    /** A socket can only sit in one room: leave the old one before joining another. */
    const leaveCurrent = () => {
      const cur = currentRoom();
      if (cur) cur.room.leave(socket, cur.playerId);
    };

    // ------------------------------------------------------------ lobby
    socket.on('room:create', (ack) => {
      const reply = safeAck<Ack<JoinedRoom>>(ack);
      leaveCurrent();
      const room = rooms.create();
      if (!room) return reply({ ok: false, error: 'Server is full, try again later' });
      reply(room.join(socket));
    });

    socket.on('room:join', (payload, ack) => {
      const reply = safeAck<Ack<JoinedRoom>>(ack);
      const code = isObject(payload) ? payload.code : undefined;
      if (!isRoomCode(code)) return reply({ ok: false, error: 'Room codes are 4 digits' });
      const room = rooms.get(code);
      if (!room) return reply({ ok: false, error: `No room with code ${code}` });
      leaveCurrent();
      reply(room.join(socket));
    });

    socket.on('room:rejoin', (payload, ack) => {
      const reply = safeAck<Ack<JoinedRoom>>(ack);
      if (!isObject(payload) || !isRoomCode(payload.code) || typeof payload.token !== 'string') {
        return reply({ ok: false, error: 'Invalid rejoin request' });
      }
      const room = rooms.get(payload.code);
      if (!room) return reply({ ok: false, error: 'That room no longer exists' });
      reply(room.rejoin(socket, payload.token));
    });

    socket.on('room:leave', () => leaveCurrent());

    socket.on('room:profile', (payload, ack) => {
      const reply = safeAck<Ack<null>>(ack);
      const cur = currentRoom();
      if (!cur) return reply({ ok: false, error: 'You are not in a room' });
      if (!isObject(payload)) return reply({ ok: false, error: 'Invalid profile' });
      reply(cur.room.setProfile(cur.playerId, payload));
    });

    socket.on('room:start', (ack) => {
      const reply = safeAck<Ack<null>>(ack);
      const cur = currentRoom();
      if (!cur) return reply({ ok: false, error: 'You are not in a room' });
      reply(cur.room.start(cur.playerId));
    });

    socket.on('room:backToLobby', () => {
      const cur = currentRoom();
      if (cur) cur.room.backToLobby(cur.playerId);
    });

    // ------------------------------------------------------------ game
    socket.on('game:move', (payload) => {
      const cur = currentRoom();
      if (cur && isObject(payload)) cur.room.move(cur.playerId, payload.dir);
    });

    socket.on('game:aim', (payload) => {
      const cur = currentRoom();
      if (cur && isObject(payload)) cur.room.aim(cur.playerId, payload);
    });

    socket.on('game:fire', (payload, ack) => {
      const reply = safeAck<Ack<null>>(ack);
      const cur = currentRoom();
      if (!cur) return reply({ ok: false, error: 'You are not in a room' });
      if (!isObject(payload)) return reply({ ok: false, error: 'Invalid shot' });
      reply(cur.room.fire(cur.playerId, payload));
    });

    // ------------------------------------------------------------ shop
    socket.on('shop:buy', (payload, ack) => {
      const reply = safeAck<Ack<null>>(ack);
      const cur = currentRoom();
      if (!cur) return reply({ ok: false, error: 'You are not in a room' });
      reply(cur.room.buy(cur.playerId, isObject(payload) ? payload.weaponId : undefined));
    });

    socket.on('shop:ready', (payload) => {
      const cur = currentRoom();
      if (cur && isObject(payload)) cur.room.setReady(cur.playerId, payload.ready);
    });

    socket.on('disconnect', () => {
      const cur = currentRoom();
      if (cur) cur.room.handleDisconnect(cur.playerId, socket.id);
    });
  });
}

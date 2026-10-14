import { api } from './net';
import { store } from './store';

/** Leave the current room and go back to the home page. */
export function leaveRoom(): void {
  api.leaveRoom();
  store.setSession(null);
  store.room = null;
  store.game = null;
  store.emit('room', null);
}

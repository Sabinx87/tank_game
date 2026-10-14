/** Client-side copy of what the server last told us, plus a tiny event emitter. */
import { PLAYER_COLORS } from '@shared/constants';
import type { GameState, JoinedRoom, PlayerInfo, RoomState, ShotResult, TankUpdate } from '@shared/types';

type Events = {
  room: RoomState | null;
  game: GameState;
  tank: TankUpdate;
  shot: ShotResult;
  turnSkipped: { playerId: string; reason: 'timeout' | 'disconnected' };
};
type Listener<K extends keyof Events> = (payload: Events[K]) => void;

const SESSION_KEY = 'tanks.session';

class Store {
  room: RoomState | null = null;
  game: GameState | null = null;
  session: JoinedRoom | null = loadSession();
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => (fn as Listener<K>)(payload));
  }

  setSession(s: JoinedRoom | null): void {
    this.session = s;
    // sessionStorage is per-tab, so several tabs can be several players.
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  }

  get myId(): string | null {
    return this.session?.playerId ?? null;
  }

  get me(): PlayerInfo | undefined {
    return this.player(this.myId);
  }

  player(id: string | null | undefined): PlayerInfo | undefined {
    return id ? this.room?.players.find((p) => p.id === id) : undefined;
  }
}

function loadSession(): JoinedRoom | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as JoinedRoom) : null;
  } catch {
    return null;
  }
}

export const store = new Store();

export function colorOf(colorId: string | null | undefined) {
  return PLAYER_COLORS.find((c) => c.id === colorId) ?? { id: 'grey', label: 'Grey', hex: 0x999999, css: '#999999' };
}

export function playerName(p: PlayerInfo | undefined): string {
  return p?.name || 'Player';
}

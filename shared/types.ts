/**
 * Shared data types and the complete Socket.IO event contract.
 * Event names + payloads are defined ONLY here; client and server both use
 * these interfaces as Socket.IO generics, so a typo is a compile error.
 */
import type { PLAYER_COLORS } from './constants';

export type ColorId = (typeof PLAYER_COLORS)[number]['id'];

export type Phase = 'lobby' | 'playing' | 'roundEnd' | 'finished';

/** weaponId -> count. Unlimited weapons are not stored (see weapons.ts). */
export type Inventory = Record<string, number>;

export interface PlayerInfo {
  id: string;
  name: string;
  color: ColorId | null;
  isHost: boolean;
  connected: boolean;
  points: number;
  inventory: Inventory;
  /** Shop "Ready" flag between rounds. */
  ready: boolean;
}

export interface RoundResultEntry {
  playerId: string;
  kills: number;
  damageDealt: number;
  survived: boolean;
  pointsEarned: number;
  totalPoints: number;
}

export interface RoundResults {
  round: number;
  totalRounds: number;
  winnerId: string | null;
  entries: RoundResultEntry[];
  isFinal: boolean;
}

export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string;
  players: PlayerInfo[];
  round: number;
  totalRounds: number;
  /** Results of the last finished round (shown on the shop / final screens). */
  lastRoundResults: RoundResults | null;
}

export interface TankState {
  playerId: string;
  /** Bottom-centre of the tank, sitting on the terrain. */
  x: number;
  y: number;
  health: number;
  alive: boolean;
  /** Degrees: 0 = right, 90 = up, 180 = left. */
  angle: number;
  power: number;
  /** Remaining horizontal movement this turn (px). */
  fuel: number;
  /** Currently selected weapon (so others can see it). */
  weaponId: string;
}

export interface GameState {
  round: number;
  totalRounds: number;
  /** Heightmap: terrain[x] = y of the ground surface at column x. */
  terrain: number[];
  tanks: TankState[];
  turnOrder: string[];
  currentPlayerId: string | null;
  /** Horizontal acceleration px/s² (negative = blowing left). */
  wind: number;
  /** Milliseconds left in the current turn at the moment the state was sent. */
  turnTimeLeftMs: number;
  shotInProgress: boolean;
}

/** Small, frequent update for one tank (driving / aiming). */
export interface TankUpdate {
  playerId: string;
  x: number;
  y: number;
  angle: number;
  power: number;
  fuel: number;
  weaponId: string;
}

// ---------------------------------------------------------------- shots

export interface ProjectileTrack {
  id: number;
  weaponId: string;
  color: number;
  radius: number;
  /** Seconds since the shot started. */
  startTime: number;
  endTime: number;
  /** Seconds between samples. */
  sampleDt: number;
  /** Flat [x0, y0, x1, y1, ...] positions. */
  points: number[];
  end: 'explode' | 'lost' | 'split' | 'timeout';
}

export interface DamageEvent {
  playerId: string;
  amount: number;
  /** Who caused it (the shooter). */
  sourceId: string;
  cause: 'explosion' | 'fall';
}

export interface ExplosionEvent {
  t: number;
  x: number;
  y: number;
  weaponId: string;
  color: number;
  explosionRadius: number;
  craterRadius: number;
  damage: DamageEvent[];
  /** Tank positions/health right after this explosion (and any falling). */
  tanks: Pick<TankState, 'playerId' | 'x' | 'y' | 'health' | 'alive'>[];
  /** Tanks destroyed by this explosion. */
  killed: string[];
}

export interface ShotResult {
  shooterId: string;
  weaponId: string;
  angle: number;
  power: number;
  wind: number;
  projectiles: ProjectileTrack[];
  explosions: ExplosionEvent[];
  /** Seconds until the last projectile ended. */
  duration: number;
}

// ---------------------------------------------------------------- socket contract

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T> = (res: AckResult<T>) => void;

export interface JoinedRoom {
  code: string;
  playerId: string;
  /** Secret used to reclaim this seat after a disconnect. Never broadcast. */
  token: string;
}

export interface ClientToServerEvents {
  'room:create': (ack: Ack<JoinedRoom>) => void;
  'room:join': (payload: { code: string }, ack: Ack<JoinedRoom>) => void;
  'room:rejoin': (payload: { code: string; token: string }, ack: Ack<JoinedRoom>) => void;
  'room:leave': () => void;
  'room:profile': (payload: { name?: string; color?: ColorId }, ack: Ack<null>) => void;
  'room:start': (ack: Ack<null>) => void;
  /** Host only, after the final leaderboard: everyone goes back to the waiting room. */
  'room:backToLobby': () => void;

  /** -1 = left, 0 = stop, 1 = right. */
  'game:move': (payload: { dir: -1 | 0 | 1 }) => void;
  'game:aim': (payload: { angle: number; power: number; weaponId: string }) => void;
  'game:fire': (payload: { angle: number; power: number; weaponId: string }, ack: Ack<null>) => void;

  'shop:buy': (payload: { weaponId: string }, ack: Ack<null>) => void;
  'shop:ready': (payload: { ready: boolean }) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'game:state': (state: GameState) => void;
  'game:tank': (update: TankUpdate) => void;
  'game:shot': (shot: ShotResult) => void;
  'game:turnSkipped': (payload: { playerId: string; reason: 'timeout' | 'disconnected' }) => void;
  'server:error': (message: string) => void;
}

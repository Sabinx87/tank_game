/**
 * Shared data types and the complete Socket.IO event contract.
 * Event names + payloads are defined ONLY here; client and server both use
 * these interfaces as Socket.IO generics, so a typo is a compile error.
 */
import type { PLAYER_COLORS } from './constants';
import type { ShopCategory } from './shop';

export type ColorId = (typeof PLAYER_COLORS)[number]['id'];

export type Phase = 'lobby' | 'playing' | 'roundEnd' | 'finished';

/** weaponId -> count. Unlimited weapons are not stored (see weapons.ts). */
export type Inventory = Record<string, number>;

/** Everything a player can own and buy in the shop. */
export interface Holdings {
  inventory: Inventory;
  /** shieldId -> count of unused shields. */
  shields: Record<string, number>;
  /** Repair kit charges (0 … REPAIR_KIT_CAPACITY). */
  repairKits: number;
}

export interface PlayerInfo extends Holdings {
  id: string;
  name: string;
  color: ColorId | null;
  isHost: boolean;
  connected: boolean;
  points: number;
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
  /** Map chosen by the host in the waiting room (a map id or RANDOM_MAP_ID). */
  mapId: string;
  /** Results of the last finished round (shown on the shop / final screens). */
  lastRoundResults: RoundResults | null;
}

/** A shield that has been switched on and is soaking up damage. */
export interface ActiveShield {
  shieldId: string;
  /** Remaining shield HP. The shield disappears at 0. */
  hp: number;
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
  /** Highest power this tank can fire with right now (drops with damage, raised by repair kits). */
  maxPower: number;
  shield: ActiveShield | null;
  /** Remaining horizontal movement this turn (px). */
  fuel: number;
  /** Currently selected weapon (so others can see it). */
  weaponId: string;
}

/** A purely decorative object standing on the ground (tree, cactus, rock…). */
export interface Decoration {
  /** Key into the client's decoration drawers (see maps.ts DecorationKind). */
  kind: string;
  x: number;
  scale: number;
}

export interface GameState {
  round: number;
  totalRounds: number;
  /** The map actually being played this round (never RANDOM_MAP_ID). */
  mapId: string;
  /** Heightmap: terrain[x] = y of the ground surface at column x. */
  terrain: number[];
  decorations: Decoration[];
  tanks: TankState[];
  turnOrder: string[];
  currentPlayerId: string | null;
  /** Horizontal acceleration px/s² (negative = blowing left). */
  wind: number;
  /** Milliseconds left in the current turn at the moment the state was sent. */
  turnTimeLeftMs: number;
  shotInProgress: boolean;
}

/** Frequent update for one tank (driving, aiming, repairing, shielding). */
export type TankUpdate = TankState;

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
  /** Damage that reached the tank's health. */
  amount: number;
  /** Damage soaked up by an active shield. */
  absorbed: number;
  /** This hit popped the tank's shield. */
  shieldBroken: boolean;
  /** Direct hit (body hit or blast right on the tank) — used for the "DIRECT HIT!" label. */
  direct: boolean;
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
  tanks: Pick<TankState, 'playerId' | 'x' | 'y' | 'health' | 'alive' | 'maxPower' | 'shield'>[];
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
  /** Host only, in the waiting room: a map id or RANDOM_MAP_ID. */
  'room:map': (payload: { mapId: string }, ack: Ack<null>) => void;
  /** Host only, after the final leaderboard: everyone goes back to the waiting room. */
  'room:backToLobby': () => void;

  /** -1 = left, 0 = stop, 1 = right. */
  'game:move': (payload: { dir: -1 | 0 | 1 }) => void;
  'game:aim': (payload: { angle: number; power: number; weaponId: string }) => void;
  'game:fire': (payload: { angle: number; power: number; weaponId: string }, ack: Ack<null>) => void;
  /** Use one repair kit charge (does not end the turn). */
  'game:repair': (ack: Ack<null>) => void;
  /** Switch on one owned shield (does not end the turn). */
  'game:shield': (payload: { shieldId: string }, ack: Ack<null>) => void;

  'shop:buy': (payload: { category: ShopCategory; itemId: string }, ack: Ack<null>) => void;
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

/**
 * Every tunable number in the game lives here.
 * Both the server (authoritative simulation) and the client (rendering) import
 * these, so changing a value here changes it everywhere.
 */

// ---------------------------------------------------------------- world
/** Logical world size in pixels. The client scales the canvas to fit the window. */
export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 900;
/** Highest point terrain may be generated at (fraction of world height from the top). */
export const TERRAIN_MIN_HEIGHT_RATIO = 0.32;
/** Lowest point terrain may be generated at (fraction of world height from the top). */
export const TERRAIN_MAX_HEIGHT_RATIO = 0.86;
/** Craters never dig below this many pixels above the bottom of the world. */
export const TERRAIN_FLOOR_THICKNESS = 6;

// ---------------------------------------------------------------- rooms
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYERS = 5;
export const MIN_PLAYERS_TO_START = 2;
export const MAX_NAME_LENGTH = 16;
/** How long a disconnected player can come back and take their seat again. */
export const RECONNECT_WINDOW_MS = 60_000;
/** In the waiting room a disconnected player is removed after this delay. */
export const LOBBY_DISCONNECT_GRACE_MS = 10_000;
/** A room with nobody connected is deleted after this delay. */
export const EMPTY_ROOM_TTL_MS = RECONNECT_WINDOW_MS;

// ---------------------------------------------------------------- physics
/** Downward acceleration, px/s². */
export const GRAVITY = 300;
/** Wind is a horizontal acceleration in px/s², random in [-MAX_WIND, MAX_WIND] each turn. */
export const MAX_WIND = 40;
/** Wind values are rounded to this step so the HUD shows clean numbers. */
export const WIND_STEP = 2;
/** Fixed simulation timestep (seconds). Same on client and server. */
export const PHYSICS_DT = 1 / 120;
/** A projectile track records one sample every N physics steps (client interpolates). */
export const TRACK_SAMPLE_EVERY = 4;
/** Hard cap on how long a single shot may be simulated (seconds). */
export const MAX_SHOT_SECONDS = 20;
/** Projectiles may fly this far above the top of the screen before being considered lost. */
export const MAX_ALTITUDE_ABOVE_SCREEN = 4000;

// ---------------------------------------------------------------- tanks
export const TANK_WIDTH = 40;
export const TANK_HEIGHT = 18;
export const BARREL_LENGTH = 26;
/** Height of the turret pivot above the tank's ground point. */
export const TURRET_PIVOT_HEIGHT = 16;
export const MAX_HEALTH = 100;
/** Horizontal movement speed in px/s. */
export const TANK_SPEED = 90;
/** Fuel (in pixels of horizontal travel) granted at the start of each turn. */
export const MOVE_LIMIT_PER_TURN = 160;
/** Tanks cannot climb slopes steeper than this (rise / run). */
export const MAX_CLIMB_SLOPE = 2.2;
export const MIN_ANGLE = 0;
export const MAX_ANGLE = 180;
/** Degrees per second the muzzle rotates while a key is held. */
export const AIM_SPEED = 60;
export const MIN_POWER = 5;
/** Highest power an undamaged tank can fire with. */
export const BASE_MAX_POWER = 100;
/** Absolute upper bound for power on the wire (= BASE_MAX_POWER). */
export const MAX_POWER = BASE_MAX_POWER;
/**
 * Damage weakens the gun: maxPower = BASE_MAX_POWER × (F + (1 − F) × health / MAX_HEALTH).
 * With F = 0.5 a nearly dead tank fires at about half power.
 */
export const MIN_POWER_FACTOR = 0.5;
/** Power units per second while W/S is held. */
export const POWER_CHANGE_SPEED = 40;
/** Launch speed (px/s) = power * POWER_TO_SPEED. */
export const POWER_TO_SPEED = 7.5;
export const DEFAULT_POWER = 60;
/** Fall damage: falls shorter than the threshold are free. */
export const FALL_DAMAGE_ENABLED = true;
export const FALL_DAMAGE_THRESHOLD = 40;
export const FALL_DAMAGE_PER_PIXEL = 0.25;
/** Explosions use distance to the tank's body, so a hit "on the edge" still counts. */
export const TANK_HIT_RADIUS = 14;

// ---------------------------------------------------------------- damage
/**
 * A direct hit (projectile touches the tank, or explodes this close to the tank's
 * centre) deals the weapon's damage × DIRECT_HIT_MULTIPLIER, with no falloff.
 */
export const DIRECT_HIT_MULTIPLIER = 2.0;
export const DIRECT_HIT_DISTANCE = 16;
/**
 * Near hits: damage × (1 − distance / explosionRadius) ^ DAMAGE_FALLOFF_EXPONENT.
 * 1 = linear, 2 = quadratic (closer = much more damage).
 */
export const DAMAGE_FALLOFF_EXPONENT = 2;
/** Whether shields also soak up fall damage (not just explosions). */
export const SHIELDS_ABSORB_FALL_DAMAGE = true;

// ---------------------------------------------------------------- repair kits
/** Charges a player can hold. Everyone starts each game with a full bar. */
export const REPAIR_KIT_CAPACITY = 3;
/** Shop price of one charge. */
export const REPAIR_KIT_PRICE = 50;
/** maxPower restored by one charge (capped at BASE_MAX_POWER). */
export const REPAIR_KIT_POWER_RESTORE = 25;
/** Optionally a charge also heals the tank. */
export const REPAIR_KIT_RESTORES_HEALTH = false;
export const REPAIR_KIT_HEALTH_RESTORE = 15;

// ---------------------------------------------------------------- turns & rounds
export const TURN_TIME_MS = 30_000;
/** Pause after a shot's animation finishes before the next turn begins. */
export const POST_SHOT_DELAY_MS = 1200;
/** Server tick rate for live movement while a player is driving. */
export const SERVER_TICK_HZ = 30;
export const DEFAULT_ROUNDS = 5;
/** Pause after the final explosion of a round before the results screen appears. */
export const ROUND_END_DELAY_MS = 1500;

// ---------------------------------------------------------------- scoring
export const POINTS_PER_KILL = 100;
/** Points per point of damage dealt to *other* tanks. */
export const POINTS_PER_DAMAGE = 1;
export const SURVIVAL_BONUS = 150;
export const STARTING_POINTS = 0;

// ---------------------------------------------------------------- weapons
/** The weapon everyone always owns (unlimited). Must exist in weapons.ts. */
export const DEFAULT_WEAPON_ID = 'volcano';
/** Extra weapons every player starts the game with (weaponId -> count). */
export const STARTING_INVENTORY: Record<string, number> = {
  shower: 1,
};
/** Shields every player starts the game with (shieldId -> count). */
export const STARTING_SHIELDS: Record<string, number> = {};

// ---------------------------------------------------------------- maps
/** Map used when the host hasn't picked one. Must exist in maps.ts. */
export const DEFAULT_MAP_ID = 'classic';
/** Special lobby choice: a different random map every round. */
export const RANDOM_MAP_ID = 'random';

// ---------------------------------------------------------------- client visuals
/** Cloud drift speed in px/s per px/s² of wind. */
export const CLOUD_SPEED_PER_WIND = 1.5;
export const CLOUD_COUNT = 7;
/** How often (ms) the client sends aim updates while aiming. */
export const AIM_SEND_INTERVAL_MS = 50;
/** Shield bubble radius (px) around a tank at full shield HP. */
export const SHIELD_BUBBLE_RADIUS = 34;

// ---------------------------------------------------------------- players
export const PLAYER_COLORS = [
  { id: 'red', label: 'Red', hex: 0xe74c3c, css: '#e74c3c' },
  { id: 'blue', label: 'Blue', hex: 0x3498db, css: '#3498db' },
  { id: 'green', label: 'Green', hex: 0x2ecc71, css: '#2ecc71' },
  { id: 'yellow', label: 'Yellow', hex: 0xf1c40f, css: '#f1c40f' },
  { id: 'purple', label: 'Purple', hex: 0x9b59b6, css: '#9b59b6' },
] as const;

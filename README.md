# Pocket Artillery

A turn-based 2D multiplayer artillery tank game (in the spirit of Pocket Tanks / Worms) that runs in the browser.
Friends join a shared room with a 4-digit code, take turns lobbing bombs over hilly, destructible terrain, earn
points, buy bigger bombs between rounds, and fight for the top of the leaderboard.

- **Client:** TypeScript + Phaser 3, bundled with Vite
- **Server:** TypeScript + Node.js + Express + Socket.IO (authoritative)
- **Shared:** physics, terrain, weapons, behaviors, constants and the socket contract, used by both sides

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. `npm run dev` starts the game server on port 3000 and the Vite dev server on port 5173
(Vite proxies `/socket.io` to the game server).

### Testing multiplayer with several tabs

Each browser tab is its own player: the seat token is kept in `sessionStorage`, which is per tab.

1. Tab 1: **Create Room** and note the 4-digit code (use **Copy** to share it).
2. Tab 2 (and 3, 4, 5…): enter the code and press **Join Room**.
3. Everyone picks a name and a color. The host's **Start Game** button unlocks once 2+ players are ready.
4. Bring the tab whose turn it is to the front and play.

To play from phones or laptops on the same Wi-Fi, open `http://<your-computer's-LAN-IP>:5173`. The dev server
listens on all interfaces.

**Reconnects:** reload a tab mid-game and you get your seat back. While you're away your tank stays on the
field but your turns are skipped. The window to reconnect is `RECONNECT_WINDOW_MS` (60 s).

### Controls

| Key | Action |
| --- | --- |
| ← / → | Drive (limited by the fuel bar each turn) |
| ↑ / ↓ | Rotate the muzzle (0° = right, 180° = left). Hold **Shift** for fine aim |
| W / S | Increase / decrease shot power |
| 1–9 or click | Pick a weapon from your inventory |
| R (or click) | Use a repair kit charge: restores firing power. Doesn't end your turn |
| E (or click) | Switch on your best shield (click a shield button to pick a level). Doesn't end your turn |
| Space (or Enter) | Fire |

### Gameplay at a glance

- **Damage:** a *direct hit* (the shell touches a tank, or explodes within `DIRECT_HIT_DISTANCE` of its centre) deals
  the weapon's damage × `DIRECT_HIT_MULTIPLIER` (2×) and shows **DIRECT HIT!**. A *near hit* falls off
  quadratically to zero at the edge of the blast.
- **Damaged guns:** a tank's max power drops with its health, down to `MIN_POWER_FACTOR` (50%) when nearly dead. The
  lost part of the power bar is shown cracked. The server enforces the cap on every shot.
- **Repair kits:** everyone starts with a full bar (`REPAIR_KIT_CAPACITY` charges, the green pips in the HUD). One
  charge gives back `REPAIR_KIT_POWER_RESTORE` max power. Buy more charges in the shop.
- **Shields:** buy them in the shop, then switch one on during your turn. A shield soaks up a percentage of every
  hit until its HP runs out. Its HP shows as a blue bar under your health bar in the HUD.
- **Maps:** the host picks Classic, Desert, Mountain, Forest or Random in the waiting room. Random picks a new map
  every round.

### Tests and checks

```bash
npm test          # simulation unit tests + an end-to-end multiplayer test with real socket clients
npm run typecheck # tsc over shared, server and client
```

## Production build & deployment

```bash
npm run build                 # builds client/dist and server/dist/index.cjs
PORT=8080 npm start           # one Node process serves the game AND the built client
```

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ROUNDS` | `DEFAULT_ROUNDS` (5) | Rounds per game |
| `CLIENT_DIST` | `../../client/dist` | Where the built client lives |
| `CORS_ORIGIN` | (none) | Comma-separated origins, only if the client is hosted on a different domain |

**Deploying:** any host that runs a long-lived Node process with WebSockets works, for example Render, Railway,
Fly.io or a plain VPS.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check: `GET /health`

Rooms live in memory, so run a **single instance**. Several instances would need sticky sessions and a shared
store such as the Socket.IO Redis adapter. Serverless platforms that don't keep WebSocket connections open
(classic Vercel or Netlify functions) won't work for the server.

Example with a VPS + pm2:

```bash
git clone <repo> && cd game && npm install && npm run build
PORT=3000 pm2 start server/dist/index.cjs --name tanks
# put nginx/caddy in front for HTTPS; make sure it forwards WebSocket upgrades
```

## Project layout

```
shared/                  ← imported by BOTH client and server (identical simulation)
  constants.ts           every tunable number (gravity, wind, speeds, health, points, timers…)
  types.ts               game types + the full Socket.IO event contract
  weapons.ts             WEAPON REGISTRY (data only)
  behaviors.ts           BEHAVIOR REGISTRY (single, split, bounce, climbToPeak)
  shields.ts             SHIELD REGISTRY (data only) + damage absorption
  maps.ts                MAP REGISTRY (terrain settings, sky, ground, decorations, wind)
  shop.ts                shop catalogue built from the registries (bombs, shields, repair kits)
  physics.ts             fixed-timestep projectile simulation → ShotResult
  terrain.ts             heightmap generation, crater carving
  damage.ts              direct hits, blast falloff, shields, fall damage, tank settling
  tank.ts                barrel geometry, driving, spawn positions, max power from health
  test/                  simulation unit tests
server/src/
  index.ts               Express + Socket.IO bootstrap, serves client/dist in production
  socketHandlers.ts      maps socket events → room methods
  RoomManager.ts         unique 4-digit codes, room cleanup
  GameRoom.ts            one room: lobby → playing → roundEnd → … → finished; validates every intention
  Player.ts              a seat (secret reconnect token, points, inventory)
  validation.ts          guards for all client input
  systems/TurnSystem.ts  shuffled turn order + turn timer
  systems/Battlefield.ts terrain, tanks, wind for one round; runs shots
  systems/Scoring.ts     kills / damage / survival → points
  systems/Shop.ts        buying and consuming weapons
client/src/
  main.ts                socket → store wiring, page router, reconnect
  net.ts / store.ts      typed socket + client state
  pages/                 Home, Room (waiting room), Shop (+ round results), Final (leaderboard)
  game/GameScene.ts      Phaser scene: renders server state, replays shots, sends intentions
  game/                  TerrainRenderer (+ sky), TankSprite, ShotPlayer, Clouds, Effects
  game/mapArt.ts         canvas painters for sky, ground, decorations and map previews
  game/ui/               HealthBars, WindIndicator, PowerMeter, FuelBar, WeaponPicker, ActionBar, TurnBanner
  audio/sounds.ts        sound hooks (synthesised with WebAudio; swap for audio files any time)
```

### How a turn works

1. The server picks the next player who is alive and connected, rolls the wind, refills their fuel, starts the
   turn timer and broadcasts `game:state`.
2. The active client sends **intentions only**: `game:move {dir}`, `game:aim {angle, power, weaponId}`,
   `game:repair`, `game:shield {shieldId}` and `game:fire`. The server simulates driving at 30 Hz and relays aim,
   repairs and shields, so everyone sees them live. Repairing and shielding don't end the turn.
3. On `game:fire` the server checks the turn, ammo, angle range and the tank's current max power. It then runs the whole shot with
   `simulateShot()` (projectiles, wind, splits, bounces, craters, damage, falling tanks) and broadcasts one
   `ShotResult`.
4. Clients replay the recorded projectile tracks and apply each explosion at its timestamp, using the same
   shared `carveCrater()`. After the animation finishes, the server starts the next turn, or ends the round
   once one tank (or none) is left.

## How to add…

Everything below is data in a registry. The shop, HUD, key bindings, server validation, physics and damage all
read from the registries, so no other file needs to change unless noted. Run `npm test` afterwards: tests check
that every registry entry is valid (unique ids, existing behaviors, sane numbers, terrain inside the world).

### …a new weapon (existing behavior, data only)

Add an entry to `WEAPONS` in **`shared/weapons.ts`**:

```ts
{
  id: 'mega-volcano',
  name: 'Mega Volcano',
  description: 'A bigger, angrier volcano.',
  cost: 200,
  damage: 30,            // direct hit = 30 × DIRECT_HIT_MULTIPLIER; near hits fall off from 30
  explosionRadius: 80,
  craterRadius: 50,
  color: 0xff3300,
  projectileRadius: 6,
  behavior: 'single',
  // trail: { colors: [0xffe45c, 0xff4a10], seconds: 0.4, size: 1.2 },   // optional fancy trail
},
```

Behavior settings go in `params`, e.g. a 9-bomblet shower:

```ts
behavior: 'split',
params: { count: 9, spread: 110, childDamage: 12, childExplosionRadius: 25, childCraterRadius: 16 },
```

### …a new behavior (a new kind of bomb)

Add one behavior to **`shared/behaviors.ts`** and register it in `BEHAVIORS`. A behavior can hook three moments:

```ts
/** Explodes on its own 1.5 s after launch, wherever it is. */
const timed: Behavior = {
  update(p, ctx) {
    if (p.age >= (p.params.fuse ?? 1.5)) ctx.explode(p);
  },
  // onImpact(p, ctx, impact) { ... }  // optional: touched terrain or a tank (default: ctx.explode(p))
  // integrate(p, ctx) { ... }         // optional: move p yourself this step and return true
  //                                   // (gravity and wind are skipped), e.g. climbToPeak rolls along the ground
};

export const BEHAVIORS = { single, split, bounce, climbToPeak, timed } satisfies Record<string, Behavior>;
```

Then use it from a weapon with `behavior: 'timed', params: { fuse: 1.5 }`. Through `ctx` a behavior can `spawn()`
child projectiles, `explode()` or `remove()` a projectile, and read `terrain`, `wind`, `dt` and `time`. The
simulation runs on the server and clients replay the recorded result, so you don't need any client changes.

### …a new map

Add an entry to `MAPS` in **`shared/maps.ts`**:

```ts
{
  id: 'volcanic',
  name: 'Volcanic',
  description: 'Black rock under a red sky.',
  terrain: { ...DEFAULT_TERRAIN_SETTINGS, hills: 1.3, hillHeight: 0.4, peakSharpness: 1.6 },
  sky: { top: 0x2a0a0a, bottom: 0xa83a1a, sun: { color: 0xffd0a0, x: 0.3, y: 0.2, radius: 40 } },
  ground: { top: '#3a3a3a', mid: '#2a2a2a', bottom: '#111', surface: '#ff5a1a', surfaceHighlight: '#ffb070',
            style: 'rock', speckle: 'rgba(255, 90, 30, 0.25)' },
  decorations: [{ kind: 'rock', count: 8, scale: [0.8, 1.5] }],
  modifiers: { windMultiplier: 1.2 },
},
```

It appears in the waiting room with a generated preview and joins the Random rotation. Terrain knobs (see
`TerrainSettings` in `shared/terrain.ts`): `minHeightRatio`/`maxHeightRatio`, `baseHeight`, `layers`, `hills`,
`hillHeight`, `roughness` and `peakSharpness`. Decoration kinds are `cactus`, `rock`, `tree`, `pine` and `bush`.
A new *kind* also needs a small drawing function in `DRAWERS` in `client/src/game/mapArt.ts`.

### …a new shield level

Add an entry to `SHIELDS` in **`shared/shields.ts`**:

```ts
{ id: 'shield-4', name: 'Aegis Shield', level: 4, description: 'Nearly impenetrable.',
  cost: 420, absorb: 0.85, hp: 150, color: 0xffd166 },
```

It shows up in the shop's Shields section and in the in-game shield buttons. **E** always activates the
highest-level shield you own.

## Tuning

Every number lives in **`shared/constants.ts`**: world size, gravity, `MAX_WIND`, tank speed, `MOVE_LIMIT_PER_TURN`,
`BASE_MAX_POWER`, `MIN_POWER_FACTOR`, `MAX_HEALTH`, `DIRECT_HIT_MULTIPLIER`, `DIRECT_HIT_DISTANCE`,
`DAMAGE_FALLOFF_EXPONENT` (1 = linear, 2 = quadratic), `SHIELDS_ABSORB_FALL_DAMAGE`, repair kits
(`REPAIR_KIT_CAPACITY`, `REPAIR_KIT_PRICE`, `REPAIR_KIT_POWER_RESTORE`, `REPAIR_KIT_RESTORES_HEALTH`,
`REPAIR_KIT_HEALTH_RESTORE`), `TURN_TIME_MS`, fall damage, `POINTS_PER_KILL`, `POINTS_PER_DAMAGE`, `SURVIVAL_BONUS`,
`DEFAULT_ROUNDS`, `STARTING_INVENTORY`, `STARTING_SHIELDS`, `DEFAULT_MAP_ID`, reconnect windows, cloud speed and more.
Per-item balance (damage, radii, prices, shield absorb/HP, map wind) lives in the registries.

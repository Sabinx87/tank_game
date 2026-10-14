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
| Space (or Enter) | Fire |

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
  behaviors.ts           BEHAVIOR REGISTRY (single, split, bounce)
  physics.ts             fixed-timestep projectile simulation → ShotResult
  terrain.ts             heightmap generation, crater carving
  damage.ts              blast falloff, fall damage, tank settling
  tank.ts                barrel geometry, driving, spawn positions
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
  game/                  TerrainRenderer, TankSprite, ShotPlayer, Clouds, Effects
  game/ui/               HealthBars, WindIndicator, PowerMeter, FuelBar, WeaponPicker, TurnBanner
  audio/sounds.ts        sound hooks (synthesised with WebAudio; swap for audio files any time)
```

### How a turn works

1. The server picks the next player who is alive and connected, rolls the wind, refills their fuel, starts the
   turn timer and broadcasts `game:state`.
2. The active client sends **intentions only**: `game:move {dir}`, `game:aim {angle, power, weaponId}` and
   `game:fire`. The server simulates driving at 30 Hz and relays aim, so everyone sees the barrel move live.
3. On `game:fire` the server checks the turn, ammo and angle/power ranges. It then runs the whole shot with
   `simulateShot()` (projectiles, wind, splits, bounces, craters, damage, falling tanks) and broadcasts one
   `ShotResult`.
4. Clients replay the recorded projectile tracks and apply each explosion at its timestamp, using the same
   shared `carveCrater()`. After the animation finishes, the server starts the next turn, or ends the round
   once one tank (or none) is left.

## How to add a new weapon

### A new bomb using an existing behavior (data only)

Add an entry to `WEAPONS` in **`shared/weapons.ts`**:

```ts
{
  id: 'mega-volcano',
  name: 'Mega Volcano',
  description: 'A bigger, angrier volcano.',
  cost: 200,
  damage: 50,
  explosionRadius: 80,
  craterRadius: 50,
  color: 0xff3300,
  projectileRadius: 6,
  behavior: 'single',
},
```

That's all. The shop, weapon picker, number keys, server validation, physics and damage pick it up
automatically. Behavior settings go in `params`, e.g. a 9-bomblet shower:

```ts
behavior: 'split',
params: { count: 9, spread: 110, childDamage: 12, childExplosionRadius: 25, childCraterRadius: 16 },
```

### A new kind of bomb (new behavior)

Add one behavior to **`shared/behaviors.ts`** and register it in `BEHAVIORS`. A behavior can hook two moments:

```ts
/** Explodes on its own 1.5 s after launch, wherever it is. */
const timed: Behavior = {
  update(p, ctx) {
    if (p.age >= (p.params.fuse ?? 1.5)) ctx.explode(p);
  },
  // onImpact(p, ctx, impact) { ... }   // optional, default is ctx.explode(p)
};

export const BEHAVIORS = { single, split, bounce, timed } satisfies Record<string, Behavior>;
```

Then reference it from a weapon with `behavior: 'timed', params: { fuse: 1.5 }`. Through `ctx` a behavior can
`spawn()` child projectiles, `explode()` or `remove()` a projectile, and read `terrain`, `wind` and `time`. The
simulation runs on the server and the recorded result is replayed on clients, so you don't need any client
changes.

Run `npm test` afterwards. One test checks that every weapon points to an existing behavior.

## Tuning

Every number lives in **`shared/constants.ts`**: world size, gravity, `MAX_WIND`, tank speed, `MOVE_LIMIT_PER_TURN`,
`MAX_POWER`, `MAX_HEALTH`, `TURN_TIME_MS`, fall damage, `POINTS_PER_KILL`, `POINTS_PER_DAMAGE`, `SURVIVAL_BONUS`,
`DEFAULT_ROUNDS`, `STARTING_INVENTORY`, reconnect windows, cloud speed and more.

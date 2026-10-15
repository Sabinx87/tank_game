/**
 * End-to-end test: real Socket.IO clients against a real server.
 * Covers lobby errors, waiting room rules, turns, validation, a full round,
 * the shop and reconnecting.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import { BASE_MAX_POWER, DEFAULT_MAP_ID, MAX_PLAYERS, RANDOM_MAP_ID, REPAIR_KIT_CAPACITY } from '@shared/constants';
import { MAPS } from '@shared/maps';
import { SHIELDS } from '@shared/shields';
import { REPAIR_KIT_ITEM_ID } from '@shared/shop';
import type { AckResult, ClientToServerEvents, GameState, JoinedRoom, RoomState, ServerToClientEvents } from '@shared/types';
import { createGameServer } from '../src/index';

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & { room?: RoomState; game?: GameState };

let url = '';
const { httpServer, io, rooms } = createGameServer();
const clients: Client[] = [];

before(async () => {
  await new Promise<void>((r) => httpServer.listen(0, r));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});
after(() => {
  clients.forEach((c) => c.disconnect());
  rooms.closeAll();
  io.close();
  httpServer.close();
});

async function client(): Promise<Client> {
  const c = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  c.on('room:state', (s) => (c.room = s));
  c.on('game:state', (s) => (c.game = s));
  c.on('game:tank', (u) => {
    const t = c.game?.tanks.find((x) => x.playerId === u.playerId);
    if (t) Object.assign(t, u);
  });
  clients.push(c);
  await new Promise<void>((r) => c.on('connect', () => r()));
  return c;
}

function call<T>(fn: (ack: (r: AckResult<T>) => void) => void): Promise<AckResult<T>> {
  return new Promise((r) => fn(r));
}

function until(cond: () => boolean, timeoutMs = 10_000, label = 'condition'): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (cond()) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 10);
  });
}

const okData = <T>(r: AckResult<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

test('full multiplayer flow', { timeout: 120_000 }, async () => {
  const a = await client();
  const b = await client();

  // ---- lobby
  const bad = await call<JoinedRoom>((ack) => a.emit('room:join', { code: '12' }, ack));
  assert.equal(bad.ok, false);
  const missing = await call<JoinedRoom>((ack) => a.emit('room:join', { code: '0000' }, ack));
  assert.ok(!missing.ok && /No room/.test(missing.error));

  const created = okData(await call<JoinedRoom>((ack) => a.emit('room:create', ack)));
  assert.match(created.code, /^\d{4}$/);
  const joinedB = okData(await call<JoinedRoom>((ack) => b.emit('room:join', { code: created.code }, ack)));
  await until(() => a.room?.players.length === 2, 5000, 'two players');
  assert.equal(a.room!.hostId, created.playerId);
  assert.ok(!JSON.stringify(a.room).includes(created.token), 'tokens are never broadcast');

  // Room full
  const extras: Client[] = [];
  for (let i = 2; i < MAX_PLAYERS; i++) {
    const c = await client();
    okData(await call<JoinedRoom>((ack) => c.emit('room:join', { code: created.code }, ack)));
    extras.push(c);
  }
  const sixth = await client();
  const full = await call<JoinedRoom>((ack) => sixth.emit('room:join', { code: created.code }, ack));
  assert.ok(!full.ok && /full/i.test(full.error));
  extras.forEach((c) => c.emit('room:leave'));
  await until(() => a.room?.players.length === 2, 5000, 'extras left');

  // ---- waiting room
  okData(await call<null>((ack) => a.emit('room:profile', { name: 'Alice', color: 'red' }, ack)));
  const taken = await call<null>((ack) => b.emit('room:profile', { name: 'Bob', color: 'red' }, ack));
  assert.ok(!taken.ok && /taken/.test(taken.error));
  const notHost = await call<null>((ack) => b.emit('room:start', ack));
  assert.equal(notHost.ok, false);
  const noProfile = await call<null>((ack) => a.emit('room:start', ack));
  assert.ok(!noProfile.ok && /name and a color/.test(noProfile.error));
  okData(await call<null>((ack) => b.emit('room:profile', { name: 'Bob', color: 'blue' }, ack)));

  // ---- map selection (host only, live for everyone)
  assert.equal(b.room!.mapId, DEFAULT_MAP_ID);
  const pickedMap = MAPS[MAPS.length - 1].id;
  const notHostMap = await call<null>((ack) => b.emit('room:map', { mapId: pickedMap }, ack));
  assert.ok(!notHostMap.ok && /host/.test(notHostMap.error));
  const badMap = await call<null>((ack) => a.emit('room:map', { mapId: 'atlantis' }, ack));
  assert.equal(badMap.ok, false);
  okData(await call<null>((ack) => a.emit('room:map', { mapId: RANDOM_MAP_ID }, ack)));
  await until(() => b.room?.mapId === RANDOM_MAP_ID, 3000, 'random map broadcast');
  okData(await call<null>((ack) => a.emit('room:map', { mapId: pickedMap }, ack)));
  await until(() => b.room?.mapId === pickedMap, 3000, 'map broadcast');
  assert.ok(a.room!.players.every((p) => p.repairKits === REPAIR_KIT_CAPACITY), 'everyone starts with a full repair kit bar');

  okData(await call<null>((ack) => a.emit('room:start', ack)));

  await until(() => !!a.game && !!b.game && !!a.game.currentPlayerId, 5000, 'game state');
  assert.equal(a.room!.phase, 'playing');
  assert.equal(a.game!.terrain.length, 1600);
  assert.equal(a.game!.tanks.length, 2);
  assert.equal(a.game!.mapId, pickedMap);
  assert.ok(a.game!.tanks.every((t) => t.maxPower === BASE_MAX_POWER && t.shield === null));

  const late = await client();
  const lateJoin = await call<JoinedRoom>((ack) => late.emit('room:join', { code: created.code }, ack));
  assert.ok(!lateJoin.ok && /started/.test(lateJoin.error));

  // ---- turns & validation
  const byId = { [created.playerId]: a, [joinedB.playerId]: b } as Record<string, Client>;
  const current = () => byId[a.game!.currentPlayerId!];
  const other = () => (current() === a ? b : a);

  const notYourTurn = await call<null>((ack) => other().emit('game:fire', { angle: 90, power: 5, weaponId: 'volcano' }, ack));
  assert.equal(notYourTurn.ok, false);
  const badPower = await call<null>((ack) => current().emit('game:fire', { angle: 90, power: 500, weaponId: 'volcano' }, ack));
  assert.ok(!badPower.ok && /Power/.test(badPower.error));
  const notOwned = await call<null>((ack) => current().emit('game:fire', { angle: 90, power: 50, weaponId: 'atom' }, ack));
  assert.ok(!notOwned.ok && /don't have/.test(notOwned.error));
  const fullRepair = await call<null>((ack) => current().emit('game:repair', ack));
  assert.ok(!fullRepair.ok && /full power/.test(fullRepair.error), 'repair at full power is refused');
  const noShield = await call<null>((ack) => current().emit('game:shield', { shieldId: SHIELDS[0].id }, ack));
  assert.ok(!noShield.ok && /don't have/.test(noShield.error));

  // Driving is server-simulated and broadcast.
  const startX = a.game!.tanks.find((t) => t.playerId === a.game!.currentPlayerId)!.x;
  let moved = false;
  other().once('game:tank', () => (moved = true));
  current().emit('game:move', { dir: startX < 800 ? 1 : -1 });
  await until(() => moved, 3000, 'movement broadcast');
  current().emit('game:move', { dir: 0 });

  // ---- play a round: everyone shoots straight up onto themselves until one is left.
  let shots = 0;
  a.on('game:shot', () => shots++);
  while (a.room!.phase === 'playing') {
    const turnOf = a.game!.currentPlayerId!;
    const shooter = byId[turnOf];
    const before = shots;
    okData(await call<null>((ack) => shooter.emit('game:fire', { angle: 90, power: 5, weaponId: 'volcano' }, ack)));
    await until(() => shots > before, 5000, 'shot broadcast');
    await until(() => a.room!.phase !== 'playing' || (a.game!.currentPlayerId !== turnOf && !a.game!.shotInProgress), 15_000, 'next turn');
  }
  assert.equal(a.room!.phase, 'roundEnd');
  const results = a.room!.lastRoundResults!;
  assert.equal(results.round, 1);
  assert.ok(results.winnerId);
  const winner = a.room!.players.find((p) => p.id === results.winnerId)!;
  assert.ok(winner.points > 0, 'survivor got points');

  // ---- shop
  const shopperClient = byId[winner.id];
  const before = winner.points;
  const buy = await call<null>((ack) => shopperClient.emit('shop:buy', { category: 'weapon', itemId: 'digger' }, ack));
  if (before >= 80) {
    okData(buy);
    await until(() => (a.room!.players.find((p) => p.id === winner.id)!.inventory.digger ?? 0) >= 1, 3000, 'inventory');
  } else {
    assert.equal(buy.ok, false);
  }
  const freeBuy = await call<null>((ack) => a.emit('shop:buy', { category: 'weapon', itemId: 'volcano' }, ack));
  assert.equal(freeBuy.ok, false);
  const fullKits = await call<null>((ack) => a.emit('shop:buy', { category: 'repair', itemId: REPAIR_KIT_ITEM_ID }, ack));
  assert.ok(!fullKits.ok && /carry/.test(fullKits.error), 'repair kits are capped');
  const bogus = await call<null>((ack) => a.emit('shop:buy', { category: 'shield', itemId: 'nope' }, ack));
  assert.equal(bogus.ok, false);
  const cheapShield = [...SHIELDS].sort((x, y) => x.cost - y.cost)[0];
  const pointsNow = a.room!.players.find((p) => p.id === winner.id)!.points;
  const shieldBuy = await call<null>((ack) => shopperClient.emit('shop:buy', { category: 'shield', itemId: cheapShield.id }, ack));
  if (pointsNow >= cheapShield.cost) {
    okData(shieldBuy);
    await until(() => (a.room!.players.find((p) => p.id === winner.id)!.shields[cheapShield.id] ?? 0) === 1, 3000, 'shield bought');
  } else {
    assert.equal(shieldBuy.ok, false);
  }

  // ---- reconnect: B drops during the shop and comes back with its token
  b.disconnect();
  await until(() => a.room!.players.some((p) => p.id === joinedB.playerId && !p.connected), 3000, 'B offline');
  const b2 = await client();
  okData(await call<JoinedRoom>((ack) => b2.emit('room:rejoin', { code: created.code, token: joinedB.token }, ack)));
  await until(() => a.room!.players.every((p) => p.connected), 3000, 'B back');
  const stolen = await call<JoinedRoom>((ack) => late.emit('room:rejoin', { code: created.code, token: 'nope' }, ack));
  assert.equal(stolen.ok, false);

  // ---- next round
  const round1Order = a.game!.turnOrder.join();
  a.emit('shop:ready', { ready: true });
  b2.emit('shop:ready', { ready: true });
  await until(() => a.room!.phase === 'playing' && a.room!.round === 2, 5000, 'round 2');
  await until(() => a.game!.round === 2, 5000, 'round 2 state');
  assert.ok(a.game!.tanks.every((t) => t.alive && t.health === 100));
  assert.ok(round1Order.length > 0);

  // ---- round 2: shields, damage lowers the power cap, repair kits restore it
  byId[joinedB.playerId] = b2;
  const shooterId = a.game!.currentPlayerId!;
  const shooter = byId[shooterId];
  const tankOf = (id: string) => a.game!.tanks.find((t) => t.playerId === id)!;
  const ownsShield = (a.room!.players.find((p) => p.id === shooterId)!.shields[cheapShield.id] ?? 0) > 0;
  if (ownsShield) {
    okData(await call<null>((ack) => shooter.emit('game:shield', { shieldId: cheapShield.id }, ack)));
    await until(() => tankOf(shooterId).shield?.shieldId === cheapShield.id, 3000, 'shield up');
    const twice = await call<null>((ack) => shooter.emit('game:shield', { shieldId: cheapShield.id }, ack));
    assert.equal(twice.ok, false, 'shield is used up / only one at a time');
    assert.equal(a.game!.currentPlayerId, shooterId, 'activating a shield does not end the turn');
  }
  // Both players hit themselves once, then the first one is back with a damaged gun.
  for (let i = 0; i < 2; i++) {
    const turnOf = a.game!.currentPlayerId!;
    const before2 = shots;
    okData(await call<null>((ack) => byId[turnOf].emit('game:fire', { angle: 90, power: 5, weaponId: 'volcano' }, ack)));
    await until(() => shots > before2, 5000, 'shot broadcast');
    await until(() => a.game!.currentPlayerId !== turnOf && !a.game!.shotInProgress, 15_000, 'next turn');
  }
  assert.equal(a.game!.currentPlayerId, shooterId);
  const hurt = tankOf(shooterId);
  assert.ok(hurt.alive && hurt.health < 100, 'shooter took damage');
  assert.ok(hurt.maxPower < BASE_MAX_POWER, 'damage lowered max power');
  const tooStrong = await call<null>((ack) => shooter.emit('game:fire', { angle: 90, power: BASE_MAX_POWER, weaponId: 'volcano' }, ack));
  assert.ok(!tooStrong.ok && /only fire up to/.test(tooStrong.error), 'server enforces the power cap');
  const capBefore = hurt.maxPower;
  okData(await call<null>((ack) => shooter.emit('game:repair', ack)));
  await until(() => tankOf(shooterId).maxPower > capBefore, 3000, 'repair raised max power');
  await until(() => a.room!.players.find((p) => p.id === shooterId)!.repairKits === REPAIR_KIT_CAPACITY - 1, 3000, 'kit used');
  assert.equal(a.game!.currentPlayerId, shooterId, 'repairing does not end the turn');

  // Current player disconnecting skips their turn.
  const cur = a.game!.currentPlayerId!;
  if (cur === joinedB.playerId) {
    let skipped = false;
    a.once('game:turnSkipped', (p) => (skipped = p.playerId === cur));
    b2.disconnect();
    await until(() => skipped, 3000, 'turn skipped');
    await until(() => a.game!.currentPlayerId === created.playerId, 3000, 'A plays');
  }
});

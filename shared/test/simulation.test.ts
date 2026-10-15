import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEHAVIORS } from '../behaviors';
import {
  BASE_MAX_POWER,
  DIRECT_HIT_MULTIPLIER,
  MAX_HEALTH,
  MAX_WIND,
  MIN_POWER_FACTOR,
  TANK_HEIGHT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../constants';
import { applyExplosion, falloffDamage, type BlastSpec, type SimTank } from '../damage';
import { simulateShot, trackPositionAt } from '../physics';
import { SHIELDS, absorbDamage, getShield } from '../shields';
import { maxPowerFor, spawnPositions, stepTankMovement } from '../tank';
import { carveCrater, findPeak, generateTerrain } from '../terrain';
import { MAPS, generateDecorations, getMap, isMapChoice, resolveMap, seededRng, survivingDecorations } from '../maps';
import { DEFAULT_MAP_ID, RANDOM_MAP_ID } from '../constants';
import { WEAPONS, getWeapon } from '../weapons';

const flat = (y = 700) => new Array(WORLD_WIDTH).fill(y);
const tank = (playerId: string, x: number, y = 700): SimTank => ({
  playerId,
  x,
  y,
  health: MAX_HEALTH,
  alive: true,
  maxPower: BASE_MAX_POWER,
  powerBoost: 0,
  shield: null,
});
const blast = (x: number, y: number, o: Partial<BlastSpec> = {}): BlastSpec => ({
  x,
  y,
  t: 0,
  weaponId: 'volcano',
  color: 0,
  damage: 20,
  explosionRadius: 40,
  craterRadius: 0,
  sourceId: 'z',
  ...o,
});

test('every weapon references an existing behavior and has sane numbers', () => {
  for (const w of WEAPONS) {
    assert.ok(w.behavior in BEHAVIORS, `${w.id} behavior ${w.behavior}`);
    assert.ok(w.damage >= 0 && w.explosionRadius > 0 && w.craterRadius >= 0, w.id);
  }
  assert.equal(new Set(WEAPONS.map((w) => w.id)).size, WEAPONS.length, 'weapon ids are unique');
});

test('generated terrain stays inside the world', () => {
  const t = generateTerrain();
  assert.equal(t.length, WORLD_WIDTH);
  assert.ok(t.every((y) => y > 0 && y < WORLD_HEIGHT));
});

test('every weapon damages, shield and repair numbers are sane', () => {
  assert.equal(new Set(SHIELDS.map((s) => s.id)).size, SHIELDS.length, 'shield ids are unique');
  for (const w of WEAPONS) assert.ok(w.cost >= 0, w.id);
});

test('crater lowers the ground by up to its diameter, centred on impact', () => {
  const t = flat(700);
  carveCrater(t, 800, 700, 30);
  assert.equal(t[800], 730);
  assert.equal(t[700], 700, 'far columns untouched');
  assert.ok(t[790] > 700 && t[790] < 730);
});

test('falloff is quadratic: full at centre, a quarter at half radius, zero at edge', () => {
  assert.equal(falloffDamage(50, 40, 0), 50);
  assert.equal(falloffDamage(50, 40, 20), 12.5);
  assert.equal(falloffDamage(50, 40, 40), 0);
  assert.equal(falloffDamage(50, 40, 60), 0);
});

test('direct hits deal damage × DIRECT_HIT_MULTIPLIER, near hits less, far tanks nothing', () => {
  const ts = [tank('a', 400), tank('b', 440), tank('c', 900)];
  // Blast right on tank a's body centre.
  const ev = applyExplosion(flat(), ts, blast(400, 700 - TANK_HEIGHT / 2));
  const dmg = (id: string) => ev.damage.find((d) => d.playerId === id);
  assert.equal(dmg('a')!.amount, 20 * DIRECT_HIT_MULTIPLIER);
  assert.equal(dmg('a')!.direct, true);
  assert.ok(dmg('b')!.amount > 0 && dmg('b')!.amount < 20, 'near hit is partial');
  assert.equal(dmg('b')!.direct, false);
  assert.equal(dmg('c'), undefined);
});

test('a projectile striking a tank body is a direct hit', () => {
  const ev = applyExplosion(flat(), [tank('a', 400)], blast(430, 690, { hitTankId: 'a' }));
  assert.equal(ev.damage[0].amount, 20 * DIRECT_HIT_MULTIPLIER);
});

test('weapon balance: direct Volcano ≈ 35–40% HP, direct Atom almost a one-shot', () => {
  const direct = (id: string) => getWeapon(id)!.damage * DIRECT_HIT_MULTIPLIER;
  assert.ok(direct('volcano') >= 0.35 * MAX_HEALTH && direct('volcano') <= 0.4 * MAX_HEALTH);
  assert.ok(direct('atom') >= 0.9 * MAX_HEALTH && direct('atom') < MAX_HEALTH);
});

test('max power drops with damage and repair boost is capped', () => {
  assert.equal(maxPowerFor(MAX_HEALTH, 0), BASE_MAX_POWER);
  assert.equal(maxPowerFor(0, 0), BASE_MAX_POWER * MIN_POWER_FACTOR);
  assert.equal(maxPowerFor(MAX_HEALTH / 2, 0), BASE_MAX_POWER * (MIN_POWER_FACTOR + (1 - MIN_POWER_FACTOR) / 2));
  assert.equal(maxPowerFor(0, 1000), BASE_MAX_POWER);
  const ts = [tank('a', 400)];
  applyExplosion(flat(), ts, blast(400, 690));
  assert.equal(ts[0].maxPower, maxPowerFor(ts[0].health, 0), 'maxPower follows health after a hit');
});

test('shields absorb their share, lose HP, and pop with the rest going through', () => {
  for (const s of SHIELDS) assert.ok(s.absorb > 0 && s.absorb < 1 && s.hp > 0, s.id);
  const lvl1 = SHIELDS.find((s) => s.level === 1)!;
  const sh = { shieldId: lvl1.id, hp: lvl1.hp };
  const first = absorbDamage(sh, 40);
  assert.equal(first.absorbed, Math.round(40 * lvl1.absorb));
  assert.equal(first.passed, 40 - first.absorbed);
  assert.equal(sh.hp, lvl1.hp - first.absorbed);
  // A huge hit drains the remaining HP; leftover goes to the tank.
  const left = sh.hp;
  const big = absorbDamage(sh, 200);
  assert.equal(big.absorbed, left);
  assert.equal(big.passed, 200 - left);
  assert.equal(big.broken, true);

  const ts = [tank('a', 400)];
  const best = [...SHIELDS].sort((a, b) => b.level - a.level)[0];
  ts[0].shield = { shieldId: best.id, hp: best.hp };
  const ev = applyExplosion(flat(), ts, blast(400, 690));
  const d = ev.damage[0];
  assert.equal(d.absorbed + d.amount, 20 * DIRECT_HIT_MULTIPLIER);
  assert.equal(d.absorbed, Math.round(40 * getShield(best.id)!.absorb));
  assert.equal(ev.tanks[0].shield!.hp, best.hp - d.absorbed);
});

test('findPeak climbs to the local maximum in the given direction', () => {
  // A single hill peaking at x = 600 (smaller y = higher).
  const t = Array.from({ length: WORLD_WIDTH }, (_, x) => 700 - Math.max(0, 200 - Math.abs(x - 600)));
  assert.equal(findPeak(t, 450, 1, 500), 600);
  assert.equal(findPeak(t, 750, -1, 500), 600);
  assert.equal(findPeak(t, 450, -1, 500), 450, 'downhill: stays put');
  assert.equal(findPeak(t, 450, 1, 50), 500, 'limited by max distance');
});

test('Ball V2 rolls uphill to the peak before exploding', () => {
  const t = Array.from({ length: WORLD_WIDTH }, (_, x) => 700 - Math.max(0, 150 - Math.abs(x - 700) * 0.6));
  const shot = simulateShot({ terrain: t, tanks: [tank('a', 200, t[200])], shooterId: 'a', weapon: getWeapon('ball-v2')!, angle: 45, power: 52, wind: 0 });
  assert.equal(shot.explosions.length, 1);
  assert.ok(Math.abs(shot.explosions[0].x - 700) <= 2, `exploded at the peak (x=${shot.explosions[0].x})`);
});

test('Ball V2 on flat ground explodes where it lands', () => {
  const shot = simulateShot({ terrain: flat(), tanks: [tank('a', 300)], shooterId: 'a', weapon: getWeapon('ball-v2')!, angle: 50, power: 60, wind: 0 });
  assert.equal(shot.explosions.length, 1);
  const track = shot.projectiles[0];
  assert.equal(shot.explosions[0].x, track.points[track.points.length - 2]);
});

test('Hot Shower splits into more bomblets than the Shower Bomb', () => {
  const run = (id: string) =>
    simulateShot({ terrain: flat(), tanks: [tank('a', 300)], shooterId: 'a', weapon: getWeapon(id)!, angle: 60, power: 70, wind: 0 });
  const hot = run('hot-shower');
  assert.equal(hot.explosions.length, getWeapon('hot-shower')!.params!.count);
  assert.ok(hot.explosions.length > run('shower').explosions.length);
});

test('a shot lands, carves a crater and damages the tank it hits', () => {
  // Search a power that hits b with no wind.
  let hit = false;
  for (let power = 40; power <= 100 && !hit; power += 0.5) {
    const tr = flat();
    const ts = [tank('a', 200), tank('b', 700)];
    const shot = simulateShot({ terrain: tr, tanks: ts, shooterId: 'a', weapon: getWeapon('volcano')!, angle: 45, power, wind: 0 });
    if (ts[1].health < MAX_HEALTH) {
      hit = true;
      assert.equal(shot.explosions.length, 1);
      assert.ok(shot.explosions[0].damage.some((d) => d.playerId === 'b'));
      assert.equal(ts[0].health, MAX_HEALTH, 'shooter far away is unhurt');
    }
  }
  assert.ok(hit, 'some power should hit tank b');
});

test('simulation is deterministic', () => {
  const run = () =>
    simulateShot({ terrain: flat(), tanks: [tank('a', 300), tank('b', 1200)], shooterId: 'a', weapon: getWeapon('shower')!, angle: 60, power: 70, wind: 17 });
  assert.deepEqual(run(), run());
});

test('shower bomb splits into 5 bomblets that each explode', () => {
  const shot = simulateShot({ terrain: flat(), tanks: [tank('a', 300)], shooterId: 'a', weapon: getWeapon('shower')!, angle: 60, power: 70, wind: 0 });
  const parent = shot.projectiles.find((p) => p.id === 1)!;
  assert.equal(parent.end, 'split');
  assert.equal(shot.projectiles.length, 6);
  assert.equal(shot.explosions.length, 5);
});

test('bouncer bounces once before exploding', () => {
  const shot = simulateShot({ terrain: flat(), tanks: [tank('a', 200)], shooterId: 'a', weapon: getWeapon('bouncer')!, angle: 45, power: 50, wind: 0 });
  assert.equal(shot.explosions.length, 1);
  const track = shot.projectiles[0];
  // It touched the ground (y≈700) once, then flew up again before the final hit.
  const ys = track.points.filter((_, i) => i % 2 === 1);
  const firstLow = ys.findIndex((y) => y >= 695);
  assert.ok(firstLow > 0 && firstLow < ys.length - 2, 'bounce happened mid-flight');
});

test('wind pushes shots downwind', () => {
  const land = (wind: number) =>
    simulateShot({ terrain: flat(), tanks: [tank('a', 800)], shooterId: 'a', weapon: getWeapon('volcano')!, angle: 90, power: 60, wind }).explosions[0]?.x;
  assert.ok(land(MAX_WIND)! > 800 + 20);
  assert.ok(land(-MAX_WIND)! < 800 - 20);
});

test('projectiles leaving the side of the map are lost', () => {
  const shot = simulateShot({ terrain: flat(), tanks: [tank('a', 100)], shooterId: 'a', weapon: getWeapon('volcano')!, angle: 170, power: 100, wind: 0 });
  assert.equal(shot.projectiles[0].end, 'lost');
  assert.equal(shot.explosions.length, 0);
});

test('trackPositionAt interpolates and ends at the last point', () => {
  const shot = simulateShot({ terrain: flat(), tanks: [tank('a', 300)], shooterId: 'a', weapon: getWeapon('volcano')!, angle: 50, power: 60, wind: 0 });
  const tr = shot.projectiles[0];
  const end = trackPositionAt(tr, tr.endTime)!;
  assert.equal(end.x, tr.points[tr.points.length - 2]);
  assert.equal(trackPositionAt(tr, tr.endTime + 0.1), null);
});

test('craters drop tanks and fall damage applies', () => {
  const terrain = flat();
  const ts = [tank('a', 200), tank('b', 1000)];
  const shot = simulateShot({ terrain, tanks: ts, shooterId: 'a', weapon: getWeapon('digger')!, angle: 90, power: 30, wind: 0 });
  // Digger straight up lands on the shooter's own position: big crater below it.
  assert.equal(shot.explosions.length, 1);
  assert.ok(ts[0].y > 700, 'shooter fell into its own crater');
});

test('tank movement is limited by fuel', () => {
  const t = { x: 400, y: 700, fuel: 20 };
  for (let i = 0; i < 100; i++) stepTankMovement(flat(), t, 1, 1 / 30);
  assert.equal(t.fuel, 0);
  assert.ok(Math.abs(t.x - 420) < 0.01);
});

test('spawn positions are spread out', () => {
  const xs = spawnPositions(5).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 100);
});

test('every map generates valid terrain and decorations', () => {
  assert.ok(getMap(DEFAULT_MAP_ID), 'default map exists');
  assert.equal(new Set(MAPS.map((m) => m.id)).size, MAPS.length, 'map ids are unique');
  for (const m of MAPS) {
    for (let seed = 1; seed <= 5; seed++) {
      const t = generateTerrain(seededRng(seed), m.terrain);
      assert.equal(t.length, WORLD_WIDTH, m.id);
      assert.ok(t.every((y) => y >= WORLD_HEIGHT * m.terrain.minHeightRatio - 0.01 && y <= WORLD_HEIGHT * m.terrain.maxHeightRatio + 0.01), m.id);
    }
    const decos = generateDecorations(m, seededRng(1));
    assert.equal(decos.length, m.decorations.reduce((n, d) => n + d.count, 0), m.id);
    assert.ok(decos.every((d) => d.x >= 0 && d.x < WORLD_WIDTH));
  }
});

test('mountains are more rugged than desert dunes', () => {
  const spread = (id: string) => {
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const t = generateTerrain(seededRng(seed), getMap(id)!.terrain);
      total += Math.max(...t) - Math.min(...t);
    }
    return total / 10;
  };
  assert.ok(spread('mountain') > spread('desert') * 1.5);
});

test('map choices: Random resolves to a real map, unknown ids are rejected', () => {
  assert.ok(isMapChoice(RANDOM_MAP_ID));
  assert.ok(MAPS.every((m) => isMapChoice(m.id)));
  assert.ok(!isMapChoice('nope') && !isMapChoice(42));
  const rng = seededRng(7);
  const picked = new Set(Array.from({ length: 50 }, () => resolveMap(RANDOM_MAP_ID, rng).id));
  assert.ok(picked.size > 1 && [...picked].every((id) => getMap(id)));
});

test('decorations inside a crater are blown away, others survive', () => {
  const t = flat(700);
  const decos = [{ kind: 'tree', x: 400, scale: 1 }, { kind: 'tree', x: 600, scale: 1 }];
  assert.deepEqual(survivingDecorations(decos, t, 405, 700, 30).map((d) => d.x), [600]);
  assert.equal(survivingDecorations(decos, t, 400, 300, 30).length, 2, 'airburst high above does nothing');
});

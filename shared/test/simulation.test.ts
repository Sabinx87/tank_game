import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEHAVIORS } from '../behaviors';
import { MAX_HEALTH, MAX_WIND, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { falloffDamage, type SimTank } from '../damage';
import { simulateShot, trackPositionAt } from '../physics';
import { spawnPositions, stepTankMovement } from '../tank';
import { carveCrater, generateTerrain } from '../terrain';
import { WEAPONS, getWeapon } from '../weapons';

const flat = (y = 700) => new Array(WORLD_WIDTH).fill(y);
const tank = (playerId: string, x: number, y = 700): SimTank => ({ playerId, x, y, health: MAX_HEALTH, alive: true });

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

test('crater lowers the ground by up to its diameter, centred on impact', () => {
  const t = flat(700);
  carveCrater(t, 800, 700, 30);
  assert.equal(t[800], 730);
  assert.equal(t[700], 700, 'far columns untouched');
  assert.ok(t[790] > 700 && t[790] < 730);
});

test('falloff: full at centre, zero at edge', () => {
  assert.equal(falloffDamage(50, 40, 0), 50);
  assert.equal(falloffDamage(50, 40, 20), 25);
  assert.equal(falloffDamage(50, 40, 40), 0);
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

/**
 * Terrain is a heightmap: terrain[x] is the y coordinate of the ground surface
 * at column x (smaller y = higher ground). Everything below the surface is solid.
 */
import {
  TERRAIN_FLOOR_THICKNESS,
  TERRAIN_MAX_HEIGHT_RATIO,
  TERRAIN_MIN_HEIGHT_RATIO,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';

export type Rng = () => number;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Shape of a map's ground. Every map in maps.ts has one of these. */
export interface TerrainSettings {
  /** Highest / lowest ground allowed, as fractions of the world height from the top. */
  minHeightRatio: number;
  maxHeightRatio: number;
  /** Average ground level: random in [min, max], as a fraction from highest (0) to lowest (1) ground. */
  baseHeight: [number, number];
  /** Number of sine layers stacked to build the hills. */
  layers: number;
  /** How many big hills fit across the map (frequency multiplier, 1 = classic). */
  hills: number;
  /** Height of the biggest hills, as a fraction of the allowed range. */
  hillHeight: number;
  /** How much the smaller layers add detail (1 = classic, <1 smoother, >1 more jagged). */
  roughness: number;
  /** 1 = smooth sine hills; >1 = narrow sharp peaks with wide deep valleys; <1 = flat-topped. */
  peakSharpness: number;
}

/** The original "Classic" terrain. */
export const DEFAULT_TERRAIN_SETTINGS: TerrainSettings = {
  minHeightRatio: TERRAIN_MIN_HEIGHT_RATIO,
  maxHeightRatio: TERRAIN_MAX_HEIGHT_RATIO,
  baseHeight: [0.45, 0.65],
  layers: 5,
  hills: 1,
  hillHeight: 0.32,
  roughness: 1,
  peakSharpness: 1,
};

/** Random hills built from a few layered sine waves, shaped by `settings`. */
export function generateTerrain(rng: Rng = Math.random, settings: TerrainSettings = DEFAULT_TERRAIN_SETTINGS, width = WORLD_WIDTH): number[] {
  const minY = WORLD_HEIGHT * settings.minHeightRatio;
  const maxY = WORLD_HEIGHT * settings.maxHeightRatio;
  const [b0, b1] = settings.baseHeight;
  const base = minY + (maxY - minY) * (b0 + rng() * (b1 - b0));

  const waves = Array.from({ length: settings.layers }, (_, i) => ({
    amp: ((maxY - minY) * settings.hillHeight * (0.4 + rng() * 0.8)) / (i + 1) ** (1 / settings.roughness),
    freq: ((2 * Math.PI) / width) * (i + 1) * (0.6 + rng() * 0.9) * settings.hills,
    phase: rng() * Math.PI * 2,
  }));
  const totalAmp = waves.reduce((sum, w) => sum + w.amp, 0) || 1;
  const p = settings.peakSharpness;

  const heights = new Array<number>(width);
  for (let x = 0; x < width; x++) {
    let offset = 0;
    for (const w of waves) offset += w.amp * Math.sin(w.freq * x + w.phase);
    if (p !== 1) {
      // Normalised height in [0, 1] (1 = highest), curved, then mapped back.
      const up = Math.min(1, Math.max(0, (1 - offset / totalAmp) / 2));
      offset = (1 - 2 * up ** p) * totalAmp;
    }
    heights[x] = round2(Math.min(maxY, Math.max(minY, base + offset)));
  }
  return heights;
}

/**
 * Walk from x in direction `dir` while the ground keeps rising (small dips up to
 * `tolerance` px are crossed). Returns the column of the highest point reached
 * within `maxDistance` px — x itself if the ground doesn't rise that way.
 */
export function findPeak(terrain: number[], x: number, dir: -1 | 1, maxDistance: number, tolerance = 2): number {
  const start = Math.max(0, Math.min(terrain.length - 1, Math.round(x)));
  let best = start;
  for (let d = 1; d <= maxDistance; d++) {
    const cx = start + dir * d;
    if (cx < 0 || cx >= terrain.length) break;
    if (terrain[cx] < terrain[best]) best = cx;
    else if (terrain[cx] > terrain[best] + tolerance) break; // over the top, going downhill
  }
  return best;
}

/** Ground surface y at any (possibly fractional / out-of-range) x. */
export function heightAt(terrain: number[], x: number): number {
  const i = Math.round(x);
  if (i < 0) return terrain[0];
  if (i >= terrain.length) return terrain[terrain.length - 1];
  return terrain[i];
}

/** True if the point (x, y) is inside solid ground. */
export function isSolid(terrain: number[], x: number, y: number): boolean {
  if (x < 0 || x >= terrain.length) return false;
  return y >= heightAt(terrain, x);
}

/** Unit surface normal (pointing out of the ground) at x. */
export function surfaceNormal(terrain: number[], x: number): { nx: number; ny: number } {
  const dx = 3;
  const dy = heightAt(terrain, x + dx) - heightAt(terrain, x - dx);
  // Tangent is (2dx, dy); normal pointing up (negative y) is (dy, -2dx).
  const len = Math.hypot(dy, 2 * dx) || 1;
  return { nx: dy / len, ny: (-2 * dx) / len };
}

/**
 * Remove a circle of ground. For each column, the dirt that overlaps the circle
 * is removed and the dirt above it drops down, so the heightmap stays valid.
 * Mutates and returns `terrain`.
 */
export function carveCrater(terrain: number[], cx: number, cy: number, radius: number): number[] {
  const floor = WORLD_HEIGHT - TERRAIN_FLOOR_THICKNESS;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(terrain.length - 1, Math.ceil(cx + radius));
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const half = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    if (half <= 0) continue;
    const top = cy - half;
    const bottom = cy + half;
    const surface = terrain[x];
    // Overlap of the solid column [surface, ∞) with the circle span [top, bottom].
    const removed = bottom - Math.max(surface, top);
    if (removed > 0) terrain[x] = round2(Math.min(floor, surface + removed));
  }
  return terrain;
}

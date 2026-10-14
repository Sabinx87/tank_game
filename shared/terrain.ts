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

/** Random rolling hills built from a few layered sine waves. */
export function generateTerrain(rng: Rng = Math.random, width = WORLD_WIDTH): number[] {
  const minY = WORLD_HEIGHT * TERRAIN_MIN_HEIGHT_RATIO;
  const maxY = WORLD_HEIGHT * TERRAIN_MAX_HEIGHT_RATIO;
  const base = minY + (maxY - minY) * (0.45 + rng() * 0.2);

  const waves = Array.from({ length: 5 }, (_, i) => ({
    amp: ((maxY - minY) * 0.32 * (0.4 + rng() * 0.8)) / (i + 1),
    freq: ((2 * Math.PI) / width) * (i + 1) * (0.6 + rng() * 0.9),
    phase: rng() * Math.PI * 2,
  }));

  const heights = new Array<number>(width);
  for (let x = 0; x < width; x++) {
    let y = base;
    for (const w of waves) y += w.amp * Math.sin(w.freq * x + w.phase);
    heights[x] = round2(Math.min(maxY, Math.max(minY, y)));
  }
  return heights;
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

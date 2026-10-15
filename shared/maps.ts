/**
 * MAP REGISTRY — maps are pure data.
 *
 * To add a new map: add an entry below. The waiting-room picker (with a
 * generated preview), the "Random" choice, terrain generation, sky/ground
 * rendering, decorations and wind all read from this list.
 */
import { DEFAULT_MAP_ID, RANDOM_MAP_ID, WORLD_WIDTH } from './constants';
import { DEFAULT_TERRAIN_SETTINGS, heightAt, type Rng, type TerrainSettings } from './terrain';
import type { Decoration } from './types';

/** Decoration kinds the client knows how to draw (client/src/game/decorations.ts). */
export type DecorationKind = 'cactus' | 'rock' | 'tree' | 'pine' | 'bush';

export interface MapDef {
  id: string;
  name: string;
  description: string;
  terrain: TerrainSettings;
  sky: {
    /** Gradient colours, top of the screen → horizon (0xRRGGBB). */
    top: number;
    bottom: number;
    /** Optional sun/moon: position as fractions of the world size. */
    sun?: { color: number; x: number; y: number; radius: number };
  };
  ground: {
    /** Fill gradient from the highest ground down to the bottom (CSS colours). */
    top: string;
    mid: string;
    bottom: string;
    /** Surface edge (grass / sand crust / rock edge). */
    surface: string;
    surfaceHighlight: string;
    /** Extra drawing on top of the fill. */
    style: 'grass' | 'sand' | 'rock';
    /** Colour of the speckle texture (omit for none). */
    speckle?: string;
    /** Rock style: ground higher than this fraction of the terrain range gets snow. */
    snowLine?: number;
  };
  /** Decorative objects scattered on the ground (no collision). */
  decorations: { kind: DecorationKind; count: number; scale?: [number, number] }[];
  modifiers?: {
    /** Multiplies MAX_WIND for this map. */
    windMultiplier?: number;
  };
}

export const MAPS: MapDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Rolling grassy hills. The original battlefield.',
    terrain: DEFAULT_TERRAIN_SETTINGS,
    sky: { top: 0x2b5876, bottom: 0x8fc6e8, sun: { color: 0xfff4c2, x: 0.82, y: 0.17, radius: 46 } },
    ground: {
      top: '#8a6a3f',
      mid: '#6b4f2c',
      bottom: '#3b2a18',
      surface: '#3f7d2a',
      surfaceHighlight: '#6fbf3f',
      style: 'grass',
    },
    decorations: [],
  },
  {
    id: 'desert',
    name: 'Desert',
    description: 'Low rolling dunes under a scorching sky.',
    terrain: {
      ...DEFAULT_TERRAIN_SETTINGS,
      minHeightRatio: 0.45,
      maxHeightRatio: 0.86,
      baseHeight: [0.5, 0.65],
      hills: 1.7,
      hillHeight: 0.22,
      roughness: 0.6,
      peakSharpness: 0.8,
    },
    sky: { top: 0xe0793a, bottom: 0xffd9a0, sun: { color: 0xfffbe0, x: 0.2, y: 0.15, radius: 54 } },
    ground: {
      top: '#e8c27a',
      mid: '#d4a556',
      bottom: '#9a6a32',
      surface: '#c79a52',
      surfaceHighlight: '#f6dc9c',
      style: 'sand',
      speckle: 'rgba(120, 80, 30, 0.35)',
    },
    decorations: [
      { kind: 'cactus', count: 6, scale: [0.8, 1.3] },
      { kind: 'rock', count: 4, scale: [0.6, 1.1] },
    ],
  },
  {
    id: 'mountain',
    name: 'Mountain',
    description: 'Tall sharp peaks, deep valleys and stronger wind.',
    terrain: {
      ...DEFAULT_TERRAIN_SETTINGS,
      minHeightRatio: 0.16,
      maxHeightRatio: 0.9,
      baseHeight: [0.3, 0.42],
      hills: 1.5,
      hillHeight: 0.34,
      roughness: 1.4,
      peakSharpness: 1.8,
    },
    sky: { top: 0x3d5a80, bottom: 0xc9d8e8, sun: { color: 0xffffff, x: 0.75, y: 0.12, radius: 34 } },
    ground: {
      top: '#8d8d94',
      mid: '#6a6a72',
      bottom: '#3a3a40',
      surface: '#55555c',
      surfaceHighlight: '#a9a9b2',
      style: 'rock',
      speckle: 'rgba(30, 30, 35, 0.3)',
      snowLine: 0.32,
    },
    decorations: [
      { kind: 'pine', count: 6, scale: [0.7, 1.1] },
      { kind: 'rock', count: 5, scale: [0.8, 1.4] },
    ],
    modifiers: { windMultiplier: 1.3 },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Medium green hills dotted with trees.',
    terrain: {
      ...DEFAULT_TERRAIN_SETTINGS,
      baseHeight: [0.45, 0.6],
      hills: 1.2,
      hillHeight: 0.28,
      roughness: 0.9,
    },
    sky: { top: 0x3f7fbf, bottom: 0xbfe6ff, sun: { color: 0xfff7cc, x: 0.85, y: 0.14, radius: 42 } },
    ground: {
      top: '#5d7a35',
      mid: '#4a5f28',
      bottom: '#2a3416',
      surface: '#2f6b1f',
      surfaceHighlight: '#7fcf4a',
      style: 'grass',
      speckle: 'rgba(20, 40, 10, 0.3)',
    },
    decorations: [
      { kind: 'tree', count: 9, scale: [0.8, 1.3] },
      { kind: 'pine', count: 5, scale: [0.8, 1.2] },
      { kind: 'bush', count: 6, scale: [0.7, 1.1] },
    ],
  },
];

const BY_ID = new Map(MAPS.map((m) => [m.id, m]));

export function getMap(id: string): MapDef | undefined {
  return BY_ID.get(id);
}

/** Valid waiting-room choices: every map, plus Random. */
export function isMapChoice(id: unknown): id is string {
  return typeof id === 'string' && (id === RANDOM_MAP_ID || BY_ID.has(id));
}

/** Turn the host's choice into the map to play this round (Random picks a new one each call). */
export function resolveMap(choice: string, rng: Rng = Math.random): MapDef {
  if (choice === RANDOM_MAP_ID) return MAPS[Math.floor(rng() * MAPS.length)];
  return getMap(choice) ?? getMap(DEFAULT_MAP_ID)!;
}

/** Scatter a map's decorations across the ground. */
export function generateDecorations(map: MapDef, rng: Rng = Math.random, width = WORLD_WIDTH): Decoration[] {
  const out: Decoration[] = [];
  for (const spec of map.decorations) {
    const [s0, s1] = spec.scale ?? [1, 1];
    for (let i = 0; i < spec.count; i++) {
      out.push({ kind: spec.kind, x: Math.round(20 + rng() * (width - 40)), scale: Math.round((s0 + rng() * (s1 - s0)) * 100) / 100 });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

/**
 * Decorations whose foot is inside a crater are blown away. Call with the
 * terrain as it was *before* this crater was carved; the server and the client
 * replay explosions in the same order, so both end up with the same list.
 */
export function survivingDecorations(decorations: Decoration[], terrain: number[], x: number, y: number, craterRadius: number): Decoration[] {
  return decorations.filter((d) => Math.hypot(d.x - x, heightAt(terrain, d.x) - y) > craterRadius);
}

/** Small deterministic RNG (mulberry32), e.g. for identical map previews on every client. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

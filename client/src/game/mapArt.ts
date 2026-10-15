/**
 * Canvas painters for a map's sky, ground and decorations. Used both by the
 * in-game renderers and by the waiting-room map previews, so a map defined in
 * shared/maps.ts looks the same everywhere.
 */
import { WORLD_HEIGHT, WORLD_WIDTH } from '@shared/constants';
import { generateDecorations, seededRng, type DecorationKind, type MapDef } from '@shared/maps';
import { generateTerrain, heightAt } from '@shared/terrain';
import type { Decoration } from '@shared/types';

const css = (hex: number, alpha = 1) =>
  `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${alpha})`;

export function paintSky(ctx: CanvasRenderingContext2D, map: MapDef): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, css(map.sky.top));
  g.addColorStop(1, css(map.sky.bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  const sun = map.sky.sun;
  if (sun) {
    const x = sun.x * WORLD_WIDTH;
    const y = sun.y * WORLD_HEIGHT;
    const glow = ctx.createRadialGradient(x, y, sun.radius * 0.6, x, y, sun.radius * 2.2);
    glow.addColorStop(0, css(sun.color, 0.35));
    glow.addColorStop(1, css(sun.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - sun.radius * 2.2, y - sun.radius * 2.2, sun.radius * 4.4, sun.radius * 4.4);
    ctx.fillStyle = css(sun.color, 0.92);
    ctx.beginPath();
    ctx.arc(x, y, sun.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Speckle texture positions are fixed per map, so craters reveal the same texture. */
const speckleCache = new Map<string, Float32Array>();
function speckles(map: MapDef): Float32Array {
  let pts = speckleCache.get(map.id);
  if (!pts) {
    let seed = 0;
    for (const ch of map.id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const rng = seededRng(seed);
    pts = new Float32Array(1800 * 3);
    for (let i = 0; i < pts.length; i += 3) {
      pts[i] = rng() * WORLD_WIDTH;
      pts[i + 1] = WORLD_HEIGHT * 0.12 + rng() * WORLD_HEIGHT * 0.88;
      pts[i + 2] = 1 + rng() * 2.2;
    }
    speckleCache.set(map.id, pts);
  }
  return pts;
}

function groundPath(ctx: CanvasRenderingContext2D, terrain: number[]): void {
  ctx.beginPath();
  ctx.moveTo(0, WORLD_HEIGHT);
  for (let x = 0; x < terrain.length; x++) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(terrain.length - 1, WORLD_HEIGHT);
  ctx.closePath();
}

function surfacePath(ctx: CanvasRenderingContext2D, terrain: number[]): void {
  ctx.beginPath();
  ctx.moveTo(0, terrain[0]);
  for (let x = 1; x < terrain.length; x++) ctx.lineTo(x, terrain[x]);
}

export function paintGround(ctx: CanvasRenderingContext2D, terrain: number[], map: MapDef): void {
  if (terrain.length === 0) return;
  const gr = map.ground;
  const top = Math.min(...terrain);
  const fill = ctx.createLinearGradient(0, top, 0, WORLD_HEIGHT);
  fill.addColorStop(0, gr.top);
  fill.addColorStop(0.35, gr.mid);
  fill.addColorStop(1, gr.bottom);
  groundPath(ctx, terrain);
  ctx.fillStyle = fill;
  ctx.fill();

  if (gr.speckle) {
    ctx.save();
    groundPath(ctx, terrain);
    ctx.clip();
    ctx.fillStyle = gr.speckle;
    const pts = speckles(map);
    for (let i = 0; i < pts.length; i += 3) ctx.fillRect(pts[i], pts[i + 1], pts[i + 2], pts[i + 2]);
    ctx.restore();
  }

  ctx.lineJoin = 'round';
  if (gr.style === 'rock' && gr.snowLine !== undefined) {
    // Snow caps on everything above the snow line.
    const minY = WORLD_HEIGHT * map.terrain.minHeightRatio;
    const maxY = WORLD_HEIGHT * map.terrain.maxHeightRatio;
    const snowY = minY + (maxY - minY) * gr.snowLine;
    ctx.fillStyle = '#f4f8ff';
    for (let x = 0; x < terrain.length; x++) {
      const y = terrain[x];
      if (y < snowY) ctx.fillRect(x, y, 1, Math.min(snowY - y, 10 + (snowY - y) * 0.35));
    }
  }

  surfacePath(ctx, terrain);
  const thick = gr.style === 'grass' ? [9, 4] : gr.style === 'sand' ? [5, 2] : [4, 1.5];
  ctx.strokeStyle = gr.surface;
  ctx.lineWidth = thick[0];
  ctx.stroke();
  ctx.strokeStyle = gr.surfaceHighlight;
  ctx.lineWidth = thick[1];
  ctx.stroke();
}

type Drawer = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void;

const DRAWERS: Record<DecorationKind, Drawer> = {
  cactus(ctx, x, y, s) {
    ctx.fillStyle = '#3f8f3a';
    ctx.strokeStyle = '#2a6127';
    ctx.lineWidth = 1.5;
    const arm = (ax: number, ay: number, w: number, h: number) => {
      ctx.beginPath();
      ctx.roundRect(ax, ay, w, h, w / 2);
      ctx.fill();
      ctx.stroke();
    };
    arm(x - 5 * s, y - 46 * s, 10 * s, 50 * s);
    arm(x - 15 * s, y - 34 * s, 7 * s, 16 * s);
    arm(x - 15 * s, y - 22 * s, 12 * s, 6 * s);
    arm(x + 8 * s, y - 40 * s, 7 * s, 18 * s);
    arm(x + 3 * s, y - 26 * s, 12 * s, 6 * s);
  },
  rock(ctx, x, y, s) {
    ctx.fillStyle = '#7b7468';
    ctx.beginPath();
    ctx.ellipse(x, y - 4 * s, 16 * s, 10 * s, 0, Math.PI, 0);
    ctx.lineTo(x + 16 * s, y + 4);
    ctx.lineTo(x - 16 * s, y + 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(x - 4 * s, y - 9 * s, 7 * s, 3 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  tree(ctx, x, y, s) {
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x - 3 * s, y - 30 * s, 6 * s, 34 * s);
    ctx.fillStyle = '#3c8d2f';
    for (const [dx, dy, r] of [
      [0, -44, 16],
      [-11, -34, 12],
      [11, -34, 12],
      [0, -56, 11],
    ]) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x - 5 * s, y - 50 * s, 6 * s, 0, Math.PI * 2);
    ctx.fill();
  },
  pine(ctx, x, y, s) {
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(x - 2.5 * s, y - 14 * s, 5 * s, 18 * s);
    ctx.fillStyle = '#245c32';
    for (let i = 0; i < 3; i++) {
      const by = y - (12 + i * 13) * s;
      const w = (16 - i * 4) * s;
      ctx.beginPath();
      ctx.moveTo(x - w, by);
      ctx.lineTo(x + w, by);
      ctx.lineTo(x, by - 20 * s);
      ctx.closePath();
      ctx.fill();
    }
  },
  bush(ctx, x, y, s) {
    ctx.fillStyle = '#4c9a3a';
    for (const [dx, r] of [
      [-8, 8],
      [0, 10],
      [8, 7],
    ]) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y - 4 * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

export function paintDecorations(ctx: CanvasRenderingContext2D, decorations: Decoration[], terrain: number[]): void {
  for (const d of decorations) {
    const draw = DRAWERS[d.kind as DecorationKind];
    if (draw) draw(ctx, d.x, heightAt(terrain, d.x) + 3, d.scale);
  }
}

/** A small preview picture of a map: same generator and painters as the real thing, fixed seed. */
export function renderMapPreview(map: MapDef, width: number, height: number, seed = 7): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  const terrain = generateTerrain(seededRng(seed), map.terrain);
  paintSky(ctx, map);
  paintDecorations(ctx, generateDecorations(map, seededRng(seed + 1)), terrain);
  paintGround(ctx, terrain, map);
  return canvas;
}

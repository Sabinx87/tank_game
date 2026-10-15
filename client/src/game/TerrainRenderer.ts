import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@shared/constants';
import type { MapDef } from '@shared/maps';
import type { Decoration } from '@shared/types';
import { paintDecorations, paintGround, paintSky } from './mapArt';

/** A full-screen canvas texture we repaint by hand. */
class CanvasLayer {
  readonly texture: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene, key: string, depth: number) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.texture = scene.textures.createCanvas(key, WORLD_WIDTH, WORLD_HEIGHT)!;
    scene.add.image(0, 0, key).setOrigin(0).setDepth(depth);
  }

  paint(fn: (ctx: CanvasRenderingContext2D) => void): void {
    const ctx = this.texture.context;
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    fn(ctx);
    this.texture.refresh();
  }
}

/** Sky gradient + sun for the current map. Repainted only when the map changes. */
export class SkyRenderer {
  private readonly layer: CanvasLayer;
  private mapId = '';

  constructor(scene: Phaser.Scene, depth: number) {
    this.layer = new CanvasLayer(scene, 'sky-canvas', depth);
  }

  draw(map: MapDef): void {
    if (map.id === this.mapId) return;
    this.mapId = map.id;
    this.layer.paint((ctx) => paintSky(ctx, map));
  }
}

/** Draws the heightmap (and decorations) into a canvas texture. Redrawn whenever a crater is carved. */
export class TerrainRenderer {
  private readonly layer: CanvasLayer;

  constructor(scene: Phaser.Scene, depth: number) {
    this.layer = new CanvasLayer(scene, 'terrain-canvas', depth);
  }

  draw(terrain: number[], map: MapDef, decorations: Decoration[]): void {
    this.layer.paint((ctx) => {
      if (terrain.length === 0) return;
      // Decorations first: the ground fill and grass hide their roots.
      paintDecorations(ctx, decorations, terrain);
      paintGround(ctx, terrain, map);
    });
  }
}

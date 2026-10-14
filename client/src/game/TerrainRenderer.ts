import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@shared/constants';

const KEY = 'terrain-canvas';

/** Draws the heightmap into a canvas texture. Redrawn whenever a crater is carved. */
export class TerrainRenderer {
  private readonly texture: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene, depth: number) {
    if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
    this.texture = scene.textures.createCanvas(KEY, WORLD_WIDTH, WORLD_HEIGHT)!;
    scene.add.image(0, 0, KEY).setOrigin(0).setDepth(depth);
  }

  draw(terrain: number[]): void {
    const ctx = this.texture.context;
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    if (terrain.length === 0) {
      this.texture.refresh();
      return;
    }

    const top = Math.min(...terrain);
    const fill = ctx.createLinearGradient(0, top, 0, WORLD_HEIGHT);
    fill.addColorStop(0, '#8a6a3f');
    fill.addColorStop(0.35, '#6b4f2c');
    fill.addColorStop(1, '#3b2a18');

    ctx.beginPath();
    ctx.moveTo(0, WORLD_HEIGHT);
    for (let x = 0; x < terrain.length; x++) ctx.lineTo(x, terrain[x]);
    ctx.lineTo(terrain.length - 1, WORLD_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // Grass along the surface.
    ctx.beginPath();
    ctx.moveTo(0, terrain[0]);
    for (let x = 1; x < terrain.length; x++) ctx.lineTo(x, terrain[x]);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3f7d2a';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = '#6fbf3f';
    ctx.lineWidth = 4;
    ctx.stroke();

    this.texture.refresh();
  }
}

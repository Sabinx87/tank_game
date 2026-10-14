import Phaser from 'phaser';
import { CLOUD_COUNT, CLOUD_SPEED_PER_WIND, WORLD_HEIGHT, WORLD_WIDTH } from '@shared/constants';

/** Clouds drifting across the sky in the wind direction, speed proportional to wind. */
export class Clouds {
  private readonly clouds: { img: Phaser.GameObjects.Image; parallax: number }[] = [];
  private speed = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    if (!scene.textures.exists('cloud')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1);
      [
        [40, 40, 28],
        [75, 30, 34],
        [110, 42, 26],
        [60, 52, 24],
        [95, 54, 22],
      ].forEach(([x, y, r]) => g.fillCircle(x, y, r));
      g.generateTexture('cloud', 150, 85);
      g.destroy();
    }
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const scale = 0.6 + Math.random() * 0.9;
      const img = scene.add
        .image(Math.random() * WORLD_WIDTH, 40 + Math.random() * WORLD_HEIGHT * 0.3, 'cloud')
        .setScale(scale)
        .setAlpha(0.55 + Math.random() * 0.3)
        .setDepth(depth);
      this.clouds.push({ img, parallax: 0.6 + scale * 0.4 });
    }
  }

  setWind(wind: number): void {
    this.speed = wind * CLOUD_SPEED_PER_WIND;
  }

  update(dt: number): void {
    for (const { img, parallax } of this.clouds) {
      img.x += this.speed * parallax * dt;
      const half = img.displayWidth / 2;
      if (img.x > WORLD_WIDTH + half) img.x = -half;
      else if (img.x < -half) img.x = WORLD_WIDTH + half;
    }
  }
}

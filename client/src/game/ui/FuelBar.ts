import Phaser from 'phaser';
import { MOVE_LIMIT_PER_TURN, WORLD_HEIGHT } from '@shared/constants';
import { HUD_DEPTH, textStyle } from './style';

const BAR_W = 200;

/** Under the power meter: how much driving is left this turn. */
export class FuelBar {
  private readonly bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    const label = scene.add.text(12, 0, 'FUEL', textStyle(13, '#bcd'));
    this.bar = scene.add.graphics();
    scene.add.container(12, WORLD_HEIGHT - 50, [label, this.bar]).setDepth(HUD_DEPTH);
  }

  update(fuel: number): void {
    const frac = Phaser.Math.Clamp(fuel / MOVE_LIMIT_PER_TURN, 0, 1);
    this.bar
      .clear()
      .fillStyle(0x000000, 0.6)
      .fillRect(12, 20, BAR_W, 10)
      .fillStyle(0xf39c12, 1)
      .fillRect(13, 21, (BAR_W - 2) * frac, 8);
  }
}

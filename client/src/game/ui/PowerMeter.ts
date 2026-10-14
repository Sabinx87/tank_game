import Phaser from 'phaser';
import { MAX_POWER, WORLD_HEIGHT } from '@shared/constants';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

const BAR_W = 200;

/** Bottom-left: shot power bar and muzzle angle readout. */
export class PowerMeter {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly angle: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics().fillStyle(PANEL_COLOR, PANEL_ALPHA).fillRoundedRect(0, 0, BAR_W + 24, 92, 8);
    this.label = scene.add.text(12, 8, '', textStyle(14));
    this.angle = scene.add.text(BAR_W + 12, 8, '', textStyle(14)).setOrigin(1, 0);
    this.bar = scene.add.graphics();
    scene.add.container(12, WORLD_HEIGHT - 104, [bg, this.label, this.angle, this.bar]).setDepth(HUD_DEPTH);
  }

  update(power: number, angle: number): void {
    this.label.setText(`POWER ${Math.round(power)}`);
    this.angle.setText(`ANGLE ${Math.round(angle)}°`);
    const frac = Phaser.Math.Clamp(power / MAX_POWER, 0, 1);
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x2ecc71),
      Phaser.Display.Color.ValueToColor(0xe74c3c),
      100,
      frac * 100,
    );
    this.bar
      .clear()
      .fillStyle(0x000000, 0.6)
      .fillRect(12, 30, BAR_W, 14)
      .fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1)
      .fillRect(13, 31, (BAR_W - 2) * frac, 12);
  }
}

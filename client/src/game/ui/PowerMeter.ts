import Phaser from 'phaser';
import { MAX_POWER, WORLD_HEIGHT } from '@shared/constants';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

const BAR_W = 200;

/**
 * Bottom-left: shot power bar and muzzle angle readout. The part of the bar
 * above the tank's current max power (lost to damage) is greyed and cracked.
 */
export class PowerMeter {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly angle: Phaser.GameObjects.Text;
  private readonly cap: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics().fillStyle(PANEL_COLOR, PANEL_ALPHA).fillRoundedRect(0, 0, BAR_W + 24, 92, 8);
    this.label = scene.add.text(12, 8, '', textStyle(14));
    this.angle = scene.add.text(BAR_W + 12, 8, '', textStyle(14)).setOrigin(1, 0);
    this.cap = scene.add.text(BAR_W + 12, 48, '', textStyle(11, '#ff9b9b')).setOrigin(1, 0);
    this.bar = scene.add.graphics();
    scene.add.container(12, WORLD_HEIGHT - 104, [bg, this.label, this.angle, this.cap, this.bar]).setDepth(HUD_DEPTH);
  }

  update(power: number, angle: number, maxPower: number): void {
    this.label.setText(`POWER ${Math.round(power)}`);
    this.angle.setText(`ANGLE ${Math.round(angle)}°`);
    const damaged = maxPower < MAX_POWER - 0.05;
    this.cap.setText(damaged ? `max ${Math.floor(maxPower)} (damaged)` : '');
    const frac = Phaser.Math.Clamp(power / MAX_POWER, 0, 1);
    const capFrac = Phaser.Math.Clamp(maxPower / MAX_POWER, 0, 1);
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x2ecc71),
      Phaser.Display.Color.ValueToColor(0xe74c3c),
      100,
      frac * 100,
    );
    const g = this.bar
      .clear()
      .fillStyle(0x000000, 0.6)
      .fillRect(12, 30, BAR_W, 14)
      .fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1)
      .fillRect(13, 31, (BAR_W - 2) * frac, 12);
    if (damaged) {
      // Unavailable part: grey with cracks, and a red line at the cap.
      const x0 = 13 + (BAR_W - 2) * capFrac;
      const w = 13 + BAR_W - 2 - x0;
      g.fillStyle(0x5a5a5a, 0.9).fillRect(x0, 31, w, 12);
      g.lineStyle(1, 0x222222, 0.9);
      for (let x = x0 + 4; x < x0 + w - 2; x += 9) {
        g.beginPath();
        g.moveTo(x, 31);
        g.lineTo(x + 3, 36);
        g.lineTo(x - 1, 39);
        g.lineTo(x + 2, 43);
        g.strokePath();
      }
      g.fillStyle(0xff4d4d, 1).fillRect(x0 - 1, 28, 2, 18);
    }
  }
}

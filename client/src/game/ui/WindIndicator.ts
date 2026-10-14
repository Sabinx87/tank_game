import Phaser from 'phaser';
import { MAX_WIND, WORLD_WIDTH } from '@shared/constants';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

const MAX_ARROW = 70;

/** Top-centre: wind arrow (direction + length) and strength 0–10. */
export class WindIndicator {
  private readonly arrow: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics().fillStyle(PANEL_COLOR, PANEL_ALPHA).fillRoundedRect(-95, 0, 190, 58, 8);
    const title = scene.add.text(0, 6, 'WIND', textStyle(13, '#bcd')).setOrigin(0.5, 0);
    this.arrow = scene.add.graphics();
    this.label = scene.add.text(0, 40, '', textStyle(14)).setOrigin(0.5, 0.5);
    scene.add.container(WORLD_WIDTH / 2, 10, [bg, title, this.arrow, this.label]).setDepth(HUD_DEPTH);
  }

  update(wind: number): void {
    const strength = Math.round((Math.abs(wind) / MAX_WIND) * 10);
    const len = (Math.abs(wind) / MAX_WIND) * MAX_ARROW;
    const dir = Math.sign(wind);
    const g = this.arrow.clear();
    const y = 28;
    if (strength === 0) {
      g.fillStyle(0xffffff, 0.8).fillCircle(0, y, 4);
      this.label.setText('calm');
      return;
    }
    const color = strength >= 8 ? 0xff6b6b : strength >= 5 ? 0xffd166 : 0x9be7ff;
    g.lineStyle(5, color, 1).lineBetween(-dir * len * 0.5, y, dir * len * 0.5, y);
    g.fillStyle(color, 1).fillTriangle(dir * (len * 0.5 + 10), y, dir * len * 0.5, y - 8, dir * len * 0.5, y + 8);
    this.label.setText(`${dir < 0 ? '◀ ' : ''}${strength}${dir > 0 ? ' ▶' : ''}`);
  }
}

import Phaser from 'phaser';
import { MAX_HEALTH, WORLD_WIDTH } from '@shared/constants';
import type { PlayerInfo, TankState } from '@shared/types';
import { colorOf } from '../../store';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

const ROW_H = 30;
const WIDTH = 230;
const BAR_W = 90;

/** Top-right panel: every player's name (in their color) with a health bar. */
export class HealthBars {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  private rows: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.bars = scene.add.graphics();
    this.container = scene.add.container(WORLD_WIDTH - WIDTH - 12, 12, [this.bg, this.bars]).setDepth(HUD_DEPTH);
  }

  update(players: PlayerInfo[], tanks: TankState[], currentId: string | null): void {
    const list = players.filter((p) => tanks.some((t) => t.playerId === p.id));
    while (this.rows.length < list.length) {
      const t = this.scene.add.text(10, 0, '', textStyle(15));
      this.rows.push(t);
      this.container.add(t);
    }
    while (this.rows.length > list.length) this.rows.pop()!.destroy();

    this.bg.clear().fillStyle(PANEL_COLOR, PANEL_ALPHA).fillRoundedRect(0, 0, WIDTH, list.length * ROW_H + 10, 8);
    const g = this.bars.clear();
    list.forEach((p, i) => {
      const tank = tanks.find((t) => t.playerId === p.id)!;
      const y = 5 + i * ROW_H;
      const dead = !tank.alive;
      const color = colorOf(p.color);
      const row = this.rows[i];
      row.setText(`${p.id === currentId ? '▶ ' : ''}${p.name}${p.connected ? '' : ' (offline)'}`);
      row.setY(y + 5).setColor(dead ? '#777777' : color.css).setAlpha(dead || !p.connected ? 0.6 : 1);
      const frac = Phaser.Math.Clamp(tank.health / MAX_HEALTH, 0, 1);
      g.fillStyle(0x000000, 0.6).fillRect(WIDTH - BAR_W - 10, y + 9, BAR_W, 12);
      g.fillStyle(dead ? 0x555555 : color.hex, 1).fillRect(WIDTH - BAR_W - 9, y + 10, (BAR_W - 2) * frac, 10);
    });
  }
}

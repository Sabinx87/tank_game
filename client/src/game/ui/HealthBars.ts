import Phaser from 'phaser';
import { MAX_HEALTH, REPAIR_KIT_CAPACITY, WORLD_WIDTH } from '@shared/constants';
import { getShield } from '@shared/shields';
import type { PlayerInfo, TankState } from '@shared/types';
import { colorOf } from '../../store';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

const ROW_H = 40;
const WIDTH = 250;
const BAR_W = 100;
const PIP = 9;
const SHIELD_COLOR = 0x4aa8ff;
const REPAIR_COLOR = 0x9be37a;

/**
 * Top-right panel: every player's name (in their color), health bar, shield HP
 * bar (blue, under the health bar) and repair kit charges (green pips).
 */
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
      row.setY(y + 3).setColor(dead ? '#777777' : color.css).setAlpha(dead || !p.connected ? 0.6 : 1);

      // Health
      const barX = WIDTH - BAR_W - 10;
      const frac = Phaser.Math.Clamp(tank.health / MAX_HEALTH, 0, 1);
      g.fillStyle(0x000000, 0.6).fillRect(barX, y + 6, BAR_W, 12);
      g.fillStyle(dead ? 0x555555 : color.hex, 1).fillRect(barX + 1, y + 7, (BAR_W - 2) * frac, 10);

      // Shield HP (only while a shield is up)
      const def = tank.shield && getShield(tank.shield.shieldId);
      if (tank.shield && def && !dead) {
        const sf = Phaser.Math.Clamp(tank.shield.hp / def.hp, 0, 1);
        g.fillStyle(0x000000, 0.6).fillRect(barX, y + 21, BAR_W, 6);
        g.fillStyle(SHIELD_COLOR, 1).fillRect(barX + 1, y + 22, (BAR_W - 2) * sf, 4);
      }

      // Repair kit charges
      for (let k = 0; k < REPAIR_KIT_CAPACITY; k++) {
        const px = 12 + k * (PIP + 4);
        const filled = k < p.repairKits;
        g.fillStyle(filled ? REPAIR_COLOR : 0x000000, filled ? (dead ? 0.4 : 1) : 0.5).fillRoundedRect(px, y + 24, PIP, PIP, 2);
        g.lineStyle(1, REPAIR_COLOR, 0.6).strokeRoundedRect(px, y + 24, PIP, PIP, 2);
      }
    });
  }
}

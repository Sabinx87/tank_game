import Phaser from 'phaser';
import { REPAIR_KIT_CAPACITY, WORLD_HEIGHT, WORLD_WIDTH } from '@shared/constants';
import { ownedShields } from '@shared/shields';
import type { PlayerInfo, TankState } from '@shared/types';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

const BTN_W = 96;
const BTN_H = 54;
const GAP = 6;

interface Button {
  label: string;
  sub: string;
  color: number;
  enabled: boolean;
  onClick: () => void;
}

/**
 * Bottom-right: things you can do on your turn without ending it —
 * use a repair kit (R) and switch on a shield (E = best one you own, or click).
 */
export class ActionBar {
  private readonly container: Phaser.GameObjects.Container;
  private key = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actions: { repair: () => void; shield: (shieldId: string) => void },
  ) {
    // Leaves room in the corner for the page's mute button.
    this.container = scene.add.container(WORLD_WIDTH - 60, WORLD_HEIGHT - BTN_H - 12).setDepth(HUD_DEPTH);
  }

  update(me: PlayerInfo, tank: TankState | undefined, myTurn: boolean): void {
    const canAct = myTurn && !!tank?.alive;
    const shields = ownedShields(me.shields);
    const key = JSON.stringify([me.repairKits, me.shields, tank?.shield, tank?.maxPower, canAct]);
    if (key === this.key) return;
    this.key = key;

    const buttons: Button[] = [
      {
        label: '🔧 Repair [R]',
        sub: `${me.repairKits} / ${REPAIR_KIT_CAPACITY}`,
        color: 0x9be37a,
        enabled: canAct && me.repairKits > 0,
        onClick: this.actions.repair,
      },
      ...shields.map((s, i) => ({
        label: `🛡 L${s.level}${i === 0 ? ' [E]' : ''}`,
        sub: `× ${me.shields[s.id]}`,
        color: s.color,
        enabled: canAct && !tank?.shield,
        onClick: () => this.actions.shield(s.id),
      })),
    ];

    this.container.removeAll(true);
    buttons.forEach((b, i) => {
      const x = -(buttons.length - i) * (BTN_W + GAP) + GAP;
      const g = this.scene.add.graphics();
      g.fillStyle(PANEL_COLOR, b.enabled ? 0.8 : PANEL_ALPHA).fillRoundedRect(0, 0, BTN_W, BTN_H, 8);
      g.lineStyle(2, b.color, b.enabled ? 1 : 0.35).strokeRoundedRect(0, 0, BTN_W, BTN_H, 8);
      const label = this.scene.add.text(BTN_W / 2, 10, b.label, textStyle(12, '#ffffff', true)).setOrigin(0.5, 0);
      const sub = this.scene.add.text(BTN_W / 2, 32, b.sub, textStyle(13, '#ddd')).setOrigin(0.5, 0);
      const btn = this.scene.add.container(x, 0, [g, label, sub]).setAlpha(b.enabled ? 1 : 0.55);
      btn.setSize(BTN_W, BTN_H);
      btn.setInteractive(new Phaser.Geom.Rectangle(0, 0, BTN_W, BTN_H), Phaser.Geom.Rectangle.Contains);
      btn.on('pointerdown', () => b.enabled && b.onClick());
      this.container.add(btn);
    });
  }
}
